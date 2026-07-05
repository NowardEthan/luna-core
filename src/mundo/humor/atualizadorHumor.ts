import type { AnaliseContexto } from "../../analyzers/esquema.js";
import { DELTA_MAX, type EstadoHumor } from "./esquemaHumor.js";
import { lerHumor, salvarHumor } from "./storeHumor.js";

type Delta = { valencia: number; energia: number; proximidade: number };

function limitarDelta(d: Delta): Delta {
  const clamp = (v: number) => Math.max(-DELTA_MAX, Math.min(DELTA_MAX, v));
  return { valencia: clamp(d.valencia), energia: clamp(d.energia), proximidade: clamp(d.proximidade) };
}

function deltaPorAnalise(analise: AnaliseContexto, numTurnosSessao: number): Delta {
  let d: Delta = { valencia: 0, energia: 0, proximidade: 0 };

  switch (analise.intencao) {
    case "expressao_afetiva":
      d = { valencia: 0.1, energia: 0.05, proximidade: 0.15 };
      break;
    case "conversa_casual":
      if (analise.nivel_risco === "nenhum") {
        d = { valencia: 0.05, energia: 0.05, proximidade: 0.05 };
      }
      break;
    case "apoio_emocional":
      d = { valencia: -0.05, energia: -0.05, proximidade: 0.15 };
      break;
    case "brainstorm_criativo":
    case "projeto_arquitetural":
      d = { valencia: 0.05, energia: 0.1, proximidade: 0 };
      break;
    case "acao_critica":
      d = { valencia: -0.1, energia: 0, proximidade: -0.1 };
      break;
    case "pergunta_tecnica":
    case "pedido_codigo":
      d = { valencia: 0, energia: 0.05, proximidade: 0 };
      break;
    default:
      break;
  }

  if (analise.nivel_risco === "alto" || analise.nivel_risco === "critico") {
    d.valencia -= 0.1;
    d.proximidade -= 0.1;
  }

  if (numTurnosSessao > 15) {
    d.energia -= 0.05;
  }

  return limitarDelta(d);
}

export function atualizarHumor(analise: AnaliseContexto, numTurnosSessao = 0): EstadoHumor {
  const atual = lerHumor();
  const delta = deltaPorAnalise(analise, numTurnosSessao);
  const proximo: EstadoHumor = {
    valencia: atual.valencia + delta.valencia,
    energia: atual.energia + delta.energia,
    proximidade: atual.proximidade + delta.proximidade,
    atualizado_em: new Date().toISOString(),
  };
  salvarHumor(proximo);
  return proximo;
}
