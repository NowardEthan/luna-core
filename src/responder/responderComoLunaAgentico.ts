import { executorAgentico } from "../agente/executorAgentico.js";
import { blocoPromptIdiomaRaciocinio } from "../providers/raciocinioApi.js";
import { DIRETRIZ_MODO_TECNICO } from "./diretrizModoTecnico.js";
import type { EntradaVisaoGemma, DependenciasVisaoGemma } from "../agentico/especialistas/visaoGemma.js";
import { visaoGemma } from "../agentico/especialistas/visaoGemma.js";
import {
  fatiar,
  lerDocumento,
  type AnexoDocumentoChat,
  type DependenciasLeitorDocumento,
} from "../agentico/especialistas/leitorDocumento.js";
import {
  apagarBlocoRotina,
  criarBloco,
  criarRotinaAlternativa,
  detalharBloco,
  editarBloco,
  editarRotinaAlternativa,
  organizarTarefas,
  pausarBloco,
  retomarBloco,
  verRotina,
  verRotinas,
  apagarRotinaAlternativa,
  type DependenciasRotina,
} from "../ferramentas/maosDaRotina.js";
import { anotarIdeia, verIdeias } from "../ferramentas/maosDasIdeias.js";
import {
  gerirCarteira,
  gerirMeta,
  gerirRecorrente,
  listarLancamentosFinanca,
  registrarLancamento,
  resumoFinanceiro,
  transferirEntreCarteiras,
  type DependenciasFinancas,
} from "../ferramentas/maosDasFinancas.js";
import {
  criarDocumento as criarDocumentoFerramenta,
  listarDocumentos as listarDocumentosFerramenta,
  lerDocumento as lerDocumentoFerramenta,
  lerEstruturaDocumento as lerEstruturaDocumentoFerramenta,
  lerSecaoDocumento as lerSecaoDocumentoFerramenta,
  buscarNoDocumento as buscarNoDocumentoFerramenta,
  editarDocumento as editarDocumentoFerramenta,
  editarTrechoDocumento as editarTrechoDocumentoFerramenta,
  anotarCanone as anotarCanoneFerramenta,
  lerBlocoDocumento as lerBlocoDocumentoFerramenta,
  inserirBlocosDocumento as inserirBlocosDocumentoFerramenta,
  editarBlocoDocumento as editarBlocoDocumentoFerramenta,
  mapearSecoes,
} from "../ferramentas/maosDosDocumentos.js";
import { carregarInstrucaoSistema } from "../constitution/carregador.js";
import type { ContextoCompilado } from "../contexto/compiladorContexto.js";
import { compilarGuiaFerramentasPrompt } from "../personalidade/compilarGuiaFerramentas.js";
import type { ConfigLuna, ProvedorAgente } from "../providers/tipos.js";
import type { ResultadoResposta } from "./responderLuna.js";
import { listarFerramentasChat } from "../ferramentas/registroFerramentasChat.js";
import { consultarAtlas } from "../atlas/consultarAtlas.js";
import { pesquisaWeb, webSearchDisponivel } from "../ferramentas/pesquisaWeb.js";
import { lerUrl } from "../ferramentas/lerUrl.js";
import { verificarFontes, formatarVerificacao, type FonteDossie } from "../ferramentas/verificarFontes.js";
import {
  mensagemContemUrl,
  mensagemPedeFinancas,
  mensagemSugerePesquisaWeb,
} from "../pipeline/detectoresIntencao.js";

export type FonteAgentico = {
  title?: string;
  url: string;
  snippet?: string;
  publishedAt?: string;
  status?: "found" | "reading" | "read" | "verified" | "rejected" | "cited";
};

const MAX_RODADAS_AGENTICO = 4;
// Com o plano em passos ligado, uma tarefa legítima gasta rodadas de sobra: `planejar` +
// (executar+`concluir_passo`) por passo. Um teto de 4 estrangularia a cadeia logo no 2º passo.
// Só sobe quando o planejamento está ativo (OrbitLab); o chat comum continua enxuto em 4.
const MAX_RODADAS_PLANEJAMENTO = 12;

/** Um passo do plano do turno: o texto e se já foi marcado como feito. */
export type PassoPlano = { texto: string; feito: boolean };

export type AcaoAgenticoChat = {
  tipo: "inicio_ferramenta" | "fim_ferramenta" | "plano";
  ferramenta: string;
  argumentos: Record<string, unknown>;
  rodada: number;
  maxRodadas: number;
  sucesso?: boolean;
  fontes?: FonteAgentico[];
  /**
   * A imagem que a Luna acabou de desenhar — presente só no `fim_ferramenta` de `gerar_imagem`.
   * A URL nasce no servidor (depois do upload), então não está nos `argumentos`; viaja aqui.
   */
  imagem?: { url: string; prompt: string };
  /**
   * A pergunta com opções que a Luna fez ao usuário — presente só no `fim_ferramenta` de
   * `perguntar`. O app renderiza um cartão com as opções tocáveis; tocar vira a próxima mensagem.
   */
  pergunta?: { texto: string; opcoes: string[] };
  /** Snapshot da lista de passos — presente só quando `tipo: "plano"`. */
  plano?: PassoPlano[];
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

/**
 * A URL da imagem nasce no servidor (depois do upload), então não está nos argumentos da
 * ferramenta. `gerar_imagem` devolve-a no JSON de resultado — daqui ela viaja no evento
 * fim_ferramenta pro app montar o cartão. Devolve null se o passo falhou (a Luna já leu o erro).
 */
function extrairImagemDoResultado(resultadoJson: string): { url: string; prompt: string } | null {
  try {
    const parsed = JSON.parse(resultadoJson) as {
      ok?: boolean;
      imagem?: { url?: unknown; prompt?: unknown };
    };
    if (parsed.ok !== true || !parsed.imagem) return null;
    const url = typeof parsed.imagem.url === "string" ? parsed.imagem.url : "";
    const prompt = typeof parsed.imagem.prompt === "string" ? parsed.imagem.prompt : "";
    return url ? { url, prompt } : null;
  } catch {
    return null;
  }
}

/**
 * A pergunta+opções da ferramenta `perguntar` nasce nos argumentos, mas normalizo aqui (2 a 4
 * opções não-vazias) e faço viajar no evento fim_ferramenta pro app montar o cartão de opções.
 * Devolve null se não houver pergunta ou opções válidas.
 */
function extrairPerguntaDoResultado(resultadoJson: string): { texto: string; opcoes: string[] } | null {
  try {
    const parsed = JSON.parse(resultadoJson) as {
      ok?: boolean;
      pergunta?: { texto?: unknown; opcoes?: unknown };
    };
    if (parsed.ok !== true || !parsed.pergunta) return null;
    const texto = typeof parsed.pergunta.texto === "string" ? parsed.pergunta.texto.trim() : "";
    const opcoes = Array.isArray(parsed.pergunta.opcoes)
      ? parsed.pergunta.opcoes
          .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
          .map((o) => o.trim())
          .slice(0, 4)
      : [];
    return texto && opcoes.length >= 2 ? { texto, opcoes } : null;
  } catch {
    return null;
  }
}

/** Junta as deps de finanças a partir das mãos da rotina (mesmo objeto, campos opcionais). */
function montarDepsFinancas(deps: DependenciasRotina): DependenciasFinancas {
  return {
    criarLancamento: deps.criarLancamento ?? (async () => ""),
    listarLancamentos: deps.listarLancamentos ?? (async () => []),
    listarCarteiras: deps.listarCarteiras ?? (async () => []),
    criarCarteira: deps.criarCarteira,
    atualizarCarteira: deps.atualizarCarteira,
    arquivarCarteira: deps.arquivarCarteira,
    listarRecorrentes: deps.listarRecorrentes,
    criarRecorrente: deps.criarRecorrente,
    atualizarRecorrente: deps.atualizarRecorrente,
    criarTransferencia: deps.criarTransferencia,
    listarMetas: deps.listarMetas,
    criarMeta: deps.criarMeta,
    atualizarMeta: deps.atualizarMeta,
    apagarMeta: deps.apagarMeta,
    reaisParaCentavos: deps.reaisParaCentavos ?? (() => -1),
    faixaPeriodo: deps.faixaPeriodoFinancas ?? (() => ({ inicio: 0, fim: 0 })),
  };
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
  /** Modo pesquisa profunda (opcional): habilita a ferramenta `verificar_fontes` (cruzar fontes). */
  pesquisaProfunda?: boolean;
  /** Artefatos ativos (opcional): habilita a ferramenta `criar_artefato`. Só o OrbitLab liga, por ora. */
  documentosAtivo?: boolean;
  /** Modo técnico (opcional): troca a voz calorosa/casual de sempre por um registro detalhista, rigoroso e formal (maiúsculas, pontuação, seções). */
  modoTecnico?: boolean;
  onAcao?: (acao: AcaoAgenticoChat) => void;
  /** Raciocínio do modelo por rodada (antes de decidir usar ferramentas ou responder). */
  onRaciocinio?: (rodada: number, texto: string, emProgresso: boolean) => void;
  /**
   * Ponte visível entre ações («Vou ler…») — vira SSE `content` mid-loop no path agentico.
   */
  onNarracao?: (texto: string) => void;
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

/**
 * Diretriz de DOCUMENTOS — só entra quando `documentosAtivo` (OrbitLab). O bug: ela TINHA a
 * ferramenta na mão (o turno já é agêntico) mas o deepseek, tímido, escrevia o texto na bolha e
 * dizia «documento criado» sem chamar nada. Igual foi com o `ver_imagem`: ter a ferramenta não
 * basta, é preciso a ORDEM. Aqui a ordem é imperativa e ataca a confabulação de frente.
 */
const DIRETRIZ_DOCUMENTOS =
  "ARTEFATOS ligados: tens ferramentas REAIS para escrever num lugar que FICA (a estante dele), fora do fluxo do chat — `criar_artefato`, e para rever o que já existe `listar_artefatos`/`ler_artefato`/`editar_artefato`. Um ARTEFATO é algo que TU crias e guardas (texto, plano, carta, resumo); não confundas com `ler_arquivo`, que é para os ARQUIVOS/PDFs que ELE anexou. Ele pode dizer «documento» à toa — trata como artefato na mesma. " +
  "A estante é DELE, não só desta conversa: `listar_artefatos` mostra artefatos de TODAS as conversas (marca se é desta ou de outra). Se ele perguntar «lembra daquele artefato», citar um nome («meus gastos») ou falar de algo criado noutro chat — LISTA e procura o título. É PROIBIDO dizer que não existe sem ter listado a estante inteira. " +
  "Quando ele pedir um artefato, um texto, uma carta, um plano, um resumo, um rascunho («escreve isso num artefato/documento», «me faz um texto sobre…», «guarda isso») — ou quando o que construíram é substancial e vale guardar — CHAMA `criar_artefato` com o corpo INTEIRO em `conteudo`. Não escrevas o artefato na bolha do chat. " +
  "A REGRA DE OURO: só existe artefato se tu CHAMASTE a ferramenta. É PROIBIDO dizer «artefato criado», «tá aí o documento», «guardei aí» se não chamaste — isso é mentira, e ele fica à procura de um cartão que não existe. Se escreveste o texto na resposta em vez de chamar a ferramenta, então NÃO criaste artefato nenhum: chama a ferramenta. " +
  "EDITAR (pensa em Markdown/seções, não em ids de bloco): CONTINUAÇÃO («continua», «mais uma parte», «acrescenta») → `inserir_blocos` com `markdown` (só o trecho novo) + `after_secao` (número ou título do índice; omite = fim do artefato). NÃO uses `editar_artefato` pra continuar — isso apaga o que já existia. PONTO (frase/parágrafo) → `editar_trecho_artefato` com cópia EXATA. Só `editar_artefato` (corpo INTEIRO) pra refazer do ZERO. AMBIENTA primeiro (`ler_estrutura` / `ler_secao` / `buscar_no_artefato`). Depois CONFERE. É PROIBIDO dizer «editei» / «já escrevi» sem ter chamado a ferramenta. " +
  "ARTEFATO GRANDE: NÃO leia o corpo inteiro. `ler_estrutura` → `ler_secao` → `inserir_blocos` ou `editar_trecho_artefato`. Se ele cita algo específico: `buscar_no_artefato`. O mapa é barato. Artefato pequeno: `ler_artefato` ok. " +
  "CÂNONE (a bíblia do artefato): num texto grande tu não vês o livro todo — é assim que não saturas — mas por isso podes «esquecer» que a personagem se chama Marina e chamá-la de Mariana no capítulo 8. Para não te contradizeres, guarda os FATOS FIXOS (nomes, idades, relações, decisões de mundo) com `anotar_canone` — é o `AGENTS.md` do teu texto. Quando ele ESTABELECE algo do mundo/personagens, ou quando TU fixas um fato ao escrever, anota-o. Esses fatos aparecem sempre à tua frente (na pré-carga, mesmo quando só vês o índice): antes de escrever ou editar, OLHA o CÂNONE e respeita-o. Passa sempre a lista COMPLETA e atualizada (tu já a tens no contexto) — junta o novo, corrige o que mudou. " +
  "COMO ESCREVER o corpo (isto importa — um artefato não é uma mensagem de chat esticada, dá-lhe FORMA): abre com uma frase ou duas que situam o assunto; divide em SEÇÕES com subtítulos `## ` (e `### ` quando precisares de um nível a mais); usa listas com `- ` para itens soltos e `1. ` para passos em ordem; quando for um PLANO ou uma lista de TAREFAS que ele vai executar e ir riscando, usa CHECKLIST — `- [ ] ` uma caixa por tarefa (em vez de `- `) — que ele marca com o dedo no leitor e fica salvo; começa um item com **termo em negrito** quando há um rótulo a destacar; usa `> ` para um aviso/destaque que merece saltar à vista; se estás a comparar coisas pelos mesmos campos, uma tabela Markdown (| … | … |) lê muito melhor que um parágrafo. Um traço `---` separa partes grandes. NÃO enches de seção por encher — a estrutura serve a leitura, não a enfeita; um bilhete curto continua curto. É a tua voz de sempre, só que organizada para durar e reabrir. " +
  "Depois de criar ou editar, confirma na tua voz, curto, que ficou guardado — e NÃO repitas o texto inteiro no chat (ele abre o cartão para ler).";

/**
 * Pediu mudar formato de propósito? Espelho leve de `mensagemPedeMudancaDeAspecto` (mobile-api)
 * — fica aqui pra o dispatcher não depender do dist da API.
 */
function mensagemPedeMudancaDeAspectoLocal(texto: string): boolean {
  const t = texto.trim();
  if (!t) return false;
  if (/\baspect_ratio\s*=\s*\d+\s*:\s*\d+\b/i.test(t)) return true;
  const temRatio = /\b\d+\s*:\s*\d+\b/.test(t);
  const temFormato =
    /\b(formato|propor[cç][aã]o|aspecto|enquadramento|canvas|widescreen|ultrawide|retrato|portrait|paisagem|landscape|quadrad[ao]|story|stories|vertical|horizontal)\b/i.test(
      t,
    );
  if (temRatio && temFormato) return true;
  if (
    /\b(formato|propor[cç][aã]o|aspecto)\b.{0,48}\b(vertical|horizontal|widescreen|ultrawide|retrato|quadrad|story|16\s*:\s*9|9\s*:\s*16)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /\b(refaz\w*|refaça|refaca|muda|mude|troca|troque)\b.{0,40}\b(formato|propor[cç][aã]o|aspecto|para\s+(vertical|horizontal|widescreen|quadrad))\b/i.test(
      t,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * A mão que DESENHA — a Luna gera imagens. Curta de propósito: é uma mão simples (um prompt →
 * um cartão de imagem). Entra junto com `documentosAtivo` (só no OrbitLab, onde a ferramenta existe).
 */
const DIRETRIZ_IMAGEM =
  "DESENHAR e EDITAR imagens: tens DUAS mãos REAIS que produzem uma imagem de verdade, que aparece " +
  "num cartão aqui no chat — não é metáfora, não é «pintar com palavras».\n" +
  "• `gerar_imagem` (descrição → imagem NOVA do ZERO): quando ele pede uma imagem de um assunto NOVO, " +
  "sem ligação com nenhuma imagem anterior desta conversa («desenha…», «cria uma imagem de…», «como " +
  "seria… numa imagem?»). O `prompt` é a descrição visual — sê concreta (assunto, estilo, cores, luz, " +
  "enquadramento); se ele foi vago, ENRIQUECE com bom senso em vez de interrogar.\n" +
  "• `editar_imagem` (parte da imagem TUA/referenciada como BASE, mantém o SUJEITO): usa SEMPRE que o " +
  "pedido tem CONTINUIDADE com uma imagem que já existe aqui. Quatro casos: (a) RETOQUE — mexer num " +
  "detalhe e preservar o resto («adiciona um sachê», «tira o fundo», «muda a cor»); " +
  "(b) RE-ENCENAR — «o MESMO» gato/objeto/cena num ângulo ou cenário NOVO; " +
  "(c) MUDANÇA SÓ DE ESTILO — «faz realista», «versão fotográfica», «photoreal» da arte que ele " +
  "puxou/da última: SEMPRE `editar_imagem` com essa base. Sofá continua sofá — NUNCA `gerar_imagem` " +
  "(o motor realista do zero inventa outro assunto, ex. um rosto); " +
  "(d) ESTILO A PARTIR DO ANEXO DELE — ele manda foto/arte e pede ajustar ESTILO da TUA arte; passa " +
  "`referencia_id` do anexo. `ver_imagem` SÓ OLHA; não produz cartão. É PROIBIDO dizer que «ajustei " +
  "no estilo» SEM ter chamado `editar_imagem`. " +
  "── BASE ≠ SEMPRE A ÚLTIMA ── se ele REFERENCIOU/PUXOU uma imagem TUA (bloco com URL/`base_url`), " +
  "passa `base_url` com ESSA URL. REGRA DE OURO: «o mesmo…», «esse…», «faz realista» (desta arte), " +
  "«versão foto» — é `editar_imagem`, NUNCA `gerar_imagem`. No RETOQUE, `instrucao` = só o que muda; " +
  "no ESTILO, deixa claro «mesmo sujeito da Image 1, só o estilo».\n" +
  "── PROPORÇÃO / FORMATO ── PRESERVA a proporção da imagem atual em todo retoque " +
  "(«adiciona…», «muda a cor…») — NÃO passes `aspect_ratio` e NÃO mudes o enquadramento, " +
  "a menos que ele PEÇA outro formato (9:16, 16:9, widescreen, story…). " +
  "Quando ele pedir formato novo: passa `aspect_ratio` e CHAMA `editar_imagem` (NUNCA `gerar_imagem` — " +
  "do zero sai OUTRO personagem). Na `instrucao`, sê CURTA: «estende o canvas pra 9:16, mesmo " +
  "sujeito idêntico» — não reescrevas a cena inteira. O formato muda o QUADRO, não a orientação " +
  "do conteúdo — NUNCA girar 90°. Preserva a orientação da base.\n" +
  "Demora alguns segundos. Depois de gerar/editar, a imagem JÁ está à frente dele no cartão: reage a " +
  "ELA — curto, na tua voz (o que achaste, um detalhe). NÃO copies a URL, NÃO descrevas a imagem " +
  "inteira, e NUNCA digas que «não desenhas de verdade» ou que «só pintas com palavras»: tu desenhaste, " +
  "a imagem é real e está ali. É PROIBIDO dizer «desenhei/aqui está» SEM ter chamado a ferramenta. Isto " +
  "é PRODUZIR uma imagem, não «ver» uma que ele mandou.";

/**
 * A mão que PERGUNTA — a Luna consulta antes de agir, com opções tocáveis. O Ethan escolheu que ela
 * seja consultiva: pergunta sempre que houver uma escolha de GOSTO, mesmo que conseguisse chutar. O
 * segredo é que isto PARA o turno: depois de chamar, ela não escreve a resposta, espera a dele.
 */
const DIRETRIZ_PERGUNTAR =
  "PERGUNTAR antes de agir: tens uma mão `perguntar` que faz uma pergunta ao usuário com opções " +
  "tocáveis (ele toca numa ou escreve a dele) e ESPERA a resposta. Usa-a de forma consultiva: SEMPRE " +
  "que houver uma escolha de GOSTO/direção que molda o que vais produzir — estilo, tom, ângulo, " +
  "paleta, formato, rumo, nível de detalhe —, pergunta em vez de chutar, mesmo que conseguisses " +
  "adivinhar. É melhor acertar uma pergunta do que entregar dez versões erradas; é assim que colaboras " +
  "com ele em vez de despejar. Dá 2 a 4 opções curtas e concretas (ele sempre pode escrever a dele — " +
  "não ponhas «outro»). Regras: (1) NÃO uses pra pedir permissão óbvia («posso desenhar?»), pra fugir " +
  "de fazer o que já dá com bom senso, nem pra pedir algo que ele já disse; (2) DEPOIS de `perguntar`, " +
  "PARA — no máximo uma frase de contexto, NUNCA respondas por ele nem sigas adivinhando; (3) uma " +
  "pergunta de cada vez, não empilhes três cartões. Quando ele responder, segue com a escolha dele.";

/**
 * Diretriz do PLANO EM PASSOS — a coleira que segura um modelo one-shot na cadeia. Só entra com
 * `planejamentoAtivo`. A última frase é deliberada: uma edição de documento que ela JÁ tem à frente
 * (pré-carregado) é UM salto — não deve virar plano, senão o plano só acrescenta latência ao caso comum.
 */
const DIRETRIZ_PLANO =
  "TAREFA EM PASSOS: se o pedido exigir MAIS DE UMA ação encadeada (ler um documento e depois reescrevê-lo; " +
  "montar vários blocos; pesquisar e depois cruzar as fontes), começa por `planejar` com 2 a 5 passos curtos — a " +
  "lista fica visível pra ele conferir o teu caminho. Depois executa UM passo de cada vez e, a cada passo realmente " +
  "feito, chama `concluir_passo(nº)`; se descobrires que falta algo, `adicionar_passo`. Enquanto houver passo por " +
  "marcar, NÃO entregues a RESPOSTA FINAL — o teu trabalho não acabou. Podes (e deves) falar UMA frase curta de ponte " +
  "antes de cada ação («Vou ler a estrutura…», «Entendi, agora edito o trecho.») na MESMA rodada em que chamas a " +
  "ferramenta. Para um pedido de UMA ação só (uma pergunta, uma criação simples, uma edição de um documento que já " +
  "tens à frente), NÃO uses o plano: vai direto, é mais rápido.";

/**
 * Narração estilo Cursor — pontes curtas entre ações. Complementa (não substitui) o anti-meta
 * de tom/plano interno: aqui a fala VISÍVEL é «vou fazer X», não o monólogo de raciocínio.
 */
const DIRETRIZ_NARRACAO_AGENTICA =
  "QUANDO fores USAR FERRAMENTAS: fala COM ele em pontes curtas (1 frase), no mesmo turno da tool — " +
  "como um agente que mostra o que está fazendo. Exemplos bons: «Vou ler o artefato pra me informar.» / " +
  "«Entendi. Agora ajusto só esse trecho.» / «Deixa eu checar o extrato.» Depois CHAMA a ferramenta. " +
  "A timeline já mostra o gerúndio (Lendo… / Editando…); a tua frase é a intenção humana, não um relatório. " +
  "NÃO escrevas monólogos longos entre passos, NÃO narres o teu tom interno, NÃO digas que fez algo " +
  "sem ter chamado a ferramenta. Small talk sem tools: responde normal, sem teatro de «vou…».";

/**
 * Ambientar → agir → conferir. Corta o salto direto pra edição e lembra que web_search existe
 * quando o fato não está na estante / no contexto.
 */
const DIRETRIZ_AMBIENTAR =
  "AMBIENTAR antes de AGIR: se o pedido mexe em algo que já existe (artefato, extrato, memória, " +
  "contexto da conversa), ORIENTA-TE primeiro — lista, lê estrutura/trecho/resumo — e SÓ DEPOIS " +
  "edita, cria ou conclui. Não saltes direto pra mão de escrita porque «já imaginaste» o conteúdo. " +
  "DEPOIS de alterar, CONFERE o resultado (releia o ponto mexido ou a estrutura) antes de dizer que " +
  "está pronto. Se falta fato PÚBLICO (versão, data, notícia, cotação, doc externa) e as mãos locais " +
  "não bastam, usa `web_search` / `ler_url` — pesquisa de verdade; não inventes links nem números.";

/**
 * Orientação antes de escrever num artefato que JÁ existe (plano, carta, spec, narrativa…).
 * Raciocínio com as mãos — ler de verdade — não monólogo meta.
 */
const DIRETRIZ_ORIENTACAO_ESCRITA =
  "ORIENTAÇÃO antes de ESCREVER num artefato que já existe (plano, checklist, carta, resumo, " +
  "notas, spec, roteiro, diário, narrativa…): NÃO invente no vácuo. " +
  "1) `ler_estrutura` 2) `ler_secao` da seção alvo ou da última (ou `ler_artefato` se for curto) " +
  "3) olhe o CÂNONE; fato novo → `anotar_canone` depois. " +
  "Absorva tom, estrutura, decisões, vocabulário (e personagens/andamento se for ficção). " +
  "Continuação: `inserir_blocos` com markdown + after_secao (número/título). " +
  "Proibido continuar «de cabeça» só com títulos. Ponte curta → tools → escrita. " +
  "Artefato NOVO (`criar_artefato`) / bilhete curto: orientação leve.";

/**
 * Depois de escrever: conferir índice/trecho + perguntar se está bom / o que melhorar.
 */
const DIRETRIZ_AUDITORIA_ARTEFATO =
  "AUDITORIA depois de ESCREVER/EDITAR artefato: releia (`ler_estrutura` ou `ler_secao` do pedaço " +
  "mexido). Confira se as seções antigas ainda estão e se o novo entrou no lugar certo. " +
  "Pergunte-se: isso ficou bom pro pedido? está no mesmo tom do resto? falta clareza / sobra " +
  "enrolação / contradiz o que já estava? Como melhorar AGORA com mão cirúrgica " +
  "(`editar_trecho_artefato` / `editar_bloco_artefato` / `inserir_blocos` pontual) — sem " +
  "reescrever o doc inteiro? Se achar falha clara, corrija; se ok, feche curto. Sem teatro de " +
  "«12 critérios». É PROIBIDO dizer «pronto / escrevi a seção» sem ter releído depois da escrita.";

/** Continuação de conteúdo — NÃO usar `editar_artefato` (reescreve e apaga). */
function mensagemPedeContinuacaoArtefato(texto: string): boolean {
  const t = texto.trim();
  if (!t) return false;
  if (
    /\b(continu\w*|prossegu\w*|segu(?:e|ir)\s+(com|o|a|no|na)|completa\w*|completar)\b/i.test(t)
  ) {
    return true;
  }
  if (
    /\b(ep[íi]logo|mais\s+uma?\s+parte|mais\s+um\s+cap|pr[óo]xim\w*\s+(parte|se[cç][aã]o|cap)|acrescent\w*|adicion\w*)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  return /\b(escrev\w+|redij\w+)\b[^.?!\n]{0,40}\b(mais|pr[óo]xim|continu|ep[íi]logo|cap[íi]tulo|se[cç][aã]o)\b/i.test(
    t,
  );
}

/** Pedido de mexer em artefato existente — exige leitura antes de escrever. */
function mensagemPedeMexerArtefatoExistente(texto: string): boolean {
  if (mensagemPedeContinuacaoArtefato(texto)) return true;
  return (
    /\b(revis\w+|reescrev\w+|refaz|refaça|refaca|ajust\w+|corrig\w+|corrija|melhor\w+|expand\w+|amplia\w*|acrescent\w+|adicion\w+|remov\w+|troc\w+|muda|mude|mudar|alter\w+|edita\w*|edite)\b/i.test(
      texto,
    ) &&
    /\b(artefato|documento|cap[íi]tulo|se[cç][aã]o|plano|checklist|carta|resumo|nota|spec|roteiro|texto|estante)\b/i.test(
      texto,
    )
  );
}

const FERRAMENTAS_LEITURA_ARTEFATO = new Set([
  "ler_estrutura",
  "ler_secao",
  "ler_artefato",
  "buscar_no_artefato",
  "ler_bloco",
]);

const FERRAMENTAS_ESCRITA_ARTEFATO = new Set([
  "inserir_blocos",
  "editar_trecho_artefato",
  "editar_bloco_artefato",
  "editar_artefato",
]);

/**
 * Diretriz de FINANÇAS — a grana DELE vive nas mãos `resumo_financeiro` / `listar_lancamentos` /
 * `registrar_lancamento` / etc. Sem isto, o modelo (com `web_search` na mão no modo agêntico)
 * ia pra internet quando ele perguntava «quanto gastei» — inventava fontes públicas em vez de
 * ler a carteira. Mesmo espírito da DIRETRIZ_DOCUMENTOS: ter a ferramenta não basta.
 */
const DIRETRIZ_FINANCAS =
  "FINANÇAS DELE (módulo Finanças do app): tens mãos REAIS — `resumo_financeiro`, `listar_lancamentos`, " +
  "`registrar_lancamento`, `gerir_recorrente`, `gerir_carteira`, `gerir_meta`, `transferir`. " +
  "Quando ele pergunta quanto GASTOU / SAIU / ENTROU, pede extrato, resumo, fatura, cartão, carteira, " +
  "meta, orçamento, ou pede pra anotar gasto / criar cartão / criar meta / transferir — CHAMA essas mãos. " +
  "Criar CARTÃO = `gerir_carteira` (acao=criar, tipo=cartao_credito). Criar CONTA = tipo=conta_debito. " +
  "Criar META = `gerir_meta`. É PROIBIDO usar `web_search` ou `ler_url` pra a grana DELE. " +
  "`web_search` só se ele pedir algo público (cotação, notícia). Não inventes números. " +
  "Só confirma «criei o cartão» / «registrei» / «transferi» / «criei a meta» DEPOIS de chamar a mão " +
  "E só se o resultado NÃO começar com ERRO — se veio ERRO, diz o que faltou (carteira, valor…) e NÃO finja que gravou.";

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
  // Planejamento em passos: por ora anda junto com os documentos (só o OrbitLab liga). Quando o
  // seletor de modos chegar ao app, é este flag que o modo agêntico vai acender por conta própria.
  const planejamentoAtivo = opcoes.documentosAtivo === true;
  // Orçamento vivo: sobe quando o plano cresce (planejar / adicionar_passo).
  let maxRodadas = planejamentoAtivo ? MAX_RODADAS_PLANEJAMENTO : MAX_RODADAS_AGENTICO;
  const recalcularMaxRodadas = () => {
    if (!planejamentoAtivo) return;
    maxRodadas = Math.max(MAX_RODADAS_PLANEJAMENTO, 3 + plano.length * 2 + 2);
  };
  const pedeFinancas = mensagemPedeFinancas(mensagemUsuario);
  // Grana pessoal ≠ pesquisa web. Se o turno é financeiro e ele NÃO pediu busca/URL,
  // tira `web_search` da mão — o prompt sozinho não segura o deepseek.
  const pedeWebExplicita =
    mensagemSugerePesquisaWeb(mensagemUsuario) || mensagemContemUrl(mensagemUsuario);
  const ferramentasBrutas = listarFerramentasChat({
    pesquisaProfunda: opcoes.pesquisaProfunda,
    documentosAtivo: opcoes.documentosAtivo,
    planejamentoAtivo,
  });
  const ferramentas =
    pedeFinancas && !pedeWebExplicita
      ? ferramentasBrutas.filter(
          (f) => f.nome !== "web_search" && f.nome !== "verificar_fontes",
        )
      : ferramentasBrutas;

  // ── O plano em passos deste turno (estado vivo, morre com o turno) ────────────
  // A Luna DECLARA os passos (`planejar`), marca um a um (`concluir_passo`), pode acrescentar
  // (`adicionar_passo`). Cada marca devolve o próximo passo e re-injeta a ordem de continuar —
  // é isso que traz o modelo tímido de volta ao loop em vez de largar tudo na bolha.
  const plano: PassoPlano[] = [];
  const emitirPlano = () => {
    opcoes.onAcao?.({
      tipo: "plano",
      ferramenta: "plano",
      argumentos: {},
      rodada: 0,
      maxRodadas,
      plano: plano.map((p) => ({ ...p })),
    });
  };
  const renderPlano = (): string =>
    plano.length === 0
      ? "(plano vazio)"
      : "PLANO:\n" + plano.map((p, i) => `${p.feito ? "☑" : "☐"} ${i + 1}. ${p.texto}`).join("\n");
  const planoAindaAberto = (): {
    abertos: number;
    proximoNumero: number;
    proximo: string;
    render: string;
  } | null => {
    if (plano.length === 0) return null;
    const idx = plano.findIndex((p) => !p.feito);
    if (idx === -1) return null;
    return {
      abertos: plano.filter((p) => !p.feito).length,
      proximoNumero: idx + 1,
      proximo: plano[idx].texto,
      render: renderPlano(),
    };
  };

  // Dossiê do turno: os trechos que ela realmente leu (web_search/ler_url). É contra ISTO
  // que `verificar_fontes` cruza — não contra o palpite do modelo. Só se acumula no modo
  // profundo; fora dele, fica vazio e a ferramenta nem existe.
  const dossieFontes: FonteDossie[] = [];
  const registrarNoDossie = (ferramenta: string, resultadoJson: string) => {
    if (!opcoes.pesquisaProfunda) return;
    const analise = analisarResultadoFerramenta(ferramenta, resultadoJson);
    for (const f of analise.fontes ?? []) {
      dossieFontes.push({
        url: f.url,
        title: f.title,
        trecho: (f.snippet ?? "").slice(0, 600),
      });
    }
  };

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

  // Pré-carrega os documentos DESTA conversa direto no contexto.
  // Sem isto, EDITAR exige uma cadeia listar→ler→editar que o deepseek abandona no meio: faz UMA
  // chamada (o `ler`), "vê" o corpo, sente-se pronto e escreve a revisão NA BOLHA em vez de gravar.
  // Com o corpo já à frente, editar vira UM passo só — a mesma ergonomia da criação.
  //
  // MAS num artefato GRANDE (um livro, um texto longo), despejar o corpo inteiro é o que a faz
  // saturar e confabular. Então aqui aplicamos o «livro é uma codebase»: pequeno → corpo inteiro
  // (barato, cômodo); grande com seções → só o ÍNDICE (o mapa), e ela abre a seção certa com
  // `ler_secao` antes de mexer. Só no OrbitLab (documentosAtivo) e só quando a conversa tem estante.
  //
  // `listarDocumentos` agora devolve a estante INTEIRA (pra ela achar «meus gastos» noutro chat);
  // a pré-carga filtra `destaConversa` — senão despejava livro alheio no contexto do turno.
  const LIMITE_ARTEFATO_GRANDE = 6000; // caracteres — acima disto, injeta o MAPA em vez do corpo
  let blocoDocumentosDaConversa: string | null = null;
  if (
    opcoes.documentosAtivo &&
    opcoes.rotinaDeps?.listarDocumentos &&
    opcoes.rotinaDeps?.lerDocumento
  ) {
    try {
      const listaBruta = await opcoes.rotinaDeps.listarDocumentos();
      const lista = listaBruta.filter((d) => d.destaConversa !== false);
      if (lista.length > 0) {
        const partes: string[] = [];
        for (const d of lista.slice(0, 3)) {
          const doc = await opcoes.rotinaDeps.lerDocumento(d.id);
          const corpo = doc?.conteudo?.trim() || "";
          const secoes = corpo ? mapearSecoes(corpo) : [];
          // A BÍBLIA do artefato (fatos fixos) entra SEMPRE, grande ou pequeno — é curta e é ela que
          // impede a contradição (trocar o nome de um personagem entre capítulos). Fica à frente
          // dela mesmo quando só damos o índice.
          const canone = doc?.canone?.trim() || "";
          const blocoCanone = canone
            ? `\n  CÂNONE (fatos FIXOS deste artefato — respeita-os, NÃO os contradigas; se um fato mudar, ` +
              `atualiza com \`anotar_canone\`):\n${canone.split("\n").map((l) => `    ${l}`).join("\n")}`
            : "";
          if (corpo.length > LIMITE_ARTEFATO_GRANDE && secoes.length > 0) {
            // Grande e seccionado: dá o mapa, não o livro.
            const indice = secoes
              .map((s) => `  ${s.numero}. ${"  ".repeat(Math.max(0, s.nivel - 1))}${s.titulo} (~${s.palavras} palavras)`)
              .join("\n");
            partes.push(
              `— id: ${d.id} · «${d.titulo}» — ARTEFATO GRANDE. Em vez do corpo, aqui está só o ÍNDICE ` +
              `(${secoes.length} seções):\n${indice}\n  Para mexer aqui, abre a seção certa com \`ler_secao\` ` +
              `(este id + o número) e só então \`editar_trecho_artefato\`. NÃO carregues o texto todo.` +
              blocoCanone,
            );
          } else if (corpo.length > LIMITE_ARTEFATO_GRANDE) {
            // Grande SEM headings: nunca cola o livro — preview curto + ordem de fatiar.
            const preview = corpo.slice(0, 2000);
            partes.push(
              `— id: ${d.id} · «${d.titulo}» — ARTEFATO GRANDE (texto corrido, sem ## ). ` +
              `Preview (~2k chars), NÃO o corpo todo:\n\n${preview}\n\n` +
              `  …(+${corpo.length - 2000} chars omitidos). Use \`ler_estrutura\` / \`buscar_no_artefato\` / ` +
              `\`ler_bloco\` antes de editar. NÃO chame \`ler_artefato\` neste id.` +
              blocoCanone,
            );
          } else {
            // Pequeno: o corpo inteiro à frente (editar vira um passo só).
            partes.push(`— id: ${d.id} · «${d.titulo}»${blocoCanone}\n\n${corpo || "(vazio)"}`);
          }
        }
        blocoDocumentosDaConversa =
          "ARTEFATOS JÁ NA ESTANTE DESTA CONVERSA. Para cada um abaixo: se vês o CORPO, já o tens — não precisas de `ler_artefato`. Se vês só o ÍNDICE (artefato grande), abre a seção que precisas com `ler_secao` ANTES de mexer — não carregues o texto todo (é assim que te perdes). " +
          "CONTINUAÇÃO: `inserir_blocos` com `markdown` + `after_secao` (número/título) — NÃO reescreva com `editar_artefato`. " +
          "Ponto pontual: `editar_trecho_artefato`. Reserva `editar_artefato` só pra refazer do zero. " +
          "É PROIBIDO dizer «editei», «revisei», «já mudei» sem ter chamado a ferramenta — se não chamaste, o artefato continua igual e ele reabre e nada mudou.\n\n" +
          partes.join("\n\n---\n\n");
      }
    } catch {
      // Silencioso: sem o bloco, ela cai no fluxo normal listar→ler→editar.
    }
  }

  const systemPrompt = [
    carregarInstrucaoSistema(),
    compilarGuiaFerramentasPrompt(),
    contextoCompilado.briefing,
    opcoes.raciocinioAtivo !== false ? blocoPromptIdiomaRaciocinio() : null,
    // Trava anti-vazamento: a resposta é só a FALA, na 2ª pessoa.
    //
    // No modo pesquisa a Luna despejava o rascunho no texto visível — falava DELE em 3ª
    // pessoa ("ele perguntou", "o tom aqui é de admiração", "vou puxar esse fio"), como se
    // narrasse o próprio plano em voz alta. O usuário lia o plano e depois a resposta, e
    // parecia que ela tinha respondido duas vezes. Aqui separamos os dois:
    "A tua RESPOSTA visível é só o que dizes À PESSOA, falando COM ela na 2ª pessoa (você/tu) — nunca SOBRE ela em 3ª pessoa (\"ele\", \"ele perguntou\", \"ele quer\"). " +
      "Se precisares planear o tom, decidir o que perguntar ou pensar em voz alta antes de responder, faz isso DENTRO de um bloco <think>…</think> logo no início; a resposta final vem DEPOIS do </think> e a pessoa nunca vê o que está dentro dele. " +
      "Nunca narres o teu tom interno nem metasobre o pedido (nada de \"o tom é de admiração\", \"vou validar e puxar o fio\", \"aqui ele está a pedir X\") — isso vai pra dentro do <think>. " +
      "EXCEÇÃO (ações com ferramentas): podes e deves dizer em 1 frase o que vais fazer AGORA («Vou ler…», «Entendi, edito isso.») junto com a tool — é fala com ele, não monólogo de plano.",
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
    webSearchDisponivel() && !(pedeFinancas && !pedeWebExplicita)
      ? "Usa `web_search` quando precisares de informação actual da internet por palavras-chave (notícias, preços, eventos) — não para abrir um link específico, aí usa `ler_url`. " +
        "NUNCA uses `web_search` pra responder quanto ELE gastou/recebeu — isso é dado do app (`resumo_financeiro` / `listar_lancamentos`). " +
        "Não repitas a mesma pesquisa se os resultados já estão nas tool messages deste turno. " +
        "Na resposta final, estrutura em Markdown com links [nome](url) apenas para fontes que realmente vieram no resultado da ferramenta (campo `results`/`url`). " +
        "Se `web_search` ou `ler_url` devolver `ok: false` ou nenhum resultado, NÃO invente links, nomes de site ou citações. Começa a resposta avisando isso claramente (ex.: \"não encontrei nada na busca sobre X\") antes de qualquer outra coisa — não deixes o aviso escondido no meio ou no fim do texto. " +
        "Nesse caso, se ainda assim quiseres responder com o que sabes do teu próprio treino, deixa isso bem explícito (\"pelo teu treino, sem confirmar agora\") e evita números, datas, versões ou benchmarks específicos que não consegues verificar — não escrevas uma resposta longa e estruturada em tópicos como se fosse pesquisa real; um resumo curto e visivelmente incerto é mais honesto."
      : null,
    // Modo pesquisa profunda (opcional): a Luna cruza as fontes antes de escrever.
    opcoes.pesquisaProfunda &&
      webSearchDisponivel() &&
      !(pedeFinancas && !pedeWebExplicita)
      ? "MODO PESQUISA PROFUNDA ligado: quando usares `web_search`/`ler_url` e fores fazer afirmações factuais (números, datas, versões, alegações), chama `verificar_fontes` UMA vez ANTES de escrever a resposta final — passa as afirmações que pretendes dizer. Um segundo par de olhos cruza-as com o que leste e devolve o que está sustentado, parcial ou sem apoio. Depois escreve reconciliando: mantém o sustentado, põe ressalva no parcial, corrige/tira o resto. Não chames antes de ter fontes, nem mais de uma vez sem necessidade."
      : null,
    // MODO TÉCNICO (opt-in do usuário): ele PEDIU profundidade, então não esperes o segundo
    // empurrão. A voz calorosa e concisa de sempre continua a ser tu — mas aqui o rigor vem à frente.
    opcoes.modoTecnico ? DIRETRIZ_MODO_TECNICO : null,
    // A coleira do plano — antes da diretriz de documentos, porque rege COMO ela encadeia as mãos.
    planejamentoAtivo ? DIRETRIZ_PLANO : null,
    // Pontes curtas entre tools (sempre no path agentico — é o que faz parecer Cursor).
    DIRETRIZ_NARRACAO_AGENTICA,
    // Ler/conferir antes de editar; web quando o fato não está no contexto.
    DIRETRIZ_AMBIENTAR,
    // Só no OrbitLab (documentosAtivo). A ferramenta só existe aqui; a ordem também.
    opcoes.documentosAtivo ? DIRETRIZ_DOCUMENTOS : null,
    opcoes.documentosAtivo ? DIRETRIZ_ORIENTACAO_ESCRITA : null,
    opcoes.documentosAtivo ? DIRETRIZ_AUDITORIA_ARTEFATO : null,
    // A mão que desenha — mesma trava (OrbitLab).
    opcoes.documentosAtivo ? DIRETRIZ_IMAGEM : null,
    // A mão que pergunta antes de agir — mesma trava (OrbitLab).
    opcoes.documentosAtivo ? DIRETRIZ_PERGUNTAR : null,
    // Finanças: ordem imperativa — e, se o turno é de grana, web_search já saiu da lista.
    pedeFinancas ? DIRETRIZ_FINANCAS : null,
    // O corpo dos documentos desta conversa, já à frente dela (como a rotina já está sempre).
    // É isto que faz editar virar um passo só, em vez de uma caça listar→ler→editar.
    blocoDocumentosDaConversa,
  ]
    .filter(Boolean)
    .join("\n\n");

  /** Orientação/auditoria de artefato neste turno (coleiras pré e pós). */
  let leuArtefatoNesteTurno = false;
  let artefatoPendenteAuditoriaFlag = false;

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
    maxRodadas,
    obterMaxRodadas: () => maxRodadas,
    planoAindaAberto,
    artefatoPendenteAuditoria: () => artefatoPendenteAuditoriaFlag,
    onToolCallStart: (nome, argumentos, rodada) => {
      opcoes.onAcao?.({
        tipo: "inicio_ferramenta",
        ferramenta: nomeFerramentaParaUi(nome, argumentos),
        argumentos,
        rodada,
        maxRodadas,
      });
    },
    onToolCallComplete: (passo) => {
      if (passo.sucesso) {
        if (FERRAMENTAS_LEITURA_ARTEFATO.has(passo.ferramenta)) {
          leuArtefatoNesteTurno = true;
          artefatoPendenteAuditoriaFlag = false;
        } else if (FERRAMENTAS_ESCRITA_ARTEFATO.has(passo.ferramenta)) {
          artefatoPendenteAuditoriaFlag = true;
        }
      }
      const ehFerramentaDePesquisa = passo.ferramenta === "web_search" || passo.ferramenta === "ler_url";
      const analise =
        passo.sucesso && ehFerramentaDePesquisa
          ? analisarResultadoFerramenta(passo.ferramenta, passo.resultado)
          : { ok: passo.sucesso };
      const imagem =
        (passo.ferramenta === "gerar_imagem" || passo.ferramenta === "editar_imagem") &&
        passo.sucesso
          ? extrairImagemDoResultado(passo.resultado)
          : null;
      const pergunta =
        passo.ferramenta === "perguntar" && passo.sucesso
          ? extrairPerguntaDoResultado(passo.resultado)
          : null;
      opcoes.onAcao?.({
        tipo: "fim_ferramenta",
        ferramenta: nomeFerramentaParaUi(passo.ferramenta, passo.argumentos),
        argumentos: passo.argumentos,
        rodada: passo.rodada,
        maxRodadas,
        sucesso: analise.ok,
        fontes: analise.fontes,
        imagem: imagem ?? undefined,
        pergunta: pergunta ?? undefined,
      });
    },
    onRaciocinioRodada: opcoes.onRaciocinio,
    onNarracaoRodada: opcoes.onNarracao,
    toolExecutor: async (nome, args) => {
      // Coleiras de artefato: orientação antes de escrever; sem rewrite em continuação.
      if (opcoes.documentosAtivo && FERRAMENTAS_ESCRITA_ARTEFATO.has(nome)) {
        if (
          nome === "editar_artefato" &&
          typeof args.conteudo === "string" &&
          mensagemPedeContinuacaoArtefato(mensagemUsuario)
        ) {
          return (
            "ERRO: este pedido é CONTINUAÇÃO — não use `editar_artefato` (reescreve o corpo e " +
            "pode apagar seções). Oriente-se com `ler_estrutura` / `ler_secao` e use " +
            "`inserir_blocos` com `markdown` + `after_secao` (número ou título da seção)."
          );
        }
        if (
          mensagemPedeMexerArtefatoExistente(mensagemUsuario) &&
          !leuArtefatoNesteTurno
        ) {
          return (
            "ERRO: oriente-se primeiro. Chame `ler_estrutura` e leia a seção relevante " +
            "(`ler_secao` ou `ler_artefato` se for curto) — tom, o que já está escrito, " +
            "decisões abertas — e só depois escreva/edite."
          );
        }
      }

      // ── A mão que PERGUNTA — para o turno e espera a resposta dele ───────────
      // A pergunta+opções viajam no evento fim_ferramenta (o app monta o cartão). Ao modelo,
      // devolvo a ordem firme: PARA aqui, não respondas por ele. As opções são normalizadas
      // (2 a 4, curtas) tanto aqui como no extractor do evento.
      if (nome === "perguntar") {
        const pergunta = typeof args.pergunta === "string" ? args.pergunta.trim() : "";
        const opcoes = Array.isArray(args.opcoes)
          ? args.opcoes
              .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
              .map((o) => o.trim())
              .slice(0, 4)
          : [];
        if (!pergunta) return "Passa em `pergunta` a pergunta curta a fazer ao usuário.";
        if (opcoes.length < 2) {
          return "Passa em `opcoes` de 2 a 4 respostas curtas e concretas — ele ainda poderá escrever a dele.";
        }
        return JSON.stringify({
          ok: true,
          pergunta: { texto: pergunta, opcoes },
          aviso:
            "A pergunta e as opções JÁ apareceram num cartão pra ele. Encerra AGORA o turno: no " +
            "máximo uma frase curtinha de contexto na tua voz (ou nada) — NÃO repitas a pergunta nem " +
            "as opções em texto, NÃO respondas por ele, NÃO sigas adivinhando. Espera a resposta dele.",
        });
      }

      // ── O plano em passos (a coleira) ───────────────────────────────────────
      if (nome === "planejar") {
        const passos = Array.isArray(args.passos)
          ? args.passos.filter((p): p is string => typeof p === "string" && p.trim().length > 0).map((p) => p.trim())
          : [];
        if (passos.length === 0) {
          return "Passa em `passos` a lista de passos curtos que vais seguir (2 a 5).";
        }
        if (passos.length > 5) {
          return (
            `No máximo 5 passos (recebi ${passos.length}). Resume a lista em 2–5 ações concretas e chama ` +
            "`planejar` de novo."
          );
        }
        plano.length = 0;
        for (const texto of passos) plano.push({ texto, feito: false });
        recalcularMaxRodadas();
        emitirPlano();
        return (
          renderPlano() +
          "\n\nPlano registrado. Executa AGORA o passo 1 (chama a ferramenta que ele pede) e depois marca com " +
          "`concluir_passo(1)`. Não escrevas a resposta final enquanto houver ☐."
        );
      }

      if (nome === "concluir_passo") {
        const numero = typeof args.numero === "number" ? Math.trunc(args.numero) : NaN;
        if (plano.length === 0) {
          return "Ainda não há plano. Se a tarefa tem vários passos, chama `planejar` primeiro; se não, ignora isto.";
        }
        if (!Number.isFinite(numero) || numero < 1 || numero > plano.length) {
          return `Número inválido — o plano tem ${plano.length} passo(s). ${renderPlano()}`;
        }
        plano[numero - 1].feito = true;
        emitirPlano();
        const idxRestante = plano.findIndex((p) => !p.feito);
        if (idxRestante === -1) {
          return renderPlano() + "\n\nTodos os passos feitos ✓. Agora escreve a resposta final, na tua voz.";
        }
        return (
          renderPlano() +
          `\n\nAgora o passo ${idxRestante + 1}: ${plano[idxRestante].texto}. Executa-o e marca com ` +
          `\`concluir_passo(${idxRestante + 1})\`.`
        );
      }

      if (nome === "adicionar_passo") {
        const texto = typeof args.texto === "string" ? args.texto.trim() : "";
        if (!texto) return "Passa o `texto` do passo a acrescentar.";
        if (plano.length >= 5) {
          return (
            `O plano já tem ${plano.length} passos (máximo 5). Conclui os ☐ em aberto antes de acrescentar; ` +
            "se precisas mudar o caminho, usa `planejar` de novo com a lista enxuta."
          );
        }
        plano.push({ texto, feito: false });
        recalcularMaxRodadas();
        emitirPlano();
        return renderPlano() + `\n\nPasso acrescentado (nº ${plano.length}).`;
      }

      if (nome === "web_search") {
        const query = typeof args.query === "string" ? args.query.trim() : "";
        if (!query) {
          return JSON.stringify({ ok: false, error: "Parâmetro query é obrigatório para web_search." });
        }
        const resultado = await pesquisaWeb(query);
        const json = JSON.stringify(resultado);
        registrarNoDossie("web_search", json);
        return json;
      }

      if (nome === "ler_url") {
        const url = typeof args.url === "string" ? args.url.trim() : "";
        if (!url) {
          return JSON.stringify({ ok: false, error: "Parâmetro url é obrigatório para ler_url." });
        }
        const resultado = await lerUrl(url);
        const json = JSON.stringify(resultado);
        registrarNoDossie("ler_url", json);
        return json;
      }

      if (nome === "verificar_fontes") {
        const afirmacoes = Array.isArray(args.afirmacoes)
          ? args.afirmacoes.filter((a): a is string => typeof a === "string" && a.trim().length > 0).map((a) => a.trim())
          : [];
        const foco = typeof args.foco === "string" ? args.foco.trim() : undefined;
        if (afirmacoes.length === 0) {
          return "Passa em `afirmacoes` o que pretendes dizer (uma por item) para eu cruzar com as fontes.";
        }
        const veredictos = await verificarFontes(provedor, config, afirmacoes, dossieFontes, foco);
        return formatarVerificacao(veredictos);
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
        nome === "organizar_tarefas" ||
        nome === "pausar_bloco" ||
        nome === "retomar_bloco" ||
        nome === "ver_rotinas" ||
        nome === "criar_rotina" ||
        nome === "editar_rotina" ||
        nome === "apagar_rotina" ||
        nome === "apagar_bloco" ||
        nome === "anotar_ideia" ||
        nome === "ver_ideias" ||
        nome === "registrar_lancamento" ||
        nome === "listar_lancamentos" ||
        nome === "resumo_financeiro" ||
        nome === "gerir_recorrente" ||
        nome === "gerir_carteira" ||
        nome === "gerir_meta" ||
        nome === "transferir" ||
        nome === "criar_artefato" ||
        nome === "listar_artefatos" ||
        nome === "ler_artefato" ||
        nome === "ler_estrutura" ||
        nome === "ler_secao" ||
        nome === "ler_bloco" ||
        nome === "buscar_no_artefato" ||
        nome === "inserir_blocos" ||
        nome === "editar_bloco_artefato" ||
        nome === "editar_trecho_artefato" ||
        nome === "anotar_canone" ||
        nome === "editar_artefato" ||
        nome === "gerar_imagem" ||
        nome === "editar_imagem"
      ) {
        if (!opcoes.rotinaDeps) {
          return "ERRO FATAL: o módulo de rotina/ideias não está disponível neste ambiente. Não posso fazer nada. Pede-lhe desculpa.";
        }
        if (nome === "gerar_imagem") {
          if (!opcoes.rotinaDeps.gerarImagem) {
            return "ERRO FATAL: o método de gerar imagens não foi implementado neste ambiente.";
          }
          // Flash (plano Grátis) às vezes CHAMA a ferramenta mas esquece de preencher `prompt` —
          // o cartão-fantasma já apareceu, então abortar aqui fazia a imagem sumir E ela narrar
          // sucesso. Em vez de abortar, desenho a partir do pedido dele.
          let prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
          if (!prompt) prompt = (mensagemUsuario ?? "").trim();
          if (!prompt) return "ERRO: sem descrição do que desenhar — nem no `prompt` nem na mensagem.";
          const aspectArg =
            typeof args.aspect_ratio === "string" ? args.aspect_ratio.trim() : "";
          // Fallback: o modelo esqueceu o param — tira do pedido dele + do prompt.
          const aspectRatio =
            aspectArg ||
            (() => {
              const m = `${mensagemUsuario}\n${prompt}`.match(
                /\b(21\s*:\s*9|16\s*:\s*9|9\s*:\s*16|4\s*:\s*3|3\s*:\s*4|1\s*:\s*1)\b/i,
              );
              return m ? m[1]!.replace(/\s+/g, "") : undefined;
            })();
          try {
            const img = await opcoes.rotinaDeps.gerarImagem(prompt, {
              aspectRatio,
            });
            // O app lê a URL do evento fim_ferramenta (parseada daqui). Ao modelo, devolvo só a
            // confirmação — com aviso EXPLÍCITO pra não colar a URL nem descrever a imagem inteira.
            return JSON.stringify({
              ok: true,
              imagem: { url: img.url, prompt: img.prompt },
              aspect_ratio: aspectRatio ?? null,
              aviso:
                "A imagem já foi desenhada e mostrada ao usuário num cartão. Comenta na tua voz " +
                "(curto e caloroso). NÃO copies a URL nem descrevas a imagem inteira.",
            });
          } catch (err) {
            // Prefixo ERRO → o executor marca o passo como falho (sucesso=false), o app pinta
            // vermelho e ela não consegue narrar que desenhou.
            return `ERRO: não consegui desenhar a imagem: ${err instanceof Error ? err.message : String(err)}`;
          }
        }
        if (nome === "editar_imagem") {
          if (!opcoes.rotinaDeps.editarImagem) {
            return "ERRO FATAL: o método de editar imagens não foi implementado neste ambiente.";
          }
          const instrucao = typeof args.instrucao === "string" ? args.instrucao.trim() : "";
          // Prefixo ERRO em todo soft-fail — senão o badge fica verde e ela narra sucesso sem URL.
          if (!instrucao) return "ERRO: passa em `instrucao` a mudança a fazer na imagem.";

          // Referência de estilo = anexo DELE (além da base = última arte dela).
          // Entra se ela passou `referencia_id`, OU se o pedido cheira a estilo/referência e
          // há foto neste turno (caminho feliz: «ajusta no estilo desta» sem o modelo lembrar do id).
          const referenciaUrls: string[] = [];
          const refIdArg =
            typeof args.referencia_id === "string" ? args.referencia_id.trim() : "";
          const pedeEstiloAnexo =
            /\b(estilo|paleta|vibe|tra[cç]o|clima|mood|refer[eê]ncia|como (nesta|nessa|esta|essa|na|a) (foto|imagem|arte|pintura)|de acordo com (a |essa |esta )?(foto|imagem|arte))\b/i.test(
              `${mensagemUsuario}\n${instrucao}`,
            );
          const anexoEstilo = (() => {
            if (refIdArg) {
              const hit = mapaImagens.get(refIdArg);
              if (!hit) {
                return { erro: `ERRO: não achei o anexo \`${refIdArg}\` pra usar de referência de estilo.` };
              }
              return { anexo: hit };
            }
            if (!pedeEstiloAnexo) return { anexo: undefined as undefined };
            const doTurno = anexosImagem.filter(
              (a) => !a.deTurnoAnterior && !a.mimeType?.startsWith("video/"),
            );
            return { anexo: doTurno.length > 0 ? doTurno[doTurno.length - 1] : undefined };
          })();
          if ("erro" in anexoEstilo && anexoEstilo.erro) return anexoEstilo.erro;
          const estilo = "anexo" in anexoEstilo ? anexoEstilo.anexo : undefined;
          if (estilo) {
            if (estilo.mimeType?.startsWith("video/")) {
              return "ERRO: referência de estilo precisa ser uma IMAGEM, não vídeo. Pede uma foto/arte.";
            }
            const refUrl =
              estilo.url?.trim() ||
              (estilo.imageBase64?.trim()
                ? `data:${estilo.mimeType?.trim() || "image/jpeg"};base64,${estilo.imageBase64.trim()}`
                : "");
            if (!refUrl) {
              return "ERRO: o anexo de referência existe, mas sem URL/bytes — não consigo usá-lo de estilo.";
            }
            referenciaUrls.push(refUrl);
          }

          const baseUrlArg =
            typeof args.base_url === "string" ? args.base_url.trim() : "";
          // Aceita só http(s) — evita o modelo colar lixo; data: também ok (raro).
          const baseUrl =
            baseUrlArg &&
            (/^https?:\/\//i.test(baseUrlArg) || baseUrlArg.startsWith("data:image/"))
              ? baseUrlArg
              : undefined;

          try {
            // Só muda proporção se ELE pediu formato — senão o servidor herda o aspecto da última.
            // Ignora aspect_ratio que o modelo inventou num retoque («adiciona chapéu»).
            const aspectArg =
              typeof args.aspect_ratio === "string" ? args.aspect_ratio.trim() : "";
            const pediuMudanca = mensagemPedeMudancaDeAspectoLocal(mensagemUsuario);
            const aspectRatio = pediuMudanca
              ? aspectArg ||
                (() => {
                  const m = mensagemUsuario.match(
                    /\b(21\s*:\s*9|16\s*:\s*9|9\s*:\s*16|4\s*:\s*3|3\s*:\s*4|1\s*:\s*1)\b/i,
                  );
                  return m ? m[1]!.replace(/\s+/g, "") : undefined;
                })()
              : undefined;
            const img = await opcoes.rotinaDeps.editarImagem(instrucao, {
              referenciaUrls: referenciaUrls.length > 0 ? referenciaUrls : undefined,
              baseUrl,
              aspectRatio,
              mudarProporcao: pediuMudanca,
            });
            return JSON.stringify({
              ok: true,
              imagem: { url: img.url, prompt: img.prompt },
              usouReferenciaEstilo: referenciaUrls.length > 0,
              usouBaseExplicita: Boolean(baseUrl),
              aspect_ratio: img.aspectRatio ?? aspectRatio ?? null,
              aviso:
                "A imagem editada já foi mostrada ao usuário num cartão novo. Comenta na tua voz " +
                "(curto e caloroso). NÃO copies a URL nem descrevas a imagem inteira.",
            });
          } catch (err) {
            return `ERRO: não consegui editar a imagem: ${err instanceof Error ? err.message : String(err)}`;
          }
        }
        if (nome === "criar_artefato") {
          if (!opcoes.rotinaDeps.criarDocumento) {
            return "ERRO FATAL: o método de criar artefatos não foi implementado neste ambiente.";
          }
          return criarDocumentoFerramenta({ criarDocumento: opcoes.rotinaDeps.criarDocumento }, args);
        }
        if (nome === "listar_artefatos") {
          if (!opcoes.rotinaDeps.listarDocumentos) {
            return "ERRO FATAL: o método de listar artefatos não foi implementado neste ambiente.";
          }
          return listarDocumentosFerramenta({ listarDocumentos: opcoes.rotinaDeps.listarDocumentos }, args);
        }
        if (nome === "ler_artefato") {
          if (!opcoes.rotinaDeps.lerDocumento) {
            return "ERRO FATAL: o método de ler artefato não foi implementado neste ambiente.";
          }
          return lerDocumentoFerramenta({ lerDocumento: opcoes.rotinaDeps.lerDocumento }, args);
        }
        if (nome === "ler_estrutura") {
          if (!opcoes.rotinaDeps.lerDocumento) {
            return "ERRO FATAL: o método de ler artefato não foi implementado neste ambiente.";
          }
          return lerEstruturaDocumentoFerramenta({ lerDocumento: opcoes.rotinaDeps.lerDocumento }, args);
        }
        if (nome === "ler_secao") {
          if (!opcoes.rotinaDeps.lerDocumento) {
            return "ERRO FATAL: o método de ler artefato não foi implementado neste ambiente.";
          }
          return lerSecaoDocumentoFerramenta({ lerDocumento: opcoes.rotinaDeps.lerDocumento }, args);
        }
        if (nome === "buscar_no_artefato") {
          if (!opcoes.rotinaDeps.lerDocumento) {
            return "ERRO FATAL: o método de ler artefato não foi implementado neste ambiente.";
          }
          return buscarNoDocumentoFerramenta({ lerDocumento: opcoes.rotinaDeps.lerDocumento }, args);
        }
        if (nome === "ler_bloco") {
          if (!opcoes.rotinaDeps.lerDocumento) {
            return "ERRO FATAL: o método de ler artefato não foi implementado neste ambiente.";
          }
          return lerBlocoDocumentoFerramenta({ lerDocumento: opcoes.rotinaDeps.lerDocumento }, args);
        }
        if (nome === "inserir_blocos") {
          if (!opcoes.rotinaDeps.editarDocumento || !opcoes.rotinaDeps.lerDocumento) {
            return "ERRO FATAL: o método de editar artefato não foi implementado neste ambiente.";
          }
          return inserirBlocosDocumentoFerramenta(
            {
              lerDocumento: opcoes.rotinaDeps.lerDocumento,
              editarDocumento: opcoes.rotinaDeps.editarDocumento,
            },
            args,
          );
        }
        if (nome === "editar_bloco_artefato") {
          if (!opcoes.rotinaDeps.editarDocumento || !opcoes.rotinaDeps.lerDocumento) {
            return "ERRO FATAL: o método de editar artefato não foi implementado neste ambiente.";
          }
          return editarBlocoDocumentoFerramenta(
            {
              lerDocumento: opcoes.rotinaDeps.lerDocumento,
              editarDocumento: opcoes.rotinaDeps.editarDocumento,
            },
            args,
          );
        }
        if (nome === "editar_trecho_artefato") {
          if (!opcoes.rotinaDeps.editarDocumento || !opcoes.rotinaDeps.lerDocumento) {
            return "ERRO FATAL: o método de editar artefato não foi implementado neste ambiente.";
          }
          return editarTrechoDocumentoFerramenta(
            {
              lerDocumento: opcoes.rotinaDeps.lerDocumento,
              editarDocumento: opcoes.rotinaDeps.editarDocumento,
            },
            args,
          );
        }
        if (nome === "editar_artefato") {
          if (!opcoes.rotinaDeps.editarDocumento) {
            return "ERRO FATAL: o método de editar artefato não foi implementado neste ambiente.";
          }
          return editarDocumentoFerramenta({ editarDocumento: opcoes.rotinaDeps.editarDocumento }, args);
        }
        if (nome === "anotar_canone") {
          if (!opcoes.rotinaDeps.editarDocumento) {
            return "ERRO FATAL: o método de editar artefato não foi implementado neste ambiente.";
          }
          return anotarCanoneFerramenta({ editarDocumento: opcoes.rotinaDeps.editarDocumento }, args);
        }
        if (nome === "anotar_ideia") {
          if (!opcoes.rotinaDeps.criarIdeia) {
            return "ERRO FATAL: o método de criar ideias não foi implementado neste ambiente.";
          }
          return anotarIdeia({ criarIdeia: opcoes.rotinaDeps.criarIdeia }, args);
        }
        if (nome === "ver_ideias") {
          return verIdeias({
            criarIdeia: opcoes.rotinaDeps.criarIdeia!,
            verIdeias: opcoes.rotinaDeps.verIdeias
          });
        }
        if (nome === "registrar_lancamento") {
          if (
            !opcoes.rotinaDeps.criarLancamento ||
            !opcoes.rotinaDeps.listarCarteiras ||
            !opcoes.rotinaDeps.reaisParaCentavos
          ) {
            return "ERRO FATAL: as finanças não estão disponíveis neste ambiente.";
          }
          return registrarLancamento(montarDepsFinancas(opcoes.rotinaDeps), args);
        }
        if (nome === "listar_lancamentos") {
          if (
            !opcoes.rotinaDeps.listarLancamentos ||
            !opcoes.rotinaDeps.faixaPeriodoFinancas ||
            !opcoes.rotinaDeps.reaisParaCentavos
          ) {
            return "ERRO FATAL: as finanças não estão disponíveis neste ambiente.";
          }
          return listarLancamentosFinanca(montarDepsFinancas(opcoes.rotinaDeps), args);
        }
        if (nome === "resumo_financeiro") {
          if (
            !opcoes.rotinaDeps.listarLancamentos ||
            !opcoes.rotinaDeps.faixaPeriodoFinancas ||
            !opcoes.rotinaDeps.reaisParaCentavos
          ) {
            return "ERRO FATAL: as finanças não estão disponíveis neste ambiente.";
          }
          return resumoFinanceiro(montarDepsFinancas(opcoes.rotinaDeps), args);
        }
        if (nome === "gerir_recorrente") {
          if (!opcoes.rotinaDeps.listarCarteiras || !opcoes.rotinaDeps.reaisParaCentavos) {
            return "ERRO FATAL: as finanças não estão disponíveis neste ambiente.";
          }
          return gerirRecorrente(montarDepsFinancas(opcoes.rotinaDeps), args);
        }
        if (nome === "gerir_carteira") {
          if (!opcoes.rotinaDeps.listarCarteiras || !opcoes.rotinaDeps.reaisParaCentavos) {
            return "ERRO FATAL: as finanças não estão disponíveis neste ambiente.";
          }
          return gerirCarteira(montarDepsFinancas(opcoes.rotinaDeps), args);
        }
        if (nome === "gerir_meta") {
          if (!opcoes.rotinaDeps.reaisParaCentavos) {
            return "ERRO FATAL: as finanças não estão disponíveis neste ambiente.";
          }
          return gerirMeta(montarDepsFinancas(opcoes.rotinaDeps), args);
        }
        if (nome === "transferir") {
          if (
            !opcoes.rotinaDeps.criarTransferencia ||
            !opcoes.rotinaDeps.listarCarteiras ||
            !opcoes.rotinaDeps.reaisParaCentavos
          ) {
            return "ERRO FATAL: as finanças não estão disponíveis neste ambiente.";
          }
          return transferirEntreCarteiras(montarDepsFinancas(opcoes.rotinaDeps), args);
        }
        if (nome === "ver_rotina") {
          const dia = typeof args.dia === "number" ? args.dia : undefined;
          return verRotina(opcoes.rotinaDeps, dia);
        }
        if (nome === "criar_bloco") return criarBloco(opcoes.rotinaDeps, args);
        if (nome === "editar_bloco") return editarBloco(opcoes.rotinaDeps, args);
        if (nome === "detalhar_bloco") return detalharBloco(opcoes.rotinaDeps, args);
        if (nome === "organizar_tarefas") return organizarTarefas(opcoes.rotinaDeps, args);
        if (nome === "pausar_bloco") return pausarBloco(opcoes.rotinaDeps, args);
        if (nome === "retomar_bloco") return retomarBloco(opcoes.rotinaDeps, args);
        if (nome === "ver_rotinas") return verRotinas(opcoes.rotinaDeps);
        if (nome === "criar_rotina") return criarRotinaAlternativa(opcoes.rotinaDeps, args);
        if (nome === "editar_rotina") return editarRotinaAlternativa(opcoes.rotinaDeps, args);
        if (nome === "apagar_rotina") return apagarRotinaAlternativa(opcoes.rotinaDeps, args);
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
