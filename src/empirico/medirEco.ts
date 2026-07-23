/**
 * Baseline do eco (C0) — roda sobre uma conversa REAL exportada do app.
 *
 *   npx tsx src/empirico/medirEco.ts <conversa.md>
 *
 * O .md é o que o botão "Exportar conversa" do OrbitLab gera. A saída é o número honesto:
 * quanto a Luna ECOA e quanto ela APORTA de próprio, turno a turno.
 */
import { readFileSync } from "node:fs";

import { medirConversa, parseConversaMd } from "../revisao/indiceEco.js";

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function main(): void {
  const arquivo = process.argv[2];
  if (!arquivo) {
    console.error("uso: npx tsx src/empirico/medirEco.ts <conversa.md>");
    process.exit(1);
  }

  const md = readFileSync(arquivo, "utf8");
  const rel = medirConversa(parseConversaMd(md));

  if (rel.turnosAvaliados === 0) {
    console.error("Nenhum turno da Luna encontrado. É um .md exportado do Orbit?");
    process.exit(1);
  }

  console.log(`\n── Índice de eco — ${arquivo} ──`);
  console.log(`Turnos da Luna avaliados : ${rel.turnosAvaliados}`);
  console.log(`Eco médio                : ${pct(rel.ecoMedio)}   (alto = reflete o que ele disse)`);
  console.log(`Aporte próprio médio     : ${pct(rel.aporteMedio)}   (alto = traz algo dela)`);
  console.log(`Abre com recap-espelho   : ${pct(rel.fracaoRecapAbertura)} dos turnos`);

  console.log(`\nPiores turnos (mais eco):`);
  [...rel.porTurno]
    .sort((a, b) => b.eco - a.eco)
    .slice(0, 5)
    .forEach((t) => {
      const resumo = t.resposta.replace(/\s+/g, " ").slice(0, 72);
      console.log(`  eco ${pct(t.eco)} · aporte ${pct(t.aporte)}${t.recapAbertura ? " · recap" : ""}  "${resumo}…"`);
    });
  console.log("");
}

main();
