export type NivelMarkdown = "pesado" | "leve" | "qualquer";

/**
 * Detecta markdown na resposta.
 * - pesado: headers (#) e code fences (```) — falha clara de política
 * - leve: negrito (**), listas numeradas/marcadores
 * - qualquer: pesado + leve
 */
export function detectarMarkdown(resposta: string, nivel: NivelMarkdown = "qualquer"): boolean {
  const pesado = /^#{1,6}\s/m.test(resposta) || /```/.test(resposta);
  const leve =
    /\*\*[^*]+\*\*/.test(resposta) ||
    /__[^_]+__/.test(resposta) ||
    /^\s*\d+\.\s+/m.test(resposta) ||
    /^\s*[-*]\s+/m.test(resposta);

  if (nivel === "pesado") return pesado;
  if (nivel === "leve") return leve;
  return pesado || leve;
}

export function descreverMarkdown(resposta: string): string[] {
  const tipos: string[] = [];
  if (/^#{1,6}\s/m.test(resposta)) tipos.push("header");
  if (/```/.test(resposta)) tipos.push("code_fence");
  if (/\*\*[^*]+\*\*/.test(resposta)) tipos.push("negrito");
  if (/^\s*\d+\.\s+/m.test(resposta)) tipos.push("lista_numerada");
  if (/^\s*[-*]\s+/m.test(resposta)) tipos.push("lista_marcador");
  return tipos;
}
