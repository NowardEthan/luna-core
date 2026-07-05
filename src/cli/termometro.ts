/**
 * M0 — Termômetro de Presença
 * Uso: npm run termometro -- --label baseline
 *      npm run termometro -- --comparar dirA dirB
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { executarPipelineCompleto } from "../pipeline/executarPipelineCompleto.js";
import { obterOuCriarSessao, registrarTurno } from "../memoria/gerenciadorSessao.js";
import { DECISAO_MEMORIA_IGNORAR } from "../memoria/esquemaMemoria.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE = join(RAIZ, "validacao", "termometro-v0.json");
const SAIDA_BASE = join(RAIZ, "validacao", "termometro-resultados");

type ItemTermometro = {
  id: string;
  categoria: string;
  mensagem: string;
  contexto_previo?: Array<{ user: string; assistant: string }>;
  chave_continuidade?: string;
};

const RE_RESSALVA =
  /\b(como (uma )?ia|não (posso|tenho acesso|consigo)|apenas um(a)? (assistente|modelo)|não tenho (sentimentos|memória))\b/gi;

function parseArgs(): { modo: "rodar" | "comparar"; label?: string; dirs?: [string, string] } {
  const args = process.argv.slice(2);
  const compararIdx = args.indexOf("--comparar");
  if (compararIdx >= 0) {
    return { modo: "comparar", dirs: [args[compararIdx + 1]!, args[compararIdx + 2]!] };
  }
  const labelIdx = args.indexOf("--label");
  return { modo: "rodar", label: labelIdx >= 0 ? args[labelIdx + 1] : "run" };
}

function proxies(resposta: string, item: ItemTermometro): Record<string, unknown> {
  const frases = resposta.match(RE_RESSALVA)?.length ?? 0;
  const ref =
    item.chave_continuidade &&
    item.chave_continuidade
      .split(/\s+/)
      .some((k) => resposta.toLowerCase().includes(k.toLowerCase()));
  return {
    frases_ressalva: frases,
    tamanho_resposta: resposta.length,
    referencia_contexto: Boolean(ref),
  };
}

async function rodar(label: string): Promise<void> {
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf-8")) as { itens: ItemTermometro[] };
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
  const pasta = join(SAIDA_BASE, `${stamp}-${label}`);
  mkdirSync(pasta, { recursive: true });

  const resultados: unknown[] = [];

  for (const item of fixture.itens) {
    const sessao = obterOuCriarSessao(randomUUID());
    for (const turno of item.contexto_previo ?? []) {
      registrarTurno(sessao, turno.user, turno.assistant, DECISAO_MEMORIA_IGNORAR);
    }
    const inicio = Date.now();
    const out = await executarPipelineCompleto(item.mensagem, {
      sessaoId: sessao.id,
      gerarResposta: false,
    });
    const resposta = out.resposta?.texto ?? "(sem resposta — configure API no .env)";
    resultados.push({
      id: item.id,
      categoria: item.categoria,
      mensagem: item.mensagem,
      resposta,
      latencia_ms: Date.now() - inicio,
      proxies: proxies(resposta, item),
    });
  }

  writeFileSync(join(pasta, "resultados.json"), JSON.stringify(resultados, null, 2));
  const md = resultados
    .map((r) => {
      const x = r as { id: string; categoria: string; mensagem: string; resposta: string };
      return `## ${x.id} (${x.categoria})\n**Entrada:** ${x.mensagem}\n\n**Resposta:**\n${x.resposta}\n`;
    })
    .join("\n");
  writeFileSync(join(pasta, "resultados.md"), md);
  console.log(`Termômetro salvo em ${pasta}`);
}

function comparar(dirA: string, dirB: string): void {
  const a = JSON.parse(readFileSync(join(dirA, "resultados.json"), "utf-8")) as Array<{
    id: string;
    resposta: string;
  }>;
  const b = JSON.parse(readFileSync(join(dirB, "resultados.json"), "utf-8")) as Array<{
    id: string;
    resposta: string;
  }>;
  const gabarito: Record<string, { a: string; b: string }> = {};
  const linhas: string[] = ["# Comparação às cegas\n"];

  for (const itemA of a) {
    const itemB = b.find((x) => x.id === itemA.id);
    if (!itemB) continue;
    const swap = Math.random() < 0.5;
    const r1 = swap ? itemB.resposta : itemA.resposta;
    const r2 = swap ? itemA.resposta : itemB.resposta;
    gabarito[itemA.id] = { a: itemA.resposta, b: itemB.resposta };
    linhas.push(
      `## ${itemA.id}\n**Resposta 1:**\n${r1}\n\n**Resposta 2:**\n${r2}\n\n(Calor / Continuidade / Naturalidade: 1-5 cada)\n`,
    );
  }

  const pasta = join(SAIDA_BASE, `comparacao-${Date.now()}`);
  mkdirSync(pasta, { recursive: true });
  writeFileSync(join(pasta, "comparacao.md"), linhas.join("\n"));
  writeFileSync(join(pasta, "gabarito.json"), JSON.stringify(gabarito, null, 2));
  console.log(`Comparação em ${pasta}`);
}

const args = parseArgs();
if (args.modo === "comparar" && args.dirs) {
  comparar(args.dirs[0], args.dirs[1]);
} else {
  rodar(args.label ?? "run").catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
