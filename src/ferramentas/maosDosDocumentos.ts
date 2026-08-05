import {
  SCHEMA_ARTEFATO_BLOCOS,
  blocosToMd,
  editarBlocoNaLista,
  inserirBlocosApos,
  mdToBlocos,
  novoIdBloco,
  normalizarDocumentoBlocos,
  type BlocoArtefato,
  type PropsBlocoArtefato,
  type TipoBlocoArtefato,
} from "./artefatoBlocos.js";

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
export type DocumentoResumo = {
  id: string;
  titulo: string;
  /** true = nasceu nesta conversa; false/omitido = veio de outra (ou sem conversa). */
  destaConversa?: boolean;
};
export type DocumentoConteudo = {
  id: string;
  titulo: string;
  conteudo: string;
  /** Blocos tipados (schema 2). Ausente em docs legados ainda não migrados. */
  blocos?: BlocoArtefato[];
  schemaVersion?: number;
  /** A «bíblia» do artefato — os fatos fixos (nomes, idades, relações). `""` quando ainda não há. */
  canone?: string;
};

export type DependenciasDocumentos = {
  criarDocumento: (dados: {
    titulo: string;
    conteudo: string;
    blocos?: BlocoArtefato[];
  }) => Promise<{ id: string; titulo: string }>;
  /** Lista a estante do usuário (id + título; preferir marcar `destaConversa`). */
  listarDocumentos: () => Promise<DocumentoResumo[]>;
  /** Lê o corpo de um documento pelo id (para auditar/revisar). `null` se o id não bate. */
  lerDocumento: (id: string) => Promise<DocumentoConteudo | null>;
  /** Reescreve um documento existente. `null` se o id não bate. */
  editarDocumento: (dados: {
    id: string;
    titulo?: string;
    conteudo?: string;
    blocos?: BlocoArtefato[];
    /** A bíblia dos fatos fixos — metadado, gravado sem tocar no corpo nem gerar versão. */
    canone?: string;
  }) => Promise<{ id: string; titulo: string } | null>;
};

/** Garante blocos + MD coerentes a partir do que a dep devolveu. */
function corpoComBlocos(doc: DocumentoConteudo): {
  blocos: BlocoArtefato[];
  conteudo: string;
  schemaVersion: number;
} {
  return normalizarDocumentoBlocos({
    conteudo: doc.conteudo,
    blocos: doc.blocos,
    schemaVersion: doc.schemaVersion,
  });
}

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

/** Conta palavras de forma tosca-mas-suficiente (para dar a NOÇÃO de tamanho de uma seção). */
function contarPalavras(texto: string): number {
  const t = texto.trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Índice + lembrete de auditoria depois de escrever/editar.
 * A Luna «vê» o estado do doc sem depender só de disciplina de prompt.
 */
export function anexoAuditoriaPosEdit(
  titulo: string,
  id: string,
  conteudo: string,
  blocos?: BlocoArtefato[],
): string {
  const lista = blocos ?? mdToBlocos(conteudo);
  const secoes = mapearSecoes(conteudo);
  const headings = lista.filter((b) => b.type === "heading");
  const totalPalavras = contarPalavras(conteudo);
  let indice: string;
  if (secoes.length === 0 && headings.length === 0) {
    const preview = lista
      .slice(0, 8)
      .map((b) => `- ${b.id} · ${b.type} · «${(b.text || "").slice(0, 40)}»`)
      .join("\n");
    indice =
      `Índice atual (texto corrido, ${lista.length} blocos, ~${totalPalavras} palavras):\n` +
      (preview || "(vazio)");
  } else {
    const linhas = secoes
      .map((s, i) => {
        const hid = headings[i]?.id ? ` blocoId=${headings[i]!.id}` : "";
        return `${s.numero}. ${"  ".repeat(Math.max(0, s.nivel - 1))}${s.titulo}  (~${s.palavras} palavras)${hid}`;
      })
      .join("\n");
    indice =
      `Índice atual (${secoes.length} seções, ${lista.length} blocos, ~${totalPalavras} palavras):\n${linhas}`;
  }
  return (
    `\n\n${indice}\n\n` +
    `AUDITORIA PENDENTE no artefato «${titulo}» (id: ${id}): chame \`ler_estrutura\` ` +
    `(ou \`ler_secao\` do trecho mexido), confira se as seções antigas ainda estão e se o novo ` +
    `entrou no lugar certo; pergunte-se «isso ficou bom pro pedido? o que melhorar?» e, se ` +
    `preciso, corrija com mão cirúrgica. Só depois diga que está pronto.`
  );
}

/**
 * Uma seção do artefato — o «arquivo» dentro da «codebase» que é o texto.
 *
 * `numero` é o índice estável (1-based) pela ordem de leitura; `inicio`/`fim` são offsets de
 * caractere na FONTE (incluem a linha do próprio título), para o degrau seguinte (`ler_secao`)
 * recortar exatamente aquele pedaço sem tocar no resto.
 */
export type SecaoArtefato = {
  numero: number;
  nivel: number;
  titulo: string;
  palavras: number;
  inicio: number;
  fim: number;
};

/**
 * O MAPA do artefato — parte o corpo Markdown pelos títulos (`#`..`######`) e devolve a lista de
 * seções. É o `ls` da árvore: barato, cabe na cabeça dela inteiro, e é o que a deixa navegar um
 * texto grande sem o carregar todo.
 *
 * Cada seção vai de um título até o PRÓXIMO título de qualquer nível (uma fatia contígua da fonte).
 * Ignora `#` dentro de blocos de código cercados (``` / ~~~), que não são títulos de verdade.
 * Texto ANTES do primeiro título não é seção (fica de fora do mapa de propósito — v1).
 */
export function mapearSecoes(texto: string): SecaoArtefato[] {
  const linhas = texto.split("\n");
  const cabecalhos: { nivel: number; titulo: string; inicioLinha: number }[] = [];
  let emCodigo = false;
  let offset = 0;
  for (const linha of linhas) {
    const semEspaco = linha.trimStart();
    if (semEspaco.startsWith("```") || semEspaco.startsWith("~~~")) {
      emCodigo = !emCodigo;
    } else if (!emCodigo) {
      const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(linha);
      if (m) {
        cabecalhos.push({ nivel: m[1].length, titulo: m[2].trim(), inicioLinha: offset });
      }
    }
    offset += linha.length + 1; // +1 pela quebra de linha consumida no split
  }

  return cabecalhos.map((h, i) => {
    const inicio = h.inicioLinha;
    const fim = i + 1 < cabecalhos.length ? cabecalhos[i + 1].inicioLinha : texto.length;
    return {
      numero: i + 1,
      nivel: h.nivel,
      titulo: h.titulo,
      palavras: contarPalavras(texto.slice(inicio, fim)),
      inicio,
      fim,
    };
  });
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

/** Teto pra não afogar o modelo se a estante crescer. */
const LIMITE_LISTA_ARTEFATOS = 40;

export async function listarDocumentos(
  deps: Pick<DependenciasDocumentos, "listarDocumentos">,
  _args: Record<string, unknown>,
): Promise<string> {
  try {
    const docs = await deps.listarDocumentos();
    if (docs.length === 0) {
      return "Nenhum artefato na estante ainda. Use criar_artefato para começar um.";
    }
    const fatia = docs.slice(0, LIMITE_LISTA_ARTEFATOS);
    const linhas = fatia
      .map((d) => {
        const onde =
          d.destaConversa === true
            ? "esta conversa"
            : d.destaConversa === false
              ? "outra conversa"
              : "estante";
        return `- id: ${d.id} — «${d.titulo}» (${onde})`;
      })
      .join("\n");
    const extras =
      docs.length > LIMITE_LISTA_ARTEFATOS
        ? `\n(…e mais ${docs.length - LIMITE_LISTA_ARTEFATOS} na estante; os mais recentes vêm primeiro.)`
        : "";
    return (
      `Artefatos na estante dele (todas as conversas):\n${linhas}${extras}\n\n` +
      `Se ele citou um nome («meus gastos», etc.), bata o título na lista — pode ser de outra conversa. ` +
      `Para ler o corpo, use ler_artefato com o id. Para revisar, use editar_artefato / editar_trecho_artefato.`
    );
  } catch (error) {
    return `ERRO ao listar artefatos: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** Acima disto, `ler_artefato` devolve o índice em vez do livro inteiro. */
const LIMITE_LER_ARTEFATO_CHARS = 8000;
/** Acima disto, `ler_secao` corta o retorno com aviso. */
const LIMITE_LER_SECAO_CHARS = 6000;

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
    const corpo = doc.conteudo ?? "";
    if (corpo.length > LIMITE_LER_ARTEFATO_CHARS) {
      // Não satura o contexto — mapa + ordem de abrir seção.
      const estrutura = await lerEstruturaDocumento(deps, { id });
      return (
        `Artefato «${doc.titulo}» (id: ${doc.id}) é GRANDE (~${corpo.length} chars) — ` +
        `não devolvo o corpo inteiro (estoura o contexto). Use \`ler_secao\` / \`ler_bloco\`.\n\n` +
        estrutura
      );
    }
    return (
      `Artefato «${doc.titulo}» (id: ${doc.id}). Corpo atual em Markdown abaixo — ` +
      `leia para auditar/revisar; para salvar mudanças use editar_artefato com este id.\n\n` +
      `${corpo}`
    );
  } catch (error) {
    return `ERRO ao ler artefato: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * O SUMÁRIO — devolve só o ÍNDICE do artefato (títulos + tamanho de cada seção), sem o corpo.
 *
 * É o primeiro órgão do «livro é uma codebase»: em vez de ler o texto inteiro (onde, num artefato
 * grande, ela satura e confabula), ela olha o mapa — barato — e decide qual seção abrir com
 * `ler_secao`. Reaproveita `lerDocumento` (nada de Firestore novo); a análise é local.
 */
export async function lerEstruturaDocumento(
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
    const { blocos, conteudo } = corpoComBlocos(doc);
    const secoes = mapearSecoes(conteudo);
    const totalPalavras = contarPalavras(conteudo);
    const headings = blocos.filter((b) => b.type === "heading");
    if (secoes.length === 0 && headings.length === 0) {
      const preview = blocos
        .slice(0, 12)
        .map((b) => `- ${b.id} · ${b.type} · «${(b.text || "").slice(0, 48)}»`)
        .join("\n");
      return (
        `O artefato «${doc.titulo}» (id: ${doc.id}) não tem seções com título — texto corrido ` +
        `de ~${totalPalavras} palavras (${blocos.length} blocos).\n` +
        `Blocos (preview):\n${preview}\n\n` +
        `Para ler um bloco: ler_bloco. Para CONTINUAR o texto: inserir_blocos (after_id = último bloco).`
      );
    }
    const linhas = secoes
      .map((s, i) => {
        const hid = headings[i]?.id ? ` blocoId=${headings[i]!.id}` : "";
        return `${s.numero}. ${"  ".repeat(Math.max(0, s.nivel - 1))}${s.titulo}  (~${s.palavras} palavras)${hid}`;
      })
      .join("\n");
    return (
      `Estrutura do artefato «${doc.titulo}» (id: ${doc.id}) — o índice, SEM o corpo ` +
      `(${secoes.length} seções, ${blocos.length} blocos, ~${totalPalavras} palavras no total):\n${linhas}\n\n` +
      `Para ler UMA seção: ler_secao (número ou título). Para CONTINUAR: inserir_blocos com ` +
      `markdown + after_secao (número/título da seção, ou omite pro fim). ` +
      `Pra mudar um trecho: editar_trecho_artefato. NÃO reescreva o livro inteiro.`
    );
  } catch (error) {
    return `ERRO ao ler a estrutura do artefato: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * ABRIR UM CAPÍTULO — devolve o texto de UMA seção do artefato, sem o resto.
 *
 * O segundo órgão do «livro é uma codebase»: depois de olhar o mapa (`ler_estrutura`), ela puxa
 * só a seção que interessa — como abrir um arquivo da árvore em vez do projeto inteiro. Aceita o
 * NÚMERO da seção (do índice) ou o TÍTULO (match sem diferença de acento/maiúsculas, e por
 * prefixo se for único). Reaproveita `lerDocumento`; a fatia é local (offsets de `mapearSecoes`).
 */
export async function lerSecaoDocumento(
  deps: Pick<DependenciasDocumentos, "lerDocumento">,
  args: Record<string, unknown>,
): Promise<string> {
  const id = String(args.id ?? "").trim();
  const alvoBruto = args.secao ?? args.numero ?? args.titulo ?? "";
  const alvo = String(alvoBruto).trim();
  if (!id) {
    return "ERRO: preciso do id do artefato. Se não souber, chame listar_artefatos primeiro.";
  }
  if (!alvo) {
    return "ERRO: preciso de qual seção — passe `secao` com o número (ex.: 3) ou o título dela. Veja o índice em ler_estrutura.";
  }
  try {
    const doc = await deps.lerDocumento(id);
    if (!doc) {
      return `ERRO: não achei artefato com id ${id}. Confira em listar_artefatos.`;
    }
    const secoes = mapearSecoes(doc.conteudo);
    if (secoes.length === 0) {
      return (
        `O artefato «${doc.titulo}» (id: ${doc.id}) não tem seções (nenhum título ## ) — não há o que ` +
        `fatiar. É um texto corrido; para o ler use ler_artefato.`
      );
    }

    const secao = acharSecao(secoes, alvo);
    if (!secao) {
      const indice = secoes.map((s) => `${s.numero}. ${s.titulo}`).join("\n");
      return (
        `ERRO: não achei a seção «${alvo}» no artefato «${doc.titulo}». O índice é:\n${indice}\n\n` +
        `Passe o NÚMERO ou o título exato de uma dessas.`
      );
    }

    const textoCompleto = doc.conteudo.slice(secao.inicio, secao.fim).trim();
    const truncado = textoCompleto.length > LIMITE_LER_SECAO_CHARS;
    const texto = truncado
      ? textoCompleto.slice(0, LIMITE_LER_SECAO_CHARS)
      : textoCompleto;
    const avisoTrunc =
      truncado
        ? `\n\n(Seção grande — mostrei só os primeiros ~${LIMITE_LER_SECAO_CHARS} chars. ` +
          `Refine com \`buscar_no_artefato\` / \`ler_bloco\`, ou peça outra fatia do tema.)`
        : "";
    return (
      `Artefato «${doc.titulo}» (id: ${doc.id}) — seção ${secao.numero} «${secao.titulo}» ` +
      `(~${secao.palavras} palavras), só este pedaço:\n\n${texto}${avisoTrunc}\n\n` +
      `Para mudar um ponto AQUI, use editar_trecho_artefato com este id e o trecho copiado tal e qual. ` +
      `Se já tem o que precisa: ESCREVA ou RESPONDA — não fique relendo capítulos em ping-pong. ` +
      `Outra seção só se for necessária; mapa: ler_estrutura.`
    );
  } catch (error) {
    return `ERRO ao ler a seção do artefato: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** Normaliza para comparar títulos sem tropeçar em acento/maiúsculas/espaços. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Acha a seção pelo número (1-based) ou pelo título (igual → prefixo único → contém único). */
function acharSecao(secoes: SecaoArtefato[], alvo: string): SecaoArtefato | null {
  const comoNumero = Number.parseInt(alvo, 10);
  if (String(comoNumero) === alvo.trim() && Number.isFinite(comoNumero)) {
    return secoes.find((s) => s.numero === comoNumero) ?? null;
  }
  const n = normalizar(alvo);
  const exatos = secoes.filter((s) => normalizar(s.titulo) === n);
  if (exatos.length === 1) return exatos[0];
  if (exatos.length > 1) return exatos[0]; // desempata pelo primeiro (ordem de leitura)
  const prefixo = secoes.filter((s) => normalizar(s.titulo).startsWith(n));
  if (prefixo.length === 1) return prefixo[0];
  const contem = secoes.filter((s) => normalizar(s.titulo).includes(n));
  if (contem.length === 1) return contem[0];
  return null;
}

/**
 * Dobra acentos e caixa PRESERVANDO o comprimento (1 code point → 1 code point), para que os
 * offsets da busca batam de volta no texto ORIGINAL. (O `normalize("NFD")+strip` clássico muda o
 * comprimento — aqui não pode, senão o recorte do contexto sai deslocado.)
 */
function dobrarPreservando(texto: string): string {
  let saida = "";
  for (const ch of texto) {
    const semAcento = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
    saida += (semAcento.length === 1 ? semAcento : ch).toLowerCase();
  }
  return saida;
}

/** Recorta uma janela de contexto à volta de uma ocorrência (uma linha, sem quebras). */
function janelaContexto(texto: string, pos: number, len: number, raio = 60): string {
  const ini = Math.max(0, pos - raio);
  const fim = Math.min(texto.length, pos + len + raio);
  return texto.slice(ini, fim).replace(/\s+/g, " ").trim();
}

/**
 * O GREP do artefato — acha ONDE um termo aparece, com o contexto e a seção de cada ocorrência.
 *
 * O terceiro órgão do «livro é uma codebase»: depois do mapa (`ler_estrutura`) e de abrir um
 * capítulo (`ler_secao`), este é o «procurar no projeto». Resolve o caso que a navegação por
 * seções não cobre — achar uma menção enterrada, inclusive num texto SEM títulos. Busca sem
 * diferença de acento/maiúsculas, mas devolve o contexto na grafia ORIGINAL (para ela poder
 * copiar o `trecho_antigo` exato depois). Reaproveita `lerDocumento` — nada de Firestore novo.
 */
export async function buscarNoDocumento(
  deps: Pick<DependenciasDocumentos, "lerDocumento">,
  args: Record<string, unknown>,
): Promise<string> {
  const id = String(args.id ?? "").trim();
  const termo = String(args.termo ?? args.texto ?? "").trim();
  if (!id) {
    return "ERRO: preciso do id do artefato. Se não souber, chame listar_artefatos primeiro.";
  }
  if (!termo) {
    return "ERRO: preciso do `termo` a procurar no artefato (uma palavra ou expressão).";
  }
  try {
    const doc = await deps.lerDocumento(id);
    if (!doc) {
      return `ERRO: não achei artefato com id ${id}. Confira em listar_artefatos.`;
    }
    const corpo = doc.conteudo;
    const base = dobrarPreservando(corpo);
    const alvo = dobrarPreservando(termo);

    const posicoes: number[] = [];
    let idx = base.indexOf(alvo);
    while (idx !== -1 && posicoes.length < 200) {
      posicoes.push(idx);
      idx = base.indexOf(alvo, idx + alvo.length);
    }
    if (posicoes.length === 0) {
      return (
        `Procurei «${termo}» no artefato «${doc.titulo}» (id: ${doc.id}) e não achei nenhuma ocorrência. ` +
        `Confira a grafia, ou tente uma palavra-chave mais curta.`
      );
    }

    const secoes = mapearSecoes(corpo);
    const MAX = 8;
    const linhas = posicoes.slice(0, MAX).map((pos, i) => {
      const sec = secoes.find((s) => pos >= s.inicio && pos < s.fim);
      const onde = sec ? `seção ${sec.numero} «${sec.titulo}»` : "(abertura)";
      return `${i + 1}. ${onde}: …${janelaContexto(corpo, pos, termo.length)}…`;
    });
    const extra =
      posicoes.length > MAX ? `\n(+${posicoes.length - MAX} outras — refine o termo se precisar de menos.)` : "";

    return (
      `Procurei «${termo}» no artefato «${doc.titulo}» (id: ${doc.id}): ${posicoes.length} ocorrência(s).\n` +
      linhas.join("\n") +
      extra +
      `\n\nPara abrir onde está, use ler_secao com o número da seção; para trocar, ` +
      `editar_trecho_artefato copiando o trecho EXATO à volta (a frase inteira, para ficar único).`
    );
  } catch (error) {
    return `ERRO ao procurar no artefato: ${error instanceof Error ? error.message : String(error)}`;
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
    const corpo = temConteudo ? String(args.conteudo) : "";
    const base =
      `Artefato «${resultado.titulo}» atualizado na estante (id: ${resultado.id}). ` +
      `O cartão nesta conversa já mostra a versão nova. ` +
      `Conte ao Ethan, na sua voz, o que você mudou — não repita o texto inteiro aqui.`;
    if (!corpo.trim()) return base;
    return base + anexoAuditoriaPosEdit(resultado.titulo, resultado.id, corpo);
  } catch (error) {
    return `ERRO ao editar artefato: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * A BÍBLIA do artefato — fatos fixos (metadado, fora do corpo).
 * CRUD pontual: adicionar | editar | apagar | substituir | limpar | ler.
 * Prefira adicionar/editar/apagar — full-replace costuma ser abandonado no loop.
 */
function linhasCanone(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);
}

function formatarCanoneNumerado(linhas: string[]): string {
  if (linhas.length === 0) return "(cânone vazio)";
  return linhas.map((l, i) => `${i + 1}. ${l}`).join("\n");
}

export async function anotarCanone(
  deps: Pick<DependenciasDocumentos, "editarDocumento" | "lerDocumento">,
  args: Record<string, unknown>,
): Promise<string> {
  const id = String(args.id ?? "").trim();
  if (!id) {
    return "ERRO: preciso do id do artefato. Chame listar_artefatos se não souber.";
  }

  const acaoRaw = String(args.acao ?? "").trim().toLowerCase();
  const temNotas = typeof args.notas === "string";
  const acao =
    acaoRaw ||
    (temNotas ? "substituir" : "") ||
    (typeof args.fato === "string" && String(args.fato).trim() ? "adicionar" : "");

  if (!acao) {
    return (
      "ERRO: diga a `acao` — adicionar | editar | apagar | substituir | limpar | ler. " +
      "Ex.: adicionar + `fato`; apagar + `numero` ou `fato`; editar + `numero`/`fato_antigo` + `fato_novo`; " +
      "substituir + `notas` (lista completa)."
    );
  }

  try {
    if (
      !deps.lerDocumento &&
      (acao === "adicionar" || acao === "editar" || acao === "apagar" || acao === "ler")
    ) {
      return "ERRO FATAL: lerDocumento não disponível pra manipular o cânone.";
    }

    const doc = deps.lerDocumento ? await deps.lerDocumento(id) : null;

    if (!doc && (acao === "adicionar" || acao === "editar" || acao === "apagar" || acao === "ler")) {
      return `ERRO: não achei artefato com id ${id}. Confira em listar_artefatos.`;
    }

    const titulo = doc?.titulo ?? id;
    let linhas = linhasCanone(doc?.canone ?? "");

    if (acao === "ler") {
      return (
        `CÂNONE de «${titulo}» (${linhas.length} fato${linhas.length === 1 ? "" : "s"}):\n` +
        `${formatarCanoneNumerado(linhas)}\n` +
        `Pra mudar: anotar_canone com acao adicionar/editar/apagar/substituir/limpar.`
      );
    }

    if (acao === "limpar") {
      const resultado = await deps.editarDocumento({ id, canone: "" });
      if (!resultado) return `ERRO: não achei artefato com id ${id}.`;
      return `Cânone de «${resultado.titulo}» limpo (zerado).`;
    }

    if (acao === "substituir") {
      if (!temNotas) {
        return "ERRO: `substituir` precisa de `notas` (lista completa; string vazia = limpar).";
      }
      const notas = String(args.notas).trim();
      const resultado = await deps.editarDocumento({ id, canone: notas });
      if (!resultado) return `ERRO: não achei artefato com id ${id}.`;
      const n = linhasCanone(notas).length;
      return (
        `Cânone de «${resultado.titulo}» substituído (${n} fato${n === 1 ? "" : "s"}).\n` +
        `${formatarCanoneNumerado(linhasCanone(notas))}`
      );
    }

    if (acao === "adicionar") {
      const fato = String(args.fato ?? args.notas ?? "").trim();
      if (!fato) return "ERRO: `adicionar` precisa de `fato` (uma linha).";
      if (linhas.some((l) => l.toLowerCase() === fato.toLowerCase())) {
        return (
          `Esse fato já está no cânone de «${titulo}» — nada mudou.\n` +
          `${formatarCanoneNumerado(linhas)}`
        );
      }
      linhas = [...linhas, fato];
      const resultado = await deps.editarDocumento({ id, canone: linhas.join("\n") });
      if (!resultado) return `ERRO: não achei artefato com id ${id}.`;
      return (
        `Fato adicionado ao cânone de «${resultado.titulo}».\n` +
        `${formatarCanoneNumerado(linhas)}`
      );
    }

    if (acao === "editar") {
      const fatoNovo = String(args.fato_novo ?? args.fatoNovo ?? "").trim();
      if (!fatoNovo) return "ERRO: `editar` precisa de `fato_novo`.";
      const numero = Number(args.numero ?? args.n ?? NaN);
      const fatoAntigo = String(args.fato_antigo ?? args.fatoAntigo ?? args.fato ?? "").trim();
      let idx = -1;
      if (Number.isFinite(numero) && numero >= 1 && numero <= linhas.length) {
        idx = Math.floor(numero) - 1;
      } else if (fatoAntigo) {
        idx = linhas.findIndex(
          (l) =>
            l.toLowerCase() === fatoAntigo.toLowerCase() ||
            l.toLowerCase().includes(fatoAntigo.toLowerCase()),
        );
      }
      if (idx < 0) {
        return (
          `ERRO: não achei o fato pra editar. Use \`numero\` (1…${linhas.length}) ou \`fato_antigo\`.\n` +
          `${formatarCanoneNumerado(linhas)}`
        );
      }
      const antes = linhas[idx]!;
      linhas = linhas.map((l, i) => (i === idx ? fatoNovo : l));
      const resultado = await deps.editarDocumento({ id, canone: linhas.join("\n") });
      if (!resultado) return `ERRO: não achei artefato com id ${id}.`;
      return (
        `Fato ${idx + 1} editado em «${resultado.titulo}»:\n` +
        `antes: ${antes}\n` +
        `agora: ${fatoNovo}\n` +
        `${formatarCanoneNumerado(linhas)}`
      );
    }

    if (acao === "apagar") {
      const numero = Number(args.numero ?? args.n ?? NaN);
      const fato = String(args.fato ?? args.fato_antigo ?? args.fatoAntigo ?? "").trim();
      let idx = -1;
      if (Number.isFinite(numero) && numero >= 1 && numero <= linhas.length) {
        idx = Math.floor(numero) - 1;
      } else if (fato) {
        idx = linhas.findIndex(
          (l) =>
            l.toLowerCase() === fato.toLowerCase() ||
            l.toLowerCase().includes(fato.toLowerCase()),
        );
      }
      if (idx < 0) {
        return (
          `ERRO: não achei o fato pra apagar. Use \`numero\` ou \`fato\`.\n` +
          `${formatarCanoneNumerado(linhas)}`
        );
      }
      const removido = linhas[idx]!;
      linhas = linhas.filter((_, i) => i !== idx);
      const resultado = await deps.editarDocumento({ id, canone: linhas.join("\n") });
      if (!resultado) return `ERRO: não achei artefato com id ${id}.`;
      return (
        `Fato removido do cânone de «${resultado.titulo}»: ${removido}\n` +
        `${formatarCanoneNumerado(linhas)}`
      );
    }

    return (
      `ERRO: acao «${acao}» desconhecida. Use adicionar | editar | apagar | substituir | limpar | ler.`
    );
  } catch (error) {
    return `ERRO ao anotar o cânone: ${error instanceof Error ? error.message : String(error)}`;
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
      `Conte ao Ethan, na sua voz, o que você mudou — não repita o texto inteiro aqui.` +
      anexoAuditoriaPosEdit(resultado.titulo, resultado.id, novoCorpo)
    );
  } catch (error) {
    return `ERRO ao editar trecho: ${error instanceof Error ? error.message : String(error)}`;
  }
}

const TIPOS_BLOCO_OK = new Set<TipoBlocoArtefato>([
  "paragraph",
  "heading",
  "bullet",
  "numbered",
  "todo",
  "quote",
  "code",
  "divider",
  "callout",
]);

function parseBlocoArg(raw: unknown): BlocoArtefato | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const type = String(o.type ?? "paragraph") as TipoBlocoArtefato;
  if (!TIPOS_BLOCO_OK.has(type)) return null;
  const text = typeof o.text === "string" ? o.text : String(o.text ?? "");
  const propsIn = o.props && typeof o.props === "object" ? (o.props as PropsBlocoArtefato) : undefined;
  const props: PropsBlocoArtefato | undefined = propsIn
    ? {
        level: propsIn.level === 1 || propsIn.level === 2 || propsIn.level === 3 ? propsIn.level : undefined,
        checked: typeof propsIn.checked === "boolean" ? propsIn.checked : undefined,
        language: typeof propsIn.language === "string" ? propsIn.language : undefined,
      }
    : type === "heading"
      ? { level: 2 }
      : undefined;
  return {
    id: typeof o.id === "string" && o.id.trim() ? o.id.trim() : novoIdBloco(),
    type,
    props,
    text,
  };
}

/**
 * Lê UM bloco pelo id — o «abrir arquivo» da página de blocos.
 */
export async function lerBlocoDocumento(
  deps: Pick<DependenciasDocumentos, "lerDocumento">,
  args: Record<string, unknown>,
): Promise<string> {
  const id = String(args.id ?? "").trim();
  const blocoId = String(args.bloco_id ?? args.blocoId ?? "").trim();
  if (!id) return "ERRO: preciso do id do artefato.";
  if (!blocoId) return "ERRO: preciso do `bloco_id` (vem de ler_estrutura / listagem de blocos).";
  try {
    const doc = await deps.lerDocumento(id);
    if (!doc) return `ERRO: não achei artefato com id ${id}.`;
    const { blocos } = corpoComBlocos(doc);
    const b = blocos.find((x) => x.id === blocoId);
    if (!b) {
      return (
        `ERRO: não achei bloco ${blocoId} em «${doc.titulo}». ` +
        `Chame ler_estrutura pra ver os blocoId dos headings.`
      );
    }
    return (
      `Artefato «${doc.titulo}» (id: ${doc.id}) — bloco ${b.id} (${b.type}):\n` +
      `${JSON.stringify({ type: b.type, props: b.props ?? {}, text: b.text }, null, 2)}\n\n` +
      `Pra mudar: editar_bloco_artefato. Pra acrescentar depois: inserir_blocos com after_id=${b.id}.`
    );
  } catch (error) {
    return `ERRO ao ler bloco: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Resolve âncora humana (número/título da seção) → id do ÚLTIMO bloco dessa seção.
 * Assim a continuação entra no fim do capítulo, não logo após o heading.
 */
function resolverAfterSecao(
  blocos: BlocoArtefato[],
  conteudo: string,
  alvo: string,
): { afterId: string; rotulo: string } | { erro: string } {
  const secoes = mapearSecoes(conteudo);
  if (secoes.length === 0) {
    return {
      erro:
        "Este artefato não tem seções (## ). Omita after_secao pra acrescentar no fim, " +
        "ou use after_id de um bloco de ler_estrutura.",
    };
  }
  const secao = acharSecao(secoes, alvo);
  if (!secao) {
    const indice = secoes.map((s) => `${s.numero}. ${s.titulo}`).join("\n");
    return {
      erro: `Não achei a seção «${alvo}». Índice:\n${indice}`,
    };
  }
  const headings = blocos.filter((b) => b.type === "heading");
  const heading = headings[secao.numero - 1];
  if (!heading) {
    return { erro: `Seção ${secao.numero} «${secao.titulo}» sem heading correspondente nos blocos.` };
  }
  const startIdx = blocos.findIndex((b) => b.id === heading.id);
  if (startIdx < 0) return { erro: "Heading da seção não encontrado na lista de blocos." };
  let endIdx = blocos.length - 1;
  for (let i = startIdx + 1; i < blocos.length; i++) {
    if (blocos[i]!.type === "heading") {
      endIdx = i - 1;
      break;
    }
  }
  return {
    afterId: blocos[endIdx]!.id,
    rotulo: `seção ${secao.numero} «${secao.titulo}»`,
  };
}

/**
 * CONTINUAÇÃO — preferir `markdown` + `after_secao` (número/título).
 * `after_id` / `blocos` tipados ficam como legado avançado.
 */
export async function inserirBlocosDocumento(
  deps: Pick<DependenciasDocumentos, "lerDocumento" | "editarDocumento">,
  args: Record<string, unknown>,
): Promise<string> {
  const id = String(args.id ?? "").trim();
  const afterIdRaw = args.after_id ?? args.afterId ?? args.depois_de ?? null;
  let afterId =
    afterIdRaw === null || afterIdRaw === undefined || afterIdRaw === ""
      ? null
      : String(afterIdRaw).trim();
  const afterSecaoRaw = args.after_secao ?? args.afterSecao ?? null;
  const afterSecao =
    afterSecaoRaw === null || afterSecaoRaw === undefined || afterSecaoRaw === ""
      ? ""
      : String(afterSecaoRaw).trim();

  if (!id) return "ERRO: preciso do id do artefato.";

  const listaRaw = args.blocos;
  let novos: BlocoArtefato[] = [];
  if (typeof args.markdown === "string" && args.markdown.trim()) {
    novos = mdToBlocos(args.markdown);
  } else if (typeof args.conteudo === "string" && args.conteudo.trim()) {
    novos = mdToBlocos(args.conteudo);
  } else if (Array.isArray(listaRaw)) {
    novos = listaRaw.map(parseBlocoArg).filter((b): b is BlocoArtefato => b != null);
  }

  if (novos.length === 0) {
    return "ERRO: passe `markdown` com o trecho novo a inserir (preferido).";
  }

  try {
    const doc = await deps.lerDocumento(id);
    if (!doc) return `ERRO: não achei artefato com id ${id}.`;
    const { blocos, conteudo } = corpoComBlocos(doc);

    let ancoraHumana = "";
    // Preferência: after_secao (humano) > after_id (legado).
    if (afterSecao && !/^fim$/i.test(afterSecao)) {
      const resolvido = resolverAfterSecao(blocos, conteudo, afterSecao);
      if ("erro" in resolvido) {
        return `ERRO: ${resolvido.erro}`;
      }
      afterId = resolvido.afterId;
      ancoraHumana = resolvido.rotulo;
    } else if (afterId && !blocos.some((b) => b.id === afterId)) {
      const ultimos = blocos
        .filter((b) => b.type === "heading")
        .slice(-5)
        .map((b) => `${b.id} «${b.text}»`)
        .join("; ");
      return (
        `ERRO: after_id «${afterId}» não existe neste artefato. ` +
        `Prefira after_secao com o número/título (ex.: 3 ou «Capítulo 2»). ` +
        `Headings recentes: ${ultimos || "(nenhum)"}.`
      );
    }

    const next = inserirBlocosApos(blocos, afterId, novos);
    const md = blocosToMd(next);
    const resultado = await deps.editarDocumento({ id, blocos: next, conteudo: md });
    if (!resultado) return `ERRO: não achei artefato com id ${id}.`;
    const onde =
      ancoraHumana ||
      (afterId ? `depois de ${afterId}` : "no fim");
    return (
      `Inseridos ${novos.length} bloco(s) no artefato «${resultado.titulo}» (id: ${resultado.id}) ` +
      `${onde}. O cartão já mostra a versão nova. Conte ao Ethan o que acrescentou — não repita o livro inteiro.` +
      anexoAuditoriaPosEdit(resultado.titulo, resultado.id, md, next)
    );
  } catch (error) {
    return `ERRO ao inserir blocos: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Edita UM bloco por id (texto/tipo/props) — sem tocar nos outros.
 * Nome da tool: `editar_bloco_artefato` (evita colisão com `editar_bloco` da rotina).
 */
export async function editarBlocoDocumento(
  deps: Pick<DependenciasDocumentos, "lerDocumento" | "editarDocumento">,
  args: Record<string, unknown>,
): Promise<string> {
  const id = String(args.id ?? "").trim();
  const blocoId = String(args.bloco_id ?? args.blocoId ?? "").trim();
  if (!id) return "ERRO: preciso do id do artefato.";
  if (!blocoId) return "ERRO: preciso do `bloco_id`.";

  const patch: {
    text?: string;
    type?: TipoBlocoArtefato;
    props?: PropsBlocoArtefato;
  } = {};
  if (typeof args.text === "string") patch.text = args.text;
  if (typeof args.type === "string" && TIPOS_BLOCO_OK.has(args.type as TipoBlocoArtefato)) {
    patch.type = args.type as TipoBlocoArtefato;
  }
  if (args.props && typeof args.props === "object") {
    patch.props = args.props as PropsBlocoArtefato;
  }
  if (typeof args.checked === "boolean") {
    patch.props = { ...patch.props, checked: args.checked };
  }
  if (args.level === 1 || args.level === 2 || args.level === 3) {
    patch.props = { ...patch.props, level: args.level };
  }

  if (patch.text === undefined && patch.type === undefined && patch.props === undefined) {
    return "ERRO: nada pra mudar — passe `text` e/ou `type`/`props`.";
  }

  try {
    const doc = await deps.lerDocumento(id);
    if (!doc) return `ERRO: não achei artefato com id ${id}.`;
    const { blocos } = corpoComBlocos(doc);
    const next = editarBlocoNaLista(blocos, blocoId, patch);
    if (!next) {
      return `ERRO: não achei bloco ${blocoId} em «${doc.titulo}». Use ler_estrutura.`;
    }
    const resultado = await deps.editarDocumento({
      id,
      blocos: next,
      conteudo: blocosToMd(next),
    });
    if (!resultado) return `ERRO: não achei artefato com id ${id}.`;
    const md = blocosToMd(next);
    return (
      `Bloco ${blocoId} atualizado no artefato «${resultado.titulo}» (id: ${resultado.id}). ` +
      `Conte ao Ethan o que mudou — sem repetir o texto inteiro.` +
      anexoAuditoriaPosEdit(resultado.titulo, resultado.id, md, next)
    );
  } catch (error) {
    return `ERRO ao editar bloco: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export { SCHEMA_ARTEFATO_BLOCOS, blocosToMd, mdToBlocos };
