import { AsyncLocalStorage } from "node:async_hooks";

import type { FatoConfirmadoDb } from "../memoria/longa/esquemaSqlite.js";
import type { ClimaHumor } from "../mundo/humor/climaHumor.js";
import type { RelacaoHumor } from "../mundo/humor/relacaoHumor.js";
import type { TipoEventoAfetivo } from "../mundo/humor/eventoAfectivo.js";
import type { GostoLuna } from "../mundo/gostos/storeGostos.js";
import type { VontadeNarrativa } from "../mundo/vontade/storeVontade.js";
import type { EstadoVida, EventoVidaPersistido } from "../mundo/vida/storeVida.js";
import type { EstadoHabitat } from "../mundo/habitat/esquemaHabitat.js";

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
};

export type CacheMundoPersistencia = {
  uid: string;
  clima?: ClimaHumor;
  relacao?: RelacaoHumor;
  habitat?: EstadoHabitat;
  gostos: Map<string, GostoLuna>;
  vontades: Map<string, VontadeNarrativa>;
  vidaEstado?: EstadoVida;
  vidaEventos: Map<string, EventoVidaPersistido>;
  eventosAfetivosPendentes: EventoAfetivoPendente[];
  memoriaFatos: Map<string, FatoConfirmadoDb>;
  dirty: MundoDirty;
};

const storage = new AsyncLocalStorage<CacheMundoPersistencia>();

export function criarCacheMundoVazio(uid: string): CacheMundoPersistencia {
  return {
    uid,
    gostos: new Map(),
    vontades: new Map(),
    vidaEventos: new Map(),
    eventosAfetivosPendentes: [],
    memoriaFatos: new Map(),
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
    },
  };
}

export function getCacheMundo(): CacheMundoPersistencia | undefined {
  return storage.getStore();
}

export async function executarComCacheMundo<T>(
  cache: CacheMundoPersistencia,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(cache, fn);
}
