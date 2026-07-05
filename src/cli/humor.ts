/** M5 — CLI do humor da Luna */

import { HUMOR_BASELINE } from "../mundo/humor/esquemaHumor.js";
import { lerHumor, resetarHumor } from "../mundo/humor/storeHumor.js";
import { humorParaFrase } from "../mundo/humor/humorParaFrase.js";

if (process.argv.includes("--reset")) {
  resetarHumor();
  console.log("Humor resetado ao baseline.");
  process.exit(0);
}

const h = lerHumor();
console.log("Vetor atual:");
console.log(`  valência:    ${h.valencia.toFixed(3)} (baseline ${HUMOR_BASELINE.valencia})`);
console.log(`  energia:     ${h.energia.toFixed(3)} (baseline ${HUMOR_BASELINE.energia})`);
console.log(`  proximidade: ${h.proximidade.toFixed(3)} (baseline ${HUMOR_BASELINE.proximidade})`);
console.log(`  atualizado:  ${h.atualizado_em}`);
console.log("\nLeitura:", humorParaFrase(h));
