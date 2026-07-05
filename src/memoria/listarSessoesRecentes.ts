import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { carregarSessao, PASTA_SESSOES } from "./storeSessao.js";
import type { MemoriaSessao } from "./esquemaMemoria.js";

/** M4 — lista sessões recentes (últimos 7 dias), mais recente primeiro. */
export function listarSessoesRecentes(dias = 7, limite = 20): MemoriaSessao[] {
  if (!existsSync(PASTA_SESSOES)) return [];

  const corte = Date.now() - dias * 86_400_000;
  const arquivos = readdirSync(PASTA_SESSOES).filter((f) => f.endsWith(".json") && !f.startsWith("."));

  const sessoes: MemoriaSessao[] = [];
  for (const arquivo of arquivos) {
    const caminho = join(PASTA_SESSOES, arquivo);
    try {
      const mtime = statSync(caminho).mtimeMs;
      if (mtime < corte) continue;
      const id = arquivo.replace(/\.json$/, "");
      const s = carregarSessao(id);
      if (s && s.mensagens.length > 0) sessoes.push(s);
    } catch {
      // ignora arquivo corrompido
    }
  }

  return sessoes
    .sort((a, b) => new Date(b.atualizada_em).getTime() - new Date(a.atualizada_em).getTime())
    .slice(0, limite);
}
