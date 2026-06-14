import "../carregarEnv.js";
import { executarPipelineCompleto } from "../pipeline/executarPipelineCompleto.js";
import { lerUltimaSessao, salvarUltimaSessao } from "../memoria/storeSessao.js";
import { carregarConfig } from "../providers/tipos.js";
import { gerarPolitica } from "../pipeline/executarPipeline.js";

function parseArgs(args: string[]): { mensagem: string; sessaoId?: string; continuar: boolean } {
  // Se o usuário esquecer o `--`, o npm intercepta a flag e joga no env.
  if (process.env.npm_config_continuar || process.env.npm_config_sessao) {
    console.error("❌ Ops! Parece que você esqueceu o '--' antes dos argumentos do chat.");
    console.error("Você quis dizer?");
    if (process.env.npm_config_continuar) {
      console.error(`  npm run chat -- --continuar "${args.join(" ")}"`);
    } else {
      console.error(`  npm run chat -- --sessao <ID> "${args.join(" ")}"`);
    }
    process.exit(1);
  }

  const restante: string[] = [];
  let sessaoId: string | undefined;
  let continuar = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--continuar" || arg === "-c") {
      continuar = true;
      continue;
    }
    if (arg === "--sessao" && args[i + 1]) {
      sessaoId = args[i + 1];
      i++;
      continue;
    }
    restante.push(arg);
  }

  return { mensagem: restante.join(" "), sessaoId, continuar };
}

function imprimirBlocoSessao(id: string, turnos: number, fatos: number): void {
  console.log("\n┌──────────────────────────────────────────────────────────────┐");
  console.log("│  ID DA SESSÃO (copie para continuar depois)                  │");
  console.log("└──────────────────────────────────────────────────────────────┘");
  console.log(`\n  ${id}\n`);
  console.log(`  ${turnos} turnos · ${fatos} fatos`);
  console.log("\n  Próxima mensagem — opção A (continuar automático):");
  console.log('  npm run chat -- --continuar "sua mensagem"\n');
  console.log("  Próxima mensagem — opção B (com ID explícito):");
  console.log(`  npm run chat -- --sessao ${id} "sua mensagem"\n`);
}

async function main(): Promise<void> {
  const { mensagem, sessaoId: sessaoArg, continuar } = parseArgs(process.argv.slice(2));

  if (!mensagem) {
    console.log('Uso: npm run chat -- [--continuar | --sessao UUID] "sua mensagem"\n');
    console.log('Exemplo: npm run chat -- "Oi Luna, como você está?"');
    console.log('Exemplo: npm run chat -- --continuar "Lembra do que falei?"');
    console.log('Exemplo: npm run chat -- --sessao f0121194-fa50-4e86-ad3c-a8d779cc7a4a "..."');
    const ultima = lerUltimaSessao();
    if (ultima) console.log(`\nÚltima sessão: ${ultima}`);
    process.exit(1);
  }

  const { obterEstado, entrar } = await import("../presenca/gerenciadorPresenca.js");
  const estadoAtual = obterEstado();

  if (estadoAtual.ambiente !== "chat_cli" && estadoAtual.status !== "ausente") {
    console.log(`\n⛔ Ops! Luna não está aqui. Ela viajou para outro portal: '${estadoAtual.ambiente}'.`);
    console.log(`Você pode tentar usar o desktop ou aguardar a transição dela de volta.`);
    process.exit(0);
  } else if (estadoAtual.status === "ausente") {
    // Reivindica a presença
    entrar("chat_cli");
  }

  let sessaoId = sessaoArg;
  if (continuar) {
    const ultima = lerUltimaSessao();
    if (!ultima) {
      console.error("Erro: nenhuma sessão anterior. Rode um chat sem --continuar primeiro.");
      process.exit(1);
    }
    sessaoId = ultima;
  }

  const config = carregarConfig();

  console.log("╔══════════════════════════════════════╗");
  console.log("║       Luna Core — chat V1.4          ║");
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
  console.log(`Modelo maior: ${config.modeloMaior}`);
  if (sessaoId) console.log(`Sessão ativa: ${sessaoId}`);
  console.log();

  console.log(`Você: ${mensagem}\n`);

  const resultado = await executarPipelineCompleto(mensagem, {
    sessaoId,
    ambiente: "chat_cli",
  });

  console.log(`▸ Análise (${resultado.analise.fonte}): ${resultado.pipeline.analise.intencao}, risco ${resultado.pipeline.analise.nivel_risco}`);
  console.log(`▸ Política: acao=${resultado.pipeline.politica.acao}, tom=${resultado.pipeline.politica.tom}`);
  if (resultado.memoria) {
    console.log(
      `▸ Memória (${resultado.memoria.fonte}): ${resultado.memoria.decisao.acao} · ${resultado.memoria.decisao.tipo}`,
    );
  }
  console.log();

  if (resultado.resposta) {
    console.log("Luna:");
    console.log(resultado.resposta.texto);
  }

  if (resultado.sessao) {
    salvarUltimaSessao(resultado.sessao.id);
    imprimirBlocoSessao(
      resultado.sessao.id,
      resultado.sessao.mensagens.length,
      resultado.sessao.fatos.length,
    );
  }

  console.log(`📋 Log: ${resultado.log_path}`);
  console.log(
    `⏱ ${resultado.analise.latencia_ms ?? 0}ms análise + ${resultado.resposta?.latencia_ms ?? 0}ms resposta`,
  );
}

main().catch((erro: unknown) => {
  console.error("Erro:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
