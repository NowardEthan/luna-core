#!/usr/bin/env node
/** Copia JSON estáticos de src/ para dist/ — tsc não inclui assets lidos via filesystem. */
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origem = join(raiz, "src");
const destino = join(raiz, "dist");

function copiarJsonRecursivo(pastaOrigem, pastaDestino) {
  if (!existsSync(pastaOrigem)) return;

  for (const nome of readdirSync(pastaOrigem)) {
    const caminhoOrigem = join(pastaOrigem, nome);
    const caminhoDestino = join(pastaDestino, nome);
    const stat = statSync(caminhoOrigem);

    if (stat.isDirectory()) {
      copiarJsonRecursivo(caminhoOrigem, caminhoDestino);
      continue;
    }

    if (!nome.endsWith(".json")) continue;

    mkdirSync(dirname(caminhoDestino), { recursive: true });
    cpSync(caminhoOrigem, caminhoDestino);
  }
}

copiarJsonRecursivo(origem, destino);
console.log("Assets JSON copiados de src/ para dist/");
