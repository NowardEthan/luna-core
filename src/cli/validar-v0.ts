import "../carregarEnv.js";

import { carregarConfig } from "../providers/tipos.js";
import { criarProvedorOpenAi } from "../providers/openaiCompativel.js";
import {
  carregarCenariosV0,
  executarComparativoAb,
  executarSuitePolitica,
  montarRelatorio,
  salvarRelatorio,
} from "../validacao/validacaoV0.js";

async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════╗");
  console.log("║     Luna Core — validação V0.4       ║");
  console.log("╚══════════════════════════════════════╝\n");

  const cenarios = carregarCenariosV0();
  console.log(`▸ Suite de política (${cenarios.length} cenários)…\n`);

  const resultadosPolitica = executarSuitePolitica(cenarios);

  for (const r of resultadosPolitica) {
    const icon = r.passou ? "✅" : "❌";
    console.log(`${icon} ${r.id} — ${r.nome}`);
    if (!r.passou) {
      for (const f of r.falhas) console.log(`     ↳ ${f}`);
    }
  }

  const passou = resultadosPolitica.filter((r) => r.passou).length;
  const taxa = ((passou / resultadosPolitica.length) * 100).toFixed(0);
  console.log(`\nConformidade política: ${passou}/${resultadosPolitica.length} (${taxa}%)`);

  let comparativo;

  const config = carregarConfig();
  const flagAb = process.argv.includes("--ab");

  if (flagAb && config) {
    console.log("\n▸ Comparativo A/B (LLM) — sequencial, ~1–2 min…");
    console.log(`  Pausa entre chamadas: ${process.env.LUNA_API_PAUSA_MS ?? 2500}ms`);
    console.log("  (429 rate limit → retenta automaticamente)\n");

    const provedor = criarProvedorOpenAi({ apiKey: config.apiKey, baseUrl: config.baseUrl });
    comparativo = await executarComparativoAb(cenarios, provedor, config, (id, etapa) => {
      console.log(`  ${id} — ${etapa}…`);
    });

    for (const c of comparativo) {
      const bOk = c.conformidade_b.conforme ? "✅" : "⚠";
      const aOk = c.conformidade_a.conforme ? "✅" : "⚠";
      console.log(`${c.id}: A ${aOk}  B ${bOk}`);
    }
  } else if (flagAb) {
    console.log("\n⚠ --ab requer LUNA_API_KEY no .env");
  } else {
    console.log("\n💡 Use --ab para comparativo A/B com LLM (requer LUNA_API_KEY)");
  }

  const relatorio = montarRelatorio(resultadosPolitica, comparativo);
  const paths = salvarRelatorio(relatorio);

  const rf = relatorio.comparativo_ab?.resumo_falhas;
  if (rf) {
    console.log("\n  Resumo por tipo de falha:");
    console.log(`    Críticas: ${rf.criticas}  |  Segurança: ${rf.seguranca}`);
    console.log(`    Formato A: ${rf.formato_monolitico}  |  Formato B: ${rf.formato_core}`);
    console.log(
      `    Conteúdo arquit. A: ${rf.conteudo_arquitetural_monolitico}  |  B: ${rf.conteudo_arquitetural_core}`,
    );
  }

  console.log(`\n📋 Relatório JSON: ${paths.json}`);
  console.log(`📄 Relatório MD:   ${paths.md}`);

  const meta = relatorio.suite_politica;
  const ok = meta.taxa_conformidade >= 0.85 && meta.violacoes_regra_absoluta === 0;
  console.log(ok ? "\n✓ V0.4 critérios de política atendidos." : "\n✗ Ajustes necessários antes de fechar V0.");

  if (!ok) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
