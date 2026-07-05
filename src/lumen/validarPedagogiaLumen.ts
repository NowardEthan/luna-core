import type { ItemFeynmanLumen, PassoAulaLumen, SessaoLumen } from "./esquemaSessaoLumen.js";
import { LumenSessionSchema } from "./esquemaSessaoLumen.js";
import {
  FRASES_FIXAS_COREANAS,
  LIMITES_DIDATICA_LUMEN,
  VOGAIS_HANGUL_RE,
} from "./diretrizesDidaticaLumen.js";

export type ViolacaoPedagogica = {
  codigo: string;
  mensagem: string;
  onde?: string;
};

export type ResultadoValidacaoPedagogica = {
  ok: boolean;
  violacoes: ViolacaoPedagogica[];
};

const PARADAS = new Set([
  "quando", "porque", "sobre", "entre", "ainda", "assim", "mesma", "mesmo", "coisa",
  "sempre", "nunca", "todas", "todos", "qual", "quais", "como", "onde", "quem",
  "essa", "esse", "isso", "aqui", "agora", "depois", "antes", "muito", "pouco",
  "gente", "voces", "você", "voce", "estao", "estão", "está", "esta", "seria",
  "fases", "fase", "lua", "luas", "noite", "noites", "terra", "metade", "parte",
  "luz", "brilho", "sol", "céu", "ceu", "verdade", "diferenca", "diferença",
  "complete", "qual", "pratica", "prova", "aula",
]);

/** Termos lexicalmente significativos para cruzar pré-requisitos. */
export function tokensPedagogicos(texto: string): Set<string> {
  const norm = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  const matches = norm.match(/\b[a-z]{5,}\b/g) ?? [];
  return new Set(matches.filter((t) => !PARADAS.has(t)));
}

const DEMO_FISICA =
  /\b(fa[cç]a em casa|pegue (uma|um)|segura(r)? (uma|um)|com (as|os) m[aã]os|gire devagar no lugar)\b/i;

const NARRATIVA_GUIADA = /\b(imagina|pensa (assim|numa)|visualize|na sua cabe[cç]a)\b/i;

function textoBeatsLista(beats: NonNullable<PassoAulaLumen["beats"]>): string {
  return beats
    .map((b) => {
      if (b.kind === "analogia") return `${b.de} ${b.para}`;
      return b.text;
    })
    .join(" ");
}

function textoBeats(passo: PassoAulaLumen): string {
  if (!passo.beats?.length) return passo.teach ?? "";
  return textoBeatsLista(passo.beats);
}

function textoExplainAgain(obj: {
  explainAgain?: string;
  explainAgainBeats?: PassoAulaLumen["beats"];
}): string {
  if (obj.explainAgainBeats?.length) return textoBeatsLista(obj.explainAgainBeats);
  return obj.explainAgain ?? "";
}

function validarExplainAgain(
  onde: string,
  obj: { explainAgain?: string; explainAgainBeats?: PassoAulaLumen["beats"] },
): ViolacaoPedagogica[] {
  const violacoes: ViolacaoPedagogica[] = [];
  const texto = obj.explainAgain?.trim() ?? "";

  if (texto && texto.length > 100 && !obj.explainAgainBeats?.length) {
    violacoes.push({
      codigo: "explain-again-textao",
      onde,
      mensagem:
        `"${onde}" tem explainAgain longo (${texto.length} chars) sem explainAgainBeats. ` +
        `Divida em 2–4 batidas (fala, destaque, analogia) — parágrafo confunde.`,
    });
  }

  if (obj.explainAgainBeats?.length === 1) {
    violacoes.push({
      codigo: "explain-again-uma-batida",
      onde,
      mensagem: `"${onde}" tem só 1 batida em explainAgainBeats — use pelo menos 2.`,
    });
  }

  const corpus = textoExplainAgain(obj);
  if (corpus && DEMO_FISICA.test(corpus) && !NARRATIVA_GUIADA.test(corpus)) {
    violacoes.push({
      codigo: "demo-fisica-sem-narrativa",
      onde,
      mensagem:
        `"${onde}" (explainAgain) pede demonstração física sem narrativa guiada ("imagina…"). ` +
        `A Luna não gera vídeo — reescreva como cena imaginada.`,
    });
  }

  return violacoes;
}

function corpusEnsinoUniversal(passos: PassoAulaLumen[]): string {
  return passos
    .map((p) => [textoBeats(p), p.check.correctNote ?? "", textoExplainAgain(p)].join(" "))
    .join(" ");
}

function mergeTokens(...textos: string[]): Set<string> {
  const out = new Set<string>();
  for (const texto of textos) {
    for (const t of tokensPedagogicos(texto)) out.add(t);
  }
  return out;
}

function textoItem(item: { type: string } & Record<string, unknown>): string {
  switch (item.type) {
    case "quiz":
      return [
        item.prompt,
        item.explanation,
        textoExplainAgain(item as { explainAgain?: string; explainAgainBeats?: PassoAulaLumen["beats"] }),
      ]
        .filter(Boolean)
        .join(" ");
    case "flashcard":
      return [item.front, item.back, item.hint].filter(Boolean).join(" ");
    case "feynman":
      return [item.prompt, ...(item.guides as string[] | undefined ?? []), item.sampleAnswer].join(" ");
    case "ensina_luna":
      return [item.scenario, item.fix, ...(item.statements as { text: string }[]).map((s) => s.text)].join(" ");
    default:
      return "";
  }
}

const SESSAO_ALFABETO =
  /\b(vogal|hangul|alfabet|símbolo|simbolo|consoante|letra coreana|한글)\b/i;

const NUMEROS_NATIVOS_COREANOS =
  /\b(하나|둘|셋|넷|다섯|여섯|일곱|여덟|아홉|열)\b/g;

const SILABAS_HANGUL_RE = /[\uAC00-\uD7AF]/g;

function silabasHangulUnicas(texto: string): Set<string> {
  return new Set(texto.match(SILABAS_HANGUL_RE) ?? []);
}

function contarSilabasHangul(texto: string): number {
  return silabasHangulUnicas(texto).size;
}

/** Hangul com 3+ sílabas na pergunta sem romanização legível ao lado. */
function hangulLongoSemRomanizacao(texto: string): boolean {
  const silabas = texto.match(SILABAS_HANGUL_RE) ?? [];
  if (silabas.length < 3) return false;
  if (/\([a-z]{3,}\)/i.test(texto)) return false;
  if (/\b(annyeong|gamsa|haseyo|hamnida)\b/i.test(texto)) return false;
  return true;
}

function corpusPerguntasAula(sessao: SessaoLumen): string {
  const aula = sessao.stages.find((s) => s.moment === "aula");
  if (!aula || aula.moment !== "aula") return "";
  return aula.steps.map((p) => p.check.question).join(" ");
}

function vogaisHangulUnicas(texto: string): Set<string> {
  return new Set(texto.match(VOGAIS_HANGUL_RE) ?? []);
}

function corpusEnsinoAula(sessao: SessaoLumen): string {
  const aula = sessao.stages.find((s) => s.moment === "aula");
  if (!aula || aula.moment !== "aula") return "";
  const intro = [aula.intro, aula.introBeats ? textoBeatsLista(aula.introBeats) : ""].join(" ");
  const passos = aula.steps.map((p) => textoBeats(p)).join(" ");
  return `${intro} ${passos}`;
}

function sessaoEnsinaAlfabeto(sessao: SessaoLumen): boolean {
  const cabecalho = `${sessao.topic} ${sessao.subtitle}`;
  return SESSAO_ALFABETO.test(cabecalho) || /[\u3131-\u318E]/.test(corpusEnsinoAula(sessao));
}

function frasesFixasNaAula(sessao: SessaoLumen): string[] {
  const corpus = corpusEnsinoAula(sessao);
  return FRASES_FIXAS_COREANAS.filter((f) => corpus.includes(f));
}

function contarNumerosNativosEnsinados(texto: string): number {
  return new Set(texto.match(NUMEROS_NATIVOS_COREANOS) ?? []).size;
}

function temFeynmanOuEnsinaLuna(sessao: SessaoLumen): boolean {
  for (const stage of sessao.stages) {
    if (stage.moment === "aula" && stage.closer?.type === "feynman") return true;
    if (stage.moment !== "aula") {
      for (const item of stage.items) {
        if (item.type === "feynman" || item.type === "ensina_luna") return true;
      }
    }
  }
  return false;
}

/** Regras de granularidade (didática Luna / estilo Duolingo). */
function validarGranularidade(sessao: SessaoLumen): ViolacaoPedagogica[] {
  const violacoes: ViolacaoPedagogica[] = [];
  const aula = sessao.stages.find((s) => s.moment === "aula");
  if (!aula || aula.moment !== "aula") return violacoes;

  if (aula.steps.length > LIMITES_DIDATICA_LUMEN.maxPassosAula) {
    violacoes.push({
      codigo: "aula-muitos-passos",
      mensagem:
        `Aula com ${aula.steps.length} passos — máximo ${LIMITES_DIDATICA_LUMEN.maxPassosAula} por micro-aula. ` +
        `Divida em estrelas separadas (uma ideia por estrela).`,
    });
  }

  const corpusAula = corpusEnsinoAula(sessao);

  if (sessaoEnsinaAlfabeto(sessao)) {
    const vogais = vogaisHangulUnicas(corpusAula);
    if (vogais.size > LIMITES_DIDATICA_LUMEN.maxVogaisHangulEnsinadasPorAula) {
      violacoes.push({
        codigo: "muitas-vogais-por-aula",
        mensagem:
          `Aula ensina ${vogais.size} vogais hangul (${[...vogais].join(" ")}) — máximo ` +
          `${LIMITES_DIDATICA_LUMEN.maxVogaisHangulEnsinadasPorAula} por sessão. ` +
          `Separe em estrelas (ex.: só ㅏ, depois só ㅗ).`,
      });
    }

    if (temFeynmanOuEnsinaLuna(sessao)) {
      violacoes.push({
        codigo: "feynman-cedo-alfabeto",
        mensagem:
          "Sessão de alfabeto/símbolo com Feynman ou ensina_luna — use quiz/montar nas primeiras estrelas. " +
          "Texto livre só depois que o aluno reconhece símbolos.",
      });
    }
  }

  const frases = frasesFixasNaAula(sessao);
  if (frases.length > LIMITES_DIDATICA_LUMEN.maxFrasesFixasPorAula) {
    violacoes.push({
      codigo: "muitas-frases-por-aula",
      mensagem:
        `Aula mistura frases (${frases.join(", ")}) — máximo ` +
        `${LIMITES_DIDATICA_LUMEN.maxFrasesFixasPorAula} frase fixa por estrela (ex.: olá OU obrigado).`,
    });
  }

  const numeros = contarNumerosNativosEnsinados(corpusAula);
  if (numeros > LIMITES_DIDATICA_LUMEN.maxNumerosNovosPorAula) {
    violacoes.push({
      codigo: "muitos-numeros-por-aula",
      mensagem:
        `Aula introduz ${numeros} números nativos — máximo ` +
        `${LIMITES_DIDATICA_LUMEN.maxNumerosNovosPorAula} por sessão. Divida a trilha.`,
    });
  }

  const silabas = contarSilabasHangul(corpusAula);
  if (silabas > LIMITES_DIDATICA_LUMEN.maxSilabasHangulPorAula) {
    violacoes.push({
      codigo: "muitas-silabas-por-aula",
      mensagem:
        `Aula expõe ${silabas} sílabas hangul distintas — máximo ` +
        `${LIMITES_DIDATICA_LUMEN.maxSilabasHangulPorAula} na descoberta. ` +
        `Ensine sílabas (아, 안) e 안녕 antes de 안녕하세요.`,
    });
  }

  const perguntas = corpusPerguntasAula(sessao);
  if (hangulLongoSemRomanizacao(perguntas)) {
    violacoes.push({
      codigo: "hangul-longo-sem-romanizacao",
      mensagem:
        "Micro-check com frase hangul longa sem romanização — use português + romanização " +
        '(ex.: «"annyeong" (안녕) é um oi…») até o aluno montar sílabas.',
    });
  }

  return violacoes;
}

/** Termos que só aparecem no caminho de erro (reteach/reveal), não no ensino universal. */
export function termosSoNoErro(passo: PassoAulaLumen): string[] {
  const universal = tokensPedagogicos(
    [textoBeats(passo), passo.check.correctNote ?? "", textoExplainAgain(passo)].join(" "),
  );
  const noErro = tokensPedagogicos(`${passo.check.reteach} ${passo.check.reveal}`);
  return [...noErro].filter((t) => !universal.has(t));
}

function validarPassoAula(passo: PassoAulaLumen): ViolacaoPedagogica[] {
  const violacoes: ViolacaoPedagogica[] = [];
  const extras = termosSoNoErro(passo);

  if (!passo.beats?.length && passo.teach && passo.teach.length > 160) {
    violacoes.push({
      codigo: "aula-textao",
      onde: passo.id,
      mensagem:
        `O passo "${passo.id}" usa teach longo (${passo.teach.length} chars) sem beats. ` +
        `Divida em 2–5 batidas (fala, destaque, analogia) — universal pra quem não lê muito.`,
    });
  }

  if (passo.beats?.length === 1) {
    violacoes.push({
      codigo: "aula-uma-batida",
      onde: passo.id,
      mensagem: `O passo "${passo.id}" tem só 1 batida — use pelo menos 2 para ritmo de conversa.`,
    });
  }

  if (extras.length > 0 && !passo.check.correctNote) {
    violacoes.push({
      codigo: "conceito-so-no-erro",
      onde: passo.id,
      mensagem:
        `O passo "${passo.id}" ensina no reteach/reveal termos que não estão no teach/correctNote/explainAgain ` +
        `(${extras.slice(0, 5).join(", ")}). Quem acerta de primeira não vê isso — adicione ao teach ou correctNote.`,
    });
  }

  for (const campo of ["explainAgain"] as const) {
    const texto = passo[campo];
    if (!texto) continue;
    if (DEMO_FISICA.test(texto) && !NARRATIVA_GUIADA.test(texto)) {
      violacoes.push({
        codigo: "demo-fisica-sem-narrativa",
        onde: passo.id,
        mensagem:
          `O passo "${passo.id}" (${campo}) pede demonstração física sem narrativa guiada ("imagina…"). ` +
          `A Luna não gera vídeo — reescreva como cena imaginada.`,
      });
    }
  }

  violacoes.push(...validarExplainAgain(passo.id, passo));

  return violacoes;
}

function validarFeynman(item: ItemFeynmanLumen, onde: string): ViolacaoPedagogica[] {
  if (item.guides?.length || item.warmup) return [];
  return [
    {
      codigo: "feynman-sem-andaime",
      onde,
      mensagem:
        `Feynman "${item.id}" sem guides nem warmup — texto livre sem rampa. ` +
        `Inclua guides (pistas) e/ou warmup (micro-quiz antes de escrever).`,
    },
  ];
}

function validarProva(sessao: SessaoLumen): ViolacaoPedagogica[] {
  const violacoes: ViolacaoPedagogica[] = [];
  const aula = sessao.stages.find((s) => s.moment === "aula");
  if (!aula || aula.moment !== "aula") return violacoes;

  const corpusUniversal = corpusEnsinoUniversal(aula.steps);
  let corpusPratica = "";

  for (const stage of sessao.stages) {
    if (stage.moment === "pratica") {
      corpusPratica += " " + stage.items.map((i) => textoItem(i as Record<string, unknown> & { type: string })).join(" ");
    }
    if (stage.moment !== "prova") continue;

    const corpusAntesProva = mergeTokens(corpusUniversal, corpusPratica);

    for (const item of stage.items) {
      if (item.type !== "quiz") continue;
      const certa = item.choices.find((c) => c.id === item.correctId)?.text ?? "";
      const termosProva = tokensPedagogicos(`${item.prompt} ${certa}`);
      const faltando = [...termosProva].filter((t) => !corpusAntesProva.has(t));
      if (faltando.length > 0) {
        violacoes.push({
          codigo: "prova-sem-prerequisito",
          onde: item.id,
          mensagem:
            `Prova "${item.id}" cobra termos que não foram ensinados no caminho universal da aula ` +
            `(nem na prática anterior): ${faltando.slice(0, 6).join(", ")}. ` +
            `Ensine no teach/correctNote antes de avaliar.`,
        });
      }
    }
  }

  return violacoes;
}

/** Valida esquema Zod + regras pedagógicas pós-geração (R0/R2). */
export function validarPedagogiaLumen(entrada: unknown): ResultadoValidacaoPedagogica {
  const parsed = LumenSessionSchema.safeParse(entrada);
  if (!parsed.success) {
    return {
      ok: false,
      violacoes: [
        {
          codigo: "esquema-invalido",
          mensagem: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        },
      ],
    };
  }

  const sessao = parsed.data;
  const violacoes: ViolacaoPedagogica[] = [];

  for (const stage of sessao.stages) {
    if (stage.moment === "aula") {
      for (const passo of stage.steps) {
        violacoes.push(...validarPassoAula(passo));
      }
      if (stage.closer) {
        violacoes.push(...validarFeynman(stage.closer, stage.closer.id));
      }
    } else {
      for (const item of stage.items) {
        if (item.type === "feynman") {
          violacoes.push(...validarFeynman(item, item.id));
        }
        if (item.type === "flashcard" && !item.hint && /\b(por qu[eê]|explique|descreva)\b/i.test(item.front)) {
          violacoes.push({
            codigo: "flashcard-sem-hint",
            onde: item.id,
            mensagem: `Flashcard "${item.id}" pede resposta aberta sem hint — inclua uma pista verbal curta.`,
          });
        }
        if (item.type === "quiz" || item.type === "montar") {
          violacoes.push(...validarExplainAgain(item.id, item));
        }
      }
    }
  }

  violacoes.push(...validarProva(sessao));
  violacoes.push(...validarGranularidade(sessao));

  return { ok: violacoes.length === 0, violacoes };
}
