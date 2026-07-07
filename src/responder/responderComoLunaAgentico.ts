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

export type AcaoAgenticoChat = {
  tipo: "inicio_ferramenta" | "fim_ferramenta";
  ferramenta: string;
  argumentos: Record<string, unknown>;
  rodada: number;
  sucesso?: boolean;
};

export type OpcoesResponderAgentico = {
  historico?: Array<{ papel: "user" | "assistant"; conteudo: string }>;
  anexosImagem?: EntradaVisaoGemma["imagens"];
  raciocinioAtivo?: boolean;
  onAcao?: (acao: AcaoAgenticoChat) => void;
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
    partes.push(
      "## Imagens anexadas\n" +
        anexosImagem
          .map((img) => `- id=${img.id}; nome=${img.nome ?? "sem_nome"}; mime=${img.mimeType ?? "desconhecido"}`)
          .join("\n"),
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
    webSearchDisponivel()
      ? "Usa `web_search` quando precisares de informação actual da internet (notícias, preços, eventos). " +
        "Não repitas a mesma pesquisa se os resultados já estão nas tool messages deste turno. " +
        "Na resposta final, estrutura em Markdown com links [nome](url) para fontes reais."
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
    maxRodadas: 4,
    onToolCallStart: (nome, argumentos, rodada) => {
      opcoes.onAcao?.({ tipo: "inicio_ferramenta", ferramenta: nome, argumentos, rodada });
    },
    onToolCallComplete: (passo) => {
      opcoes.onAcao?.({
        tipo: "fim_ferramenta",
        ferramenta: passo.ferramenta,
        argumentos: passo.argumentos,
        rodada: passo.rodada,
        sucesso: passo.sucesso,
      });
    },
    toolExecutor: async (nome, args) => {
      if (nome === "web_search") {
        const query = typeof args.query === "string" ? args.query.trim() : "";
        if (!query) {
          return JSON.stringify({ ok: false, error: "Parâmetro query é obrigatório para web_search." });
        }
        const resultado = await pesquisaWeb(query);
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
