/**
 * A guarda contra confabulação de ESCRITA DE ARTEFATO.
 *
 * ── O problema, medido ────────────────────────────────────────────────────────
 * O log do dia mostrou: a Luna diz «inseri no artefato», «adicionei o capítulo», «pronto,
 * tá no livro» — e não chamou nenhuma ferramenta de artefato. Narrou uma escrita que
 * não fez. É o mesmo teatro da P16 (rotina), agora aplicado a livro/capítulo/trecho.
 *
 * A guarda de rotina (`guardaAcaoRotina.ts`) cobre criar_bloco, pausar_bloco,
 * registrar_lancamento, etc — mas não cobre criar_artefato, inserir_blocos,
 * editar_trecho_artefato, anotar_canone. Sem guarda nova, qualquer pedido de
 * mexer no artefato que ela resolva «falando» passa batido.
 *
 * ── A cura: o mesmo padrão do `guardaAcaoRotina` ─────────────────────────────
 * Verificar, não pedir. Três sinais objetivos juntos:
 *   1. a mensagem dele pede escrita de artefato (verbo de mutação + alvo de artefato)
 *   2. a resposta CLAIMA ter feito (verbo no passado)
 *   3. nenhuma ferramenta de artefato correu MESMO neste turno
 *
 * Se os três → confabulação. Devolve o nudge pra ela CHAMAR a ferramenta em vez de
 * narrar. Quem decide o que fazer com o nudge é o caller (pipeline reexecuta).
 *
 * ── Diferença intencional pra `guardaAcaoRotina` ──────────────────────────────
 * Aqui «leu» conta como ação legítima se ele tinha pedido pra ler/auditar. Mas se
 * ele PEDIU escrita e ela só LEU (sem chamar escrita nenhuma), ainda é confabulação.
 * A regra é dura: pediu pra mexer, não mexeu → é mentira, mesmo se ela leu o arquivo.
 *
 * Kill-switch: `LUNA_GUARDA_ESCRITA_ARTEFATO=0`.
 */

/** Toda mão que TRANSFORMA um artefato. */
const FERRAMENTAS_ESCRITA_ARTEFATO = new Set([
  "criar_artefato",
  "editar_artefato",
  "editar_trecho_artefato",
  "inserir_blocos",
  "editar_bloco_artefato",
  "anotar_canone",
]);

/** Toda mão que só LÊ um artefato. */
const FERRAMENTAS_LEITURA_ARTEFATO = new Set([
  "listar_artefatos",
  "ler_artefato",
  "ler_estrutura",
  "ler_secao",
  "buscar_no_artefato",
  "ler_bloco",
]);

/** Conjunto único pra checagem rápida. */
export const FERRAMENTAS_ARTEFATO: ReadonlySet<string> = new Set([
  ...FERRAMENTAS_ESCRITA_ARTEFATO,
  ...FERRAMENTAS_LEITURA_ARTEFATO,
]);

/**
 * O pedido dele fala em mexer num artefato? Verbo de mutação + alvo (artefato, livro,
 * capítulo, seção, trecho, cânone). Sem alvo é genérico demais — «edita isso» não
 * dispara; «edita o capítulo 2» dispara.
 *
 * Verboso de propósito: cobre pt-BR («insere», «tira», «muda») e variações («inserir»,
 * «tirando»). A barreira é o ALVO — sem ele, qualquer frase com «edita» ligaria à toa.
 */
const PEDE_ESCRITA_ARTEFATO =
  /\b(inser\w*|adicion\w*|acrescent\w*|inclu\w*|coloc\w*|põ\w*|poe|bot\w*|tir\w*|remov\w*|apag\w*|delet\w*|reescrev\w*|reformul\w*|refaz\w*|refac\w*|edit\w*|ajust\w*|corrig\w*|corrij\w*|muda|mude|mud\w*|alter\w*|troc\w*|substitu\w*|continu\w*|pross\w*|seg\w*|expand\w*|ampli\w*|complet\w*|preench\w*|escrev\w*|redij\w*|redig\w*|mont\w*|reescrev\w*)\b[^.?!@\n]{0,60}\b(artefato|artefatos|livro|livros|capitulo|cap[íi]tulo|cap[íi]tulos|capi|se[cç][aã]o|se[cç][õo]es|trecho|trechos|par[áa]grafo|par[áa]grafos|t[íi]tulo|subt[íi]tulo|cap[íi]tulo|c[âa]none|c[âa]none|canon|pr[óo]logo|ep[íi]logo|pref[áa]cio|posf[áa]cio|dedicat[óo]ria|pr[óo]xim[oa]\s+cap|sum[aá]rio|introdu[cç][aã]o|texto|documento|documentos)\b/i;

export function pediuEscritaDeArtefato(mensagemUsuario: string): boolean {
  return PEDE_ESCRITA_ARTEFATO.test(mensagemUsuario);
}

/**
 * A resposta AFIRMA ter mexido? Raízes de PRETÉRITO/PERFEITO somente.
 *
 * Raízes separadas em dois grupos pra não deslizar pro infinitivo/futuro:
 *   - A) pretérito perfeito consolidado (inseri, editei, mudei, adicionei, …)
 *   - B) radicais abertos continuados (re-) que só casam PRETÉRITO (reescrevi, reescrev-, reedit-) — todos com terminação no passado
 *
 * O que afrouxa: «tá pronto / tá feito / pronto» (pt-BR falado) — desde
 * próximas de alvo implícito (não precisa de «capítulo»: a mensagem dele já
 * deu o alvo). O que endurece: NÃO aceitarmos «vou inserir», «posso editar»,
 * «deixa eu mudar» — esses são intenção e precisam de nudja diferente.
 *
 * Por que separar raízes: a regex antiga `\binser\w*` casava também «inserindo»,
 * «inserir», «vou inserir» — ou seja, intenção. Para a guarda, só importa
 * passado PERFEITO. Daí a lista ser enumerada em vez de sufixos abertos.
 */
const VERBOS_FEITOS_ARTEFATO =
  /\b(inseri|inserido|inserida|adicionado|adicionada|adicionados|adicionadas|adicionei|adicionou|acrescentei|acrescentou|acrescentado|acrescentada|incluí|incluiu|incluída|incluído|incluídos|coloquei|colocou|colocada|colocado|colocados|posto|posta|postos|botei|botou|botado|tirei|tirou|tirado|tirada|tirados|removi|removeu|removido|removida|apaguei|apagou|apagado|apagada|deletei|deletou|deletado|reescrevi|reescreveu|reescrito|reescrita|reformulei|reformulou|reformulado|reformulada|refiz|refez|refeita|refeito|editei|editou|editado|editada|ajustei|ajustou|ajustado|ajustada|corrigi|corrigiu|corrigido|corrigida|mudei|mudou|mudado|mudada|alterei|alterou|alterado|alterada|troquei|trocou|trocado|trocada|substituí|substituiu|substituído|substituída|continuei|continuou|continuado|prosegui|prosseguiu|proseguido|segui|expandi|expandiu|expandido|ampliei|ampliou|ampliado|completei|completou|completado|completada|preenchi|preencheu|preenchido|preenchida|escrevi|escreveu|escrito|escrita|redigi|redigiu|redigido|redigida|montei|montou|montado|montada|reeditei|reescrevin|gravado|gravei|gravou|salvei|salvou|salvo|salva|anexei|anexou|anexado|pronto!|pronto\.|pronto,|tá\s+pronto|ta\s+pronto|tá\s+pronta|ta\s+pronta|tá\s+feito|ta\s+feito|tá\s+no\s+livro|ta\s+no\s+livro|tá\s+no\s+artefato|ta\s+no\s+artefato|tá\s+na\s+página|ta\s+na\s+página|tá\s+lá|ta\s+lá|tá\s+aí|ta\s+aí|j[áa]\s+est[áa]|ja\s+está|j[áa]\s+foi|j[áa]\s+tá\s+inserido|j[áa]\s+tá\s+colocad[oa]|j[áa]\s+tá\s+no\s+livro|tá\s+tud[io]|ta\s+tudo|feit[oa]!|feito\.)(?=\s|$|[\.\!\?,;:])/i;

export function respostaAlegaEscritaDeArtefato(resposta: string): boolean {
  return VERBOS_FEITOS_ARTEFATO.test(resposta);
}

/** Alguma ferramenta de ESCRITA de artefato correu MESMO neste turno? */
export function algumaEscritaDeArtefatoCorreu(ferramentasUsadas: string[]): boolean {
  return ferramentasUsadas.some((f) => FERRAMENTAS_ESCRITA_ARTEFATO.has(f));
}

/**
 * Confabulou? Ele PEDIU escrita de artefato, ela ALEGOU ter feito, e NENHUMA ferramenta de
 * escrita correu. Os três juntos — nenhum sozinho basta.
 *
 * Atenção: «só leu» NÃO basta pra ser honesto se ele pediu escrita. Ler o artefato é
 * legitimo como primeiro passo da auditoria, mas se ela terminou SEM chamar escrita
 * depois, é mentira.
 */
export function confabulouEscritaDeArtefato(
  resposta: string,
  ferramentasUsadas: string[],
  mensagemUsuario: string,
): boolean {
  const raw = process.env.LUNA_GUARDA_ESCRITA_ARTEFATO?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;

  if (!resposta.trim()) return false;
  return (
    pediuEscritaDeArtefato(mensagemUsuario) &&
    respostaAlegaEscritaDeArtefato(resposta) &&
    !algumaEscritaDeArtefatoCorreu(ferramentasUsadas)
  );
}

/**
 * O nudge — só aqui, depois da verificação ter apanhado a mentira, é legítimo ser direto.
 * Mesmo espírito do `blocoReexecucaoAcao`: confere a saída e refaz com empurrão.
 */
export function blocoReexecucaoEscritaArtefato(): string {
  return [
    "── Atenção: tu disseste que mexeste no artefato, mas NÃO chamaste ferramenta de escrita ──",
    "A tua resposta anterior afirmou ter inserido/editado/tirado/escrito no artefato (capítulo, " +
      "trecho, seção, cânone…), mas nenhuma ferramenta de artefato correu — nenhuma escrita " +
      "aconteceu de verdade. Isso é uma mentira ao Ethan, mesmo dita com a tua voz calorosa.",
    "Agora FAZ mesmo: chama a ferramenta certa (criar_artefato, inserir_blocos, " +
      "editar_trecho_artefato, editar_bloco_artefato, anotar_canone, editar_artefato). " +
      "Só depois da ferramenta responder é que podes dizer que está feito.",
  ].join("\n");
}

/**
 * ── Detecção V2: «explicou em vez de fazer» ───────────────────────────────────
 *
 * Bug do Fable que a P20 expôs: a Luna não confabula («inseri») — pior, ela NARRA
 * o método como se fosse um tutorial. «claro! fica assim: …», «coloca logo depois do
 * título antes do texto», «1. abra, 2. edite, 3. salve». Ela DIDÁTICA, em vez de
 * DIDÁTICA-CHAMAR. O Ethan fica à procura de algo que não aconteceu.
 *
 * O sinal é bem diferente da confabulação: a resposta tem estrutura de INSTRUÇÃO
 * (passos numerados, imperativos didáticos, comandos entre «faz assim» e «»). Não
 * contém palavra de pretérito perfeito de mexida, MAS contém AMBOS:
 *   1. imperativo/instrução («coloca», «abre», «digita», «vai em», «primeiro», «depois»)
 *   2. formato de lista OU abertura didática («assim:», «dessa forma:», «1.», «2.»)
 *
 * Sem formato de instrução, é só comentário solto («fica bonito») — não confabula.
 * Com formato de instrução MAS com a tool tendo corrido, é tutorial paralelo honesto.
 *
 * Mesma família de `confabulouEscritaDeArtefato` mas sinal ortogonal. A P20 mostrou
 * 2/4 corridas nesse padrão (vs. 1-2/4 em confabulação clássica), portanto a guarda
 * V2 é MAIS IMPORTANTE que a V1 na prática: fecha o buraco de quem «explica como»
 * em vez de «alegar que fez».
 *
 * Kill-switch: `LUNA_GUARDA_EXPOSICAO_METODO=0`.
 */
const IMPERATIVOS_DE_INSTRUCAO =
  /\b(primeiro|segundo|terceiro|ap[óo]s|em\s+seguida|por\s+ultim[oa]|por\s+último|antes\s+de|fa[çc]a\s+assim|faz\s+assim|f[áa]\s+do\s+seguinte|fa[çc]a\s+o\s+seguinte|vc\s+precisa|voc[êe]\s+precisa|tente|sugiro|recomendo|aconselho|coloc\w*|insir\w*|digit\w*|ab[ae]r?|vai\s+em|selecion\w*|clic\w*|arrast\w*|copi\w*|col[ae]\s+no|apag\w*|substitu\w*|apert\w*|pression\w*|salv\w*|format\w*|tabul\w*|recu\w*|negrit\w*|itálic\w*|sublinh\w*|pul\w*|inspec\w*|verif\w*|confer\w*|envi\w*|publish|public\w*|edit\w*|troc\w*|mex\w*|move\w*|edita\w*|cria\w*|fa[çc]a|monta\w*|usa\s+o\s+|use\s+o\s+)\b/i;

const PADROES_DE_LISTA_OU_DIDATICA =
  /(\n|^)\s*\d+[\.\)]\s+\S|:\s*\n\s*\d+[\.\)]\s+|\b(assim:?\s*$|dessa\s+forma:?\s*$|do\s+seguinte\s+modo:?\s*$|passo\s+a\s+passo:?\s*$|first\s+thing)\b|^\s*-\s+\S.*\n\s*-\s+\S/im;

/**
 * Quando a resposta fala em SEQUÊNCIA DE PASSOS em prosa (sem lista numerada):
 * "primeiro... depois... por último" / "antes... depois... em seguida"
 * É formato de tutorial mesmo sem marker. Adiciona custo pequeno.
 */
const SEQUENCIA_PROSA_DE_INSTRUCAO =
  /\b(primeiro|antes\s+de|em\s+seguida)\b[\s\S]{0,160}?\b(depois|em\s+seguida|por\s+ultim[oa]|por\s+último|ap[óo]s\s+isso)\b/i;

export function respostaExplicaEmVezDeFazer(resposta: string): boolean {
  return (
    IMPERATIVOS_DE_INSTRUCAO.test(resposta) &&
    (PADROES_DE_LISTA_OU_DIDATICA.test(resposta) ||
      SEQUENCIA_PROSA_DE_INSTRUCAO.test(resposta))
  );
}

/**
 * Detectou? Ele pediu mexida em artefato, a Luna respondeu com INSTRUÇÕES (imperativos
 * + lista/didática) em vez de CHAMAR a ferramenta. Sem ferramenta de escrita ter corrido,
 * é equivalente a confabular: ela deu uma RECEITA em vez de FAZER.
 */
export function exposMetodoSemExecutar(
  resposta: string,
  ferramentasUsadas: string[],
  mensagemUsuario: string,
): boolean {
  const raw = process.env.LUNA_GUARDA_EXPOSICAO_METODO?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;

  if (!resposta.trim()) return false;
  return (
    pediuEscritaDeArtefato(mensagemUsuario) &&
    respostaExplicaEmVezDeFazer(resposta) &&
    !algumaEscritaDeArtefatoCorreu(ferramentasUsadas)
  );
}

/** Nudge específico pra quem didatica em vez de agir. Mais firme que o V1. */
export function blocoReexecucaoExposicaoMetodo(): string {
  return [
    "── Atenção: tu EXPLICASTE em vez de FAZER — não chamaste ferramenta de artefato ──",
    "A resposta anterior tem cara de tutorial («coloca assim», «primeiro… depois…», «»). " +
      "Mas nenhuma ferramenta de artefato correu nesta conversa, então NENHUMA mexida " +
      "aconteceu de verdade. O Ethan pediu pra ti FAZER, e tu DESENHASTE no papel em vez de " +
      "no editor.",
    "Agora FAZ: lê a estrutura do artefato (se for a primeira vez mexendo neste), depois " +
      "chama a ferramenta certa (criar_artefato, inserir_blocos, editar_trecho_artefato, " +
      "editar_bloco_artefato, anotar_canone, editar_artefato). Só fala que está feito " +
      "DEPOIS da ferramenta responder. NÃO repitas o tutorial, NÃO dês passos, CHAMA a tool.",
  ].join("\n");
}

/**
 * Re-exporta pra que callers possam checar se uma ferramenta é de artefato sem importar
 * dois módulos. Útil em logs e debug.
 */
export function ehFerramentaDeArtefato(nome: string): boolean {
  return FERRAMENTAS_ARTEFATO.has(nome);
}