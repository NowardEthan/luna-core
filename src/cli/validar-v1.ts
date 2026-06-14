import "../carregarEnv.js";

import {
  carregarCenariosV1,
  executarSuiteV1,
  montarRelatorioV1,
  salvarRelatorioV1,
} from "../validacao/validacaoV1.js";

async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════╗");
  console.log("║     Luna Core — validação V1.5       ║");
  console.log("╚══════════════════════════════════════╝\n");

  const cenarios = carregarCenariosV1();
  console.log(`▸ Suite de memória (${cenarios.length} cenários)…\n`);

  const resultados = executarSuiteV1(cenarios);

  for (const r of resultados) {
    const icone = r.passou ? "✅" : "❌";
    console.log(`${icone} ${r.id} — ${r.nome}`);
    if (!r.passou) {
      for (const f of r.falhas) {
        const ehVazamento = f.startsWith("VAZAMENTO");
        console.log(`     ↳ ${ehVazamento ? "🚨" : "✗"} ${f}`);
      }
    }
  }

  const relatorio = montarRelatorioV1(resultados);
  const s = relatorio.suite_memoria;
  const taxa = (s.taxa_conformidade * 100).toFixed(0);

  console.log(`\nConformidade memória: ${s.passou}/${s.total} (${taxa}%)`);
  console.log(`Vazamentos de dado sensível: ${s.vazamentos_sensiveis}`);

  const paths = salvarRelatorioV1(relatorio);
  console.log(`\n📋 Relatório JSON: ${paths.json}`);
  console.log(`📄 Relatório MD:   ${paths.md}`);

  const c = relatorio.criterios_v1;
  console.log(`\n▸ Critérios V1.5:`);
  console.log(`  ${c.cenarios_json ? "✅" : "❌"} Cenários JSON (≥ 5): ${s.total} cenários`);
  console.log(`  ${c.zero_vazamento_sensivel ? "✅" : "❌"} Zero vazamento sensível: ${s.vazamentos_sensiveis} vazamentos`);

  if (c.aprovado) {
    console.log("\n✓ V1.5 critérios atendidos. Pronto para tag v1.0.0.");
  } else {
    console.log("\n✗ V1.5 falhou. Corrija as regressões antes de fechar V1.");
    process.exit(1);
  }
}

main().catch((erro: unknown) => {
  console.error("Erro fatal:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
