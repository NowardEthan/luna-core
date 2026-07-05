/** M6 — CLI do Sono (consolidação) */

import { carregarConfig } from "../providers/tipos.js";
import { criarProvedorOpenAi } from "../providers/openaiCompativel.js";
import { executarSono, precisaConsolidar } from "../mundo/sono/consolidador.js";
import { lerAutoRetrato } from "../mundo/diario/storeDiario.js";

if (process.argv.includes("--retrato")) {
  const r = lerAutoRetrato();
  if (!r) {
    console.log("(auto-retrato ainda não gerado)");
    process.exit(0);
  }
  console.log(`Auto-retrato v${r.versao} (${r.atualizado_em}):\n`);
  console.log(r.texto);
  process.exit(0);
}

const config = carregarConfig();
const forcar = process.argv.includes("--agora");

if (!forcar && !precisaConsolidar()) {
  console.log("Sono não necessário hoje (já consolidado ou sem entradas antigas).");
  process.exit(0);
}

const provedor =
  config?.apiKeyMenor && config
    ? criarProvedorOpenAi({
        apiKey: config.apiKeyMenor,
        baseUrl: config.baseUrlMenor ?? "https://openrouter.ai/api/v1",
      })
    : undefined;

executarSono(provedor, config?.modeloMenor)
  .then((r) => console.log(r.consolidou ? "Sono executado." : "Nada a consolidar."))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
