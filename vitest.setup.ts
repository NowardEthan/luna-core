import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

/**
 * Isola o SQLite dos testes num arquivo POR WORKER (via LUNA_DB_PATH).
 *
 * Antes: todos os testes rodavam contra o `logs/memoria.db` REAL. Isso (a) poluía a
 * memória de produção da Luna e (b) causava flake — workers paralelos do vitest
 * escreviam no mesmo arquivo, e um write (ex.: a simulação de vida fire-and-forget do
 * pipeline) vazava para as asserções de outro teste (ex.: vidaInterior).
 *
 * Roda antes dos módulos de teste, então CAMINHO_DB (lido no load do storeSqlite)
 * já pega este caminho isolado.
 */
const worker =
  process.env.VITEST_WORKER_ID ?? process.env.VITEST_POOL_ID ?? String(process.pid);
const dbPath = join(tmpdir(), `luna-test-db-${worker}.db`);
process.env.LUNA_DB_PATH = dbPath;

process.on("exit", () => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(dbPath + suffix, { force: true });
    } catch {
      /* noop */
    }
  }
});
