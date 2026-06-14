import type { Ambiente, EstadoPresenca } from "./esquemaPresenca.js";
import { obterFila } from "./filaPresenca.js";

export type DecisaoPresenca = "permanecer" | "transitar" | "recado";

export type SolicitacaoPresenca = {
  ambiente_solicitante: Ambiente;
  prioridade?: "normal" | "urgente";
};

export type ResultadoPresenca = {
  decisao: DecisaoPresenca;
  motivo: string;
  recado?: string;
};

/**
 * Avaliador de presença — decide se Luna deve permanecer, transitar ou deixar recado.
 *
 * Regras (em ordem de prioridade):
 *   1. Ausente → transitar sempre (nenhum compromisso ativo)
 *   2. Em transição → recado (aguardar estabilização)
 *   3. Mesmo ambiente → permanecer
 *   4. Outro ambiente + ociosa/aguardando → transitar
 *   5. Outro ambiente + conversa_ativa/processando + urgente → transitar (interrupção justificada)
 *   6. Outro ambiente + conversa_ativa/processando/reflexao + normal → recado
 */
export function avaliarPresenca(
  estado: EstadoPresenca,
  solicitacao: SolicitacaoPresenca,
): ResultadoPresenca {
  const prioridade = solicitacao.prioridade ?? "normal";

  // 1. Ausente — sem compromisso ativo
  if (estado.status === "ausente") {
    return {
      decisao: "transitar",
      motivo: "Luna está ausente — transição imediata ao ambiente solicitante",
    };
  }

  // 2. Em transição — estado instável, não interromper
  if (estado.status === "transicao") {
    return {
      decisao: "recado",
      motivo: "Luna está em transição entre ambientes — aguardar estabilização",
      recado: `Luna está mudando de ambiente. Tente novamente em instantes.`,
    };
  }

  // 3. Recado pendente — já deixou recado, nova solicitação substitui
  if (estado.status === "recado_pendente") {
    return {
      decisao: "recado",
      motivo: "Luna já deixou recado — nova solicitação registrada",
      recado: estado.recado,
    };
  }

  // 4. Mesmo ambiente — continuar
  if (estado.ambiente === solicitacao.ambiente_solicitante) {
    return {
      decisao: "permanecer",
      motivo: `Solicitação do ambiente atual (${estado.ambiente}) — sem necessidade de transição`,
    };
  }

  // Verificar se há solicitações urgentes na fila antes de aceitar uma normal
  const fila = obterFila();
  const temUrgenteNaFila = fila.some((s) => s.prioridade === "urgente");

  if (prioridade === "normal" && temUrgenteNaFila) {
    return {
      decisao: "recado",
      motivo: "Luna possui chamadas urgentes na fila, solicitações normais devem aguardar",
      recado: "Luna está recebendo solicitações urgentes. Por favor, aguarde sua vez.",
    };
  }

  // 5. Outro ambiente — avaliar pela atividade
  const estaOciosa =
    estado.atividade === "ociosa" || estado.atividade === "aguardando_input";

  if (estaOciosa) {
    return {
      decisao: "transitar",
      motivo: `Luna ociosa em ${estado.ambiente} — pode transitar para ${solicitacao.ambiente_solicitante}`,
    };
  }

  // 6. Atividade em curso + urgente → interromper
  if (prioridade === "urgente") {
    return {
      decisao: "transitar",
      motivo: `Solicitação urgente — interrompendo ${estado.atividade} em ${estado.ambiente}`,
    };
  }

  // 7. Atividade em curso + normal → recado
  const recadoPadrao = `Luna está em ${estado.ambiente} no momento (${estado.atividade}). Ela responderá assim que possível.`;

  return {
    decisao: "recado",
    motivo: `Luna ocupada em ${estado.ambiente} (${estado.atividade}) — deixando recado`,
    recado: recadoPadrao,
  };
}
