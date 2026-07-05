#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const RAIZ = process.cwd();

function run(command, args) {
  const child = spawnSync(command, args, {
    cwd: RAIZ,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (child.status !== 0) {
    process.exit(child.status ?? 1);
  }
}

function assertArquivoJson(caminho, camposObrigatorios) {
  if (!existsSync(caminho)) {
    throw new Error(`Arquivo obrigatório não encontrado: ${caminho}`);
  }
  const raw = readFileSync(caminho, "utf-8");
  const parsed = JSON.parse(raw);
  for (const campo of camposObrigatorios) {
    if (!(campo in parsed)) {
      throw new Error(`Campo obrigatório ausente em ${caminho}: ${campo}`);
    }
  }
}

console.log("validate:all — identidade validate");
run("npm", ["run", "identidade", "--", "validate"]);

console.log("validate:all — atlas validate");
run("npm", ["run", "atlas", "--", "validate"]);

console.log("validate:all — identidade compile");
run("npm", ["run", "identidade", "--", "compile"]);

console.log("validate:all — atlas compile");
run("npm", ["run", "atlas", "--", "compile"]);

console.log("validate:all — compile checks");
assertArquivoJson(join(RAIZ, "src", "identidade", "identidade.compiled.json"), ["versao", "blocos"]);
assertArquivoJson(join(RAIZ, "src", "atlas", "atlas.compiled.json"), ["manifest", "registros"]);

console.log("validate:all — OK");
