import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type GuiaProduto = {
  versao: string;
  produto: string;
  proposta_valor: string;
  capacidades: string[];
  limites: string[];
  superficies: string[];
};

const arquivoAtual = fileURLToPath(import.meta.url);
const caminhoGuiaProduto = path.resolve(
  path.dirname(arquivoAtual),
  "../personalidade/guiaOrbit.json",
);

export async function formatarGuiaProduto(): Promise<string | null> {
  const bruto = await readFile(caminhoGuiaProduto, "utf-8");
  const guia = JSON.parse(bruto) as GuiaProduto;
  if (!guia.produto.trim()) return null;

  return [
    `Guia de produto (${guia.versao}): ${guia.produto}`,
    `Proposta de valor: ${guia.proposta_valor}`,
    `Capacidades-chave: ${guia.capacidades.join("; ")}`,
    `Limites atuais: ${guia.limites.join("; ")}`,
    `Superfícies oficiais: ${guia.superficies.join("; ")}`,
  ].join("\n");
}
