import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CamadaConstituicaoSchema,
  type CamadaConstituicao,
  type Diretriz,
} from "../analyzers/esquema.js";

const RAIZ_PACOTE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ARQUIVOS_CAMADA = [
  "identidade.json",
  "expressao.json",
  "seguranca.json",
] as const;

function carregarCamada(nomeArquivo: string): CamadaConstituicao {
  const caminho = join(RAIZ_PACOTE, "constitution", nomeArquivo);
  const bruto = readFileSync(caminho, "utf-8");
  const json = JSON.parse(bruto) as unknown;
  return CamadaConstituicaoSchema.parse(json);
}

/** Carrega as três camadas da Constituição V0. */
export function carregarConstituicao(): CamadaConstituicao[] {
  return ARQUIVOS_CAMADA.map(carregarCamada);
}

/** Lista plana de todas as diretrizes versionadas. */
export function listarDiretrizes(): Diretriz[] {
  return carregarConstituicao().flatMap((camada) => camada.entradas);
}

/** Busca uma diretriz pelo identificador (ex.: identidade.manter_voz_luna). */
export function buscarDiretriz(id: string): Diretriz | undefined {
  return listarDiretrizes().find((d) => d.id === id);
}

/** Carrega a instrução de sistema mínima do Respondedor Luna. */
export function carregarInstrucaoSistema(): string {
  const caminho = join(RAIZ_PACOTE, "responder", "instrucao_sistema.md");
  return readFileSync(caminho, "utf-8");
}
