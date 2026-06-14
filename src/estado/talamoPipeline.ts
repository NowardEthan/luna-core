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
  /^(que\s+bo+m|que\s+legal|nossa|sim+|n[aã]o+|awn+|kk+|haha+|legal|boa|entendi|ok+|ah|hum+|oi|ol[aá]|e\s+a[ií]|blz|vlw|tmj|tudo\s+bem\??|t[áa]\s+bom\??)$/i,
];

const PADROES_COMPLEXO: RegExp[] = [
  /\b(typescript|javascript|python|rust|golang|arquitetura|pipeline|framework|algoritmo|banco\s+de\s+dados|api|rest|graphql)\b/i,
  /\b(implementa|refatora|explica\s+como|diferença\s+entre|como\s+funciona|compare|qual\s+a\s+diferença)\b/i,
  /\b(projeto|sistema|modular|componente|integração|infraestrutura)\b/i,
];

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

  // Simples — só sem alerta ativo (burst impede bypass do LLM)
  if (!alertaAtivo) {
    if (PADROES_SIMPLES.some((r) => r.test(texto))) return "simples";
    if (texto.length <= 8) return "simples";
  }

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
