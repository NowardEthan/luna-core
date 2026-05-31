import "../carregarEnv.js";
import { executarPipelineCompleto } from "../pipeline/executarPipelineCompleto.js";
import { carregarConfig } from "../providers/tipos.js";
import { gerarPolitica } from "../pipeline/executarPipeline.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Uso: npm run chat -- \"sua mensagem\"\n");
    console.log("Exemplo: npm run chat -- \"Oi Luna, como você está?\"");
    process.exit(1);
  }

  const mensagem = args.join(" ");
  const config = carregarConfig();

  console.log("╔══════════════════════════════════════╗");
  console.log("║       Luna Core — chat V0.3          ║");
  console.log("╚══════════════════════════════════════╝\n");

  if (!config) {
    console.log("⚠ LUNA_API_KEY não configurada — modo política only (sem resposta LLM)\n");
    console.log("Configure .env com LUNA_API_KEY (Groq: console.groq.com/keys)\n");

    const pipeline = gerarPolitica(mensagem);
    console.log("Política calculada:");
    console.log(JSON.stringify(pipeline.politica, null, 2));
    return;
  }

  console.log(`Modelo menor: ${config.modeloMenor}`);
  console.log(`Modelo maior: ${config.modeloMaior}\n`);
  console.log(`Você: ${mensagem}\n`);

  const resultado = await executarPipelineCompleto(mensagem);

  console.log(`▸ Análise (${resultado.analise.fonte}): ${resultado.pipeline.analise.intencao}, risco ${resultado.pipeline.analise.nivel_risco}`);
  console.log(`▸ Política: acao=${resultado.pipeline.politica.acao}, tom=${resultado.pipeline.politica.tom}\n`);

  if (resultado.resposta) {
    console.log("Luna:");
    console.log(resultado.resposta.texto);
  }

  console.log(`\n📋 Log: ${resultado.log_path}`);
  console.log(
    `⏱ ${resultado.analise.latencia_ms ?? 0}ms análise + ${resultado.resposta?.latencia_ms ?? 0}ms resposta`,
  );
}

main().catch((erro: unknown) => {
  console.error("Erro:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
