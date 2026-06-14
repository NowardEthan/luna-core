import type { Ambiente } from "./esquemaPresenca.js";

export type SolicitacaoFila = {
  id: string;
  ambiente: Ambiente;
  timestamp: string;
  prioridade: "normal" | "urgente";
  mensagem?: string;
  expirar_em?: string;
};

export type ResultadoFila = {
  status: "aceita" | "recado" | "expirada" | "rejeitada";
  posicao?: number;
  estimativa_ms?: number;
  recado?: string;
};

import { lerFila, salvarFila } from "./storePresenca.js";

/**
 * Enfileira uma solicitação respeitando as regras de prioridade.
 * - "urgente" fura a fila de chamadas "normal".
 * - Se mesma prioridade, a mais antiga fica na frente.
 */
export function enfileirar(solicitacao: SolicitacaoFila): void {
  const fila = lerFila();
  fila.push(solicitacao);
  ordenarFilaMutable(fila);
  salvarFila(fila);
}

/** Ordena a fila por prioridade (urgente primeiro) e timestamp (mais antigo primeiro) */
function ordenarFilaMutable(fila: SolicitacaoFila[]) {
  fila.sort((a, b) => {
    // 1. Prioridade
    if (a.prioridade === "urgente" && b.prioridade !== "urgente") return -1;
    if (a.prioridade !== "urgente" && b.prioridade === "urgente") return 1;

    // 2. Timestamp (mais antigo primeiro)
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });
}

/** Remove solicitações cujo expirar_em já passou do Date.now() */
export function limparExpiradas(): void {
  const agora = Date.now();
  const fila = lerFila();
  const novaFila = fila.filter(s => {
    if (!s.expirar_em) return true;
    return new Date(s.expirar_em).getTime() > agora;
  });
  if (fila.length !== novaFila.length) {
    salvarFila(novaFila);
  }
}

/** Retorna a próxima solicitação e a remove da fila */
export function proximaSolicitacao(): SolicitacaoFila | undefined {
  limparExpiradas();
  const fila = lerFila();
  const primeira = fila.shift();
  if (primeira) {
    salvarFila(fila);
  }
  return primeira;
}

/** Retorna as solicitações pendentes sem removê-las */
export function obterFila(): SolicitacaoFila[] {
  limparExpiradas();
  return lerFila();
}

/** Remove solicitações por id (ex: se foi cancelada) */
export function removerDaFila(id: string): void {
  let fila = lerFila();
  const tamanhoAnterior = fila.length;
  fila = fila.filter(s => s.id !== id);
  if (fila.length !== tamanhoAnterior) {
    salvarFila(fila);
  }
}

/** Limpa toda a fila (para testes e reset) */
export function limparFila(): void {
  salvarFila([]);
}

