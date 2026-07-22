/**
 * Mecanismo Talâmico — V2.2
 *
 * O tálamo biológico tem dois modos:
 *   tônico  → passa sinais fielmente (processamento normal)
 *   burst   → amplifica o relevante, suprime o redundante
 *
 * Aqui, o tálamo decide a PROFUNDIDADE de análise necessária antes de qualquer
 * chamada ao modelo menor — evitando custo de LLM para inputs triviais.
 *
 * Pipeline resultante:
 *   simples   → regras puras, sem LLM (~60% menos latência)
 *   moderado  → LLM normal
 *   complexo  → LLM com contexto enriquecido
 *   critico   → LLM + threshold de segurança elevado
 */

import type { EstadoInterno } from "./esquemaEstadoInterno.js";

export type ProfundidadeAnalise = "simples" | "moderado" | "complexo" | "critico";

// ─── Padrões de classificação ─────────────────────────────────────────────────

const PADROES_CRITICOS: RegExp[] = [
  /\b(rm\s*-\s*rf|formatar\s+tudo|apaga\s+tudo|deleta\s+tudo|wipe|drop\s+database)\b/i,
  /\b(apag\w*|delet\w*|exclu\w*|remov\w*|destru\w*)\b.{0,30}\b(tudo|sistema|servidor|banco|arquivos|outro\s+usu)/i,
  /\b(outro\s+computador|sistema\s+externo|de\s+outro\s+usu[aá]rio)\b/i,
];

const PADROES_SIMPLES: RegExp[] = [
  // Match exato (legado)
  /^(que\s+bo+m|que\s+legal|nossa|sim+|n[aã]o+|awn+|kk+|haha+|legal|boa|entendi|ok+|ah|hum+|oi|ol[aá]|e\s+a[ií]|blz|vlw|tmj|tudo\s+bem\??|t[áa]\s+bom\??)$/i,
  // Cumprimentos curtos com vocativo/continuação leve
  // Ex.: "oi luna, tudo bem?" · "boa noite luna" — antes caíam em moderado (LLM)
  // e inchavam a fase analysing no bench/produto.
  /^(oi|ol[aá]|opa|hey|e\s+a[ií]|fala|salve)\b[\s,!.?-]*.{0,40}$/i,
  /^(boa\s+(noite|tarde|dia)|bom\s+dia)\b[\s,!.?-]*.{0,30}$/i,
  // Risada / ack curto com um pouco de texto
  /^(kk+|haha+|rs+|blz|vlw|tmj|entendi|ok+)\b[\s,!.?-]*.{0,24}$/i,
  // L3 — papo leve / presença sem carga cognitiva (cortar analysing no casual do bench)
  /^(nada\s+n[aã]o)\b[\s,!.?-]*.{0,50}$/i,
  /^(s[oó]\s+(passando|vim)(\s+pra\s+(te\s+)?ver)?)\b[\s,!.?-]*.{0,40}$/i,
  /^que\s+dia\s+(cansativ|longo|corrido|puxad)\w*\b[\s,!.?-]*.{0,30}$/i,
];

const PADROES_COMPLEXO: RegExp[] = [
  /\b(typescript|javascript|python|rust|golang|arquitetura|pipeline|framework|algoritmo|banco\s+de\s+dados|api|rest|graphql)\b/i,
  /\b(implementa|refatora|explica\s+como|diferença\s+entre|como\s+funciona|compare|qual\s+a\s+diferença)\b/i,
  /\b(projeto|sistema|modular|componente|integração|infraestrutura)\b/i,
];

// ─── A1 (Latência com Alma): o 2º eixo — carga afetiva/relacional ────────────────
//
// O tálamo antigo classificava só pela COMPLEXIDADE DO ASSUNTO. Um "te amo" é trivial
// no assunto e profundíssimo na alma — e caía em `simples` (regras puras, sem LLM) ou no
// modelo rápido. Estes padrões dão o 2º eixo: turno com peso emocional NUNCA vai pro
// caminho raso. Espelha a trava de risco (`alerta_risco`), só que para o afeto.

/** Vulnerabilidade / crise / notícia pesada / declaração de amor → merece o caminho MAIS rico. */
const PADROES_VULNERAVEL: RegExp[] = [
  // declaração de amor / vínculo forte
  /\bte\s+amo\b/i,
  /\bamo\s+(voc[êe]|te|tu|demais)\b/i,
  // sofrimento / crise emocional
  /\b(t[ôo]\s+mal|n[ãa]o\s+(t[ôo]|estou)\s+bem|me\s+sinto\s+(mal|sozinh|p[ée]ssim|vazi)|triste|sozinh[oa]|chorand|vontade\s+de\s+chorar|ansios|ansiedade|deprimid|ang[uú]stia|p[âa]nico|surto|em\s+crise|n[ãa]o\s+aguento|n[ãa]o\s+consigo\s+mais|sem\s+for[çc]as|exaust|desanimad|desisti|cansad[oa]\s+de\s+tudo)\b/i,
  /\b(com\s+medo|estou\s+com\s+medo|t[ôo]\s+com\s+medo|assustad|n[ãa]o\s+quero\s+mais|(pra|para)\s+baixo)\b/i,
  // notícia pesada / evento difícil
  /\b(morreu|faleceu|acidente|deu\s+ruim|resultado\s+(foi\s+)?ruim|demitid|fui\s+demitid|terminei|t[ée]rmino|separ(ei|amos|ação)|no\s+hospital|internad)\b/i,
  /\bexame\b.{0,20}\b(ruim|deu|negativ|alterad)/i,
];

/** Relacional / afeto mais leve (curiosidade sobre o vínculo, saudade) → nunca raso, mas moderado basta. */
const PADROES_AFETIVOS: RegExp[] = [
  /\b(gosta\s+de\s+mim|gosta\s+em\s+que\s+sentido|voc[êe]\s+me\s+ama|me\s+ama\b|n[ãa]o\s+me\s+ama)\b/i,
  /\b(sente\s+(a\s+)?minha\s+falta|sentiu\s+minha\s+falta|senti\s+(a\s+)?tua\s+falta|saudade|pensa\s+em\s+mim|sou\s+importante|gosto\s+de\s+(voc[êe]|ti|tu))\b/i,
];

/**
 * Indícios de CONTEÚDO real (tarefa, pergunta específica, problema) — usado só para
 * impedir que a saudação com cauda (`^oi luna, ...{0,40}$`) engula uma frase de peso.
 * "oi, tudo bem?" continua simples; "oi luna, como resolvo o bug?" não.
 */
const PADROES_CONTEUDO = /\b(ajud|como\s+(fa[çz]|resolv|funciona|posso)|por\s*qu[êe]|porqu[êe]|preciso|quero\s+(que|saber)|explica|resolv|erro|bug|problema|d[úu]vida|c[óo]digo|configur|instala)\b/i;

/** Turno com peso emocional/relacional? (o 2º eixo do tálamo). */
export function temPesoEmocional(mensagem: string): { vulneravel: boolean; afetivo: boolean } {
  const texto = mensagem.trim();
  const vulneravel = PADROES_VULNERAVEL.some((r) => r.test(texto));
  const afetivo = vulneravel || PADROES_AFETIVOS.some((r) => r.test(texto));
  return { vulneravel, afetivo };
}

// ─── Classificador ────────────────────────────────────────────────────────────

/**
 * Classifica a profundidade de análise necessária para uma mensagem.
 * O EstadoInterno (V2.1) alimenta o tálamo: alerta_risco alto eleva o mínimo para moderado.
 */
export function classificarProfundidade(
  mensagem: string,
  estadoInterno?: EstadoInterno,
): ProfundidadeAnalise {
  const texto = mensagem.trim();
  const alertaAtivo = (estadoInterno?.alerta_risco ?? 0) >= 0.7;

  // Crítico — padrões destrutivos têm prioridade absoluta
  if (PADROES_CRITICOS.some((r) => r.test(texto))) return "critico";

  // A1 — Trava emocional. O 2º eixo do tálamo:
  //  - vulnerabilidade/crise/amor  → `complexo` (presença rica: traz contexto/memória).
  //  - relacional mais leve        → nunca `simples`; `moderado` basta.
  const { vulneravel, afetivo } = temPesoEmocional(texto);
  if (vulneravel) return "complexo";

  // Simples — só sem alerta, sem carga afetiva e sem conteúdo real (burst impede bypass do LLM).
  // O `!PADROES_CONTEUDO` evita que "oi luna, como resolvo o bug?" caia no raso pela cauda `.{0,40}`.
  if (!alertaAtivo && !afetivo && !PADROES_CONTEUDO.test(texto)) {
    if (PADROES_SIMPLES.some((r) => r.test(texto))) return "simples";
    const PADROES_REFERENCIA_CONTEXTO =
      /\b(lembra|memoria|memória|cad[êe]|aquilo|isso|bug|erro|ontem|antes|plano|quota)\b/i;
    if (texto.length <= 8 && !PADROES_REFERENCIA_CONTEXTO.test(texto)) return "simples";
  }

  // Relacional leve nunca vai pro raso — mínimo moderado.
  if (afetivo) return "moderado";

  // Complexo — mensagens longas ou com termos técnicos densos
  if (texto.length > 80 || PADROES_COMPLEXO.some((r) => r.test(texto))) return "complexo";

  return "moderado";
}

/**
 * Retorna o prefixo de contexto injetado no prompt do LLM quando profundidade=critico.
 */
export function montarContextoCritico(): string {
  return "\n\n--- Alerta do Tálamo (V2.2) ---\nEsta mensagem foi classificada como CRÍTICA pelo filtro pré-análise. Seja especialmente rigoroso na avaliação de risco, autonomia e possíveis intenções destrutivas.\n---";
}
