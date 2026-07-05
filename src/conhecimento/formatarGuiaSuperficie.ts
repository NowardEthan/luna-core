import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type GuiaSuperficie = {
  id: string;
  titulo: string;
  publico: string;
  foco: string[];
  limites: string[];
  exemplos_perguntas: string[];
};

const arquivoAtual = fileURLToPath(import.meta.url);
const pastaGuias = path.resolve(path.dirname(arquivoAtual), "./guias");

async function carregarGuia(nomeArquivo: string): Promise<GuiaSuperficie> {
  const caminho = path.join(pastaGuias, nomeArquivo);
  const bruto = await readFile(caminho, "utf-8");
  return JSON.parse(bruto) as GuiaSuperficie;
}

export async function formatarGuiaSuperficie(ambiente: string): Promise<string | null> {
  const arquivo =
    ambiente === "desktop"
      ? "orbit-desktop.json"
      : ambiente === "forge"
        ? "forge-live.json"
        : ambiente === "lumen"
          ? "lumen-inapp.json"
          : null;
  if (!arquivo) return null;

  const guia = await carregarGuia(arquivo);
  const linhas: string[] = [];
  linhas.push(`Guia de superfície: ${guia.titulo}`);
  linhas.push(`Público: ${guia.publico}`);
  linhas.push(`Foco: ${guia.foco.join("; ")}`);
  linhas.push(`Limites: ${guia.limites.join("; ")}`);
  linhas.push("Perguntas típicas:");
  for (const exemplo of guia.exemplos_perguntas.slice(0, 3)) {
    linhas.push(`- ${exemplo}`);
  }
  return linhas.join("\n");
}
