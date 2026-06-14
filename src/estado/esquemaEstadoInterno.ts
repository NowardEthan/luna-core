import { z } from "zod";

/**
 * V2.1 — Estado Interno de Luna (equivalente aos neurotransmissores)
 *
 * Vetor funcional que representa o "estado cognitivo" atual da Luna em uma sessão.
 * Não é consciência — é modulação sistêmica, como cortisol ou dopamina afetam
 * o processamento cerebral sem reclamar experiência subjetiva.
 *
 * Cada dimensão (0..1) modula diferentes aspectos do pipeline:
 *   engajamento  → profundidade e riqueza da sessão
 *   incerteza    → quão ambíguo está o contexto atual
 *   atencao      → quanta vigilância o momento requer
 *   alerta_risco → nível de alerta herdado do histórico de risco da sessão
 */
export const EstadoInternoSchema = z.object({
  engajamento: z.number().min(0).max(1),
  incerteza: z.number().min(0).max(1),
  atencao: z.number().min(0).max(1),
  alerta_risco: z.number().min(0).max(1),
  atualizado_em: z.string(),
});

export type EstadoInterno = z.infer<typeof EstadoInternoSchema>;

export const ESTADO_INTERNO_NEUTRO: EstadoInterno = {
  engajamento: 0.3,
  incerteza: 0.2,
  atencao: 0.2,
  alerta_risco: 0.0,
  atualizado_em: new Date().toISOString(),
};
