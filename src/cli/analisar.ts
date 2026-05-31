import "../carregarEnv.js";

import { analisarContexto } from "../analyzers/analisadorContextoLlm.js";
import { criarProvedorOpenAi } from "../providers/openaiCompativel.js";
import { carregarConfig } from "../providers/tipos.js";

function parseArgs(argv: string[]): { mensagem: string; regras: boolean; json: boolean } {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const resto = argv.filter((a) => !a.startsWith("--"));
  return {
    mensagem: resto.join(" ").trim(),
    regras: flags.has("--regras"),
    json: flags.has("--json"),
  };
}

async function main(): Promise<void> {
  const { mensagem, regras, json } = parseArgs(process.argv.slice(2));

  if (!mensagem) {
    console.log("Uso: npm run analisar -- \"sua mensagem\"\n");
    console.log("Opções:");
    console.log("  --regras   usa só heurísticas (sem LLM)");
    console.log("  --json     saída JSON completa");
    console.log("\nExemplo:");
    console.log('  npm run analisar -- "Apaga meus arquivos da pasta temp"');
    process.exit(1);
  }

  const config = carregarConfig();

  if (!regras && !config) {
    console.log("⚠ LUNA_API_KEY não configurada — usando modo --regras\n");
  }

  const provedor =
    !regras && config ? criarProvedorOpenAi({ apiKey: config.apiKey, baseUrl: config.baseUrl }) : undefined;
  const modelo = !regras && config ? config.modeloMenor : undefined;

  const resultado = await analisarContexto(mensagem, provedor, modelo);

  if (json) {
    console.log(JSON.stringify({ mensagem, ...resultado }, null, 2));
    return;
  }

  console.log("╔══════════════════════════════════════╗");
  console.log("║   Luna Core — analisador (menor)     ║");
  console.log("╚══════════════════════════════════════╝\n");
  console.log(`Mensagem: "${mensagem}"\n`);

  if (resultado.fonte === "llm") {
    console.log(`▸ Modelo: ${resultado.modelo} (${resultado.latencia_ms}ms)\n`);

    console.log("▸ Resposta bruta do LLM:");
    console.log("─".repeat(40));
    console.log(resultado.resposta_bruta ?? "(vazio)");
    console.log("─".repeat(40));

    if (resultado.analise_llm) {
      console.log("\n▸ Análise parseada (antes do refino determinístico):");
      console.log(JSON.stringify(resultado.analise_llm, null, 2));
    }

    const refinoAlterou =
      resultado.analise_llm &&
      JSON.stringify(resultado.analise_llm) !== JSON.stringify(resultado.analise);

    console.log("\n▸ Análise final (após refino identidade + segurança):");
    console.log(JSON.stringify(resultado.analise, null, 2));

    if (refinoAlterou) {
      console.log("\n⚠ Refino determinístico alterou a análise do LLM (identidade e/ou segurança).");
    }
  } else {
    console.log(`▸ Fonte: ${resultado.erro_llm ? "regras (fallback)" : "regras"}`);
    if (resultado.erro_llm) {
      console.log(`▸ Erro do LLM: ${resultado.erro_llm}\n`);
    }
    console.log("▸ Análise:");
    console.log(JSON.stringify(resultado.analise, null, 2));
  }
}

main().catch((erro: unknown) => {
  console.error("Erro:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
