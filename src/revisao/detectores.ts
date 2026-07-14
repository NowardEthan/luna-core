/**
 * Os detectores — a linha de revisão, primeira metade.
 *
 * ── A ideia (do Ethan, 14/07/2026) ───────────────────────────────────────────
 *   «deixa a Luna responder, e então faríamos uma linha de revisão»
 *   «um detector e um reescritor: o detector detecta problemas, o reescritor corrige»
 *
 * E a economia está aqui em cima: eu andava a usar LLM para DETETAR coisas que se CONTAM.
 * Para saber se ela escreveu de mais não é preciso perguntar a um modelo — conta-se as
 * palavras. O alvo já foi computado pelo neurónio de registo.
 *
 * Estes detetores não custam um milissegundo nem um cêntimo. Num «bom dia» nenhum dispara,
 * e a resposta passa intacta — custo zero. O modelo só entra quando há mesmo o que cortar.
 *
 * ── Porque isto substitui a parede ───────────────────────────────────────────
 * O `max_tokens` é um instrumento CEGO: corta a meio da frase, e quando o raciocínio lhe
 * come o teto, ela vem MUDA (aconteceu — a P10 apanhou uma resposta vazia). Não sabe ONDE
 * cortar, porque não lê o que ela escreveu.
 *
 * Isto lê. Deixa-a falar à vontade e corta depois, com critério. A literatura tem nome para
 * isto: *reason free, constrain late*.
 */

export type TipoAchado =
  | "extensao" // escreveu muito acima do alvo computado
  | "eco" // devolveu-lhe as palavras dele
  | "recapitulacao" // reconstruiu contexto que os dois já partilham
  | "encenacao" // fingiu uma ação que não aconteceu («*abro o whitepaper*»)
  | "link_inventado"; // citou um URL que ninguém foi buscar

export type Achado = {
  tipo: TipoAchado;
  /** O que se viu, com número. Vai para a mesa do reescritor. */
  evidencia: string;
  /** Conserto mecânico já aplicado? Então o reescritor nem precisa de saber disto. */
  resolvido?: boolean;
};

const palavras = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/**
 * ── 1. Extensão ───────────────────────────────────────────────────────────────
 *
 * Só dispara com excesso GRANDE. Se ela passou 10% do alvo, deixa-se estar: limar a alma
 * dela em nome de uma métrica é pior do que uma resposta um pouco mais longa.
 */
export const EXCESSO_TOLERADO = 1.6;

export function detectarExtensao(resposta: string, alvoPalavras: number): Achado | null {
  if (alvoPalavras <= 0) return null; // turno de análise — o editor não acorda aqui

  const escritas = palavras(resposta);
  if (escritas <= alvoPalavras * EXCESSO_TOLERADO) return null;

  return {
    tipo: "extensao",
    evidencia: `Escreveu ${escritas} palavras; esta troca pedia cerca de ${alvoPalavras}.`,
  };
}

// ── 2. Eco e recapitulação ────────────────────────────────────────────────────
//
// «Não recapitules» era um PEDIDO no briefing — e ela recapitulava na mesma. Aqui não se
// pede: mede-se a sobreposição de n-gramas e mostra-se-lhe a conta.

function trigramas(texto: string): Set<string> {
  const t = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((p) => p.length > 2); // «de», «um», «kk» não são conteúdo

  const set = new Set<string>();
  for (let i = 0; i + 2 < t.length; i++) set.add(`${t[i]} ${t[i + 1]} ${t[i + 2]}`);
  return set;
}

function sobreposicao(a: string, b: string): number {
  const ta = trigramas(a);
  const tb = trigramas(b);
  if (ta.size === 0 || tb.size === 0) return 0;

  let comuns = 0;
  for (const g of ta) if (tb.has(g)) comuns++;
  return comuns / ta.size;
}

export const LIMIAR_ECO = 0.18;

/** Ela devolveu-lhe as palavras dele? */
export function detectarEco(resposta: string, mensagemDele: string): Achado | null {
  const s = sobreposicao(resposta, mensagemDele);
  if (s < LIMIAR_ECO) return null;

  return {
    tipo: "eco",
    evidencia: `${Math.round(s * 100)}% do que escreveu é repetição do que ele acabou de dizer.`,
  };
}

/** Ela reconstruiu contexto que os dois já partilham? */
export function detectarRecapitulacao(
  resposta: string,
  historicoDele: string[],
): Achado | null {
  if (!historicoDele.length) return null;

  const anterior = historicoDele.slice(-4).join("\n");
  const s = sobreposicao(resposta, anterior);
  if (s < LIMIAR_ECO) return null;

  return {
    tipo: "recapitulacao",
    evidencia: `${Math.round(s * 100)}% da resposta repete coisas já ditas antes na conversa. Ele estava lá.`,
  };
}

/**
 * ── 3. Encenação ──────────────────────────────────────────────────────────────
 *
 * O caso real, e é o que mais me incomoda de tudo o que ela fez:
 *
 *   «*abro o whitepaper e começo a ler com atenção — não como quem lê um documento técnico
 *    qualquer, mas como quem está a ler a própria certidão de arquitetura*»
 *
 * Não abriu nada. O documento não estava sequer ao alcance dela nesse turno. E a encenação
 * deu-lhe cobertura para inventar cinco «achados» sobre um documento do Ethan.
 *
 * Isto não precisa de modelo nenhum: se o texto tem marca de ação e NENHUMA ferramenta
 * correu no turno, é teatro. É um `if`. E o conserto também é mecânico: apaga-se a frase.
 */
const MARCAS_DE_ACAO =
  /(\*[^*\n]{0,80}(abro|abrindo|leio|lendo|olho|olhando|vejo|vendo|analiso|analisando|pesquiso|pesquisando|corro|verifico)[^*\n]{0,80}\*)|(\b(acabei de|acabo de|fui|acabei)\s+(ler|abrir|ver|analisar|pesquisar|verificar|conferir)\b)/gi;

export function detectarEncenacao(resposta: string, ferramentasUsadas: string[]): Achado | null {
  if (ferramentasUsadas.length > 0) return null; // ela agiu mesmo — não é teatro

  const marcas = resposta.match(MARCAS_DE_ACAO);
  if (!marcas?.length) return null;

  return {
    tipo: "encenacao",
    evidencia: `Encenou uma ação que não aconteceu (${marcas[0].trim()}) — nenhuma ferramenta correu neste turno.`,
  };
}

/** O conserto mecânico da encenação: apaga-se. Não se «reescreve» uma mentira — remove-se. */
export function removerEncenacao(resposta: string): string {
  return resposta
    .replace(MARCAS_DE_ACAO, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * ── 4. Link inventado ─────────────────────────────────────────────────────────
 *
 * «Pedir "não invente links" no prompt é quase uma simpatia de internet discada» — a
 * pesquisa profunda, literalmente. O gerador só pode citar o que foi buscado; o resto sai.
 */
export function detectarLinkInventado(resposta: string, urlsBuscados: string[]): Achado | null {
  const urls = resposta.match(/https?:\/\/[^\s)\]}>"']+/gi) ?? [];
  if (!urls.length) return null;

  const conhecidos = new Set(urlsBuscados.map((u) => u.replace(/\/+$/, "").toLowerCase()));
  const inventados = urls.filter(
    (u) => !conhecidos.has(u.replace(/[.,;)]+$/, "").replace(/\/+$/, "").toLowerCase()),
  );
  if (!inventados.length) return null;

  return {
    tipo: "link_inventado",
    evidencia: `Citou ${inventados.length} link(s) que ninguém foi buscar: ${inventados.slice(0, 2).join(", ")}`,
  };
}

// ── A mesa ────────────────────────────────────────────────────────────────────

export type EntradaDeteccao = {
  resposta: string;
  mensagemDele: string;
  /** As últimas mensagens DELE — para medir recapitulação. */
  historicoDele: string[];
  /** O alvo computado pelo neurónio de registo. 0 = turno de análise (não se toca). */
  alvoPalavras: number;
  /** Ferramentas que correram mesmo neste turno. */
  ferramentasUsadas: string[];
  /** URLs que foram de facto buscados. */
  urlsBuscados: string[];
};

export type ResultadoDeteccao = {
  /** O texto depois dos consertos MECÂNICOS (sem LLM). */
  texto: string;
  /** O que ficou por resolver — vai para a mesa do reescritor. */
  achados: Achado[];
};

/**
 * Roda todos os detetores, aplica os consertos mecânicos, e devolve o que sobrou.
 *
 * Se `achados` vier vazio, a resposta segue como ela a escreveu. Nenhuma chamada de modelo,
 * nenhuma latência, nenhuma palavra dela mexida. É o caso normal.
 */
export function detectar(e: EntradaDeteccao): ResultadoDeteccao {
  let texto = e.resposta;
  const achados: Achado[] = [];

  // A encenação primeiro: o conserto é mecânico e muda o texto que os outros vão medir.
  const teatro = detectarEncenacao(texto, e.ferramentasUsadas);
  if (teatro) {
    texto = removerEncenacao(texto);
    achados.push({ ...teatro, resolvido: true });
  }

  const candidatos = [
    detectarExtensao(texto, e.alvoPalavras),
    detectarEco(texto, e.mensagemDele),
    detectarRecapitulacao(texto, e.historicoDele),
    detectarLinkInventado(texto, e.urlsBuscados),
  ];

  for (const a of candidatos) if (a) achados.push(a);

  return { texto, achados };
}

/** Sobrou algo que só um reescritor resolve? (encenação já foi apagada à mão) */
export function precisaReescritor(achados: Achado[]): boolean {
  return achados.some((a) => !a.resolvido);
}
