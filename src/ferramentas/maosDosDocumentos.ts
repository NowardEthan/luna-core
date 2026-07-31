/**
 * As mãos dela nos artefatos.
 *
 * A Luna já sabe conversar; isto dá-lhe a mão para TRANSFORMAR a conversa em algo que fica.
 * Sem isto, quando ele diz «escreve isso num artefato», ela só podia despejar o texto no chat
 * — onde ele se dilui no fluxo e some. Com a mão, o texto nasce da conversa e vai para a estante,
 * com um lugar próprio para ser reaberto e (depois) editado.
 *
 * (Nota de nome: internamente a coleção Firestore ainda se chama `documentos` e os símbolos aqui
 * mantêm «Documento» — o que mudou foi o nome VISÍVEL, «artefato», pra a Luna não confundir com os
 * ARQUIVOS/PDFs que o usuário anexa. Sem migração de dados.)
 *
 * O artefato nasce marcado (`origem: luna`) e preso à conversa de onde saiu — é isso que faz o
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

/** Conta quantas vezes `alvo` aparece (sem sobreposição) em `texto`. */
function contarOcorrencias(texto: string, alvo: string): number {
  if (!alvo) return 0;
  let total = 0;
  let idx = texto.indexOf(alvo);
  while (idx !== -1) {
    total += 1;
    idx = texto.indexOf(alvo, idx + alvo.length);
  }
  return total;
}

export async function criarDocumento(
  deps: Pick<DependenciasDocumentos, "criarDocumento">,
  args: Record<string, unknown>,
): Promise<string> {
  const titulo = String(args.titulo ?? "").trim();
  const conteudo = String(args.conteudo ?? "").trim();

  if (!titulo) {
    return "ERRO: o artefato precisa de um título curto.";
  }
  if (!conteudo) {
    return "ERRO: o artefato não pode ficar vazio — escreve o corpo em Markdown.";
  }

  try {
    const { id } = await deps.criarDocumento({ titulo, conteudo });
    return (
      `Artefato «${titulo}» criado e guardado na estante (id: ${id}). ` +
      `Ele aparece como um cartão nesta conversa; o Ethan pode abrir e ler. ` +
      `Diz-lhe, na tua voz, que ficou guardado — não repitas o texto inteiro aqui.`
    );
  } catch (error) {
    return `ERRO ao criar artefato: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function listarDocumentos(
  deps: Pick<DependenciasDocumentos, "listarDocumentos">,
  _args: Record<string, unknown>,
): Promise<string> {
  try {
    const docs = await deps.listarDocumentos();
    if (docs.length === 0) {
      return "Nenhum artefato nesta conversa ainda. Use criar_artefato para começar um.";
    }
    const linhas = docs.map((d) => `- id: ${d.id} — «${d.titulo}»`).join("\n");
    return (
      `Artefatos desta conversa:\n${linhas}\n\n` +
      `Para ler o corpo de um, use ler_artefato com o id. Para revisá-lo, use editar_artefato.`
    );
  } catch (error) {
    return `ERRO ao listar artefatos: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function lerDocumento(
  deps: Pick<DependenciasDocumentos, "lerDocumento">,
  args: Record<string, unknown>,
): Promise<string> {
  const id = String(args.id ?? "").trim();
  if (!id) {
    return "ERRO: preciso do id do artefato. Se não souber, chame listar_artefatos primeiro.";
  }
  try {
    const doc = await deps.lerDocumento(id);
    if (!doc) {
      return `ERRO: não achei artefato com id ${id}. Confira em listar_artefatos.`;
    }
    return (
      `Artefato «${doc.titulo}» (id: ${doc.id}). Corpo atual em Markdown abaixo — ` +
      `leia para auditar/revisar; para salvar mudanças use editar_artefato com este id.\n\n` +
      `${doc.conteudo}`
    );
  } catch (error) {
    return `ERRO ao ler artefato: ${error instanceof Error ? error.message : String(error)}`;
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
    return "ERRO: preciso do id do artefato a editar. Chame listar_artefatos se não souber.";
  }
  if (!temTitulo && !temConteudo) {
    return "ERRO: nada para mudar — passe o novo conteudo (corpo completo reescrito) e/ou um novo titulo.";
  }
  if (temConteudo && conteudo!.trim().length === 0) {
    return "ERRO: o artefato não pode ficar vazio. Reescreva o corpo em Markdown.";
  }

  try {
    const resultado = await deps.editarDocumento({ id, titulo, conteudo });
    if (!resultado) {
      return `ERRO: não achei artefato com id ${id}. Confira em listar_artefatos.`;
    }
    return (
      `Artefato «${resultado.titulo}» atualizado na estante (id: ${resultado.id}). ` +
      `O cartão nesta conversa já mostra a versão nova. ` +
      `Conte ao Ethan, na sua voz, o que você mudou — não repita o texto inteiro aqui.`
    );
  } catch (error) {
    return `ERRO ao editar artefato: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * A mão CIRÚRGICA — edita UM ponto do artefato sem reescrever o resto.
 *
 * É o «Edit tool» do código trazido pra cá: em vez de a Luna re-emitir o corpo inteiro (onde,
 * num texto grande, ela altera sem querer o que não devia — a confabulação por reescrita), ela
 * passa só o `trecho_antigo` (cópia EXATA do que está lá) e o `trecho_novo`. O que ela não
 * re-emite não pode ser corrompido, porque nunca passou por ela.
 *
 * Falha SEGURA: exige match ÚNICO. Se o trecho não existe (0) ou é ambíguo (>1), recusa e não
 * grava nada — devolve um ERRO que a orienta a corrigir (copiar exato / alargar o contexto),
 * exatamente como o Edit do código se comporta. E o histórico de versões continua a rede: mesmo
 * uma troca infeliz é restaurável.
 *
 * Reaproveita as deps que já existem — LÊ (para achar e validar o trecho) e EDITA (grava o corpo
 * já com a troca feita). Nada de Firestore novo.
 */
export async function editarTrechoDocumento(
  deps: Pick<DependenciasDocumentos, "lerDocumento" | "editarDocumento">,
  args: Record<string, unknown>,
): Promise<string> {
  const id = String(args.id ?? "").trim();
  const trechoAntigo = typeof args.trecho_antigo === "string" ? args.trecho_antigo : "";
  const trechoNovo = typeof args.trecho_novo === "string" ? args.trecho_novo : "";

  if (!id) {
    return "ERRO: preciso do id do artefato a editar. Chame listar_artefatos se não souber.";
  }
  if (!trechoAntigo) {
    return "ERRO: preciso do `trecho_antigo` — o texto EXATO que já está no artefato e vai sair. Chame ler_artefato para copiá-lo tal e qual.";
  }
  if (trechoAntigo === trechoNovo) {
    return "ERRO: o `trecho_novo` é igual ao `trecho_antigo` — nada mudaria.";
  }

  try {
    const doc = await deps.lerDocumento(id);
    if (!doc) {
      return `ERRO: não achei artefato com id ${id}. Confira em listar_artefatos.`;
    }

    const corpo = doc.conteudo;
    const ocorrencias = contarOcorrencias(corpo, trechoAntigo);
    if (ocorrencias === 0) {
      return (
        `ERRO: não encontrei esse trecho no artefato «${doc.titulo}». O \`trecho_antigo\` tem de ser ` +
        `uma cópia EXATA do que está lá (mesma pontuação, acentos, espaços e quebras de linha). ` +
        `Chame ler_artefato para ver o texto atual e copie o trecho tal e qual.`
      );
    }
    if (ocorrencias > 1) {
      return (
        `ERRO: esse trecho aparece ${ocorrencias} vezes no artefato «${doc.titulo}» — não dá para saber ` +
        `qual mudar. Alargue o \`trecho_antigo\` com mais texto à volta (a frase ou o parágrafo inteiro) ` +
        `até ficar ÚNICO, e tente de novo.`
      );
    }

    // Match único garantido: recorta pelo índice (evita as armadilhas de $ do String.replace).
    const inicio = corpo.indexOf(trechoAntigo);
    const novoCorpo = corpo.slice(0, inicio) + trechoNovo + corpo.slice(inicio + trechoAntigo.length);

    if (novoCorpo.trim().length === 0) {
      return "ERRO: essa troca deixaria o artefato vazio. Um artefato não pode ficar sem corpo.";
    }

    const resultado = await deps.editarDocumento({ id, conteudo: novoCorpo });
    if (!resultado) {
      return `ERRO: não achei artefato com id ${id}. Confira em listar_artefatos.`;
    }
    return (
      `Trecho trocado no artefato «${resultado.titulo}» (id: ${resultado.id}) — só aquele ponto mudou, ` +
      `o resto ficou intacto. O cartão nesta conversa já mostra a versão nova. ` +
      `Conte ao Ethan, na sua voz, o que você mudou — não repita o texto inteiro aqui.`
    );
  } catch (error) {
    return `ERRO ao editar trecho: ${error instanceof Error ? error.message : String(error)}`;
  }
}
