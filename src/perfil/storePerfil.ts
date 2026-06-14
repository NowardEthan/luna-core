import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type PerfilComportamental,
  VERSAO_PERFIL,
} from "./esquemaPerfil.js";

const RAIZ_PACOTE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PASTA_PERFIL = join(RAIZ_PACOTE, "logs", "perfil");
export const CAMINHO_PERFIL = join(PASTA_PERFIL, "comportamental.json");

export function carregarPerfil(): PerfilComportamental {
  if (!existsSync(CAMINHO_PERFIL)) {
    return {
      versao: VERSAO_PERFIL,
      habitos: [],
      atualizado_em: new Date().toISOString(),
    };
  }
  const bruto = JSON.parse(readFileSync(CAMINHO_PERFIL, "utf-8")) as unknown;
  return bruto as PerfilComportamental;
}

export function salvarPerfil(perfil: PerfilComportamental): void {
  mkdirSync(PASTA_PERFIL, { recursive: true });
  perfil.atualizado_em = new Date().toISOString();
  writeFileSync(CAMINHO_PERFIL, JSON.stringify(perfil, null, 2), "utf-8");
}
