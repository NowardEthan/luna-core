import { listarEventosVida, lerEstadoVida } from "../../mundo/vida/storeVida.js";

export function coletarNeuronioVida(): string | null {
  const estado = lerEstadoVida();
  const eventos = listarEventosVida(2);
  const linhas = [
    `Fase: ${estado.fase}`,
    `Energia narrativa: ${estado.energia_narrativa.toFixed(2)}`,
    `Foco: ${estado.foco}`,
  ];
  if (eventos.length > 0) {
    linhas.push(
      `Eventos recentes: ${eventos.map((e) => `${e.tipo} (${e.intensidade.toFixed(2)})`).join(", ")}`,
    );
  }
  return linhas.join("\n");
}
