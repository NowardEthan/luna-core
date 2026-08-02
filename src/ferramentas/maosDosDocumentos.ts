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
  /** A «bíblia» do artefato — os fatos fixos (nomes, idades, relações). `""` quando ainda não há. */
  canone?: string;
};

export type DependenciasDocumentos = {
  criarDocumento: (dados: {
    titulo: string;
    conteudo: string;
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
    /** A bíblia dos fatos fixos — metadado, gravado sem tocar no corpo nem gerar versão. */
    canone?: string;
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

/** Conta palavras de forma tosca-mas-suficiente (para dar a NOÇÃO de tamanho de uma seção). */
function contarPalavras(texto: string): number {
  const t = texto.trim();
  return t ? t.split(/\s+/).length : 0;
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
    const secoes = mapearSecoes(doc.conteudo);
    const totalPalavras = contarPalavras(doc.conteudo);
    if (secoes.length === 0) {
      return (
        `O artefato «${doc.titulo}» (id: ${doc.id}) não tem seções — nenhum título (## ) pra dividir. ` +
        `É um texto corrido de ~${totalPalavras} palavras; para o ler use ler_artefato.`
      );
    }
    const linhas = secoes
      .map((s) => `${s.numero}. ${"  ".repeat(Math.max(0, s.nivel - 1))}${s.titulo}  (~${s.palavras} palavras)`)
      .join("\n");
    return (
      `Estrutura do artefato «${doc.titulo}» (id: ${doc.id}) — o índice, SEM o corpo ` +
      `(${secoes.length} seções, ~${totalPalavras} palavras no total):\n${linhas}\n\n` +
      `Para ler UMA seção sem carregar o resto, use ler_secao com este id e o número (ou o título) ` +
      `da seção. Assim você só puxa o pedaço que precisa — não o artefato inteiro.`
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

    const texto = doc.conteudo.slice(secao.inicio, secao.fim).trim();
    return (
      `Artefato «${doc.titulo}» (id: ${doc.id}) — seção ${secao.numero} «${secao.titulo}» ` +
      `(~${secao.palavras} palavras), só este pedaço:\n\n${texto}\n\n` +
      `Para mudar um ponto AQUI, use editar_trecho_artefato com este id e o trecho copiado tal e qual. ` +
      `Para ver outra seção, chame ler_secao de novo; para o mapa todo, ler_estrutura.`
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
 * A BÍBLIA do artefato — a memória fixa que impede a contradição entre trechos.
 *
 * O problema: num texto grande a Luna não vê o livro todo (é assim que ela não satura). Mas então,
 * ao escrever o capítulo 8, ela pode «esquecer» que a personagem se chama Marina e chamá-la de
 * Mariana. É o mesmo furo que um agente de código teria sem um `AGENTS.md` — as regras fixas que
 * ele relê SEMPRE antes de mexer.
 *
 * `anotar_canone` guarda esses fatos fixos (nomes, idades, relações, decisões de mundo) num
 * METADADO à parte do corpo — logo NÃO vaza na exportação nem na contagem de palavras — e a
 * pré-carga injeta o cânone no contexto dela a CADA turno naquele artefato (é curto, cabe inteiro
 * mesmo num livro). Assim os fatos estão sempre à frente dela quando vai escrever ou editar.
 *
 * Semântica de ESTADO COMPLETO (igual a editar_documento reescreve o corpo inteiro): a Luna já tem
 * o cânone atual no contexto; ela passa a lista COMPLETA e atualizada — adiciona o fato novo,
 * corrige/remove o que mudou — e isto substitui o cânone. Reaproveita a dep `editarDocumento`
 * (grava só o campo `canone`, sem tocar no corpo nem gerar versão) — nada de Firestore novo.
 */
export async function anotarCanone(
  deps: Pick<DependenciasDocumentos, "editarDocumento">,
  args: Record<string, unknown>,
): Promise<string> {
  const id = String(args.id ?? "").trim();
  const temNotas = typeof args.notas === "string";
  const notas = temNotas ? String(args.notas).trim() : "";

  if (!id) {
    return "ERRO: preciso do id do artefato. Chame listar_artefatos se não souber.";
  }
  if (!temNotas) {
    return (
      "ERRO: preciso das `notas` — a lista COMPLETA e atualizada dos fatos fixos do artefato " +
      "(nomes, idades, relações, decisões de mundo). Você já tem o cânone atual no contexto: " +
      "reescreva-o inteiro com o que mudou. Para limpar o cânone, passe `notas` vazio."
    );
  }

  try {
    const resultado = await deps.editarDocumento({ id, canone: notas });
    if (!resultado) {
      return `ERRO: não achei artefato com id ${id}. Confira em listar_artefatos.`;
    }
    return (
      `Cânone do artefato «${resultado.titulo}» atualizado (id: ${resultado.id}). ` +
      `Esses fatos vão aparecer à sua frente sempre que mexer neste artefato — respeite-os para ` +
      `não se contradizer. Conte ao Ethan, na sua voz, o que você fixou — sem repetir a lista toda.`
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
      `Conte ao Ethan, na sua voz, o que você mudou — não repita o texto inteiro aqui.`
    );
  } catch (error) {
    return `ERRO ao editar trecho: ${error instanceof Error ? error.message : String(error)}`;
  }
}
