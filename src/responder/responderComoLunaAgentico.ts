import { executorAgentico } from "../agente/executorAgentico.js";
import type { EntradaVisaoGemma, DependenciasVisaoGemma } from "../agentico/especialistas/visaoGemma.js";
import { visaoGemma } from "../agentico/especialistas/visaoGemma.js";
import {
  fatiar,
  lerDocumento,
  type AnexoDocumentoChat,
  type DependenciasLeitorDocumento,
} from "../agentico/especialistas/leitorDocumento.js";
import {
  adicionarSubtarefa,
  apagarBlocoRotina,
  criarBloco,
  criarRotinaAlternativa,
  verRotinas,
  detalharBloco,
  editarBloco,
  pausarBloco,
  removerSubtarefa,
  retomarBloco,
  verRotina,
  type DependenciasRotina,
} from "../ferramentas/maosDaRotina.js";
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
  historico?: Array<{ papel: "user" | "assistant"; conteudo: string; timestamp?: string }>;
  /** Fuso do usuário — usado para datar o histórico ("ontem 23:47"). */
  timeZone?: string;
  anexosImagem?: EntradaVisaoGemma["imagens"];
  /** Documentos do turno (PDF/DOCX/MD…) — lidos por partes, via `ler_arquivo`. */
  anexosDocumento?: AnexoDocumentoChat[];
  leitorDeps?: DependenciasLeitorDocumento;
  /** As mãos dela na rotina — vêm da API (é lá que vive o Firestore). */
  rotinaDeps?: DependenciasRotina;
  raciocinioAtivo?: boolean;
  raciocinioEffort?: "low" | "medium" | "high";
  onAcao?: (acao: AcaoAgenticoChat) => void;
  /** Raciocínio do modelo por rodada (antes de decidir usar ferramentas ou responder). */
  onRaciocinio?: (rodada: number, texto: string, emProgresso: boolean) => void;
  visaoDeps?: DependenciasVisaoGemma;
};

/**
 * Marca de tempo de cada mensagem, em linguagem humana: «ontem 23:47», «hoje 09:12»,
 * «qui, 09/07 14:03».
 *
 * Sem isto, a Luna sabia que horas eram AGORA (bloco de tempo) mas não fazia ideia de
 * QUANDO cada mensagem do histórico tinha acontecido. Uma conversa que atravessa a
 * madrugada virava um borrão sem relógio e ela chutava o dia — "você passou o sábado
 * inteiro codando", num domingo.
 */
function marcaDeTempo(iso: string | undefined, agora: Date, timeZone?: string): string {
  if (!iso) return "";
  const quando = new Date(iso);
  if (Number.isNaN(quando.getTime())) return "";

  const opcoesDia: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", ...(timeZone ? { timeZone } : {}) };
  const opcoesHora: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", ...(timeZone ? { timeZone } : {}) };

  try {
    const dia = (d: Date) => new Intl.DateTimeFormat("pt-BR", opcoesDia).format(d);
    const hora = new Intl.DateTimeFormat("pt-BR", opcoesHora).format(quando);

    const ontem = new Date(agora.getTime() - 86_400_000);
    if (dia(quando) === dia(agora)) return `hoje ${hora}`;
    if (dia(quando) === dia(ontem)) return `ontem ${hora}`;

    const semana = new Intl.DateTimeFormat("pt-BR", {
      weekday: "short",
      ...opcoesDia,
    }).format(quando);
    return `${semana} ${hora}`;
  } catch {
    return "";
  }
}

function montarHistoricoPrompt(
  historico: Array<{ papel: "user" | "assistant"; conteudo: string; timestamp?: string }>,
  timeZone?: string,
): string {
  if (!historico.length) return "";
  const agora = new Date();
  const linhas = historico.slice(-8).map((m) => {
    const marca = marcaDeTempo(m.timestamp, agora, timeZone);
    const quem = m.papel === "user" ? "Usuário" : "Luna";
    const label = marca ? `[${marca}] ${quem}` : quem;
    return `${label}: ${m.conteudo}`;
  });
  return `## Histórico recente\n${linhas.join("\n")}`;
}

/**
 * O cartão do documento — nome, tamanho e quantas partes. NÃO o conteúdo.
 *
 * Antes, o texto do arquivo inteiro era colado na mensagem: um PDF grande era cortado a
 * meio e ela respondia com confiança total sobre um documento do qual perdera 90%, sem
 * saber. Agora ela vê o tamanho real, e vai buscar o que precisa com `ler_arquivo`.
 */
function montarBlocoDocumentos(documentos: AnexoDocumentoChat[]): string {
  const linhas = documentos.map((doc) => {
    const partes = fatiar(doc.texto).length;
    const paginas = doc.paginas ? `${doc.paginas} páginas, ` : "";
    return `- id=${doc.id}; nome=${doc.nome ?? "sem_nome"}; ${paginas}${partes} parte(s) de leitura`;
  });

  const grande = documentos.some((doc) => fatiar(doc.texto).length > 1);

  return [
    "## Documentos anexados",
    ...linhas,
    "",
    "Você NÃO leu estes documentos — use `ler_arquivo` para ler. Sem argumentos ela devolve o mapa (sumário e partes); " +
      "com `pergunta` devolve a resposta com a parte citada; com `parte` devolve o texto cru.",
    grande
      ? "Estes arquivos são grandes demais para ler de uma vez. Leia por partes e seja HONESTA sobre isso com a pessoa " +
        "(«li 1 de 14 — quer que eu continue, ou procuro algo específico?»). Nunca finja ter lido o que não leste."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function montarMensagemUsuario(
  mensagemUsuario: string,
  historico: Array<{ papel: "user" | "assistant"; conteudo: string; timestamp?: string }>,
  anexosImagem: EntradaVisaoGemma["imagens"],
  anexosDocumento: AnexoDocumentoChat[],
  timeZone?: string,
): string {
  const partes: string[] = [];
  const blocoHistorico = montarHistoricoPrompt(historico, timeZone);
  if (blocoHistorico) partes.push(blocoHistorico);
  if (anexosDocumento.length > 0) partes.push(montarBlocoDocumentos(anexosDocumento));
  if (anexosImagem.length > 0) {
    const descrever = (img: EntradaVisaoGemma["imagens"][number]) => {
      const tipo = img.mimeType?.startsWith("video/") ? "vídeo" : "imagem";
      return `- id=${img.id}; tipo=${tipo}; nome=${img.nome ?? "sem_nome"}`;
    };
    const agora = anexosImagem.filter((a) => !a.deTurnoAnterior);
    const antes = anexosImagem.filter((a) => a.deTurnoAnterior);

    const blocos: string[] = [];
    if (agora.length > 0) {
      blocos.push(`## Anexos DESTE pedido\n${agora.map(descrever).join("\n")}`);
    }
    if (antes.length > 0) {
      blocos.push(
        "## Anexos de turnos anteriores desta conversa\n" +
          antes.map(descrever).join("\n") +
          "\n(Só olha estes se o Ethan se referir a eles — ex.: «aquela foto que te mandei».)",
      );
    }
    blocos.push(
      "Você NÃO vê nenhum destes anexos por conta própria: use `ver_imagem` (com o id e uma pergunta focada) para olhar. " +
        "Nunca descreva nem comente o conteúdo de um anexo sem ter chamado a ferramenta — se não olhaste, não sabes o que lá está.",
    );
    partes.push(blocos.join("\n\n"));
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

  /**
   * A imagem "mais recente" quando ela não diz qual.
   *
   * Era `anexosImagem[length - 1]` — e a lista é montada como
   * `[...anexosDoTurno, ...anexosDeTurnosAnteriores]`. Ou seja: a ÚLTIMA da lista era uma
   * foto ANTIGA. O Ethan mandava uma foto nova e ela comentava a de horas atrás, com toda
   * a confiança. A imagem do turno é sempre a que ele acabou de mandar.
   */
  const imagemMaisRecente = (): (typeof anexosImagem)[number] | undefined => {
    const doTurno = anexosImagem.filter((img) => !img.deTurnoAnterior);
    const lista = doTurno.length > 0 ? doTurno : anexosImagem;
    return lista[lista.length - 1];
  };
  const anexosDocumento = opcoes.anexosDocumento ?? [];
  const mapaDocumentos = new Map(anexosDocumento.map((doc) => [doc.id, doc]));
  const ferramentas = listarFerramentasChat();

  /**
   * Nome da ferramenta para EXIBIR no app. O modelo continua chamando `ver_imagem`
   * (uma ferramenta só, mais simples para ele), mas quem está do outro lado precisa
   * ver "assistindo o vídeo" e não "olhando a imagem" quando o anexo é um vídeo.
   * Resolvemos o alvo aqui — é o mesmo alvo que o executor vai escolher.
   */
  const nomeFerramentaParaUi = (nome: string, argumentos: Record<string, unknown>): string => {
    if (nome !== "ver_imagem") return nome;
    const id = typeof argumentos.imagem_id === "string" ? argumentos.imagem_id : undefined;
    const alvo = id ? mapaImagens.get(id) : imagemMaisRecente();
    return alvo?.mimeType?.startsWith("video/") ? "ver_video" : nome;
  };

  const systemPrompt = [
    carregarInstrucaoSistema(),
    compilarGuiaFerramentasPrompt(),
    contextoCompilado.briefing,
    // A Luna já recebe o relógio real e agora também a hora de cada mensagem do
    // histórico. O que faltava era a POSTURA: ela dizia o dia certo e, ao primeiro
    // empurrão do Ethan, pedia desculpas por um erro que não tinha cometido.
    "Sobre datas e horas: o relógio no briefing e as marcas do histórico ([hoje 09:12], [ontem 23:47]) são a verdade — " +
      "não deduzas o dia pelo clima da conversa nem repitas um dia que tu própria disseste antes sem conferir. " +
      "Se alguém te corrigir e o relógio te der razão, mantém-te com calma e mostra a hora, em vez de pedir desculpa por um erro que não cometeste.",
    // Era "se houver dúvida visual, use ver_imagem" — condicional demais. Na prática ela
    // recebia um print e respondia "manda aí, tô aqui", com a imagem já na mão, ou pedia
    // ao Ethan que descrevesse o que ele acabara de lhe mandar. Agora é imperativo.
    "Se há imagem ou vídeo anexado NESTE turno, use `ver_imagem` ANTES de responder — sempre, mesmo que a pessoa não peça nada. " +
      "Ela mandou o anexo justamente para que tu visses; pedir que ela descreva o que acabou de te enviar é o oposto de estar presente. " +
      "E podes olhar mais de uma vez, com perguntas diferentes: é uma conversa com quem vê, não um scanner.",
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
    mensagemUsuario: montarMensagemUsuario(
      mensagemUsuario,
      historico,
      anexosImagem,
      anexosDocumento,
      opcoes.timeZone,
    ),
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
        ferramenta: nomeFerramentaParaUi(nome, argumentos),
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
        ferramenta: nomeFerramentaParaUi(passo.ferramenta, passo.argumentos),
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

      // ── As mãos dela na rotina ────────────────────────────────────────────
      //
      // Sem isto, quando ele pedisse «monta-me a semana», ela só podia FINGIR que montou.
      // E a ferramenta devolve ERRO em vez de rebentar: é isso que a impede de mentir por
      // ignorância — se o bloco não foi criado, ela LÊ que não foi, e diz-lho.
      if (
        nome === "ver_rotina" ||
        nome === "criar_bloco" ||
        nome === "editar_bloco" ||
        nome === "detalhar_bloco" ||
        nome === "adicionar_subtarefa" ||
        nome === "remover_subtarefa" ||
        nome === "pausar_bloco" ||
        nome === "retomar_bloco" ||
        nome === "ver_rotinas" ||
        nome === "criar_rotina" ||
        nome === "apagar_bloco"
      ) {
        if (!opcoes.rotinaDeps) {
          return "A rotina não está disponível neste ambiente — não consegues vê-la nem mexer nela.";
        }
        if (nome === "ver_rotina") {
          const dia = typeof args.dia === "number" ? args.dia : undefined;
          return verRotina(opcoes.rotinaDeps, dia);
        }
        if (nome === "criar_bloco") return criarBloco(opcoes.rotinaDeps, args);
        if (nome === "editar_bloco") return editarBloco(opcoes.rotinaDeps, args);
        if (nome === "detalhar_bloco") return detalharBloco(opcoes.rotinaDeps, args);
        if (nome === "adicionar_subtarefa") return adicionarSubtarefa(opcoes.rotinaDeps, args);
        if (nome === "remover_subtarefa") return removerSubtarefa(opcoes.rotinaDeps, args);
        if (nome === "pausar_bloco") return pausarBloco(opcoes.rotinaDeps, args);
        if (nome === "retomar_bloco") return retomarBloco(opcoes.rotinaDeps, args);
        if (nome === "ver_rotinas") return verRotinas(opcoes.rotinaDeps);
        if (nome === "criar_rotina") return criarRotinaAlternativa(opcoes.rotinaDeps, args);
        return apagarBlocoRotina(opcoes.rotinaDeps, args);
      }

      if (nome === "ler_arquivo") {
        const arquivoId = typeof args.arquivo_id === "string" ? args.arquivo_id : undefined;
        const perguntaDoc = typeof args.pergunta === "string" ? args.pergunta : undefined;
        const parte = typeof args.parte === "number" ? args.parte : undefined;

        const doc = arquivoId
          ? mapaDocumentos.get(arquivoId)
          : anexosDocumento[anexosDocumento.length - 1];

        if (!doc) {
          return "Nenhum documento disponível no contexto desta conversa.";
        }
        return lerDocumento({ documento: doc, pergunta: perguntaDoc, parte }, opcoes.leitorDeps);
      }

      if (nome !== "ver_imagem") {
        return `Ferramenta não suportada no chat: ${nome}`;
      }
      const imagemId = typeof args.imagem_id === "string" ? args.imagem_id : undefined;
      const pergunta = typeof args.pergunta === "string" ? args.pergunta : undefined;
      const imagemSelecionada = imagemId ? mapaImagens.get(imagemId) : imagemMaisRecente();
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
