/**
 * Contrato de blocos do artefato (Notion da Luna — N0).
 * Markdown continua como projeção (`conteudo`) pra export e tools legadas.
 */

export const SCHEMA_ARTEFATO_BLOCOS = 2;
export const SCHEMA_ARTEFATO_MD = 1;

export type TipoBlocoArtefato =
  | "paragraph"
  | "heading"
  | "bullet"
  | "numbered"
  | "todo"
  | "quote"
  | "code"
  | "divider"
  | "callout";

export type PropsBlocoArtefato = {
  level?: 1 | 2 | 3;
  checked?: boolean;
  language?: string;
  /** Sabor do callout (chave de SABORES_CALLOUT) — dica/atencao/feito/duvida/fixado/info. */
  callout?: SaborCalloutChave;
  /** Rótulo opcional no meio de um divisor (ex.: "Parte 2"). */
  label?: string;
};

/**
 * Sabores de callout — espelho de
 * `OrbitLab/.../data/artefato/ArtefatoBlocos.kt` (enum SaborCallout).
 * Cada um tem o marcador de markdown (`> [!chave]`), o rótulo pt-BR e o emoji
 * que também serve de atalho ao escrever.
 */
export type SaborCalloutChave = "dica" | "atencao" | "feito" | "duvida" | "fixado" | "info";

export const SABORES_CALLOUT: Record<
  SaborCalloutChave,
  { rotulo: string; emoji: string }
> = {
  dica: { rotulo: "Dica", emoji: "💡" },
  atencao: { rotulo: "Atenção", emoji: "⚠️" },
  feito: { rotulo: "Feito", emoji: "✅" },
  duvida: { rotulo: "Dúvida", emoji: "❓" },
  fixado: { rotulo: "Fixado", emoji: "📌" },
  info: { rotulo: "Nota", emoji: "ℹ️" },
};

/** Normaliza a chave crua (com apelidos amistosos) pra um sabor válido. Default: info. */
export function saborCalloutDe(raw: string | null | undefined): SaborCalloutChave {
  const k = raw?.trim().toLowerCase();
  if (k && k in SABORES_CALLOUT) return k as SaborCalloutChave;
  switch (k) {
    case "aviso":
    case "warning":
    case "cuidado":
      return "atencao";
    case "ok":
    case "sucesso":
    case "done":
      return "feito";
    case "pergunta":
    case "question":
      return "duvida";
    case "importante":
    case "pin":
      return "fixado";
    case "tip":
    case "sacada":
      return "dica";
    default:
      return "info";
  }
}

/** Se o texto começa com um dos emojis de sabor, devolve a chave correspondente. */
export function saborCalloutPorEmoji(texto: string): SaborCalloutChave | null {
  const t = texto.trimStart();
  for (const chave of Object.keys(SABORES_CALLOUT) as SaborCalloutChave[]) {
    if (t.startsWith(SABORES_CALLOUT[chave].emoji)) return chave;
  }
  return null;
}

export type BlocoArtefato = {
  id: string;
  type: TipoBlocoArtefato;
  props?: PropsBlocoArtefato;
  text: string;
};

let seqBloco = 0;

/** Id estável o bastante pra uma sessão; Firestore/Luna usam pra editar. */
export function novoIdBloco(): string {
  seqBloco = (seqBloco + 1) % 1_000_000;
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `b_${t}_${r}_${seqBloco}`;
}

export function blocosToMd(blocos: BlocoArtefato[]): string {
  const out: string[] = [];
  let numbered = 0;
  for (const b of blocos) {
    switch (b.type) {
      case "heading": {
        const nivel = Math.min(3, Math.max(1, b.props?.level ?? 1));
        out.push(`${"#".repeat(nivel)} ${b.text}`.trimEnd());
        numbered = 0;
        break;
      }
      case "bullet":
        out.push(`- ${b.text}`);
        numbered = 0;
        break;
      case "numbered":
        numbered += 1;
        out.push(`${numbered}. ${b.text}`);
        break;
      case "todo":
        out.push(`- [${b.props?.checked ? "x" : " "}] ${b.text}`);
        numbered = 0;
        break;
      case "quote":
        out.push(
          b.text
            .split("\n")
            .map((l) => `> ${l}`)
            .join("\n"),
        );
        numbered = 0;
        break;
      case "callout": {
        const kind = b.props?.callout?.trim() || null;
        const linhas = b.text.split("\n");
        const primeira = linhas[0] ?? "";
        const marcador = kind ? `[!${kind}] ` : "";
        const corpo = [
          `> ${marcador}${primeira}`.trimEnd(),
          ...linhas.slice(1).map((l) => `> ${l}`),
        ];
        out.push(corpo.join("\n"));
        numbered = 0;
        break;
      }
      case "code": {
        const lang = b.props?.language?.trim() ?? "";
        out.push("```" + lang + "\n" + b.text + "\n```");
        numbered = 0;
        break;
      }
      case "divider": {
        const label = b.props?.label?.trim() || null;
        out.push(label ? `--- ${label} ---` : "---");
        numbered = 0;
        break;
      }
      case "paragraph":
      default:
        out.push(b.text);
        numbered = 0;
        break;
    }
  }
  return out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim() + (out.length ? "\n" : "");
}

/**
 * Converte Markdown → blocos. Round-trip fiel o bastante pra headings, listas,
 * todos, quotes, code fences e HR. Parágrafos multi-linha viram um bloco.
 */
export function mdToBlocos(md: string): BlocoArtefato[] {
  const texto = md.replace(/\r\n/g, "\n");
  if (!texto.trim()) {
    return [{ id: novoIdBloco(), type: "paragraph", text: "" }];
  }

  const linhas = texto.split("\n");
  const blocos: BlocoArtefato[] = [];
  let i = 0;
  let paraBuf: string[] = [];

  const flushPara = () => {
    if (paraBuf.length === 0) return;
    const t = paraBuf.join("\n").trimEnd();
    paraBuf = [];
    if (t.length === 0) return;
    blocos.push({ id: novoIdBloco(), type: "paragraph", text: t });
  };

  while (i < linhas.length) {
    const linha = linhas[i];
    const trim = linha.trim();

    if (trim.startsWith("```") || trim.startsWith("~~~")) {
      flushPara();
      const fence = trim.slice(0, 3);
      const language = trim.slice(3).trim();
      i += 1;
      const codeLines: string[] = [];
      while (i < linhas.length && !linhas[i].trim().startsWith(fence)) {
        codeLines.push(linhas[i]);
        i += 1;
      }
      if (i < linhas.length) i += 1;
      blocos.push({
        id: novoIdBloco(),
        type: "code",
        props: language ? { language } : undefined,
        text: codeLines.join("\n"),
      });
      continue;
    }

    const divRotulado = /^(?:-{3,}|\*{3,}|_{3,})\s+(.+?)\s+(?:-{3,}|\*{3,}|_{3,})$/.exec(trim);
    if (divRotulado) {
      flushPara();
      blocos.push({
        id: novoIdBloco(),
        type: "divider",
        props: { label: divRotulado[1].trim() },
        text: "",
      });
      i += 1;
      continue;
    }

    if (/^---+$/.test(trim) || /^\*\*\*+$/.test(trim)) {
      flushPara();
      blocos.push({ id: novoIdBloco(), type: "divider", text: "" });
      i += 1;
      continue;
    }

    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(linha);
    if (h) {
      flushPara();
      const nivel = Math.min(3, h[1].length) as 1 | 2 | 3;
      blocos.push({
        id: novoIdBloco(),
        type: "heading",
        props: { level: nivel },
        text: h[2].trim(),
      });
      i += 1;
      continue;
    }

    const todo = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(linha);
    if (todo) {
      flushPara();
      blocos.push({
        id: novoIdBloco(),
        type: "todo",
        props: { checked: todo[2].toLowerCase() === "x" },
        text: todo[3],
      });
      i += 1;
      continue;
    }

    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(linha);
    if (bullet) {
      flushPara();
      blocos.push({ id: novoIdBloco(), type: "bullet", text: bullet[2] });
      i += 1;
      continue;
    }

    const num = /^(\s*)\d+\.\s+(.*)$/.exec(linha);
    if (num) {
      flushPara();
      blocos.push({ id: novoIdBloco(), type: "numbered", text: num[2] });
      i += 1;
      continue;
    }

    if (trim.startsWith(">")) {
      flushPara();
      const quoteLines: string[] = [];
      while (i < linhas.length && linhas[i].trim().startsWith(">")) {
        quoteLines.push(linhas[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      const body = quoteLines.join("\n");
      const bodyTrim = body.trimStart();
      // Callout: marcador `[!kind]` OU emoji de sabor no início — senão quote.
      const marcador = /^\[!\s*([\p{L}]+)\s*\]\s?/u.exec(bodyTrim);
      const saborEmoji = saborCalloutPorEmoji(bodyTrim);
      if (marcador) {
        blocos.push({
          id: novoIdBloco(),
          type: "callout",
          props: { callout: saborCalloutDe(marcador[1]) },
          text: bodyTrim.slice(marcador[0].length).trimStart(),
        });
      } else if (saborEmoji) {
        blocos.push({
          id: novoIdBloco(),
          type: "callout",
          props: { callout: saborEmoji },
          text: bodyTrim.slice(SABORES_CALLOUT[saborEmoji].emoji.length).trimStart(),
        });
      } else {
        blocos.push({ id: novoIdBloco(), type: "quote", text: body });
      }
      continue;
    }

    if (trim === "") {
      flushPara();
      i += 1;
      continue;
    }

    paraBuf.push(linha);
    i += 1;
  }
  flushPara();

  if (blocos.length === 0) {
    return [{ id: novoIdBloco(), type: "paragraph", text: "" }];
  }
  return blocos;
}

/** Garante blocos + projeção MD coerentes a partir do que veio do Firestore. */
export function normalizarDocumentoBlocos(input: {
  conteudo?: string;
  blocos?: BlocoArtefato[] | null;
  schemaVersion?: number | null;
}): { schemaVersion: number; blocos: BlocoArtefato[]; conteudo: string } {
  const temBlocos = Array.isArray(input.blocos) && input.blocos.length > 0;
  if (temBlocos && (input.schemaVersion ?? 0) >= SCHEMA_ARTEFATO_BLOCOS) {
    const blocos = input.blocos!.map((b) => ({
      ...b,
      id: b.id || novoIdBloco(),
      text: b.text ?? "",
    }));
    return {
      schemaVersion: SCHEMA_ARTEFATO_BLOCOS,
      blocos,
      conteudo: blocosToMd(blocos),
    };
  }
  const md = input.conteudo ?? "";
  const blocos = mdToBlocos(md);
  return {
    schemaVersion: SCHEMA_ARTEFATO_BLOCOS,
    blocos,
    conteudo: blocosToMd(blocos),
  };
}

export function inserirBlocosApos(
  blocos: BlocoArtefato[],
  afterId: string | null | undefined,
  novos: BlocoArtefato[],
): BlocoArtefato[] {
  if (novos.length === 0) return blocos;
  if (!afterId) return [...blocos, ...novos];
  const idx = blocos.findIndex((b) => b.id === afterId);
  if (idx < 0) return [...blocos, ...novos];
  return [...blocos.slice(0, idx + 1), ...novos, ...blocos.slice(idx + 1)];
}

export function editarBlocoNaLista(
  blocos: BlocoArtefato[],
  id: string,
  patch: { text?: string; type?: TipoBlocoArtefato; props?: PropsBlocoArtefato },
): BlocoArtefato[] | null {
  const idx = blocos.findIndex((b) => b.id === id);
  if (idx < 0) return null;
  const atual = blocos[idx];
  const next = [...blocos];
  next[idx] = {
    ...atual,
    text: typeof patch.text === "string" ? patch.text : atual.text,
    type: patch.type ?? atual.type,
    props: patch.props !== undefined ? { ...atual.props, ...patch.props } : atual.props,
  };
  return next;
}
