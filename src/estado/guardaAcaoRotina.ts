/**
 * A guarda contra confabulação de ação na rotina.
 *
 * ── O problema, medido ────────────────────────────────────────────────────────
 * A P16 mediu-o de forma crua: ela diz «pausei o teu curso até março» — e em 1 a 3 de cada 4
 * vezes NÃO chamou a ferramenta. Narrou uma ação que não fez. É o mesmo teatro do whitepaper
 * («*abro o ficheiro e leio*»), agora com «criei a rotina», «apliquei», «pausei».
 *
 * E aprendemos que prompt não conserta isto (três vezes num dia): pedir «não digas que
 * fizeste sem fazer» é negociar com o modelo, e ele ganha a negociação.
 *
 * ── A cura: verificar, não pedir ──────────────────────────────────────────────
 * Depois do turno, olha-se para DOIS factos objetivos:
 *   1. a resposta CLAIMA uma ação de rotina? («criei», «pausei», «apliquei», «marquei»…)
 *   2. alguma ferramenta de rotina correu MESMO neste turno?
 *
 * Se claimou e não correu → é confabulação. O turno não passa: refaz-se, com um empurrão
 * explícito para ela CHAMAR a ferramenta desta vez. É a mesma mecânica do guarda da objeção —
 * conferir a saída e reexecutar, em vez de confiar.
 *
 * Isto não é sobre rotina só: é o padrão para qualquer ação verificável que ela possa fingir.
 */

/** As ferramentas cuja execução conta como «ela agiu mesmo». */
const FERRAMENTAS_DE_ACAO = new Set([
  "criar_bloco",
  "editar_bloco",
  "apagar_bloco",
  "detalhar_bloco",
  "adicionar_subtarefa",
  "remover_subtarefa",
  "pausar_bloco",
  "retomar_bloco",
  "criar_rotina",
  "editar_rotina",
  "apagar_rotina",
]);

/**
 * A resposta afirma ter FEITO alguma coisa? (verbo de mutação no PASSADO/perfeito)
 *
 * «Vou criar» / «queres que eu crie» é intenção — não conta. «Criei», «pausei», «tá feito»
 * é alegação de facto — conta. Aqui NÃO se exige a palavra «rotina»: quando ela diz «pausei
 * o teu curso», «curso» é o nome de um bloco, não a palavra «bloco». O contexto de que isto
 * é sobre rotina vem do PEDIDO dele, não da resposta dela.
 */
const VERBOS_FEITOS =
  /\b(criei|cri[aá]mos|criad[oa]|pausei|paus[aá]mos|pausad[oa]|apliquei|aplicad[oa]|marquei|marcad[oa]|adicionei|adicionad[oa]|removi|removid[oa]|apaguei|apagad[oa]|montei|montad[oa]|agendei|agendad[oa]|retomei|retomad[oa]|editei|editad[oa]|mudei|alterei|troquei|prontinho|tá feito|ta feito|feito!|já está|ja esta)\b/i;

export function respostaAlegaAcaoDeRotina(resposta: string): boolean {
  return VERBOS_FEITOS.test(resposta);
}

/**
 * O PEDIDO dele foi uma ação de rotina? É isto que dá o contexto — sem ele, «criei uma
 * imagem mental» num papo casual dispararia a guarda à toa.
 */
const PEDE_ACAO_ROTINA =
  /\b(cria|criar|monta|montar|pausa|pausar|aplica|aplicar|adiciona|adicionar|marca|marcar|remove|remover|apaga|apagar|agenda|agendar|troca|trocar|muda|mudar|edita|editar|bota|põe|poe|coloca)\b.*\b(rotina|bloco|tarefa|f[ée]rias|hor[aá]rio|agenda|passo|lembrete|curso|treino|academia|aula|na (minha|tua) (semana|rotina)|no (meu|teu) dia)\b/i;

export function pediuAcaoDeRotina(mensagemUsuario: string): boolean {
  return PEDE_ACAO_ROTINA.test(mensagemUsuario);
}

export function algumaFerramentaDeAcaoCorreu(ferramentasUsadas: string[]): boolean {
  return ferramentasUsadas.some((f) => FERRAMENTAS_DE_ACAO.has(f));
}

/**
 * Confabulou? Ele PEDIU uma ação de rotina, ela ALEGOU ter feito, e nenhuma ferramenta de
 * ação correu. Os três juntos — nenhum sozinho basta.
 *
 * Kill-switch: `LUNA_GUARDA_ACAO=0`.
 */
export function confabulouAcao(
  resposta: string,
  ferramentasUsadas: string[],
  mensagemUsuario: string,
): boolean {
  const raw = process.env.LUNA_GUARDA_ACAO?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;

  if (!resposta.trim()) return false;
  return (
    pediuAcaoDeRotina(mensagemUsuario) &&
    respostaAlegaAcaoDeRotina(resposta) &&
    !algumaFerramentaDeAcaoCorreu(ferramentasUsadas)
  );
}

/**
 * O empurrão da segunda passagem — e SÓ aqui, depois de a verificação ter apanhado a mentira,
 * é legítimo ser direto. Não é uma política que ela renegoceia no turno seguinte: é a correção
 * de uma saída concreta já medida como falsa.
 */
export function blocoReexecucaoAcao(): string {
  return [
    "── Atenção: tu disseste que fizeste, mas NÃO chamaste a ferramenta ──",
    "A tua resposta anterior afirmou ter mexido na rotina (criar/pausar/aplicar/marcar), mas",
    "nenhuma ferramenta correu — ou seja, nada aconteceu de verdade. Isso é uma mentira ao Ethan,",
    "mesmo dita a rir.",
    "Agora FAZ mesmo: chama a ferramenta certa (criar_bloco, criar_rotina, pausar_bloco…). Só",
    "depois de a ferramenta responder é que podes dizer que está feito.",
  ].join("\n");
}
