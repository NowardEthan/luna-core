/**
 * Leitor de documentos — a "bibliotecária do outro lado do vidro".
 *
 * Irmã do `visaoGemma`: assim como a Luna tem olhos que ela pode interrogar, aqui ela tem
 * alguém que leu o arquivo inteiro e responde às perguntas dela sobre ele.
 *
 * O desenho antigo era ingênuo: o app extraía o PDF INTEIRO e colava dentro da mensagem.
 * Um documento de 110 páginas vira ~300 mil caracteres — o servidor cortava no meio, e ela
 * respondia com confiança total sobre um arquivo do qual tinha perdido 90%, sem saber.
 *
 * Aqui o documento nunca entra na cabeça dela inteiro. Ela recebe o CARTÃO (nome, tamanho,
 * quantas partes, o sumário) e vai buscar o que precisa:
 *
 *   ler_arquivo()                          → o mapa: quantas partes, o que há em cada uma
 *   ler_arquivo({ parte: 7 })              → o texto cru daquela parte
 *   ler_arquivo({ pergunta: "o que diz sobre X?" }) → a resposta, com a parte citada
 *
 * Só a pergunta gasta modelo. E ela paga pelo que lê, não pelo que existe.
 */

import {
  leitorOpenRouterDisponivel,
  responderSobreTrechosOpenRouter,
} from "./responderSobreTrechosOpenRouter.js";

export type AnexoDocumentoChat = {
  id: string;
  nome?: string;
  mimeType?: string;
  /** Texto já extraído (PDF/DOCX/MD/HTML) — quem extrai é a mobile-api. */
  texto: string;
  /** Quantas páginas o original tinha, quando se sabe. Só para a Luna ser honesta. */
  paginas?: number;
};

export type DependenciasLeitorDocumento = {
  /** Especialista que lê os trechos e responde. Injetado (produção) ou mockado (testes). */
  responderSobreTrechos?: (entrada: {
    documento: AnexoDocumentoChat;
    pergunta: string;
    trechos: { parte: number; texto: string }[];
  }) => Promise<string>;
};

export type EntradaLeitorDocumento = {
  documento: AnexoDocumentoChat;
  pergunta?: string;
  parte?: number;
};

/** ~1.500 palavras por parte: cabe numa leitura, e o mapa não fica gigante. */
const CHARS_POR_PARTE = 6_000;
/** Quantas partes a especialista lê para responder a UMA pergunta. */
const MAX_TRECHOS_POR_PERGUNTA = 3;

export function fatiar(texto: string): string[] {
  const limpo = texto.replace(/\r\n/g, "\n").trim();
  if (limpo.length <= CHARS_POR_PARTE) return [limpo];

  const partes: string[] = [];
  let inicio = 0;

  while (inicio < limpo.length) {
    let fim = Math.min(inicio + CHARS_POR_PARTE, limpo.length);

    // Corta num parágrafo, não no meio de uma palavra — senão a parte começa a meio de
    // uma frase e a Luna cita mal.
    if (fim < limpo.length) {
      const quebra = limpo.lastIndexOf("\n\n", fim);
      if (quebra > inicio + CHARS_POR_PARTE * 0.5) fim = quebra;
    }

    partes.push(limpo.slice(inicio, fim).trim());
    inicio = fim;
  }

  return partes.filter((p) => p.length > 0);
}

/** Título provável de uma parte: o primeiro heading, ou a primeira linha com corpo. */
function tituloDaParte(parte: string): string {
  const linhas = parte.split("\n").map((l) => l.trim()).filter(Boolean);

  const heading = linhas.find((l) => /^#{1,4}\s+/.test(l));
  if (heading) return heading.replace(/^#{1,4}\s+/, "").slice(0, 80);

  // Linha curta e sem ponto final costuma ser título (capítulo, secção).
  const provavel = linhas.find((l) => l.length <= 70 && !/[.;:,]$/.test(l) && l.length > 3);
  return (provavel ?? linhas[0] ?? "—").slice(0, 80);
}

/** O mapa do documento — o que ela recebe quando chama a ferramenta sem argumentos. */
export function mapaDoDocumento(documento: AnexoDocumentoChat): string {
  const partes = fatiar(documento.texto);
  const nome = documento.nome?.trim() || "documento";
  const paginas = documento.paginas ? `${documento.paginas} páginas · ` : "";

  const sumario = partes
    .map((p, i) => `  ${i + 1}. ${tituloDaParte(p)}`)
    .join("\n");

  return [
    `${nome} — ${paginas}${partes.length} parte(s) de leitura.`,
    "",
    "Sumário (título provável de cada parte):",
    sumario,
    "",
    partes.length > 1
      ? "Peça uma parte (`parte: 3`) ou faça uma pergunta (`pergunta: \"o que diz sobre X?\"`) — não é preciso ler tudo."
      : "É curto: peça `parte: 1` para o conteúdo inteiro.",
  ].join("\n");
}

function relevancia(parte: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const alvo = parte.toLowerCase();
  return tokens.filter((t) => alvo.includes(t)).length;
}

function tokensDaPergunta(pergunta: string): string[] {
  return [
    ...new Set(
      pergunta
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length > 3),
    ),
  ];
}

/**
 * Escolhe as partes que interessam À PERGUNTA — sem isto, responder exigiria mandar o
 * documento inteiro ao modelo, que é justamente o custo que queremos evitar.
 */
export function escolherTrechos(
  partes: string[],
  pergunta: string,
  max = MAX_TRECHOS_POR_PERGUNTA,
): { parte: number; texto: string }[] {
  const tokens = tokensDaPergunta(pergunta);

  const ranqueadas = partes
    .map((texto, i) => ({ parte: i + 1, texto, score: relevancia(texto, tokens) }))
    .sort((a, b) => b.score - a.score || a.parte - b.parte);

  // Nenhuma palavra da pergunta aparece? Então a pergunta é geral («do que se trata?»):
  // as primeiras partes são o melhor palpite.
  const comSinal = ranqueadas.filter((r) => r.score > 0);
  const escolhidas = (comSinal.length > 0 ? comSinal : ranqueadas.slice(0, max)).slice(0, max);

  return escolhidas
    .sort((a, b) => a.parte - b.parte)
    .map(({ parte, texto }) => ({ parte, texto }));
}

export async function lerDocumento(
  entrada: EntradaLeitorDocumento,
  deps: DependenciasLeitorDocumento = {},
): Promise<string> {
  const { documento, pergunta, parte } = entrada;

  if (!documento.texto.trim()) {
    return `NÃO consegui ler ${documento.nome ?? "o arquivo"}: veio vazio. Diga isso ao usuário e NÃO adivinhe o conteúdo.`;
  }

  const partes = fatiar(documento.texto);

  // Uma parte específica: entrega o texto cru, sem gastar modelo.
  if (typeof parte === "number" && Number.isFinite(parte)) {
    const indice = Math.trunc(parte);
    if (indice < 1 || indice > partes.length) {
      return `Este documento tem ${partes.length} parte(s) — a parte ${indice} não existe.`;
    }
    return [
      `[${documento.nome ?? "documento"} — parte ${indice} de ${partes.length}]`,
      "",
      partes[indice - 1],
    ].join("\n");
  }

  // Sem pergunta: o mapa. É o que ela deve pedir primeiro num arquivo grande.
  if (!pergunta?.trim()) {
    return mapaDoDocumento(documento);
  }

  const trechos = escolherTrechos(partes, pergunta);

  const responder =
    deps.responderSobreTrechos ??
    (leitorOpenRouterDisponivel() ? responderSobreTrechosOpenRouter : undefined);

  // Sem especialista (testes, ou modelo indisponível): devolve os trechos e ELA lê.
  if (!responder) {
    return [
      `[${documento.nome ?? "documento"} — partes ${trechos.map((t) => t.parte).join(", ")} de ${partes.length}]`,
      "",
      ...trechos.map((t) => `— parte ${t.parte} —\n${t.texto}`),
    ].join("\n");
  }

  try {
    const resposta = await responder({ documento, pergunta, trechos });
    const citadas = trechos.map((t) => t.parte).join(", ");
    return [
      resposta.trim(),
      "",
      `(lido: parte(s) ${citadas} de ${partes.length} — há mais no arquivo, se precisares)`,
    ].join("\n");
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    return `NÃO consegui consultar o arquivo (${motivo}). Diga isso ao usuário e NÃO adivinhe o conteúdo.`;
  }
}
