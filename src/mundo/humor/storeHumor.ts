import { lerClimaGlobal, resetarClimaGlobal, salvarClimaGlobal } from "./climaHumor.js";
import { lerRelacaoHumor } from "./relacaoHumor.js";
import { HUMOR_BASELINE, type EstadoHumor } from "./esquemaHumor.js";

/** Shim de compatibilidade legado: clima global + proximidade da relação por interlocutor. */
export function lerHumor(interlocutorId?: string | null): EstadoHumor {
  const clima = lerClimaGlobal();
  const proximidade = interlocutorId
    ? lerRelacaoHumor(interlocutorId).proximidade
    : HUMOR_BASELINE.proximidade;
  return {
    valencia: clima.valencia,
    energia: clima.energia,
    proximidade,
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
