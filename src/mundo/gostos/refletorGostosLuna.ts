import { listarGostosLuna } from "./storeGostos.js";

export function refletirGostosLuna(limite = 3): string | null {
  const gostos = listarGostosLuna(limite);
  if (gostos.length === 0) return null;
  return `Gostos atuais da Luna: ${gostos
    .map((g) => `${g.topico} (${Math.round(g.afinidade * 100)}%)`)
    .join(", ")}.`;
}
