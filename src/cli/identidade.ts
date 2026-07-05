/**
 * CLI identidade — compile / validate (pkg-comp / pkg-a).
 * Uso: npm run identidade -- validate | compile
 */
import {
  CAMINHO_IDENTIDADE_COMPILED,
  compilarIdentidade,
  validarPacotesPersonalidade,
} from "../identidade/compilarIdentidade.js";

const cmd = process.argv[2] ?? "validate";

if (cmd === "validate") {
  const erros = validarPacotesPersonalidade();
  if (erros.length > 0) {
    console.error("identidade validate — falhou");
    for (const erro of erros) console.error(`- ${erro}`);
    process.exit(1);
  }
  console.log("identidade validate — OK");
  process.exit(0);
}

if (cmd === "compile") {
  try {
    const compilado = compilarIdentidade();
    console.log(`identidade compile — OK (v${compilado.versao})`);
    console.log(`arquivo: ${CAMINHO_IDENTIDADE_COMPILED}`);
    process.exit(0);
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    console.error("identidade compile — falhou");
    console.error(msg);
    process.exit(1);
  }
}

console.error(`Comando desconhecido: ${cmd}`);
process.exit(1);
