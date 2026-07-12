import { executorAgentico } from "../agente/executorAgentico.js";
import type { EntradaVisaoGemma, DependenciasVisaoGemma } from "../agentico/especialistas/visaoGemma.js";
import { visaoGemma } from "../agentico/especialistas/visaoGemma.js";
import { carregarInstrucaoSistema } from "../constitution/carregador.js";
import type { ContextoCompilado } from "../contexto/compiladorContexto.js";
import { compilarGuiaFerramentasPrompt } from "../personalidade/compilarGuiaFerramentas.js";
import type { ConfigLuna, ProvedorAgente } from "../providers/tipos.js";
import type { ResultadoResposta } from "./responderLuna.js";
import { listarFerramentasChat } from "../ferramentas/registroFerramentasChat.js";
import { consultarAtlas } from "../atlas/consultarAtlas.js";
import { pesquisaWeb, webSearchDisponivel } from "../ferramentas/pesquisaWeb.js";
import { lerUrl } from "../ferramentas/lerUrl.js";

export type FonteAgentico = {
  title?: string;
  url: string;
  snippet?: string;
  publishedAt?: string;
  status?: "found" | "reading" | "read" | "verified" | "rejected" | "cited";
};

const MAX_RODADAS_AGENTICO = 4;

export type AcaoAgenticoChat = {
  tipo: "inicio_ferramenta" | "fim_ferramenta";
  ferramenta: string;
  argumentos: Record<string, unknown>;
  rodada: number;
  maxRodadas: number;
  sucesso?: boolean;
  fontes?: FonteAgentico[];
};

type ResultadoFerramentaAnalisado = { ok: boolean; fontes?: FonteAgentico[] };

/**
 * web_search/ler_url nunca lançam exceção ao falhar (devolvem {ok:false} em vez
 * disso), então `passo.sucesso` do executor não reflete se a busca funcionou de
 * verdade. Reanalisa o JSON bruto pra decidir o `sucesso` que vai pro cliente.
 */
function analisarResultadoFerramenta(ferramenta: string, resultadoJson: string): ResultadoFerramentaAnalisado {
  try {
    const parsed = JSON.parse(resultadoJson) as {
      ok?: boolean;
      url?: string;
      title?: string;
      excerpt?: string;
      publishedAt?: string;
      results?: Array<{ title?: string; url?: string; snippet?: string; publishedAt?: string }>;
    };
    if (parsed.ok === false) return { ok: false };
    if (ferramenta === "web_search" && Array.isArray(parsed.results)) {
      const fontes = parsed.results
        .filter((r): r is { title?: string; url: string; snippet?: string; publishedAt?: string } =>
          typeof r.url === "string" && r.url.length > 0)
        .map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          publishedAt: r.publishedAt,
          status: "read" as const,
        }));
      return { ok: true, fontes: fontes.length > 0 ? fontes : undefined };
    }
    if (ferramenta === "ler_url" && typeof parsed.url === "string") {
      return {
        ok: true,
        fontes: [{
          title: parsed.title,
          url: parsed.url,
          snippet: parsed.excerpt,
          publishedAt: parsed.publishedAt,
          status: "read" as const,
        }],
      };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

export type OpcoesResponderAgentico = {
  historico?: Array<{ papel: "user" | "assistant"; conteudo: string }>;
  anexosImagem?: EntradaVisaoGemma["imagens"];
  raciocinioAtivo?: boolean;
  raciocinioEffort?: "low" | "medium" | "high";
  onAcao?: (acao: AcaoAgenticoChat) => void;
  /** Raciocínio do modelo por rodada (antes de decidir usar ferramentas ou responder). */
  onRaciocinio?: (rodada: number, texto: string, emProgresso: boolean) => void;
  visaoDeps?: DependenciasVisaoGemma;
};

function montarHistoricoPrompt(historico: Array<{ papel: "user" | "assistant"; conteudo: string }>): string {
  if (!historico.length) return "";
  const linhas = historico.slice(-8).map((m) => {
    const label = m.papel === "user" ? "Usuário" : "Luna";
    return `${label}: ${m.conteudo}`;
  });
  return `## Histórico recente\n${linhas.join("\n")}`;
}

function montarMensagemUsuario(
  mensagemUsuario: string,
  historico: Array<{ papel: "user" | "assistant"; conteudo: string }>,
  anexosImagem: EntradaVisaoGemma["imagens"],
): string {
  const partes: string[] = [];
  const blocoHistorico = montarHistoricoPrompt(historico);
  if (blocoHistorico) partes.push(blocoHistorico);
  if (anexosImagem.length > 0) {
    const temVideo = anexosImagem.some((a) => a.mimeType?.startsWith("video/"));
    partes.push(
      `## Anexos visuais (${temVideo ? "imagens e/ou vídeos" : "imagens"})\n` +
        anexosImagem
          .map((img) => {
            const tipo = img.mimeType?.startsWith("video/") ? "vídeo" : "imagem";
            return `- id=${img.id}; tipo=${tipo}; nome=${img.nome ?? "sem_nome"}; mime=${img.mimeType ?? "desconhecido"}`;
          })
          .join("\n") +
        "\n\nVocê NÃO vê estes anexos por conta própria — use `ver_imagem` (com o id e uma pergunta) para olhar. " +
        "Nunca descreva nem comente o conteúdo deles sem ter chamado a ferramenta.",
    );
  }
  partes.push(`## Pedido atual\n${mensagemUsuario}`);
  return partes.join("\n\n");
}

export async function responderComoLunaAgentico(
  mensagemUsuario: string,
  provedor: ProvedorAgente,
  config: ConfigLuna,
  contextoCompilado: ContextoCompilado,
  opcoes: OpcoesResponderAgentico = {},
): Promise<ResultadoResposta> {
  const inicio = Date.now();
  const historico = opcoes.historico ?? [];
  const anexosImagem = opcoes.anexosImagem ?? [];
  const mapaImagens = new Map(anexosImagem.map((img) => [img.id, img]));
  const ferramentas = listarFerramentasChat();

  const systemPrompt = [
    carregarInstrucaoSistema(),
    compilarGuiaFerramentasPrompt(),
    contextoCompilado.briefing,
    "Se houver dúvida visual, use a ferramenta ver_imagem antes de responder.",
    "Usa `ler_url` quando o usuário colar um link e quiser que leias, resumas ou analises aquela página específica.",
    webSearchDisponivel()
      ? "Usa `web_search` quando precisares de informação actual da internet por palavras-chave (notícias, preços, eventos) — não para abrir um link específico, aí usa `ler_url`. " +
        "Não repitas a mesma pesquisa se os resultados já estão nas tool messages deste turno. " +
        "Na resposta final, estrutura em Markdown com links [nome](url) apenas para fontes que realmente vieram no resultado da ferramenta (campo `results`/`url`). " +
        "Se `web_search` ou `ler_url` devolver `ok: false` ou nenhum resultado, NÃO invente links, nomes de site ou citações. Começa a resposta avisando isso claramente (ex.: \"não encontrei nada na busca sobre X\") antes de qualquer outra coisa — não deixes o aviso escondido no meio ou no fim do texto. " +
        "Nesse caso, se ainda assim quiseres responder com o que sabes do teu próprio treino, deixa isso bem explícito (\"pelo teu treino, sem confirmar agora\") e evita números, datas, versões ou benchmarks específicos que não consegues verificar — não escrevas uma resposta longa e estruturada em tópicos como se fosse pesquisa real; um resumo curto e visivelmente incerto é mais honesto."
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const resultado = await executorAgentico({
    mensagemUsuario: montarMensagemUsuario(mensagemUsuario, historico, anexosImagem),
    systemPrompt,
    ferramentas,
    provedor,
    config,
    raciocinioAtivo: opcoes.raciocinioAtivo !== false,
    raciocinioEffort: opcoes.raciocinioEffort,
    maxRodadas: MAX_RODADAS_AGENTICO,
    onToolCallStart: (nome, argumentos, rodada) => {
      opcoes.onAcao?.({
        tipo: "inicio_ferramenta",
        ferramenta: nome,
        argumentos,
        rodada,
        maxRodadas: MAX_RODADAS_AGENTICO,
      });
    },
    onToolCallComplete: (passo) => {
      const ehFerramentaDePesquisa = passo.ferramenta === "web_search" || passo.ferramenta === "ler_url";
      const analise =
        passo.sucesso && ehFerramentaDePesquisa
          ? analisarResultadoFerramenta(passo.ferramenta, passo.resultado)
          : { ok: passo.sucesso };
      opcoes.onAcao?.({
        tipo: "fim_ferramenta",
        ferramenta: passo.ferramenta,
        argumentos: passo.argumentos,
        rodada: passo.rodada,
        maxRodadas: MAX_RODADAS_AGENTICO,
        sucesso: analise.ok,
        fontes: analise.fontes,
      });
    },
    onRaciocinioRodada: opcoes.onRaciocinio,
    toolExecutor: async (nome, args) => {
      if (nome === "web_search") {
        const query = typeof args.query === "string" ? args.query.trim() : "";
        if (!query) {
          return JSON.stringify({ ok: false, error: "Parâmetro query é obrigatório para web_search." });
        }
        const resultado = await pesquisaWeb(query);
        return JSON.stringify(resultado);
      }

      if (nome === "ler_url") {
        const url = typeof args.url === "string" ? args.url.trim() : "";
        if (!url) {
          return JSON.stringify({ ok: false, error: "Parâmetro url é obrigatório para ler_url." });
        }
        const resultado = await lerUrl(url);
        return JSON.stringify(resultado);
      }

      if (nome === "consultar_atlas") {
        const consulta = typeof args.consulta === "string" ? args.consulta.trim() : "";
        const limiteBruto = typeof args.limite === "number" ? args.limite : undefined;
        if (!consulta) {
          return "Parâmetro inválido: consulta é obrigatória para consultar_atlas.";
        }
        const resultado = await consultarAtlas(consulta, limiteBruto);
        return JSON.stringify(resultado, null, 2);
      }

      if (nome !== "ver_imagem") {
        return `Ferramenta não suportada no chat: ${nome}`;
      }
      const imagemId = typeof args.imagem_id === "string" ? args.imagem_id : undefined;
      const pergunta = typeof args.pergunta === "string" ? args.pergunta : undefined;
      const imagemSelecionada = imagemId ? mapaImagens.get(imagemId) : anexosImagem[anexosImagem.length - 1];
      if (!imagemSelecionada) {
        return "Nenhuma imagem disponível no contexto desta conversa.";
      }
      return visaoGemma({ imagens: [imagemSelecionada], pergunta }, opcoes.visaoDeps);
    },
  });

  return {
    texto: resultado.resposta_final,
    modelo: config.modeloMaior,
    latencia_ms: Date.now() - inicio,
  };
}
