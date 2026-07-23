/**
 * Índice de eco — C0 do roadmap "A Luna que Conversa".
 *
 * ── Porque não basta o `detectarEco` que já existe ────────────────────────────
 * O `detectores.ts` já mede eco, mas por SOBREPOSIÇÃO DE TRIGRAMAS — ela repetir as
 * PALAVRAS EXATAS dele. O incômodo do Ethan é outro e mais fundo:
 *
 *   «tudo que ela fala é uma extensão mais prolixa do que eu já contei»
 *
 * Isso é eco SEMÂNTICO: ela reflete o CONTEÚDO dele (os substantivos, o assunto) com
 * outras palavras e mais volume — o trigrama não pega, porque as palavras mudam de forma.
 *
 * Este módulo mede duas coisas que o trigrama não vê, sem LLM (determinístico, ~0 ms):
 *
 *   containment  → quanto do CONTEÚDO dele reaparece na resposta (ela devolve o assunto)
 *   aporte       → quanto do que ela diz é NOVO (não derivável da fala dele) — o oposto do eco
 *
 * Um turno de puro eco tem containment alto e aporte baixo: ela só reembrulha o que ele
 * trouxe. Um interlocutor de verdade tem aporte alto: traz stance, um fio, um dado novo.
 */

// Palavras-função pt-BR — não são "conteúdo". Tirar reduz o ruído (senão "que", "com",
// "isso" inflam a sobreposição e escondem o sinal real).
const STOPWORDS = new Set([
  "que", "nao", "sim", "com", "para", "por", "mas", "uma", "voce", "ele", "ela", "eles",
  "elas", "isso", "isto", "aqui", "ali", "tem", "ter", "tinha", "foi", "ser", "sou", "era",
  "sao", "dos", "das", "num", "numa", "pra", "pro", "meu", "minha", "seu", "sua", "nos",
  "vos", "voces", "esse", "essa", "este", "esta", "aquele", "aquela", "aquilo", "tudo",
  "nada", "muito", "muita", "mais", "menos", "bem", "tao", "ja", "entao", "agora", "depois",
  "antes", "sobre", "entre", "quando", "como", "onde", "porque", "qual", "quais", "cada",
  "todo", "toda", "todos", "todas", "algum", "alguma", "tambem", "ainda", "ate", "vai",
  "vou", "vamos", "fazer", "faz", "fez", "dizer", "disse", "coisa", "coisas", "gente",
  "kkk", "kks", "haha", "hahaha", "rsrs", "pois", "aew", "aeh", "eita", "opa", "hein",
  "aff", "uai", "poxa", "nossa", "cara", "vei", "mano", "tipo", "assim", "sei", "acho",
  "ficou", "fica", "ficar", "estar", "esta", "estou", "estava", "estao", "vez", "vezes",
  "dia", "hoje", "ontem", "amanha", "agora", "aqui", "porem", "logo", "entao", "então",
  "não", "você", "estão", "são", "tão", "já", "até", "também", "está", "né", "vc", "ce",
]);

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Conjunto de palavras-conteúdo (sem pontuação, sem stopwords, > 2 letras). */
export function palavrasConteudo(texto: string): Set<string> {
  const toks = normalizar(texto)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((p) => p.length > 2 && !STOPWORDS.has(p));
  return new Set(toks);
}

export type IndiceEco = {
  /** Fração das palavras-conteúdo DELE que reaparecem na resposta (0..1). Alto = devolve o assunto dele. */
  containment: number;
  /** Fração das palavras-conteúdo DELA que são NOVAS — não vieram da fala dele (0..1). Alto = traz o próprio. */
  aporte: number;
  /** A 1ª frase espelha a fala dele? (o "ahh, é o escritório clean com estante Bauhaus…") */
  recapAbertura: boolean;
  /** Composto 0..1 — ALTO = eco. Reflete muito o dele e traz pouco de novo. */
  eco: number;
};

function fracao(intersecaoCom: Set<string>, base: Set<string>): number {
  if (base.size === 0) return 0;
  let comuns = 0;
  for (const w of base) if (intersecaoCom.has(w)) comuns++;
  return comuns / base.size;
}

/** A 1ª frase é majoritariamente palavras dele? */
function recapNaAbertura(resposta: string, dele: Set<string>): boolean {
  const primeira = resposta.split(/[.!?\n]/).find((s) => s.trim().length > 0) ?? "";
  const p = palavrasConteudo(primeira);
  if (p.size < 2 || dele.size === 0) return false;
  return fracao(dele, p) >= 0.5;
}

/** Mede o eco de uma resposta da Luna contra a fala dele que a motivou. */
export function medirEco(resposta: string, mensagemDele: string): IndiceEco {
  const dele = palavrasConteudo(mensagemDele);
  const dela = palavrasConteudo(resposta);

  const containment = fracao(dela, dele); // quanto do dele reaparece
  const comunsNaResposta = fracao(dele, dela); // quanto da resposta é dele
  const aporte = dela.size === 0 ? 0 : 1 - comunsNaResposta; // o resto é novo
  const recapAbertura = recapNaAbertura(resposta, dele);

  // Eco alto = reflete muito o dele E traz pouco de novo. Abertura-espelho pesa um tico.
  const base = 0.6 * containment + 0.4 * (1 - aporte);
  const eco = Math.max(0, Math.min(1, base + (recapAbertura ? 0.1 : 0)));

  return { containment, aporte, recapAbertura, eco };
}

export type TurnoConversa = { papel: "user" | "assistant"; conteudo: string };

export type RelatorioEco = {
  /** Por resposta da Luna (com a fala dele que a motivou). */
  porTurno: Array<{ resposta: string; mensagemDele: string } & IndiceEco>;
  /** Média do índice de eco (0..1). */
  ecoMedio: number;
  /** Média de aporte próprio (0..1) — quanto ela traz de novo, em média. */
  aporteMedio: number;
  /** Fração de respostas que ABREM com recap-espelho. */
  fracaoRecapAbertura: number;
  turnosAvaliados: number;
};

/** Mede o eco ao longo de uma conversa — cada resposta da Luna contra a última fala dele. */
export function medirConversa(turnos: TurnoConversa[]): RelatorioEco {
  const porTurno: RelatorioEco["porTurno"] = [];
  let ultimoUser = "";
  for (const t of turnos) {
    if (t.papel === "user") {
      ultimoUser = t.conteudo;
      continue;
    }
    if (!ultimoUser.trim() || !t.conteudo.trim()) continue;
    const m = medirEco(t.conteudo, ultimoUser);
    porTurno.push({ resposta: t.conteudo, mensagemDele: ultimoUser, ...m });
  }

  const n = porTurno.length;
  const media = (f: (x: (typeof porTurno)[number]) => number) =>
    n === 0 ? 0 : porTurno.reduce((a, x) => a + f(x), 0) / n;

  return {
    porTurno,
    ecoMedio: media((x) => x.eco),
    aporteMedio: media((x) => x.aporte),
    fracaoRecapAbertura: media((x) => (x.recapAbertura ? 1 : 0)),
    turnosAvaliados: n,
  };
}

/**
 * Parser do .md exportado do app ("**Você:**" / "**Luna:**") → turnos.
 * É o que vira o BASELINE honesto: joga uma conversa real aqui e mede.
 */
export function parseConversaMd(md: string): TurnoConversa[] {
  const turnos: TurnoConversa[] = [];
  const linhas = md.split(/\r?\n/);
  let papel: "user" | "assistant" | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (papel && buffer.join("\n").trim()) {
      turnos.push({ papel, conteudo: buffer.join("\n").trim() });
    }
    buffer = [];
  };

  for (const linha of linhas) {
    const cab = linha.trim().replace(/\*/g, "").replace(/:$/, "").toLowerCase();
    if (cab === "voce" || cab === "você") {
      flush();
      papel = "user";
    } else if (cab === "luna") {
      flush();
      papel = "assistant";
    } else if (papel) {
      buffer.push(linha);
    }
  }
  flush();
  return turnos;
}
