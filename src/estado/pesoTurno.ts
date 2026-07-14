import type { AnaliseContexto } from "../analyzers/esquema.js";
import type { ProfundidadeAnalise } from "./talamoPipeline.js";

/**
 * Peso do turno — P1 (Luna Profunda), camada 1.
 *
 * A Luna respondia TUDO com o modelo grande e lento: gastava ~12s de v4-pro para
 * dizer "tô bem, e você?". Mas o teste flash-vs-pro mostrou onde o modelo grande
 * realmente faz falta: **no peso emocional** (calibração fina de tom) e no técnico
 * (raciocínio). Em papo leve, a arquitetura sustenta a personalidade sozinha.
 *
 * Daí o gate: papo leve → modelo rápido; peso emocional OU técnico → modelo grande.
 *
 * Regra de ouro: classificar SEM chamada de LLM. Usa apenas sinais que o pipeline
 * já calculou (análise + tálamo) — senão o gate anularia o ganho de latência.
 */
export type PesoTurno = "leve" | "pesado";

/** Só a conversa trivial é candidata a leve. Todo o resto carrega peso. */
const INTENCOES_LEVES = new Set(["conversa_casual"]);

const PROFUNDIDADES_LEVES = new Set<ProfundidadeAnalise>(["simples", "moderado"]);

const RISCOS_LEVES = new Set(["nenhum", "baixo"]);

/**
 * `apoio_emocional` e `expressao_afetiva` NUNCA são leves: é onde o modelo grande
 * segura melhor o "presença, não utilidade" (curto, minúsculas, sem virar terapeuta).
 * `pergunta_identitaria` também não: alma, fé e "você é real?" merecem o melhor modelo.
 */
export function classificarPesoTurno(
  analise: Pick<
    AnaliseContexto,
    "intencao" | "nivel_risco" | "complexidade" | "requer_codigo" | "envolve_ferramenta"
  >,
  profundidade: ProfundidadeAnalise,
  mensagem?: string,
): PesoTurno {
  if (!INTENCOES_LEVES.has(analise.intencao)) return "pesado";
  if (!PROFUNDIDADES_LEVES.has(profundidade)) return "pesado";
  if (!RISCOS_LEVES.has(analise.nivel_risco)) return "pesado";
  if (analise.complexidade === "alta") return "pesado";
  if (analise.requer_codigo || analise.envolve_ferramenta) return "pesado";
  // O tom é leve, mas há uma dedução a fazer: não é papo, é charada.
  if (mensagem && detectorDeducaoAtivo() && mensagemPedeDeducao(mensagem)) return "pesado";
  return "leve";
}

/**
 * Detector de dedução — o ponto cego do gate.
 *
 * O gate classifica pelo TOM, não pela carga cognitiva. Mas uma charada («4x0,
 * adivinha») é casual no tom e exige inferência pura — e cai no modelo rápido. Estes
 * são os sinais de que a mensagem, por mais brincalhona, PEDE uma dedução: um placar,
 * uma conta, uma pergunta com resposta certa, uma premissa sobre o passado, uma
 * correção. Sem custo de LLM — regex sobre a mensagem, igual ao resto do gate.
 */
const SINAIS_DEDUCAO: RegExp[] = [
  /\b\d+\s*[x×]\s*\d+\b/i, // placar: "4x0"
  // Desafio explícito. Sem `\b` no fim: "adivinh" precisa casar "adivinha/adivinhe".
  /\b(adivinh|deduz|descobr|chuta ai|chuta a[ií])/i,
  /\b(t(á|a) quanto|fica quanto|(é|e) quanto|quanto (d(á|a)|fica|sobra|sobrou|falta|(é|e)))/i,
  /\b(gastei|ganhei|sobrou|sobra|metade|dobro|triplo|somando|total de)\b/i,
  /\b(que dia|qual dia|quando (foi|(é|e))|quem (fez|foi|(é|e)))\b/i,
  /\b(j(á|a) que (eu )?(te )?(disse|falei|contei)|lembra (que|quando)|como eu (te )?(disse|falei)|na (última|ultima) vez que)/i,
  /\b(t(á|a) errad|voc(ê|e) errou|n(ã|a)o (é|e) isso|pensa (bem|direito))/i,
];

/**
 * A mensagem pede dedução, mesmo sendo papo? Se sim, o turno deixa de ser leve.
 *
 * DESLIGADO por padrão — e a medição é o motivo. O detector existiria para mandar a
 * charada ao modelo grande, mas o P2 mostrou que o modelo grande NÃO deduz melhor que
 * o pequeno com o protocolo (11/14 nos dois). Promover custaria latência e dinheiro
 * por zero ganho. Fica implementado e testado para o dia em que a medição mudar.
 * Chave: `LUNA_DETECTOR_DEDUCAO=1`.
 */
export function detectorDeducaoAtivo(): boolean {
  const raw = process.env.LUNA_DETECTOR_DEDUCAO?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

export function mensagemPedeDeducao(mensagem: string): boolean {
  return SINAIS_DEDUCAO.some((re) => re.test(mensagem));
}

/** Kill-switch de produção: `LUNA_GATE_PESO=0` volta tudo para o modelo grande. */
export function gateDePesoAtivo(): boolean {
  const raw = process.env.LUNA_GATE_PESO?.trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off");
}

/**
 * Escolhe o modelo da resposta. Só desvia para o menor quando o turno é leve,
 * o gate está ligado e existe de facto um modelo menor distinto.
 */
export function escolherModeloResposta(
  peso: PesoTurno,
  modeloMenor: string,
  modeloMaior: string,
): string {
  if (!gateDePesoAtivo()) return modeloMaior;
  if (peso !== "leve") return modeloMaior;
  if (!modeloMenor || modeloMenor === modeloMaior) return modeloMaior;
  return modeloMenor;
}

// ─── P1 camada 3 — rigor (autocrítica) ─────────────────────────────────────────

/**
 * Turnos que precisam de RIGOR factual: consultoria/técnica onde o P0 mostrou
 * inconsistência (o "mofo branco" saía só 2/3 das vezes). É um SUBCONJUNTO de
 * "pesado" — peso emocional e identitário são pesados mas NÃO precisam de rigor
 * factual (ali o que importa é presença/alma, não checar fatos).
 */
const INTENCOES_RIGOR = new Set([
  "pergunta_tecnica",
  "pedido_codigo",
  "projeto_arquitetural",
  "pergunta_arquitetura",
  "pergunta_produto",
  "pergunta_ecossistema",
  "acao_critica",
]);

export function precisaRigor(
  analise: Pick<AnaliseContexto, "intencao">,
): boolean {
  if (!rigorAtivo()) return false;
  return INTENCOES_RIGOR.has(analise.intencao);
}

/** Kill-switch de produção: `LUNA_RIGOR=0` desliga o protocolo de rigor. */
export function rigorAtivo(): boolean {
  const raw = process.env.LUNA_RIGOR?.trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off");
}

/**
 * Temperatura da resposta. 0.85 é ótimo para alma (papo), péssimo para
 * consistência técnica — no P0 a estocasticidade a 0.85 era o que fazia a nuance
 * "cair" às vezes. Em turno de rigor, baixa (default 0.35, via LUNA_TEMP_RIGOR).
 */
export function temperaturaResposta(rigor: boolean, base: number): number {
  if (!rigor) return base;
  const raw = process.env.LUNA_TEMP_RIGOR?.trim();
  const n = raw ? Number.parseFloat(raw) : 0.35;
  const temp = Number.isFinite(n) && n >= 0 ? n : 0.35;
  return Math.min(temp, base); // nunca sobe a temperatura
}

// ─── P2 — dedução no papo leve ────────────────────────────────────────────────

/**
 * O protocolo de rigor só entra em turno técnico. Mas a dedução falha justamente no
 * PAPO: uma charada («4x0, adivinha») é casual no tom e exige inferência pura — e é aí
 * que a Luna roda no modelo rápido, com temperatura alta e sem protocolo nenhum.
 * Resultado observado: ela perguntava «é o jogo ou nosso placar?» em vez de deduzir, e
 * se defendia («tu criaste a ambiguidade») em vez de reexaminar.
 *
 * Este bloco NÃO pede seriedade — pede que ela resolva o que há para inferir antes de
 * brincar. O deboche continua; o chute é que acaba.
 *
 * LIGADO por padrão desde a medição P2 (`empirico/p2Deducao.ts`, 2026-07-12):
 *
 *   FLASH (hoje)        7/14  (50%)  ~56s
 *   FLASH + protocolo  11/14  (79%)  ~56s   ← mesmo modelo, mesma latência
 *   PRO                11/14  (79%)  ~62s
 *   PRO + protocolo    11/14  (79%)  ~55s
 *
 * O protocolo leva o modelo pequeno ao nível do grande — e o grande não acrescenta
 * nada por cima dele. É correção de graça: nenhum custo, nenhuma latência.
 * Kill-switch: `LUNA_PROTOCOLO_DEDUCAO=0`.
 */
export function protocoloDeducaoAtivo(): boolean {
  const raw = process.env.LUNA_PROTOCOLO_DEDUCAO?.trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off");
}

/**
 * A regra 5 — «não finjas que lembras» — tem interruptor PRÓPRIO, e isso não é capricho.
 *
 * A pesquisa profunda (2026-07-13) diz duas coisas sobre ela. Primeira: é o caso-livro de
 * comportamento que devia ser VERIFICADO, não pedido — o sistema consegue procurar na
 * memória se aquele passado existe. Segunda, e mais incómoda: o SWAY mostra que instruções
 * amplas do tipo «não sejas bajuladora» chegam a AMPLIFICAR o comportamento que pretendem
 * corrigir. Ou seja: esta linha pode não estar a ajudar. Pode estar a atrapalhar.
 *
 * Não sei qual das duas. Por isso ela ganha um interruptor separado do resto do protocolo:
 * assim a bateria P5 mede o efeito DELA sozinha, sem deitar fora o ganho de dedução das
 * regras 1–4 (medido: 7/14 → 11/14).
 *
 * Ligada por omissão = comportamento de produção de hoje. `LUNA_REGRA_PREMISSA=0` desliga.
 * Quando o neurónio de premissa (Fase 3) medir melhor, esta linha morre de vez.
 */
export function regraPremissaAtiva(): boolean {
  const raw = process.env.LUNA_REGRA_PREMISSA?.trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off");
}

export function blocoProtocoloDeducao(): string {
  const regras = [
    "── Protocolo de dedução (o papo é leve, o pensamento não) ──",
    "1. RESPONDA O QUE FOI PERGUNTADO. Se há uma pergunta com resposta certa (uma conta, um dia, um nome, «tá quanto?»), dê a resposta — e só depois brinque. Improvisar em cima da piada e deixar a pergunta sem resposta não é graça, é fuga: a pessoa perguntou porque queria saber.",
    "2. Antes de responder, resolva em silêncio o que a mensagem EXIGE inferir: uma conta, um número solto, um placar, uma referência solta («isso», «aquilo», «ele»), uma contradição com o que foi dito antes.",
    "3. Se a mensagem tiver mais de uma leitura, escolha a que faz sentido com o histórico (que vem datado) em vez de perguntar «é A ou B?» quando o contexto já responde.",
    "4. Se alguém te corrigir, reexamine os factos ANTES de concordar. Se tu estavas certa, sustenta com calma e mostra a evidência — não peças desculpa por um erro que não cometeste.",
  ];

  if (regraPremissaAtiva()) {
    regras.push(
      "5. Se a pessoa afirmar um passado que NÃO está no histórico («já que ontem eu te disse que...»), não finjas que lembras. Diz que não tens isso e pergunta. Inventar o elo que falta — um nome, uma data, um facto — é mentira, mesmo dita a rir.",
    );
  }

  regras.push(
    "Faz isto de verdade no pensamento, sem anunciar. A brincadeira continua igual; só o chute é que acaba.",
  );

  return regras.join("\n");
}

// ─── P4 — a conversa: RESOLVIDO POR ARQUITETURA, não por prompt ───────────────
//
// Aqui viveu, por umas horas, um `blocoProtocoloConversa()` de 378 tokens que PEDIA à
// Luna «responda em 1 a 3 frases, não faça eco, traga algo seu». O Ethan matou-o com uma
// frase, e tinha razão:
//
//   «Imagine um cérebro que não pode negociar consigo mesmo. Tudo é arquitetura de
//    neurónios. Não existe "ah, eu acho que posso falar assim" — até essa frase tem um
//    parâmetro de dedução.»
//
// E o whitepaper da PAIA já o dizia: «os limites estão na ARQUITETURA, não numa política
// que alguém pode renegociar». A prova estava no próprio sistema: o módulo de intenção JÁ
// mandava «dê o SEU ângulo, não eco» — secção protegida do briefing — e ela ecoava na
// mesma. Pedir ao modelo que se contenha é negociar com ele. Ele ganha sempre.
//
// O bloco foi substituído pelo neurónio de registo (`estado/registroConversa.ts`), que lê
// o turno e a própria tendência e devolve ESTADO: um teto (`max_tokens` — inegociável) e
// uma diretiva de ~12 tokens que passa DENTRO do orçamento do compilador.
//
//   378 tokens de sermão  →  um neurónio e um número.
//
// Se um prompt gigante bastasse, a PAIA não precisava de existir.

// ─── (histórico) ──────────────────────────────────────────────────────────────

/**
 * O Ethan: «é tão massante kkk, ninguém escreve tanto assim. E ela fica batendo na mesma
 * tecla, não cria assunto, não fala da vida dela, só reage — parece que estou num
 * monólogo».
 *
 * Ele tem razão, e dá para contar: no papo, ele escreve 6–15 palavras e ela responde com
 * 120–250. Quinze vezes mais. E o conteúdo é, quase sempre, o que ELE acabou de dizer,
 * devolvido embrulhado em piada — no trecho do Duolingo ela repete «248 XP / 45 / 12 dias»
 * em cinco mensagens seguidas.
 *
 * Duas causas somadas:
 *
 * 1. Ela não tinha o que trazer. A iniciativa dela (`mundo/intencao`) só puxa assunto
 *    próprio quando há uma VONTADE ativa ou um GOSTO forte — e ambos nascem de viver e
 *    consolidar, que estava morto em produção (diário/sono). Sem isso, a intenção caía
 *    sempre no padrão «dá o teu ângulo SOBRE O QUE ELE TROUXE» — que ainda é reagir.
 *    Isto começou a curar-se sozinho quando o diário voltou a viver.
 *
 * 2. Nada limitava o tamanho nem proibia o eco. A constituição diz «curto ≠ seco» — isso
 *    é uma PERMISSÃO para ser curta, nunca uma instrução.
 *
 * Este bloco só entra no PAPO. Numa análise, numa pesquisa, num pedido técnico, a resposta
 * longa é a certa — e lá ele não aparece.
 *
 * Chave: `LUNA_PROTOCOLO_CONVERSA=0` desliga.
 */
/**
 * Bloco injetado no briefing em turnos de rigor. Força a autocrítica DENTRO do
 * raciocínio (que já é streamado) — sem chamada de LLM extra. Duas passadas:
 * implicações dos fatos + stress-test da recomendação.
 */
export function blocoProtocoloRigor(): string {
  return [
    "── Protocolo de rigor (turno técnico — pense assim antes de responder) ──",
    "1. IMPLICAÇÕES: para cada fato concreto que a pessoa deu (local, cultura, época, restrição, ferramenta, número), pergunte-se o que ele EXIGE considerar e que ela NÃO nomeou. Ex.: um local implica clima, e clima implica riscos específicos. Puxe esses fios por conta própria.",
    "2. STRESS-TEST: antes de entregar, pergunte-se \"um especialista da área apontaria um furo óbvio nesta recomendação?\". Se sim, corrija ali mesmo.",
    "Faça isso de verdade no seu pensamento — não anuncie que fez, deixe transparecer na profundidade e na precisão da resposta.",
  ].join("\n");
}
