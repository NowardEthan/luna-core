import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type FerramentaGuia = {
  nome: string;
  quando_usar: string[];
  quando_evitar: string[];
  saida_esperada: string;
};

type GuiaFerramentas = {
  versao: string;
  objetivo: string;
  principios: string[];
  ferramentas: FerramentaGuia[];
};

const RAIZ_PACOTE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function carregarGuiaFerramentas(): GuiaFerramentas {
  const caminho = join(RAIZ_PACOTE, "src", "personalidade", "guiaFerramentas.json");
  return JSON.parse(readFileSync(caminho, "utf-8")) as GuiaFerramentas;
}

export function compilarGuiaFerramentasPrompt(): string {
  const guia = carregarGuiaFerramentas();
  const linhas: string[] = [];
  linhas.push(`## Guia de Ferramentas (${guia.versao})`);
  linhas.push(guia.objetivo);
  linhas.push("");
  linhas.push("Princípios:");
  for (const principio of guia.principios) {
    linhas.push(`- ${principio}`);
  }

  for (const ferramenta of guia.ferramentas) {
    linhas.push("");
    linhas.push(`Ferramenta: ${ferramenta.nome}`);
    linhas.push("- Quando usar:");
    for (const regra of ferramenta.quando_usar) {
      linhas.push(`  - ${regra}`);
    }
    linhas.push("- Quando evitar:");
    for (const regra of ferramenta.quando_evitar) {
      linhas.push(`  - ${regra}`);
    }
    linhas.push(`- Saída esperada: ${ferramenta.saida_esperada}`);
  }

  return linhas.join("\n");
}
