import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CatalogoHabitatSchema,
  EstadoHabitatSchema,
  type AmbienteHabitat,
  type CatalogoHabitat,
  type EstadoHabitat,
} from "./esquemaHabitat.js";
import { getCacheMundo } from "../../persistencia/contextoMundo.js";

const RAIZ_PACOTE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CAMINHO_ESTADO = join(RAIZ_PACOTE, "logs", "habitat.estado.json");
const CAMINHO_AMBIENTES = join(dirname(fileURLToPath(import.meta.url)), "ambientes.json");

const ambientesRaw = JSON.parse(readFileSync(CAMINHO_AMBIENTES, "utf-8")) as CatalogoHabitat;
const CATALOGO = CatalogoHabitatSchema.parse(ambientesRaw satisfies CatalogoHabitat);

function obterAmbientePadrao(): AmbienteHabitat {
  return (
    CATALOGO.ambientes.find((item) => item.ativo_padrao) ??
    CATALOGO.ambientes[0]
  );
}

function persistirEstado(estado: EstadoHabitat): void {
  const cache = getCacheMundo();
  if (cache) {
    cache.habitat = estado;
    cache.dirty.habitat = true;
    return;
  }

  const dirLogs = join(RAIZ_PACOTE, "logs");
  if (!existsSync(dirLogs)) mkdirSync(dirLogs, { recursive: true });
  writeFileSync(CAMINHO_ESTADO, `${JSON.stringify(estado, null, 2)}\n`);
}

function lerEstadoPersistido(): EstadoHabitat | undefined {
  const cache = getCacheMundo();
  if (cache?.habitat) return cache.habitat;

  if (!existsSync(CAMINHO_ESTADO)) return undefined;
  try {
    const bruto = JSON.parse(readFileSync(CAMINHO_ESTADO, "utf-8")) as unknown;
    return EstadoHabitatSchema.parse(bruto);
  } catch {
    return undefined;
  }
}

function resolverAmbientePorId(ambienteId: string): AmbienteHabitat | undefined {
  return CATALOGO.ambientes.find((item) => item.id === ambienteId);
}

export function listarAmbientesHabitat(): AmbienteHabitat[] {
  return [...CATALOGO.ambientes];
}

export function obterEstadoHabitat(): { estado: EstadoHabitat; ambiente: AmbienteHabitat } {
  const padrao = obterAmbientePadrao();
  const persisted = lerEstadoPersistido();
  const ambiente = persisted ? resolverAmbientePorId(persisted.ambiente_id) : undefined;
  if (persisted && ambiente) {
    return { estado: persisted, ambiente };
  }

  const estadoPadrao: EstadoHabitat = {
    ambiente_id: padrao.id,
    atualizado_em: new Date().toISOString(),
  };
  persistirEstado(estadoPadrao);
  return { estado: estadoPadrao, ambiente: padrao };
}

export function definirHabitatAtual(ambienteId: string): EstadoHabitat {
  const ambiente = resolverAmbientePorId(ambienteId);
  if (!ambiente) {
    throw new Error(`Habitat inválido: "${ambienteId}"`);
  }
  const estado: EstadoHabitat = {
    ambiente_id: ambiente.id,
    atualizado_em: new Date().toISOString(),
  };
  persistirEstado(estado);
  return estado;
}

export function obterSliceHabitatAtual(): string {
  return obterEstadoHabitat().ambiente.slice_contexto;
}

export function resetarHabitat(): EstadoHabitat {
  const padrao = obterAmbientePadrao();
  return definirHabitatAtual(padrao.id);
}
