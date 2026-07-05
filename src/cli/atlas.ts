/**
 * CLI Atlas Lunar — validate / compile / list (pkg-r).
 * Uso: npm run atlas -- validate | compile | list
 */
import { compilarAtlas, obterCaminhoCompiladoAtlas, validarAtlas } from "../atlas/compilarAtlas.js";

const cmd = process.argv[2] ?? "validate";

async function main(): Promise<void> {
  if (cmd === "validate") {
    const { registros } = await validarAtlas();
    console.log(`atlas validate — OK (${registros.length} registros válidos)`);
    return;
  }

  if (cmd === "compile") {
    const compilado = await compilarAtlas();
    console.log(
      `atlas compile — OK (${compilado.registros.length} registros em ${obterCaminhoCompiladoAtlas()})`,
    );
    return;
  }

  if (cmd === "list") {
    const { registros } = await validarAtlas();
    for (const registro of registros) {
      console.log(`${registro.id} :: ${registro.titulo}`);
    }
    console.log(`Total: ${registros.length}`);
    return;
  }

  console.error(`Comando desconhecido: ${cmd}`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(`atlas ${cmd} — falhou`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
