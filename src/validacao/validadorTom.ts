import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type VozCultural = {
  antipadroes: {
    assistente: string[];
    parca: string[];
    fe_meta?: string[];
    meta_narrativa?: string[];
  };
};

export type AchadoTom = {
  tipo: "assistente" | "parca" | "fe_meta" | "meta_narrativa";
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

function buscarAntipadroes(
  texto: string,
  itens: string[] | undefined,
  tipo: AchadoTom["tipo"],
): AchadoTom[] {
  if (!itens?.length) return [];
  const normalized = normalizar(texto);
  const achados: AchadoTom[] = [];
  for (const trecho of itens) {
    if (normalized.includes(normalizar(trecho))) {
      achados.push({ tipo, trecho });
    }
  }
  return achados;
}

export function validarTom(texto: string): ResultadoValidadorTom {
  const voz = carregarVozCultural();
  const achados: AchadoTom[] = [
    ...buscarAntipadroes(texto, voz.antipadroes.assistente, "assistente"),
    ...buscarAntipadroes(texto, voz.antipadroes.parca, "parca"),
    ...buscarAntipadroes(texto, voz.antipadroes.fe_meta, "fe_meta"),
    ...buscarAntipadroes(texto, voz.antipadroes.meta_narrativa, "meta_narrativa"),
  ];

  return {
    aprovado: achados.length === 0,
    achados,
  };
}
