#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const RAIZ = process.cwd();
const PREFIXO_SRC = "src/";

const REGRAS = [
  { match: /presenca|contextoPresenca|runtime/i, id: "runtime-presenca", motivo: "mudanças de presença/superfície" },
  { match: /humor|clima|relacao/i, id: "humor-clima-relacao", motivo: "mudanças de humor/clima/relacional" },
  { match: /vida|sono|diario|mundo/i, id: "mundo-interior-expressao", motivo: "mudanças de mundo interior" },
  { match: /pipeline|talamo|analyzers|analisador/i, id: "pipeline-ordem-turno", motivo: "mudanças no fluxo do pipeline" },
  { match: /atlas|conhecimento/i, id: "atlas-consulta-tool", motivo: "mudanças em inferência/consulta de atlas" },
  { match: /forge|ide|agentico|tool/i, id: "forge-ide", motivo: "mudanças no modo de desenvolvimento" },
  { match: /orbit-mobile|mobile|firebase/i, id: "orbit-mobile-superficie", motivo: "mudanças em superfície mobile" },
  { match: /lumen|didatica|pedagogia/i, id: "lumen-modulo", motivo: "mudanças no módulo Lumen" },
];

function executarGit(args) {
  const r = spawnSync("git", args, {
    cwd: RAIZ,
    encoding: "utf-8",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) return null;
  return (r.stdout ?? "").trim();
}

function listarArquivosAlterados() {
  const alvo = process.argv[2];
  if (alvo && alvo.trim()) {
    return alvo
      .split(",")
      .map((p) => p.trim().replaceAll("\\", "/"))
      .filter((p) => p.startsWith(PREFIXO_SRC));
  }

  const saidaDiff = executarGit(["diff", "--name-only", "--relative", "HEAD"]);
  const saidaUntracked = executarGit(["ls-files", "--others", "--exclude-standard"]);
  const linhas = [saidaDiff, saidaUntracked]
    .filter(Boolean)
    .flatMap((txt) => txt.split(/\r?\n/))
    .map((l) => l.trim().replaceAll("\\", "/"))
    .filter(Boolean);

  return Array.from(new Set(linhas)).filter((p) => p.startsWith(PREFIXO_SRC));
}

function sugerirRegistros(arquivos) {
  const sugestoes = new Map();
  for (const arquivo of arquivos) {
    for (const regra of REGRAS) {
      if (!regra.match.test(arquivo)) continue;
      const atual = sugestoes.get(regra.id);
      if (atual) {
        atual.arquivos.push(arquivo);
      } else {
        sugestoes.set(regra.id, {
          id: regra.id,
          motivo: regra.motivo,
          arquivos: [arquivo],
        });
      }
    }
  }
  return [...sugestoes.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function main() {
  if (!existsSync(path.join(RAIZ, "src", "atlas", "registros"))) {
    console.error("atlas:suggest: pasta src/atlas/registros não encontrada.");
    process.exit(1);
  }

  const arquivos = listarArquivosAlterados();
  if (arquivos.length === 0) {
    console.log("atlas:suggest: nenhum arquivo alterado em src/.");
    return;
  }

  const sugestoes = sugerirRegistros(arquivos);
  console.log("atlas:suggest — arquivos detectados:");
  for (const arquivo of arquivos) {
    console.log(`- ${arquivo}`);
  }

  if (sugestoes.length === 0) {
    console.log("\nNenhuma sugestão automática de registro Atlas.");
    return;
  }

  console.log("\nSugestões Atlas (adicionar/atualizar):");
  for (const sugestao of sugestoes) {
    const exemplos = Array.from(new Set(sugestao.arquivos)).slice(0, 3);
    console.log(`- ${sugestao.id} — ${sugestao.motivo}`);
    console.log(`  arquivos: ${exemplos.join(", ")}`);
  }
}

main();
