/**
 * Roteamento inteligente do modelo de imagem.
 *
 * - Seedream 4.5 — arte, ilustração, anime, estilo; o default que a Luna já ama.
 * - Riverflow V2.5 Fast — foto/realista (pessoas, produto, cena fotográfica).
 *
 * Override global ainda vale: `OPENROUTER_IMAGE_MODEL` / `OPENROUTER_IMAGE_EDIT_MODEL`
 * forçam um modelo único (desliga o roteamento).
 */

export type EstiloImagem = "arte" | "realista";

export const MODELO_ARTE = "bytedance-seed/seedream-4.5";
export const MODELO_REALISTA = "sourceful/riverflow-v2.5-fast";

/**
 * Sinais de realismo fotográfico. Se bater, Riverflow; senão Seedream (arte).
 * Deliberadamente exige intenção clara — «gato fofo» continua arte.
 */
const SINAIS_REALISTA =
  /\b(foto|fotograf\w*|photoreal\w*|photo[\s-]?real\w*|realista|realismo|hiper[\s-]?real\w*|hyper[\s-]?real\w*|cinematic\w*|dslr|35\s*mm|50\s*mm|retrato\s+fotogr|portrait\s+photo|stock\s+photo|produto\s+real|pessoa\s+real|rosto\s+real|pele\s+realista|como\s+(uma\s+)?foto|parece\s+(uma\s+)?foto|estilo\s+foto|shot\s+on|canon|nikon|sony\s+a7)\b/i;

const SINAIS_ARTE =
  /\b(ilustra\w*|arte|art[ií]stic|desenho|drawing|anime|manga|pixel\s*art|watercolor|aquarela|óleo|oil\s+paint|concept\s+art|digital\s+art|cartoon|hq|quadrinho|vetor|vector|3d\s+render|low\s+poly|studio\s+ghibli|pixar|stylized|estilizado)\b/i;

/** Classifica o pedido. Arte explícita ganha de realista vago; senão, sinais de foto → realista. */
export function classificarEstiloImagem(...textos: Array<string | undefined | null>): EstiloImagem {
  const t = textos.filter((s) => s && s.trim()).join("\n");
  if (!t) return "arte";
  // Pedido explícito de arte vence («foto estilo anime» → arte).
  if (SINAIS_ARTE.test(t)) return "arte";
  if (SINAIS_REALISTA.test(t)) return "realista";
  return "arte";
}

export function modeloParaEstilo(estilo: EstiloImagem): string {
  return estilo === "realista" ? MODELO_REALISTA : MODELO_ARTE;
}

/**
 * Modelo efetivo pra GERAR. Env `OPENROUTER_IMAGE_MODEL` força um só (sem roteamento).
 */
export function escolherModeloGeracao(...textos: Array<string | undefined | null>): {
  model: string;
  estilo: EstiloImagem;
  forcadoPorEnv: boolean;
} {
  const env = process.env.OPENROUTER_IMAGE_MODEL?.trim();
  if (env) return { model: env, estilo: classificarEstiloImagem(...textos), forcadoPorEnv: true };
  const estilo = classificarEstiloImagem(...textos);
  return { model: modeloParaEstilo(estilo), estilo, forcadoPorEnv: false };
}

/**
 * Modelo efetivo pra EDITAR. Env `OPENROUTER_IMAGE_EDIT_MODEL` > `OPENROUTER_IMAGE_MODEL` >
 * roteamento pelo texto da instrução (+ prompt anterior, se houver).
 */
export function escolherModeloEdicao(...textos: Array<string | undefined | null>): {
  model: string;
  estilo: EstiloImagem;
  forcadoPorEnv: boolean;
} {
  const env =
    process.env.OPENROUTER_IMAGE_EDIT_MODEL?.trim() ||
    process.env.OPENROUTER_IMAGE_MODEL?.trim();
  if (env) return { model: env, estilo: classificarEstiloImagem(...textos), forcadoPorEnv: true };
  const estilo = classificarEstiloImagem(...textos);
  return { model: modeloParaEstilo(estilo), estilo, forcadoPorEnv: false };
}
