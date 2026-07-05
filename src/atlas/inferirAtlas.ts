import { carregarRegistrosAtlas, type RegistroAtlas } from "./compilarAtlas.js";

export type ItemInferidoAtlas = RegistroAtlas & { score: number };

export type OpcoesInferirAtlas = {
  limite?: number;
  registros?: RegistroAtlas[];
};

function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function tokenizarConsulta(consulta: string): string[] {
  return normalizarTexto(consulta)
    .split(/\s+/)
    .filter(Boolean);
}

function pontuarRegistro(registro: RegistroAtlas, tokens: string[], consultaNormalizada: string): number {
  const id = normalizarTexto(registro.id);
  const titulo = normalizarTexto(registro.titulo);
  const resumo = normalizarTexto(registro.resumo);
  const palavras = registro.palavras_chave.map(normalizarTexto);

  let score = 0;
  if (id === consultaNormalizada) score += 40;
  if (titulo.includes(consultaNormalizada)) score += 25;
  if (resumo.includes(consultaNormalizada)) score += 12;
  if (palavras.some((palavra) => palavra === consultaNormalizada)) score += 30;

  for (const token of tokens) {
    if (id.includes(token)) score += 8;
    if (titulo.includes(token)) score += 6;
    if (resumo.includes(token)) score += 3;
    if (palavras.some((palavra) => palavra.includes(token))) score += 10;
  }
  return score;
}

export async function inferirAtlas(consulta: string, opcoes: OpcoesInferirAtlas = {}): Promise<ItemInferidoAtlas[]> {
  const consultaNormalizada = normalizarTexto(consulta);
  if (!consultaNormalizada) return [];

  const tokens = tokenizarConsulta(consulta);
  const registros = opcoes.registros ?? (await carregarRegistrosAtlas());
  const limite = Math.max(3, Math.min(5, opcoes.limite ?? 5));

  return registros
    .map((registro) => ({
      ...registro,
      score: pontuarRegistro(registro, tokens, consultaNormalizada),
    }))
    .filter((registro) => registro.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limite);
}
