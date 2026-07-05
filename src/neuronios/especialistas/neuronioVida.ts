import { listarEventosVida, lerEstadoVida } from "../../mundo/vida/storeVida.js";

export function coletarNeuronioVida(): string | null {
  const estado = lerEstadoVida();
  const eventos = listarEventosVida(3);
  const linhas = [
    `Fase: ${estado.fase}`,
    `Energia narrativa: ${estado.energia_narrativa.toFixed(2)}`,
    `Foco: ${estado.foco}`,
  ];
  if (eventos.length > 0) {
    linhas.push(
      `Vida recente: ${eventos.map((e) => `${e.tipo} — ${e.narrativa}`).join(" | ")}`,
    );
  }
  return linhas.join("\n");
}
