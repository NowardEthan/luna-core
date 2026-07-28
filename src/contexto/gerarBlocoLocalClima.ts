/**
 * Bloco de contexto ESPACIAL — onde a pessoa está e como está o tempo agora.
 *
 * Irmão do `gerarBlocoTempo` (que dá o "quando"). Antes a Luna só tinha o relógio;
 * sem o lugar, ela respondia coisa regional (fungicida, clima, safra, o que está
 * registrado) no genérico. O clima vem PRONTO do app (ele já capta a localização e
 * consulta o Open-Meteo) — o servidor só formata. Assim nada de rede aqui, nada de
 * latência a mais no turno.
 */

/** Clima atual + previsão do dia, já buscado pelo cliente (Open-Meteo). */
export type ClimaAtual = {
  /** Temperatura atual (°C). */
  tempC?: number;
  /** Sensação térmica (°C). */
  sensacaoC?: number;
  /** Umidade relativa (%). */
  umidade?: number;
  /** Vento (km/h). */
  ventoKmh?: number;
  /** Código WMO do tempo (0 = limpo … 95 = trovoada). */
  codigo?: number;
  /** Descrição pronta em pt-BR (se o app já traduziu). Senão, derivamos do código. */
  descricao?: string;
  /** Máxima do dia (°C). */
  maxC?: number;
  /** Mínima do dia (°C). */
  minC?: number;
  /** Probabilidade de chuva hoje (%). */
  chuvaProb?: number;
  /** Chuva acumulada prevista para hoje (mm). */
  chuvaMm?: number;
};

/** Onde a pessoa está + o tempo lá, do ponto de vista do dispositivo dela. */
export type LocalClima = {
  lat?: number;
  lon?: number;
  /** Cidade/município resolvido pelo Geocoder do aparelho. */
  cidade?: string;
  /** Estado/UF ou região administrativa. */
  uf?: string;
  /** País. */
  pais?: string;
  /** Clima atual, se o app conseguiu buscar. */
  clima?: ClimaAtual;
};

/** Traduz o código WMO do Open-Meteo para uma descrição curta em pt-BR. */
function descricaoWMO(codigo?: number): string | undefined {
  if (codigo == null) return undefined;
  const mapa: Record<number, string> = {
    0: "céu limpo",
    1: "predominantemente limpo",
    2: "parcialmente nublado",
    3: "nublado",
    45: "nevoeiro",
    48: "nevoeiro com geada",
    51: "garoa fraca",
    53: "garoa",
    55: "garoa forte",
    56: "garoa congelante fraca",
    57: "garoa congelante",
    61: "chuva fraca",
    63: "chuva",
    65: "chuva forte",
    66: "chuva congelante fraca",
    67: "chuva congelante",
    71: "neve fraca",
    73: "neve",
    75: "neve forte",
    77: "grãos de neve",
    80: "pancadas de chuva fracas",
    81: "pancadas de chuva",
    82: "pancadas de chuva fortes",
    85: "pancadas de neve",
    86: "pancadas de neve fortes",
    95: "trovoada",
    96: "trovoada com granizo",
    99: "trovoada com granizo forte",
  };
  return mapa[codigo];
}

function formatarLugar(local: LocalClima): string | undefined {
  const partes = [local.cidade?.trim(), local.uf?.trim()].filter(Boolean);
  let lugar = partes.join(" - ");
  if (!lugar && local.pais?.trim()) lugar = local.pais.trim();
  else if (lugar && local.pais?.trim() && local.pais.trim() !== "Brasil") {
    lugar = `${lugar}, ${local.pais.trim()}`;
  }
  if (lugar) return lugar;
  if (local.lat != null && local.lon != null) {
    return `lat ${local.lat.toFixed(3)}, lon ${local.lon.toFixed(3)}`;
  }
  return undefined;
}

function formatarClima(clima: ClimaAtual): string | undefined {
  const agora: string[] = [];
  if (clima.tempC != null) {
    let t = `${Math.round(clima.tempC)}°C`;
    if (clima.sensacaoC != null && Math.abs(clima.sensacaoC - clima.tempC) >= 2) {
      t += ` (sensação ${Math.round(clima.sensacaoC)}°C)`;
    }
    agora.push(t);
  }
  const desc = clima.descricao?.trim() || descricaoWMO(clima.codigo);
  if (desc) agora.push(desc);
  if (clima.umidade != null) agora.push(`umidade ${Math.round(clima.umidade)}%`);
  if (clima.ventoKmh != null) agora.push(`vento ${Math.round(clima.ventoKmh)} km/h`);

  const previsao: string[] = [];
  if (clima.maxC != null || clima.minC != null) {
    const max = clima.maxC != null ? `máx ${Math.round(clima.maxC)}°C` : null;
    const min = clima.minC != null ? `mín ${Math.round(clima.minC)}°C` : null;
    previsao.push([max, min].filter(Boolean).join(" / "));
  }
  if (clima.chuvaProb != null) {
    previsao.push(`${Math.round(clima.chuvaProb)}% de chance de chuva`);
  }
  if (clima.chuvaMm != null && clima.chuvaMm > 0) {
    previsao.push(`~${clima.chuvaMm.toFixed(1)} mm previstos`);
  }

  const linhas: string[] = [];
  if (agora.length) linhas.push(`Tempo agora: ${agora.join(", ")}.`);
  if (previsao.length) linhas.push(`Previsão de hoje: ${previsao.join(", ")}.`);
  return linhas.length ? linhas.join(" ") : undefined;
}

/**
 * Monta o bloco de local/clima. Devolve `undefined` quando não há nada útil — aí o
 * contexto simplesmente não ganha a seção (a Luna segue só com o relógio, como antes).
 */
export function gerarBlocoLocalClima(local?: LocalClima): string | undefined {
  if (!local) return undefined;

  const lugar = formatarLugar(local);
  const clima = local.clima ? formatarClima(local.clima) : undefined;
  if (!lugar && !clima) return undefined;

  const linhas: string[] = [];
  if (lugar) {
    linhas.push(
      `Onde a pessoa está agora: ${lugar}. Use isto como o lugar REAL dela — ` +
        `não invente outra cidade nem assuma São Paulo por padrão.`,
    );
  }
  if (clima) {
    linhas.push(
      `${clima} Este é o tempo real no entorno dela neste momento — trate como verdade. ` +
        `Só é relevante quando o assunto pede (clima, campo, roupa, deslocamento, saúde); ` +
        `não force o assunto do tempo sem motivo.`,
    );
  }
  return linhas.join(" ");
}

/** Combina o bloco temporal com o de local/clima numa string só (o slot `tempo`). */
export function gerarBlocoTempoComLocal(blocoTempo: string, local?: LocalClima): string {
  const localBloco = gerarBlocoLocalClima(local);
  return [blocoTempo, localBloco].filter(Boolean).join("\n\n");
}
