import type { AnaliseContexto } from "../../analyzers/esquema.js";
import { detectarEventoVida, type EventoVida } from "./eventosVida.js";
import {
  atualizarEstadoComEvento,
  lerEstadoVida,
  registrarEventoVida,
  type EstadoVida,
  type EventoVidaPersistido,
} from "./storeVida.js";

export type ResultadoSimuladorVida = {
  evento: EventoVidaPersistido;
  estado: EstadoVida;
};

export function simularVidaInterior(
  mensagem: string,
  analise?: Pick<AnaliseContexto, "intencao" | "nivel_risco">,
): ResultadoSimuladorVida {
  const evento: EventoVida = detectarEventoVida(
    mensagem,
    analise?.intencao,
    analise?.nivel_risco,
  );
  const persistido = registrarEventoVida(evento);
  const estado = atualizarEstadoComEvento(evento);
  return { evento: persistido, estado };
}

export function montarResumoVidaInterior(): string {
  const estado = lerEstadoVida();
  return `Vida interior: fase ${estado.fase}, energia ${estado.energia_narrativa.toFixed(2)}, foco ${estado.foco}.`;
}
