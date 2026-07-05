/**
 * M5 — Humor: esquema e constantes.
 * FRONTEIRA: este módulo alimenta SOMENTE expressão (compilador). Nunca decisão.
 */

import { z } from "zod";

export const EstadoHumorSchema = z.object({
  valencia: z.number().min(-1).max(1),
  energia: z.number().min(0).max(1),
  proximidade: z.number().min(0).max(1),
  atualizado_em: z.string(),
});

export type EstadoHumor = z.infer<typeof EstadoHumorSchema>;

export const HUMOR_BASELINE: EstadoHumor = {
  valencia: 0.35,
  energia: 0.55,
  proximidade: 0.72,
  atualizado_em: new Date(0).toISOString(),
};

export const MEIA_VIDA_HORAS = 12;
export const DELTA_MAX = 0.15;

export function clampHumor(estado: EstadoHumor): EstadoHumor {
  return {
    valencia: Math.max(-1, Math.min(1, estado.valencia)),
    energia: Math.max(0, Math.min(1, estado.energia)),
    proximidade: Math.max(0, Math.min(1, estado.proximidade)),
    atualizado_em: estado.atualizado_em,
  };
}

export function aplicarDecaimento(estado: EstadoHumor, agora = new Date()): EstadoHumor {
  const entao = new Date(estado.atualizado_em).getTime();
  const horas = Math.max(0, (agora.getTime() - entao) / 3_600_000);
  const fator = Math.pow(0.5, horas / MEIA_VIDA_HORAS);

  const decair = (valor: number, baseline: number) =>
    baseline + (valor - baseline) * fator;

  return clampHumor({
    valencia: decair(estado.valencia, HUMOR_BASELINE.valencia),
    energia: decair(estado.energia, HUMOR_BASELINE.energia),
    proximidade: decair(estado.proximidade, HUMOR_BASELINE.proximidade),
    atualizado_em: estado.atualizado_em,
  });
}
