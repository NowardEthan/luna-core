#!/usr/bin/env node
/**
 * Reseta memória da Luna Core (com backup automático).
 * Para o daemon antes se estiver a correr.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const LOGS = join(RAIZ, "logs");
const BACKUP = join(LOGS, `backup-reset-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`);

function copiarSeExiste(origem: string, destino: string): void {
  if (!existsSync(origem)) return;
  mkdirSync(join(destino, ".."), { recursive: true });
  cpSync(origem, destino, { recursive: true });
}

function limparSessoes(): number {
  const pasta = join(LOGS, "sessoes");
  if (!existsSync(pasta)) return 0;
  let count = 0;
  for (const f of readdirSync(pasta)) {
    if (f.endsWith(".json")) {
      rmSync(join(pasta, f), { force: true });
      count++;
    }
  }
  const ultima = join(pasta, ".ultima-sessao");
  if (existsSync(ultima)) rmSync(ultima, { force: true });
  return count;
}

function main(): void {
  console.log("[luna-core] reset de memória — backup + limpeza\n");

  mkdirSync(BACKUP, { recursive: true });

  copiarSeExiste(join(LOGS, "memoria.db"), join(BACKUP, "memoria.db"));
  copiarSeExiste(join(LOGS, "memoria.db-wal"), join(BACKUP, "memoria.db-wal"));
  copiarSeExiste(join(LOGS, "memoria.db-shm"), join(BACKUP, "memoria.db-shm"));
  copiarSeExiste(join(LOGS, "perfil"), join(BACKUP, "perfil"));
  copiarSeExiste(join(LOGS, "sessoes"), join(BACKUP, "sessoes"));
  copiarSeExiste(join(LOGS, "presenca"), join(BACKUP, "presenca"));

  console.log(`Backup em: ${BACKUP}\n`);

  for (const f of ["memoria.db", "memoria.db-wal", "memoria.db-shm"]) {
    const p = join(LOGS, f);
    if (existsSync(p)) rmSync(p, { force: true });
  }

  const sessoes = limparSessoes();

  const perfilPath = join(LOGS, "perfil", "comportamental.json");
  mkdirSync(join(LOGS, "perfil"), { recursive: true });
  writeFileSync(
    perfilPath,
    JSON.stringify(
      { versao: "1.0.0", habitos: [], atualizado_em: new Date().toISOString() },
      null,
      2,
    ),
    "utf8",
  );

  const presencaDir = join(LOGS, "presenca");
  if (existsSync(presencaDir)) {
    rmSync(presencaDir, { recursive: true, force: true });
  }
  mkdirSync(presencaDir, { recursive: true });

  console.log("Memória longa (SQLite): apagada — recriada na próxima conversa");
  console.log(`Sessões apagadas: ${sessoes}`);
  console.log("Perfil comportamental: resetado");
  console.log("Presença: resetada");
  console.log("\nReinicia o daemon do runtime para nova sessão limpa.");
}

main();
