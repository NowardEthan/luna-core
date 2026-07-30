/**
 * As mãos dela nos documentos.
 *
 * A Luna já sabe conversar; isto dá-lhe a mão para TRANSFORMAR a conversa em algo que fica.
 * Sem isto, quando ele diz «escreve isso num documento», ela só podia despejar o texto no chat
 * — onde ele se dilui no fluxo e some. Com a mão, o texto nasce da conversa e vai para a estante,
 * com um lugar próprio para ser reaberto e (depois) editado.
 *
 * O documento nasce marcado (`origem: luna`) e preso à conversa de onde saiu — é isso que faz o
 * cartão aparecer no chat certo. A ferramenta devolve ERRO em vez de rebentar: se não gravou, ela
 * LÊ que não gravou, e não finge que criou.
 */
export type DependenciasDocumentos = {
  criarDocumento: (dados: {
    titulo: string;
    conteudo: string;
  }) => Promise<{ id: string; titulo: string }>;
};

export async function criarDocumento(
  deps: DependenciasDocumentos,
  args: Record<string, unknown>,
): Promise<string> {
  const titulo = String(args.titulo ?? "").trim();
  const conteudo = String(args.conteudo ?? "").trim();

  if (!titulo) {
    return "ERRO: o documento precisa de um título curto.";
  }
  if (!conteudo) {
    return "ERRO: o documento não pode ficar vazio — escreve o corpo em Markdown.";
  }

  try {
    const { id } = await deps.criarDocumento({ titulo, conteudo });
    return (
      `Documento «${titulo}» criado e guardado na estante (id: ${id}). ` +
      `Ele aparece como um cartão nesta conversa; o Ethan pode abrir e ler. ` +
      `Diz-lhe, na tua voz, que ficou guardado — não repitas o texto inteiro aqui.`
    );
  } catch (error) {
    return `ERRO ao criar documento: ${error instanceof Error ? error.message : String(error)}`;
  }
}
