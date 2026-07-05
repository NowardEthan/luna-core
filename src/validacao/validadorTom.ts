import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type VozCultural = {
  antipadroes: {
    assistente: string[];
    parca: string[];
  };
};

export type AchadoTom = {
  tipo: "assistente" | "parca";
  trecho: string;
};

export type ResultadoValidadorTom = {
  aprovado: boolean;
  achados: AchadoTom[];
};

const RAIZ_PACOTE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CAMINHO_VOZ = join(RAIZ_PACOTE, "src", "personalidade", "vozCultural.json");

let cacheVoz: VozCultural | null = null;

function carregarVozCultural(): VozCultural {
  if (cacheVoz) return cacheVoz;
  cacheVoz = JSON.parse(readFileSync(CAMINHO_VOZ, "utf-8")) as VozCultural;
  return cacheVoz;
}

function normalizar(valor: string): string {
  return valor
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function validarTom(texto: string): ResultadoValidadorTom {
  const voz = carregarVozCultural();
  const normalized = normalizar(texto);
  const achados: AchadoTom[] = [];

  for (const trecho of voz.antipadroes.assistente) {
    if (normalized.includes(normalizar(trecho))) {
      achados.push({ tipo: "assistente", trecho });
    }
  }

  for (const trecho of voz.antipadroes.parca) {
    if (normalized.includes(normalizar(trecho))) {
      achados.push({ tipo: "parca", trecho });
    }
  }

  return {
    aprovado: achados.length === 0,
    achados,
  };
}
