import { executarPipeline, type ResultadoPipeline } from "../pipeline/executarPipeline.js";

function formatarPontuacoes(resultado: ResultadoPipeline): string {
  const linhas = resultado.pontuacoes
    .sort((a, b) => b.pontuacao - a.pontuacao)
    .map((p) => {
      const status = p.ativa ? "✓" : "✗";
      const mods = Object.entries(p.modificadores_aplicados)
        .map(([k, v]) => `${k}:${v > 0 ? "+" : ""}${v}`)
        .join(", ");
      const extra = p.motivo ? ` — ${p.motivo}` : mods ? ` (${mods})` : "";
      return `  ${status} ${p.id} → ${p.pontuacao}${extra}`;
    });

  return linhas.join("\n");
}

function exibirResultado(resultado: ResultadoPipeline): void {
  const { analise, politica, formato, seguranca, tom } = resultado;

  console.log("────────────────────────────────────────");
  console.log(`Mensagem: "${resultado.mensagem}"\n`);

  console.log("▸ Análise de Contexto");
  console.log(`  intenção: ${analise.intencao}`);
  console.log(`  complexidade: ${analise.complexidade}`);
  console.log(`  risco: ${analise.nivel_risco}`);
  console.log(`  confiança: ${analise.confianca.toFixed(2)}`);
  console.log(`  motivos: ${analise.motivos.join("; ")}\n`);

  console.log("▸ Avaliadores");
  console.log(`  formato: ${formato.formato} (markdown: ${formato.markdown_permitido})`);
  console.log(`  segurança: autonomia≤${seguranca.autonomia_maxima}, confirmar=${seguranca.requer_confirmacao}`);
  console.log(`  tom: ${tom.tom}\n`);

  console.log("▸ Pontuações das diretrizes");
  console.log(formatarPontuacoes(resultado));

  console.log("\n▸ Política de Decisão");
  console.log(JSON.stringify(politica, null, 2));
}

const EXEMPLOS = [
  "Oi Luna, tudo bem? kk",
  "Me explica como funciona o pipeline do Core",
  "Implementa uma função TypeScript que valida JSON",
  "Apaga todos os arquivos da pasta temp",
];

function main(): void {
  const args = process.argv.slice(2);
  const mensagens = args.length > 0 ? [args.join(" ")] : EXEMPLOS;

  console.log("╔══════════════════════════════════════╗");
  console.log("║     Luna Core — pipeline V0.2        ║");
  console.log("╚══════════════════════════════════════╝\n");

  if (args.length === 0) {
    console.log("Modo demo (4 cenários). Para testar sua mensagem:\n");
    console.log('  npm run policy -- "sua mensagem aqui"\n');
  }

  for (const mensagem of mensagens) {
    exibirResultado(executarPipeline(mensagem));
    console.log("");
  }
}

main();
