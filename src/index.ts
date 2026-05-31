import "./carregarEnv.js";
import { carregarConfig } from "./providers/tipos.js";

function main(): void {
  const config = carregarConfig();

  console.log("╔══════════════════════════════════════╗");
  console.log("║    Luna Core v0.1.0 — demo           ║");
  console.log("╚══════════════════════════════════════╝\n");

  console.log("Comandos:");
  console.log("  npm run policy              → política calculada");
  console.log("  npm run analisar -- \"...\"   → resposta do modelo menor");
  console.log("  npm run chat -- \"...\"       → Luna responde (Groq)");
  console.log("  npm run validar:v0          → 10 cenários + relatório");
  console.log("  npm run validar:v0 -- --ab  → + comparativo A/B (LLM)");
  console.log("  npm test                    → 23 testes\n");

  if (config) {
    console.log("✓ LUNA_API_KEY detectada");
    console.log(`  menor: ${config.modeloMenor}`);
    console.log(`  maior: ${config.modeloMaior}`);
  } else {
    console.log("⚠ Configure .env para chat e comparativo A/B");
  }

  console.log("\n✓ V0 completo — pronto para V1 (memória).");
}

main();
