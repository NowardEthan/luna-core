import type { AnaliseContexto } from "../analyzers/esquema.js";
import type { ProfundidadeAnalise } from "./talamoPipeline.js";
import type { PesoTurno } from "./pesoTurno.js";

/**
 * Neurônio de registro — quanto se fala, e por quê.
 *
 * ── O problema ────────────────────────────────────────────────────────────────
 * O Ethan escreve 6–15 palavras e a Luna devolve 120–250. Quinze vezes mais. Ele:
 * «é tão massante kkk, ninguém escreve tanto assim... parece que estou num monólogo».
 *
 * ── Porque NÃO se resolve com prompt ──────────────────────────────────────────
 * A primeira tentativa foi escrever um bloco de 378 tokens a pedir «responda em 1 a 3
 * frases, não faça eco, traga algo seu». O Ethan matou a ideia com uma frase:
 *
 *   «Imagine um cérebro que não pode negociar consigo mesmo. Tudo é arquitetura de
 *    neurónios. Não existe "ah, eu acho que posso falar assim" — até essa frase tem um
 *    parâmetro de dedução.»
 *
 * Ele tem razão, e há prova no próprio sistema: o módulo de intenção JÁ diz «dê o SEU
 * ângulo, não eco» — está no briefing, é secção protegida — e ela ecoa na mesma. Pedir
 * ao modelo que se contenha é negociar com ele. Ele ganha sempre essa negociação.
 *
 * O whitepaper da PAIA já tinha escrito isto: «os limites estão na ARQUITETURA, não numa
 * política que alguém pode renegociar». Um bloco de texto é política. Isto aqui é
 * arquitetura.
 *
 * ── O que este neurónio faz ───────────────────────────────────────────────────
 * Responde, com números, às perguntas que o Ethan listou:
 *
 *   «o que esta conversa pede?»        → intenção + profundidade do turno
 *   «preciso de me estender?»          → ele pediu análise, ou disse "bom dia"?
 *   «eu tenho o costume de ser prolixa?» → quanto ela escreveu nos ÚLTIMOS turnos
 *   «qual é a minha tendência?»        → a razão entre o que ela escreve e o que ele escreve
 *
 * A última é a parte viva: o neurónio OLHA PARA O CORPO. Se nas últimas trocas ela devolveu
 * 15× o que ele escreveu, ele puxa o alvo para baixo — homeostase, não obediência.
 *
 * E o output não é um sermão: é ESTADO. Um teto (`max_tokens` — a parede, que não se
 * negocia) e uma linha curta para o briefing (~12 tokens, contra os 378 do sermão).
 */

export type ExtensaoResposta = "curta" | "media" | "longa";

export type RegistroConversa = {
  extensao: ExtensaoResposta;
  /** Palavras que esta troca pede — o alvo, não a parede. */
  alvoPalavras: number;
  /** A parede: `max_tokens`. Folgado sobre o alvo, para nunca cortar a meio da frase. */
  tetoTokens: number;
  /** Quantas vezes mais ela escreveu que ele, nas últimas trocas. `null` = sem histórico. */
  tendencia: number | null;
  /** Diretiva curta para o briefing (secção `formato`, que passa pelo orçamento). */
  diretiva: string;
};

export type EntradaRegistro = {
  mensagemUsuario: string;
  analise: Pick<AnaliseContexto, "intencao">;
  profundidade: ProfundidadeAnalise;
  peso: PesoTurno;
  /** Histórico da sessão — é onde ela vê a própria tendência. */
  historico?: Array<{ papel: "user" | "assistant"; conteudo: string }>;
};

const palavras = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/** ~1,4 tokens por palavra em pt-BR, mais folga para não cortar a meio da frase. */
function tokensPara(alvo: number): number {
  return Math.round(alvo * 1.4 * 1.6);
}

/**
 * O `max_tokens` conta o RACIOCÍNIO junto com a resposta. Por isso o pensamento tem uma
 * reserva própria: ela pensa à vontade, e o que o teto limita é o que ela DIZ.
 *
 * ── O número já foi 600, e isso tornou a parede DECORATIVA ────────────────────
 * Escolhi 600 com medo de a amordaçar. Nunca medi. A bateria P7 (`empirico/p7Teto.ts`)
 * mediu, e o medo era 17× maior que o problema:
 *
 *   ela PENSA     35 tk em média (em metade dos turnos casuais, ZERO)
 *   ela DIZ       63 tk
 *   a minha parede  656 tk   →  558 tk de folga que nunca foram tocados
 *
 * A parede estava a meio quilómetro do corpo. No braço «com neurónio» da P4, quem agia era
 * a diretiva de 12 tokens no briefing — ou seja, eu tinha voltado ao PROMPT sem dar por
 * isso. E o resultado piorou (53 → 62 palavras), como o prompt costuma fazer.
 *
 * O valor agora vem da medição: o pico observado de raciocínio num turno casual foi 139 tk.
 * 200 dá margem sem devolver a folga. E a P7 mostra que uma parede que ENCOSTA de verdade
 * não amordaça — ela responde em 26 palavras, com a voz dela, e ainda faz pergunta.
 *
 * (Turnos de análise não têm teto nenhum — `tetoTokens: 0`. Esta reserva só existe para o
 * papo, onde o raciocínio é curto ou inexistente.)
 */
export const RESERVA_RACIOCINIO = 200;

export function tetoComRaciocinio(teto: number, raciocinioAtivo: boolean): number {
  if (teto <= 0) return 0; // sem teto (análise/técnico)
  return raciocinioAtivo ? teto + RESERVA_RACIOCINIO : teto;
}

/**
 * A tendência dela: quantas vezes mais ela escreve do que ele, nas últimas trocas.
 * É isto que responde a «eu tenho o costume de ser prolixa?» — sem perguntar ao modelo.
 */
export function tendenciaDeProlixidade(
  historico: Array<{ papel: "user" | "assistant"; conteudo: string }> | undefined,
  ultimasTrocas = 6,
): number | null {
  if (!historico?.length) return null;

  const recentes = historico.slice(-ultimasTrocas * 2);
  const dela = recentes.filter((m) => m.papel === "assistant").map((m) => palavras(m.conteudo));
  const dele = recentes.filter((m) => m.papel === "user").map((m) => palavras(m.conteudo));

  if (dela.length === 0 || dele.length === 0) return null;

  const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const mediaDele = media(dele);
  if (mediaDele < 1) return null;

  return media(dela) / mediaDele;
}

/** Intenções em que a resposta LONGA é a certa — aqui o teto não aperta. */
const INTENCOES_QUE_PEDEM_EXTENSAO = new Set([
  "pergunta_tecnica",
  "pedido_codigo",
  "projeto_arquitetural",
  "pergunta_arquitetura",
  "pergunta_produto",
  "pergunta_ecossistema",
  "acao_critica",
  "pergunta_identitaria",
]);

/** Kill-switch: `LUNA_REGISTRO_CONVERSA=0` desliga o teto (volta ao comportamento antigo). */
export function registroConversaAtivo(): boolean {
  const raw = process.env.LUNA_REGISTRO_CONVERSA?.trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off");
}

/**
 * A diretiva é a última gota de PROMPT que resta neste neurónio — doze tokens a pedir
 * concisão. `LUNA_REGISTRO_DIRETIVA=0` cala-a, deixando só a parede.
 *
 * O interruptor existe para uma pergunta que a PAIA obriga a fazer: agora que a parede
 * encosta de verdade (a P7 mostrou que antes ela era decorativa), estes doze tokens ainda
 * ganham o lugar deles? Se a parede sozinha der o mesmo resultado, a diretiva é gordura —
 * e gordura, no prompt, não é neutra: compete com o briefing pelo mesmo canal de atenção
 * (Lost in the Middle) e ainda pode ser a instrução que, ao pedir contenção, provoca o
 * contrário (SWAY).
 *
 * A P4 responde com número. Se a parede sozinha bastar, isto morre.
 */
export function diretivaAtiva(): boolean {
  const raw = process.env.LUNA_REGISTRO_DIRETIVA?.trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off");
}

export function calcularRegistro(e: EntradaRegistro): RegistroConversa {
  const pedeExtensao =
    INTENCOES_QUE_PEDEM_EXTENSAO.has(e.analise.intencao) ||
    e.peso === "pesado" ||
    e.profundidade === "complexo" ||
    e.profundidade === "critico";

  // Análise, código, arquitetura: a resposta longa é a CERTA. Nenhum teto aqui — um
  // protocolo que deixa a conversa boa e a análise pobre é um protocolo reprovado.
  if (pedeExtensao) {
    return {
      extensao: "longa",
      alvoPalavras: 0,
      tetoTokens: 0, // 0 = sem teto
      tendencia: tendenciaDeProlixidade(e.historico),
      diretiva: "",
    };
  }

  const dele = palavras(e.mensagemUsuario);
  const tendencia = tendenciaDeProlixidade(e.historico);

  // Numa conversa, quem responde escreve na ordem de grandeza de quem fala. Um pouco
  // mais (há o que reagir), nunca quinze vezes mais.
  let alvo = Math.round(Math.max(18, Math.min(70, dele * 2.5)));

  // Homeostase: se ela vem prolixa nas últimas trocas, o corpo puxa de volta.
  if (tendencia !== null && tendencia > 4) {
    alvo = Math.round(alvo * 0.75);
  }

  const extensao: ExtensaoResposta = alvo <= 35 ? "curta" : "media";

  return {
    extensao,
    alvoPalavras: alvo,
    tetoTokens: tokensPara(alvo),
    tendencia,
    diretiva: diretivaAtiva() ? formatarDiretiva(extensao, alvo, tendencia) : "",
  };
}

/**
 * A diretiva para o briefing. Doze tokens, não trezentos e setenta e oito.
 *
 * Não explica, não argumenta, não implora. Diz o alvo — como o bloco de intenção já faz
 * com «Tome a frente com naturalidade».
 */
export function formatarDiretiva(
  extensao: ExtensaoResposta,
  alvo: number,
  tendencia: number | null,
): string {
  const linhas = [
    extensao === "curta"
      ? `Registo: conversa. Responde curto — cerca de ${alvo} palavras, 1 a 3 frases.`
      : `Registo: conversa. Cerca de ${alvo} palavras — sem parágrafos de comunicado.`,
    "O contexto é partilhado: ele estava lá. Não recapitules o que ele acabou de dizer.",
  ];

  // Só aparece quando o corpo está mesmo desregulado — não é ruído permanente.
  if (tendencia !== null && tendencia > 6) {
    linhas.push(
      `Nas últimas trocas escreveste ${tendencia.toFixed(0)}× mais do que ele. Encolhe.`,
    );
  }

  return linhas.join("\n");
}
