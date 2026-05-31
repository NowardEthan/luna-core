import type { AnaliseContexto } from "../analyzers/esquema.js";

/** Etiquetas derivadas da análise para o Seletor Constitucional. */
export function derivarEtiquetas(analise: AnaliseContexto): string[] {
  const etiquetas = new Set<string>([analise.intencao]);

  if (analise.complexidade === "alta") etiquetas.add("complexidade_alta");
  if (analise.nivel_risco === "medio") etiquetas.add("nivel_risco_medio");
  if (analise.nivel_risco === "alto") etiquetas.add("nivel_risco_alto");
  if (analise.nivel_risco === "critico") etiquetas.add("nivel_risco_critico");
  if (analise.requer_codigo) etiquetas.add("requer_codigo");
  if (analise.requer_markdown) etiquetas.add("requer_markdown");
  if (analise.requer_ferramenta) etiquetas.add("requer_ferramenta");
  if (analise.requer_memoria) etiquetas.add("requer_memoria");
  if (analise.intencao === "acao_critica") etiquetas.add("acao_critica");
  if (analise.intencao === "pergunta_identitaria") etiquetas.add("identidade");

  return [...etiquetas];
}

export function chavesModificadores(analise: AnaliseContexto): string[] {
  const chaves: string[] = [analise.intencao];
  if (analise.complexidade === "alta") chaves.push("complexidade_alta");
  if (analise.intencao === "acao_critica") chaves.push("acao_critica");
  if (analise.nivel_risco === "alto") chaves.push("acao_critica");
  return chaves;
}
