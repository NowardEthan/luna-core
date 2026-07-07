export type ResultadoPesquisaWebItem = {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string;
};

export type ResultadoPesquisaWeb = {
  ok: boolean;
  error?: string;
  query?: string;
  answer?: string;
  results?: ResultadoPesquisaWebItem[];
  searched_at?: string;
  reference_date?: string;
  reference_year?: number;
  search_window_days?: number;
  temporal_note?: string;
};

export function webSearchDisponivel(): boolean {
  const key = process.env.WEB_SEARCH_API_KEY?.trim() || process.env.TAVILY_API_KEY?.trim();
  return Boolean(key);
}

function chavePesquisaWeb(): string | null {
  const key = process.env.WEB_SEARCH_API_KEY?.trim() || process.env.TAVILY_API_KEY?.trim();
  return key || null;
}

/** Pesquisa web via Tavily (mesmo contrato do Orbit desktop). */
export async function pesquisaWeb(query: string): Promise<ResultadoPesquisaWeb> {
  const q = String(query ?? "").trim();
  if (!q.length) {
    return { ok: false, error: "Consulta vazia." };
  }

  const key = chavePesquisaWeb();
  if (!key) {
    return {
      ok: false,
      error:
        "Pesquisa web não configurada. Defina WEB_SEARCH_API_KEY ou TAVILY_API_KEY no servidor.",
    };
  }

  const provider = (process.env.WEB_SEARCH_PROVIDER || "tavily").toLowerCase();
  if (provider !== "tavily") {
    return { ok: false, error: `Provider desconhecido: ${provider}. Use tavily.` };
  }

  try {
    const now = new Date();
    const referenceDate = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(now);
    const daysRaw = Number(process.env.TAVILY_SEARCH_DAYS);
    const days =
      !Number.isNaN(daysRaw) && daysRaw >= 1 && daysRaw <= 365 ? Math.floor(daysRaw) : 30;

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query: q,
        search_depth: "basic",
        max_results: 5,
        days,
        ...(/\b(not[ií]cia|news|recente|hoje|atual)\b/i.test(q) ? { topic: "news" } : {}),
      }),
    });

    const bodyText = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        error: `Tavily (${res.status}): ${bodyText.slice(0, 400)}`,
      };
    }

    const data = JSON.parse(bodyText) as {
      answer?: string;
      results?: Array<{
        title?: string;
        url?: string;
        content?: string;
        published_date?: string;
        publishedDate?: string;
      }>;
    };

    const results = Array.isArray(data.results)
      ? data.results.map((r) => ({
          title: r.title,
          url: r.url,
          content: String(r.content ?? "").slice(0, 800),
          published_date: r.published_date || r.publishedDate || undefined,
        }))
      : [];

    return {
      ok: true,
      query: q,
      answer: data.answer ? String(data.answer).slice(0, 2000) : "",
      results,
      searched_at: now.toISOString(),
      reference_date: referenceDate,
      reference_year: now.getFullYear(),
      search_window_days: days,
      temporal_note:
        'reference_date é o relógio do servidor ("hoje"). Resultados podem ser mais antigos — use published_date quando existir; não trate artigos de outro ano como notícia de hoje.',
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
