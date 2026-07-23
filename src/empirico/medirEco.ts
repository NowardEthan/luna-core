/**
 * Baseline do eco (C0) — roda sobre uma conversa REAL exportada do app.
 *
 *   npx tsx src/empirico/medirEco.ts <conversa.md>
 *
 * O .md é o que o botão "Exportar conversa" do OrbitLab gera. Duas medidas:
 *   1. LÉXICO (grátis, ~0 ms): quanto ela repete as PALAVRAS dele.
 *   2. STANCE (juiz LLM, se houver OPENROUTER_API_KEY): quanto ela traz de PRÓPRIO —
 *      o número que bate com o sentimento («ela só decora o meu assunto»).
 */
import { readFileSync } from "node:fs";

import { criarProvedorOpenAi } from "../providers/openaiCompativel.js";
import { medirConversa, parseConversaMd } from "../revisao/indiceEco.js";
import { julgarConversa } from "../revisao/juizAporte.js";

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function resumo(texto: string, n = 64): string {
  return texto.replace(/\s+/g, " ").slice(0, n);
}

async function main(): Promise<void> {
  const arquivo = process.argv[2];
  if (!arquivo) {
    console.error("uso: npx tsx src/empirico/medirEco.ts <conversa.md>");
    process.exit(1);
  }

  const md = readFileSync(arquivo, "utf8");
  const turnos = parseConversaMd(md);
  const rel = medirConversa(turnos);

  if (rel.turnosAvaliados === 0) {
    console.error("Nenhum turno da Luna encontrado. É um .md exportado do Orbit?");
    process.exit(1);
  }

  console.log(`\n── Índice de eco — ${arquivo} ──`);
  console.log(`Turnos da Luna avaliados : ${rel.turnosAvaliados}`);
  console.log("");
  console.log("LÉXICO (repetir as palavras dele):");
  console.log(`  Eco médio              : ${pct(rel.ecoMedio)}`);
  console.log(`  Aporte léxico médio    : ${pct(rel.aporteMedio)}   (enganoso: palavra nova ≠ aporte)`);
  console.log(`  Abre com recap-espelho : ${pct(rel.fracaoRecapAbertura)} dos turnos`);

  // ── Juiz de STANCE ──────────────────────────────────────────────────────────
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    console.log("\n(Defina OPENROUTER_API_KEY para o juiz de aporte de STANCE — o número que importa.)\n");
    return;
  }

  const modelo =
    process.env.OPENROUTER_MODEL_JUIZ?.trim() ||
    process.env.OPENROUTER_MODELO_MENOR?.trim() ||
    "deepseek/deepseek-v4-flash";
  const provedor = criarProvedorOpenAi({
    apiKey,
    baseUrl: process.env.OPENROUTER_API_BASE?.trim() || "https://openrouter.ai/api/v1",
  });

  console.log(`\nJulgando aporte de STANCE (modelo ${modelo})…`);
  const j = await julgarConversa(turnos, provedor, modelo);
  if (j.turnosAvaliados === 0) {
    console.log("(o juiz não conseguiu avaliar — modelo/chave?)\n");
    return;
  }

  console.log("");
  console.log("STANCE (o que bate com o sentimento):");
  console.log(`  Aporte de STANCE médio : ${pct(j.aporteMedio)}   (alto = traz o próprio dela)`);
  const movs = Object.entries(j.distribuicao)
    .filter(([, n]) => n > 0)
    .map(([m, n]) => `${m} ${n}`)
    .join(" · ");
  console.log(`  Movimentos             : ${movs}`);

  console.log("\n  Piores (menos aporte):");
  [...j.porTurno]
    .sort((a, b) => a.aporte - b.aporte)
    .slice(0, 6)
    .forEach((t) => {
      console.log(`   aporte ${pct(t.aporte)} · ${t.movimento}  "${resumo(t.resposta)}…"  — ${t.motivo}`);
    });
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
