import { AsyncLocalStorage } from "node:async_hooks";

import type { FatoConfirmadoDb } from "../memoria/longa/esquemaSqlite.js";
import type { ClimaHumor } from "../mundo/humor/climaHumor.js";
import type { RelacaoHumor } from "../mundo/humor/relacaoHumor.js";
import type { EventoAfetivo, TipoEventoAfetivo } from "../mundo/humor/eventoAfectivo.js";
import type { GostoLuna } from "../mundo/gostos/storeGostos.js";
import type { VontadeNarrativa } from "../mundo/vontade/storeVontade.js";
import type { EstadoVida, EventoVidaPersistido } from "../mundo/vida/storeVida.js";
import type { EstadoHabitat } from "../mundo/habitat/esquemaHabitat.js";
import type { AutoRetrato, DiarioEntrada, ResumoDiario } from "../mundo/diario/storeDiario.js";

export type EventoAfetivoPendente = {
  tipo: TipoEventoAfetivo;
  interlocutor_id: string | null;
  narrativa_interna: string;
  intensidade: number;
  ttlHoras?: number;
};

export type MundoDirty = {
  clima: boolean;
  habitat: boolean;
  relacao: boolean;
  gostos: Set<string>;
  vontades: Set<string>;
  vidaEstado: boolean;
  vidaEventos: Set<string>;
  vidaEventosRemovidos: Set<string>;
  eventosAfetivos: boolean;
  memoriaFatos: Set<string>;
  /** Diário/sono — o que a faz evoluir. Estava fora deste trem e por isso morria. */
  diarioEntradas: Set<string>;
  diarioResumos: Set<string>;
  autoRetrato: boolean;
  sonoControle: boolean;
};

/** Entrada do diário como fica no cache: com o estado de consolidação junto. */
export type DiarioEntradaCache = DiarioEntrada & { consolidado: boolean; criado_em: string };

export type CacheMundoPersistencia = {
  uid: string;
  clima?: ClimaHumor;
  relacao?: RelacaoHumor;
  habitat?: EstadoHabitat;
  gostos: Map<string, GostoLuna>;
  vontades: Map<string, VontadeNarrativa>;
  vidaEstado?: EstadoVida;
  vidaEventos: Map<string, EventoVidaPersistido>;
  /** Eventos afetivos lidos do Firestore (TTL 24h) — leitura no turno. */
  eventosAfetivosRecentes: EventoAfetivo[];
  eventosAfetivosPendentes: EventoAfetivoPendente[];
  memoriaFatos: Map<string, FatoConfirmadoDb>;
  /** Diário: o que aconteceu com ELA (não sobre o usuário). É a matéria-prima do sono. */
  diarioEntradas: Map<string, DiarioEntradaCache>;
  diarioResumos: Map<string, ResumoDiario>;
  /** Quem ela está a tornar-se — reescrito pelo sono. */
  autoRetrato?: AutoRetrato;
  /** Última consolidação (YYYY-MM-DD) — evita dormir duas vezes no mesmo dia. */
  ultimaConsolidacao?: string | null;
  /**
   * Trabalho que continua DEPOIS da resposta (o despertar/sono roda em segundo plano
   * para não atrasar a primeira mensagem). Sem registá-lo aqui, a descarga aconteceria
   * antes de ele terminar e o diário que ela acabou de escrever evaporaria — exatamente
   * o tipo de perda silenciosa que a fazia não evoluir.
   */
  tarefasPendentes: Promise<unknown>[];
  dirty: MundoDirty;
};

const storage = new AsyncLocalStorage<CacheMundoPersistencia>();

export function criarCacheMundoVazio(uid: string): CacheMundoPersistencia {
  return {
    uid,
    gostos: new Map(),
    vontades: new Map(),
    vidaEventos: new Map(),
    eventosAfetivosRecentes: [],
    eventosAfetivosPendentes: [],
    memoriaFatos: new Map(),
    diarioEntradas: new Map(),
    diarioResumos: new Map(),
    ultimaConsolidacao: null,
    tarefasPendentes: [],
    dirty: {
      clima: false,
      habitat: false,
      relacao: false,
      gostos: new Set(),
      vontades: new Set(),
      vidaEstado: false,
      vidaEventos: new Set(),
      vidaEventosRemovidos: new Set(),
      eventosAfetivos: false,
      memoriaFatos: new Set(),
      diarioEntradas: new Set(),
      diarioResumos: new Set(),
      autoRetrato: false,
      sonoControle: false,
    },
  };
}

export function getCacheMundo(): CacheMundoPersistencia | undefined {
  return storage.getStore();
}

/**
 * Regista trabalho que continua depois da resposta (despertar/sono). Quem persiste
 * espera por estas tarefas antes da descarga final — senão o que ela escreve em segundo
 * plano nunca chega ao Firestore.
 */
export function registrarTarefaMundo(tarefa: Promise<unknown>): void {
  const cache = storage.getStore();
  if (!cache) return;
  cache.tarefasPendentes.push(tarefa);
}

export async function executarComCacheMundo<T>(
  cache: CacheMundoPersistencia,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(cache, fn);
}
