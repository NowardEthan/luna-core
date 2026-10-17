import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { MemoriaSessaoSchema, type MemoriaSessao } from "./esquemaMemoria.js";
import { DIRETORIOS_DADOS_PADRAO, obterDiretoriosDados } from "../config/diretoriosDados.js";

/** @deprecated Para operações, use obterPastaSessoes(). */
export const PASTA_SESSOES = DIRETORIOS_DADOS_PADRAO.sessoes;

export function obterPastaSessoes(): string {
  return obterDiretoriosDados().sessoes;
}

export function caminhoSessao(id: string): string {
  return join(obterPastaSessoes(), `${id}.json`);
}

export function carregarSessao(id: string): MemoriaSessao | null {
  const caminho = caminhoSessao(id);
  if (!existsSync(caminho)) return null;

  const bruto = JSON.parse(readFileSync(caminho, "utf-8")) as unknown;
  return MemoriaSessaoSchema.parse(bruto);
}

export function salvarSessao(sessao: MemoriaSessao): string {
  mkdirSync(obterPastaSessoes(), { recursive: true });
  const caminho = caminhoSessao(sessao.id);
  writeFileSync(caminho, JSON.stringify(sessao, null, 2), "utf-8");
  return caminho;
}

export function salvarUltimaSessao(id: string): void {
  const pasta = obterPastaSessoes();
  mkdirSync(pasta, { recursive: true });
  writeFileSync(join(pasta, ".ultima-sessao"), id, "utf-8");
}

export function lerUltimaSessao(): string | null {
  const ARQUIVO_ULTIMA_SESSAO = join(obterPastaSessoes(), ".ultima-sessao");
  if (!existsSync(ARQUIVO_ULTIMA_SESSAO)) return null;
  const id = readFileSync(ARQUIVO_ULTIMA_SESSAO, "utf-8").trim();
  return id || null;
}
