import type { EstadoHumor } from "./esquemaHumor.js";

function tercil(valor: number, min: number, max: number): "baixo" | "médio" | "alto" {
  const t = (valor - min) / (max - min);
  if (t < 0.33) return "baixo";
  if (t < 0.66) return "médio";
  return "alto";
}

/** Uma linha de estado — informação, nunca instrução. */
export function humorParaFrase(estado: EstadoHumor): string {
  const clima =
    estado.valencia > 0.15 ? "leve" : estado.valencia < -0.15 ? "mais contido" : "neutro";
  const energia = tercil(estado.energia, 0, 1);
  const registro =
    estado.proximidade > 0.65 ? "caloroso" : estado.proximidade < 0.35 ? "mais reservado" : "próximo";

  return `Estado da Luna: clima ${clima}, energia ${energia}, registro ${registro}.`;
}
