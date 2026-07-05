import { lerClimaGlobal, resetarClimaGlobal, salvarClimaGlobal } from "./climaHumor.js";
import { HUMOR_BASELINE, type EstadoHumor } from "./esquemaHumor.js";

/** Shim de compatibilidade legado: agora delega para clima global. */
export function lerHumor(): EstadoHumor {
  const clima = lerClimaGlobal();
  return {
    valencia: clima.valencia,
    energia: clima.energia,
    proximidade: HUMOR_BASELINE.proximidade,
    atualizado_em: clima.atualizado_em,
  };
}

export function salvarHumor(estado: EstadoHumor): void {
  salvarClimaGlobal({
    valencia: estado.valencia,
    energia: estado.energia,
    atualizado_em: estado.atualizado_em,
  });
}

export function resetarHumor(): EstadoHumor {
  const clima = resetarClimaGlobal();
  return {
    valencia: clima.valencia,
    energia: clima.energia,
    proximidade: HUMOR_BASELINE.proximidade,
    atualizado_em: clima.atualizado_em,
  };
}
