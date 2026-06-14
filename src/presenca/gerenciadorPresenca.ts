import type { TransicaoPresenca } from "./contextoPresenca.js";
import {
  type Ambiente,
  type Atividade,
  type EstadoPresenca,
  PRESENCA_INICIAL,
} from "./esquemaPresenca.js";
import * as filaPresenca from "./filaPresenca.js";
import { lerEstado, salvarEstado } from "./storePresenca.js";

export function obterEstado(): EstadoPresenca {
  return lerEstado();
}

/** Registra entrada de Luna em um ambiente. Atualiza status para 'presente'. */
export function entrar(ambiente: Ambiente, sessao_id?: string): EstadoPresenca {
  const novoEstado: EstadoPresenca = {
    ambiente,
    status: "presente",
    atividade: "aguardando_input",
    timestamp_entrada: new Date().toISOString(),
    sessao_id,
  };
  salvarEstado(novoEstado);
  return obterEstado();
}

/**
 * Entra num ambiente detectando transição a partir do estado anterior.
 *
 * Considera-se transição quando a Luna já estava presente noutro lugar
 * (ou noutra sessão) — ignora a primeira entrada a partir do estado inicial
 * (status 'ausente'), que é uma chegada limpa, não uma mudança de lugar.
 *
 * Não carrega conteúdo de sessão: o `recap` de continuidade é preenchido por
 * quem tem acesso à memória (o pipeline).
 */
export function entrarComTransicao(
  ambiente: Ambiente,
  sessao_id?: string,
): { estado: EstadoPresenca; transicao?: TransicaoPresenca } {
  const anterior = lerEstado();
  const estado = entrar(ambiente, sessao_id);

  const estavaPresente = anterior.status !== "ausente";
  const mudouAmbiente = anterior.ambiente !== ambiente;
  const mudouSessao = Boolean(anterior.sessao_id && anterior.sessao_id !== sessao_id);

  if (estavaPresente && (mudouAmbiente || mudouSessao)) {
    return {
      estado,
      transicao: {
        de: anterior.ambiente,
        sessao_anterior_id: anterior.sessao_id,
      },
    };
  }

  return { estado };
}

/** Registra saída do ambiente atual. Status vira 'ausente'. */
export function sair(): EstadoPresenca {
  const _estado = lerEstado();
  const novoEstado: EstadoPresenca = {
    ..._estado,
    status: "ausente",
    atividade: "ociosa",
    recado: undefined,
  };
  salvarEstado(novoEstado);
  return obterEstado();
}

/** Atualiza a atividade atual sem mudar ambiente ou status. */
export function atualizarAtividade(atividade: Atividade): EstadoPresenca {
  const _estado = lerEstado();
  salvarEstado({ ..._estado, atividade });
  return obterEstado();
}

/** Marca estado de transição entre ambientes. */
export function iniciarTransicao(): EstadoPresenca {
  const _estado = lerEstado();
  salvarEstado({ ..._estado, status: "transicao" });
  return obterEstado();
}

/** Deixa um recado e fica indisponível temporariamente. */
export function deixarRecado(recado: string): EstadoPresenca {
  const _estado = lerEstado();
  salvarEstado({ ..._estado, status: "recado_pendente", recado });
  return obterEstado();
}

/** Limpa recado pendente ao retomar. */
export function limparRecado(): EstadoPresenca {
  const _estado = lerEstado();
  salvarEstado({ ..._estado, status: "presente", recado: undefined });
  return obterEstado();
}

/** Reset para testes — volta ao estado inicial. */
export function resetarPresenca(): void {
  salvarEstado({ ...PRESENCA_INICIAL, timestamp_entrada: new Date().toISOString() });
  filaPresenca.limparFila();
}

// ─── Integração com Fila de Presença ──────────────────────────────────────────

export const enfileirarSolicitacao = filaPresenca.enfileirar;
export const proximaSolicitacaoFila = filaPresenca.proximaSolicitacao;
export const obterFila = filaPresenca.obterFila;
export const limparFila = filaPresenca.limparFila;

/** Processa a próxima solicitação da fila, se houver */
export function processarFila(): filaPresenca.SolicitacaoFila | undefined {
  return filaPresenca.proximaSolicitacao();
}
