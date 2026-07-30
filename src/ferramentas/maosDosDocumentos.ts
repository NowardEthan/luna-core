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
export type DocumentoResumo = { id: string; titulo: string };
export type DocumentoConteudo = { id: string; titulo: string; conteudo: string };

export type DependenciasDocumentos = {
  criarDocumento: (dados: {
    titulo: string;
    conteudo: string;
  }) => Promise<{ id: string; titulo: string }>;
  /** Lista os documentos desta conversa (id + título) — para a Luna saber o que existe. */
  listarDocumentos: () => Promise<DocumentoResumo[]>;
  /** Lê o corpo de um documento pelo id (para auditar/revisar). `null` se o id não bate. */
  lerDocumento: (id: string) => Promise<DocumentoConteudo | null>;
  /** Reescreve um documento existente. `null` se o id não bate. */
  editarDocumento: (dados: {
    id: string;
    titulo?: string;
    conteudo?: string;
  }) => Promise<{ id: string; titulo: string } | null>;
};

export async function criarDocumento(
  deps: Pick<DependenciasDocumentos, "criarDocumento">,
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

export async function listarDocumentos(
  deps: Pick<DependenciasDocumentos, "listarDocumentos">,
  _args: Record<string, unknown>,
): Promise<string> {
  try {
    const docs = await deps.listarDocumentos();
    if (docs.length === 0) {
      return "Nenhum documento nesta conversa ainda. Use criar_documento para começar um.";
    }
    const linhas = docs.map((d) => `- id: ${d.id} — «${d.titulo}»`).join("\n");
    return (
      `Documentos desta conversa:\n${linhas}\n\n` +
      `Para ler o corpo de um, use ler_documento com o id. Para revisá-lo, use editar_documento.`
    );
  } catch (error) {
    return `ERRO ao listar documentos: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function lerDocumento(
  deps: Pick<DependenciasDocumentos, "lerDocumento">,
  args: Record<string, unknown>,
): Promise<string> {
  const id = String(args.id ?? "").trim();
  if (!id) {
    return "ERRO: preciso do id do documento. Se não souber, chame listar_documentos primeiro.";
  }
  try {
    const doc = await deps.lerDocumento(id);
    if (!doc) {
      return `ERRO: não achei documento com id ${id}. Confira em listar_documentos.`;
    }
    return (
      `Documento «${doc.titulo}» (id: ${doc.id}). Corpo atual em Markdown abaixo — ` +
      `leia para auditar/revisar; para salvar mudanças use editar_documento com este id.\n\n` +
      `${doc.conteudo}`
    );
  } catch (error) {
    return `ERRO ao ler documento: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function editarDocumento(
  deps: Pick<DependenciasDocumentos, "editarDocumento">,
  args: Record<string, unknown>,
): Promise<string> {
  const id = String(args.id ?? "").trim();
  const temTitulo = typeof args.titulo === "string" && String(args.titulo).trim().length > 0;
  const temConteudo = typeof args.conteudo === "string";
  const titulo = temTitulo ? String(args.titulo).trim() : undefined;
  const conteudo = temConteudo ? String(args.conteudo) : undefined;

  if (!id) {
    return "ERRO: preciso do id do documento a editar. Chame listar_documentos se não souber.";
  }
  if (!temTitulo && !temConteudo) {
    return "ERRO: nada para mudar — passe o novo conteudo (corpo completo reescrito) e/ou um novo titulo.";
  }
  if (temConteudo && conteudo!.trim().length === 0) {
    return "ERRO: o documento não pode ficar vazio. Reescreva o corpo em Markdown.";
  }

  try {
    const resultado = await deps.editarDocumento({ id, titulo, conteudo });
    if (!resultado) {
      return `ERRO: não achei documento com id ${id}. Confira em listar_documentos.`;
    }
    return (
      `Documento «${resultado.titulo}» atualizado na estante (id: ${resultado.id}). ` +
      `O cartão nesta conversa já mostra a versão nova. ` +
      `Conte ao Ethan, na sua voz, o que você mudou — não repita o texto inteiro aqui.`
    );
  } catch (error) {
    return `ERRO ao editar documento: ${error instanceof Error ? error.message : String(error)}`;
  }
}
