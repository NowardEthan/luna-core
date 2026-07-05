/** M4 — CLI do diário da Luna */

import {
  listarEntradasDiario,
  pendenciasAbertas,
  type DiarioEntrada,
} from "../mundo/diario/storeDiario.js";

function parseFlag(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const n = Number(parseFlag("--n") ?? "10");
const id = parseFlag("--id");
const soPendencias = process.argv.includes("--pendencias");

if (soPendencias) {
  const p = pendenciasAbertas();
  console.log(p.length ? p.map((x) => `- ${x}`).join("\n") : "(nenhuma pendência aberta)");
  process.exit(0);
}

if (id) {
  const entrada = listarEntradasDiario(50).find((e) => e.id === id);
  if (!entrada) {
    console.error("Entrada não encontrada:", id);
    process.exit(1);
  }
  imprimir(entrada);
  process.exit(0);
}

for (const e of listarEntradasDiario(n)) {
  imprimir(e);
  console.log("---");
}

function imprimir(e: DiarioEntrada): void {
  console.log(`[${e.quando}] ${e.id} (sessão ${e.sessao_id})`);
  console.log(`Clima: ${e.clima}`);
  console.log(e.narrativa);
  if (e.pendencias.length) console.log("Pendências:", e.pendencias.join("; "));
  console.log(`Terminou: ${e.como_terminou}`);
}
