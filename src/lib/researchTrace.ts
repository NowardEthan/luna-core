export type ResearchSource = { title?: string; url: string };

export type ResearchStep = {
  ferramenta: string;
  argumento: string;
  sucesso?: boolean;
  fontes?: ResearchSource[];
};

export type ResearchLive = {
  ferramenta: string;
  argumento: string;
  rodada: number;
  maxRodadas: number;
};

/** Extrai o argumento principal (query ou url) de uma chamada de ferramenta de pesquisa. */
export function argumentoDaAcao(ferramenta: string, argumentos: Record<string, unknown>): string {
  const raw = ferramenta === 'ler_url' ? argumentos.url : argumentos.query;
  return typeof raw === 'string' ? raw : '';
}

export function ehFerramentaDePesquisa(ferramenta: string): boolean {
  return ferramenta === 'web_search' || ferramenta === 'ler_url';
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Cruza os links [nome](url) do texto final com as fontes realmente
 * coletadas no turno — só sinaliza quais fontes reais foram citadas,
 * nunca inventa uma fonte nova a partir do texto.
 */
export function extractCitedSources(finalText: string, fontes: ResearchSource[]): Set<string> {
  const urlsNoTexto = new Set<string>();
  const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(finalText))) {
    urlsNoTexto.add(normalizeUrl(match[2]));
  }
  const citadas = new Set<string>();
  for (const fonte of fontes) {
    if (urlsNoTexto.has(normalizeUrl(fonte.url))) {
      citadas.add(fonte.url);
    }
  }
  return citadas;
}
