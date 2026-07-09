export type ResultadoLerUrl = {
  ok: boolean;
  error?: string;
  url?: string;
  title?: string;
  content?: string;
  truncated?: boolean;
};

const MAX_CHARS = 6000;

function decodeHtmlEntities(texto: string): string {
  return texto
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'");
}

function extrairTextoLegivel(html: string): string {
  const semRuido = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const semTags = semRuido.replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(semTags).replace(/\s+/g, " ").trim();
}

function extrairTitulo(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const titulo = match ? decodeHtmlEntities(match[1]).trim() : "";
  return titulo || undefined;
}

/** Busca e extrai o texto legível de uma URL específica (leitura de links colados na conversa). */
export async function lerUrl(urlBruta: string): Promise<ResultadoLerUrl> {
  const url = String(urlBruta ?? "").trim();
  if (!/^https?:\/\/\S+$/i.test(url)) {
    return { ok: false, error: "URL inválida. Deve começar com http:// ou https://." };
  }

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LunaBot/1.0; +https://luna.app)" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return { ok: false, error: `Não consegui abrir a página (HTTP ${res.status}).`, url };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain/i.test(contentType)) {
      return {
        ok: false,
        error: `Tipo de conteúdo não suportado para leitura: ${contentType || "desconhecido"}.`,
        url,
      };
    }

    const html = await res.text();
    const texto = extrairTextoLegivel(html);
    if (!texto) {
      return { ok: false, error: "A página não retornou texto legível.", url };
    }

    const truncated = texto.length > MAX_CHARS;
    return {
      ok: true,
      url,
      title: extrairTitulo(html),
      content: truncated ? texto.slice(0, MAX_CHARS) : texto,
      truncated,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), url };
  }
}
