export type DependenciasIdeias = {
  criarIdeia: (texto: string) => Promise<string>;
  verIdeias?: () => Promise<{ id: string; texto: string; status: string; createdAt: number }[]>;
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

export async function verIdeias(deps: DependenciasIdeias): Promise<string> {
  if (!deps.verIdeias) {
    return "ERRO: O método de ver ideias não está disponível neste ambiente.";
  }
  
  try {
    const ideias = await deps.verIdeias();
    if (!ideias || ideias.length === 0) {
      return "A Caixa de Entrada está vazia. Não há nenhuma ideia guardada.";
    }

    const pendentes = ideias.filter(i => i.status === "pendente");
    const arquivadas = ideias.filter(i => i.status === "arquivado");

    let texto = "";
    if (pendentes.length > 0) {
      texto += `## Ideias Pendentes\n`;
      pendentes.forEach(i => {
        texto += `- [id: ${i.id}] ${i.texto}\n`;
      });
      texto += `\n`;
    }
    
    if (arquivadas.length > 0) {
      texto += `## Ideias Arquivadas (viraram tarefa ou foram guardadas)\n`;
      arquivadas.forEach(i => {
        texto += `- [id: ${i.id}] ${i.texto}\n`;
      });
    }

    return texto.trim();
  } catch (error) {
    return `ERRO ao ler ideias: ${error instanceof Error ? error.message : String(error)}`;
  }
}
