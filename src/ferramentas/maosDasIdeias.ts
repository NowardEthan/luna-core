export type DependenciasIdeias = {
  criarIdeia: (texto: string) => Promise<string>;
};

export async function anotarIdeia(deps: DependenciasIdeias, args: Record<string, unknown>): Promise<string> {
  const texto = String(args.texto ?? "").trim();
  if (!texto) {
    return "ERRO: O texto da ideia não pode estar vazio.";
  }

  try {
    const id = await deps.criarIdeia(texto);
    return `Ideia anotada com sucesso na Caixa de Entrada! (ID: ${id})`;
  } catch (error) {
    return `ERRO ao salvar ideia: ${error instanceof Error ? error.message : String(error)}`;
  }
}
