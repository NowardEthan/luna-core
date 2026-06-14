import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MemoriaSessaoSchema, type MemoriaSessao } from "./esquemaMemoria.js";

const RAIZ_PACOTE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PASTA_SESSOES = join(RAIZ_PACOTE, "logs", "sessoes");

export function caminhoSessao(id: string): string {
  return join(PASTA_SESSOES, `${id}.json`);
}

export function carregarSessao(id: string): MemoriaSessao | null {
  const caminho = caminhoSessao(id);
  if (!existsSync(caminho)) return null;

  const bruto = JSON.parse(readFileSync(caminho, "utf-8")) as unknown;
  return MemoriaSessaoSchema.parse(bruto);
}

export function salvarSessao(sessao: MemoriaSessao): string {
  mkdirSync(PASTA_SESSOES, { recursive: true });
  const caminho = caminhoSessao(sessao.id);
  writeFileSync(caminho, JSON.stringify(sessao, null, 2), "utf-8");
  return caminho;
}

const ARQUIVO_ULTIMA_SESSAO = join(PASTA_SESSOES, ".ultima-sessao");

export function salvarUltimaSessao(id: string): void {
  mkdirSync(PASTA_SESSOES, { recursive: true });
  writeFileSync(ARQUIVO_ULTIMA_SESSAO, id, "utf-8");
}

export function lerUltimaSessao(): string | null {
  if (!existsSync(ARQUIVO_ULTIMA_SESSAO)) return null;
  const id = readFileSync(ARQUIVO_ULTIMA_SESSAO, "utf-8").trim();
  return id || null;
}
