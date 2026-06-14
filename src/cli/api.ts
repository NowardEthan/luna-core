import "../carregarEnv.js";
import { executarPipelineCompleto } from "../pipeline/executarPipelineCompleto.js";
import { lerUltimaSessao } from "../memoria/storeSessao.js";

function parseArgs(args: string[]): { mensagem: string; sessaoId?: string; json: boolean } {
  const restante: string[] = [];
  let sessaoId: string | undefined;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--sessao" && args[i + 1]) {
      sessaoId = args[i + 1];
      i++;
      continue;
    }
    restante.push(arg);
  }

  return { mensagem: restante.join(" "), sessaoId, json };
}

async function main(): Promise<void> {
  const { mensagem, sessaoId: sessaoArg, json } = parseArgs(process.argv.slice(2));

  if (!mensagem) {
    if (json) {
      console.log(JSON.stringify({ error: "Mensagem vazia" }));
    } else {
      console.error("Mensagem vazia");
    }
    process.exit(1);
  }

  // Permite que o Portal seja especificado.
  const ambiente = "desktop"; 

  // Carregando de forma isolada, não precisamos reivindicar a presença aqui (o New App já faz isso)
  
  let sessaoId = sessaoArg;
  if (!sessaoId || sessaoId === "undefined" || sessaoId === "null") {
     sessaoId = undefined;
  }

  try {
    const resultado = await executarPipelineCompleto(mensagem, {
      sessaoId,
      ambiente,
    });

    if (json) {
      console.log(JSON.stringify(resultado));
    } else {
      console.log("Resultado: ", resultado.resposta?.texto);
    }
  } catch (error: any) {
    if (json) {
      console.log(JSON.stringify({ error: error.message }));
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

main().catch((erro: unknown) => {
  console.log(JSON.stringify({ error: erro instanceof Error ? erro.message : String(erro) }));
  process.exit(1);
});
