import {
  definirHabitatAtual,
  listarAmbientesHabitat,
  obterEstadoHabitat,
} from "../mundo/habitat/storeHabitat.js";

function imprimirAjuda(): void {
  console.log("Uso:");
  console.log("  npm run mundo -- list");
  console.log("  npm run mundo -- status");
  console.log("  npm run mundo -- status --set <ambiente_id>");
}

const [comando, ...args] = process.argv.slice(2);

if (!comando) {
  imprimirAjuda();
  process.exit(1);
}

if (comando === "list") {
  const ambientes = listarAmbientesHabitat();
  for (const ambiente of ambientes) {
    console.log(`${ambiente.id} — ${ambiente.nome}`);
    console.log(`  ${ambiente.descricao}`);
  }
  process.exit(0);
}

if (comando === "status") {
  const idxSet = args.indexOf("--set");
  if (idxSet >= 0) {
    const ambienteId = args[idxSet + 1];
    if (!ambienteId) {
      console.error("Informe um ambiente após --set.");
      process.exit(1);
    }
    definirHabitatAtual(ambienteId);
  }

  const { estado, ambiente } = obterEstadoHabitat();
  console.log(`Habitat atual: ${ambiente.nome} (${ambiente.id})`);
  console.log(`Atualizado em: ${estado.atualizado_em}`);
  console.log(`Slice: ${ambiente.slice_contexto}`);
  process.exit(0);
}

console.error(`Comando inválido: ${comando}`);
imprimirAjuda();
process.exit(1);
