import type { AnaliseContexto } from "../../analyzers/esquema.js";
import { DELTA_MAX, type EstadoHumor } from "./esquemaHumor.js";
import { lerClimaGlobal, salvarClimaGlobal } from "./climaHumor.js";
import { lerRelacaoHumor, salvarRelacaoHumor } from "./relacaoHumor.js";
import { analisarImpactoAfetivo } from "./analisadorImpactoAfetivo.js";
import { registrarEventoAfetivo } from "./eventoAfectivo.js";

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

function deltaAfetivo(impacto: ReturnType<typeof analisarImpactoAfetivo>): Delta {
  switch (impacto.impacto) {
    case "carinho":
      return { valencia: 0.08 * impacto.intensidade, energia: 0.03, proximidade: 0.12 * impacto.intensidade };
    case "magoa":
      return { valencia: -0.12 * impacto.intensidade, energia: -0.04, proximidade: -0.24 * impacto.intensidade };
    case "irritacao":
      return { valencia: -0.08 * impacto.intensidade, energia: 0, proximidade: -0.18 * impacto.intensidade };
    case "desculpas":
      return { valencia: 0.04 * impacto.intensidade, energia: 0, proximidade: 0.12 * impacto.intensidade };
    default:
      return { valencia: 0, energia: 0, proximidade: 0 };
  }
}

export function atualizarHumor(
  analise: AnaliseContexto,
  numTurnosSessao = 0,
  interlocutorId?: string,
  mensagemUsuario = "",
): EstadoHumor {
  const atualClima = lerClimaGlobal();
  const atualRelacao = interlocutorId ? lerRelacaoHumor(interlocutorId) : lerRelacaoHumor(null);

  const deltaBase = deltaPorAnalise(analise, numTurnosSessao);
  const impacto = analisarImpactoAfetivo(mensagemUsuario, analise);
  const deltaAfeto = limitarDelta(deltaAfetivo(impacto));

  const proximoClima = salvarClimaGlobal({
    valencia: atualClima.valencia + deltaBase.valencia + deltaAfeto.valencia * 0.6,
    energia: atualClima.energia + deltaBase.energia + deltaAfeto.energia,
    atualizado_em: new Date().toISOString(),
  });

  const proximaRelacao = interlocutorId
    ? salvarRelacaoHumor({
        ...atualRelacao,
        interlocutor_id: atualRelacao.interlocutor_id,
        proximidade: atualRelacao.proximidade + deltaBase.proximidade + deltaAfeto.proximidade,
        ultimo_impacto: impacto.impacto === "neutro" ? atualRelacao.ultimo_impacto : impacto.impacto,
        intensidade: impacto.intensidade,
        turnos_desde: impacto.impacto === "neutro" ? atualRelacao.turnos_desde + 1 : 0,
        atualizado_em: new Date().toISOString(),
      })
    : atualRelacao;

  if (
    interlocutorId &&
    (impacto.impacto === "magoa" ||
      impacto.impacto === "irritacao" ||
      impacto.impacto === "carinho" ||
      impacto.impacto === "desculpas")
  ) {
    const narrativa =
      impacto.impacto === "carinho"
        ? "Recebi carinho explícito no tom."
        : impacto.impacto === "desculpas"
          ? "Houve pedido de desculpas no tom."
          : impacto.impacto === "irritacao"
            ? "O tom comigo veio irritado."
            : "O tom comigo foi agressivo/desrespeitoso.";
    registrarEventoAfetivo({
      tipo: impacto.impacto,
      interlocutor_id: interlocutorId,
      narrativa_interna: narrativa,
      intensidade: impacto.intensidade,
    });
  }

  return {
    valencia: proximoClima.valencia,
    energia: proximoClima.energia,
    proximidade: proximaRelacao.proximidade,
    atualizado_em: new Date().toISOString(),
  };
}
