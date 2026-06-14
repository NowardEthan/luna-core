import "../carregarEnv.js";

import { avaliarMemoria } from "../memoria/analisadorMemoria.js";
import { obterOuCriarSessao } from "../memoria/gerenciadorSessao.js";
import { criarProvedorOpenAi } from "../providers/openaiCompativel.js";
import { carregarConfig } from "../providers/tipos.js";

function parseArgs(argv: string[]): {
  mensagem: string;
  regras: boolean;
  json: boolean;
  sessaoId?: string;
} {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const resto: string[] = [];
  let sessaoId: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--sessao" && argv[i + 1]) {
      sessaoId = argv[i + 1];
      i++;
      continue;
    }
    if (!arg.startsWith("--")) resto.push(arg);
  }

  return {
    mensagem: resto.join(" ").trim(),
    regras: flags.has("--regras"),
    json: flags.has("--json"),
    sessaoId,
  };
}

async function main(): Promise<void> {
  const { mensagem, regras, json, sessaoId } = parseArgs(process.argv.slice(2));

  if (!mensagem) {
    console.log('Uso: npm run memoria -- [--sessao UUID] [--regras] [--json] "mensagem"\n');
    console.log('Exemplo: npm run memoria -- "Eu sou autista"');
    console.log('Exemplo: npm run memoria -- --sessao UUID "Sim, pode lembrar"');
    process.exit(1);
  }

  const config = carregarConfig();
  const sessao = obterOuCriarSessao(sessaoId);

  if (!regras && !config) {
    console.log("⚠ LUNA_API_KEY não configurada — usando modo --regras\n");
  }

  const provedor =
    !regras && config ? criarProvedorOpenAi({ apiKey: config.apiKey, baseUrl: config.baseUrl }) : undefined;
  const modelo = !regras && config ? config.modeloMenor : undefined;

  const resultado = await avaliarMemoria(mensagem, sessao, provedor, modelo);

  if (json) {
    console.log(JSON.stringify({ mensagem, sessao_id: sessao.id, ...resultado }, null, 2));
    return;
  }

  console.log("╔══════════════════════════════════════╗");
  console.log("║   Luna Core — neurônio memória V1.2  ║");
  console.log("╚══════════════════════════════════════╝\n");
  console.log(`Mensagem: "${mensagem}"`);
  console.log(`Sessão: ${sessao.id}`);
  if (sessao.pendente_confirmacao) {
    console.log(`Pendente: ${sessao.pendente_confirmacao.conteudo}`);
  }
  console.log();

  if (resultado.fonte === "llm") {
    console.log(`▸ Modelo: ${resultado.modelo} (${resultado.latencia_ms}ms)\n`);
    console.log("▸ Resposta bruta do LLM:");
    console.log("─".repeat(40));
    console.log(resultado.resposta_bruta ?? "(vazio)");
    console.log("─".repeat(40));

    if (resultado.decisao_llm) {
      console.log("\n▸ Decisão parseada (antes do refino):");
      console.log(JSON.stringify(resultado.decisao_llm, null, 2));
    }

    const refinoAlterou =
      resultado.decisao_llm &&
      JSON.stringify(resultado.decisao_llm) !== JSON.stringify(resultado.decisao);

    console.log("\n▸ Decisão final (após refino determinístico):");
    console.log(JSON.stringify(resultado.decisao, null, 2));

    if (refinoAlterou) {
      console.log("\n⚠ Refino determinístico alterou a decisão do LLM.");
    }
  } else {
    console.log(`▸ Fonte: ${resultado.erro_llm ? "regras (fallback)" : "regras"}`);
    if (resultado.erro_llm) console.log(`▸ Erro LLM: ${resultado.erro_llm}\n`);
    console.log("▸ Decisão:");
    console.log(JSON.stringify(resultado.decisao, null, 2));
  }
}

main().catch((erro: unknown) => {
  console.error("Erro:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
