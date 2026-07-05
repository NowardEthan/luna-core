import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { type RegistroAtlas } from "../atlas/compilarAtlas.js";
import { inferirAtlas, type ItemInferidoAtlas } from "../atlas/inferirAtlas.js";
import { formatarGuiaProduto } from "./formatarGuiaProduto.js";
import { formatarGuiaSuperficie } from "./formatarGuiaSuperficie.js";

const arquivoAtual = fileURLToPath(import.meta.url);
const caminhoAtlasCompilado = path.resolve(path.dirname(arquivoAtual), "../atlas/atlas.compiled.json");

let registrosCache: RegistroAtlas[] | null = null;

async function carregarRegistrosCompilados(): Promise<RegistroAtlas[]> {
  if (registrosCache) return registrosCache;
  const conteudo = await readFile(caminhoAtlasCompilado, "utf-8");
  const parsed = JSON.parse(conteudo) as { registros: RegistroAtlas[] };
  registrosCache = parsed.registros;
  return registrosCache;
}

function limitarResumo(texto: string, maxChars = 340): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (limpo.length <= maxChars) return limpo;
  return `${limpo.slice(0, Math.max(0, maxChars - 1))}…`;
}

export function formatarConhecimento(itens: ItemInferidoAtlas[]): string | null {
  if (itens.length === 0) return null;

  const resumo = limitarResumo(
    itens
      .slice(0, 3)
      .map((item) => `${item.titulo}: ${item.resumo}`)
      .join(" "),
  );

  const expansao = itens
    .slice(0, 3)
    .map((item) => `- ${item.titulo} (${item.id}): ${item.resumo}`)
    .join("\n");

  return [
    "Resumo do ecossistema (compacto):",
    resumo,
    "",
    "Expansão canônica:",
    expansao,
  ].join("\n");
}

export async function inferirEFormatarConhecimento(
  consulta: string,
  limite = 3,
  opcoes?: {
    intencao?: string;
    ambiente?: string;
  },
): Promise<string | null> {
  const registros = await carregarRegistrosCompilados();
  const itens = await inferirAtlas(consulta, { limite, registros });
  const base = formatarConhecimento(itens);
  const blocos: string[] = [];
  if (base) blocos.push(base);

  if (opcoes?.ambiente) {
    const guiaSuperficie = await formatarGuiaSuperficie(opcoes.ambiente);
    if (guiaSuperficie) blocos.push(guiaSuperficie);
  }

  if (opcoes?.intencao === "pergunta_produto") {
    const guiaProduto = await formatarGuiaProduto();
    if (guiaProduto) blocos.push(guiaProduto);
  }

  return blocos.length > 0 ? blocos.join("\n\n") : null;
}
