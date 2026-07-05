import { describe, expect, it } from "vitest";

import { termosSoNoErro, validarPedagogiaLumen } from "./validarPedagogiaLumen.js";

/** Recorte do passo fl2 da demo — o bug que a Raquel encontrou (eclipse só no erro). */
const passoFl2ComBug = {
  id: "fl2",
  teach:
    "Segunda ideia: a Lua NÃO muda de forma. O que muda é o ângulo de onde a gente vê a metade iluminada.",
  explainAgain:
    "Faz em casa: segura uma laranja com o braço esticado num quarto escuro, com uma lanterna acesa longe de você.",
  check: {
    question: "Quando vemos só um risquinho fino de Lua, é porque...",
    choices: [
      { id: "a", text: "A Terra fez uma sombra que tampou o resto" },
      { id: "b", text: "Estamos vendo só uma beiradinha da metade iluminada" },
    ],
    correctId: "b",
    reteach:
      "Quase todo mundo pensa na sombra — mas sombra da Terra é outra coisa (chama eclipse, e é raro!).",
    reveal: "É a beiradinha da metade iluminada. (A sombra da Terra é o eclipse — outra história.)",
  },
};

describe("validarPedagogiaLumen", () => {
  it("detecta conceito só no caminho de erro (eclipse)", () => {
    const extras = termosSoNoErro(passoFl2ComBug);
    expect(extras).toContain("eclipse");

    const resultado = validarPedagogiaLumen({
      topic: "Fases da Lua",
      subtitle: "teste",
      stages: [
        {
          moment: "aula",
          title: "Aula",
          intro: "intro",
          steps: [passoFl2ComBug],
          closer: {
            id: "closer",
            type: "feynman",
            prompt: "Explique as fases",
            rubric: [{ text: "reflete o sol", keywords: ["sol"] }],
            sampleAnswer: "resposta",
            cosmo: 0,
          },
        },
        {
          moment: "prova",
          title: "Prova",
          intro: "intro",
          items: [
            {
              id: "fe1",
              type: "quiz",
              prompt: "Qual é a diferença entre FASES da lua e um ECLIPSE?",
              choices: [
                { id: "a", text: "Fase é ângulo; eclipse é sombra rara" },
                { id: "b", text: "São a mesma coisa" },
              ],
              correctId: "a",
              explanation: "explicação",
              cosmo: 10,
            },
          ],
        },
      ],
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.violacoes.some((v) => v.codigo === "conceito-so-no-erro")).toBe(true);
    expect(resultado.violacoes.some((v) => v.codigo === "prova-sem-prerequisito")).toBe(true);
    expect(resultado.violacoes.some((v) => v.codigo === "demo-fisica-sem-narrativa")).toBe(true);
    expect(resultado.violacoes.some((v) => v.codigo === "feynman-sem-andaime")).toBe(true);
  });

  it("aceita sessão com ensino universal e andaimes", () => {
    const resultado = validarPedagogiaLumen({
      topic: "Fases da Lua",
      subtitle: "teste",
      stages: [
        {
          moment: "aula",
          title: "Aula",
          intro: "intro",
          steps: [
            {
              id: "fl2",
              teach:
                "O que muda é o ângulo. Eclipse é sombra da Terra na Lua — raro, diferente das fases do dia a dia.",
              check: {
                question: "Risquinho de lua crescente é porque...",
                choices: [
                  { id: "a", text: "Sombra da Terra" },
                  { id: "b", text: "Beiradinha da metade iluminada" },
                ],
                correctId: "b",
                correctNote: "Isso! Eclipse é outra história — sombra real, bem rara.",
                reteach: "Nas fases do dia a dia é só ângulo — eclipse é sombra da Terra, raro.",
                reveal: "É só o ângulo: a metade iluminada vista de lado.",
              },
              explainAgainBeats: [
                { kind: "fala", text: "Imagina: você no centro, Terra na frente, Sol longe." },
                { kind: "fala", text: "A Lua dá a volta — você vê fatias diferentes da metade acesa." },
              ],
            },
          ],
          closer: {
            id: "closer",
            type: "feynman",
            prompt: "Duas frases: por que a lua muda de formato?",
            guides: ["De onde vem o brilho?", "O que muda — a lua ou o ângulo?"],
            warmup: {
              question: "O que muda no céu?",
              choices: [
                { id: "a", text: "O ângulo de visão" },
                { id: "b", text: "O tamanho da lua" },
              ],
              correctId: "a",
              reteach: "É geometria — ângulo.",
              reveal: "É o ângulo.",
            },
            rubric: [{ text: "reflete o sol", keywords: ["sol"] }],
            sampleAnswer: "resposta",
            cosmo: 0,
          },
        },
        {
          moment: "prova",
          title: "Prova",
          intro: "intro",
          items: [
            {
              id: "fe1",
              type: "quiz",
              prompt: "Diferença entre fases da lua e eclipse?",
              choices: [
                { id: "a", text: "Fase é ângulo; eclipse é sombra rara" },
                { id: "b", text: "Iguais" },
              ],
              correctId: "a",
              explanation: "ok",
              cosmo: 10,
            },
          ],
        },
      ],
    });

    expect(resultado.ok).toBe(true);
    expect(resultado.violacoes).toHaveLength(0);
  });

  it("rejeita aula densa de vogais (feedback coreano)", () => {
    const resultado = validarPedagogiaLumen({
      topic: "Vogais coreanas",
      subtitle: "ㅏ ㅓ ㅗ ㅜ",
      stages: [
        {
          moment: "aula",
          title: "Aula",
          intro: "intro",
          introBeats: [
            {
              kind: "destaque",
              text: "Dez vogais: ㅏ (a), ㅓ (eo), ㅗ (o), ㅜ (u), ㅡ (eu), ㅣ (i)",
            },
          ],
          steps: [
            {
              id: "vog-1",
              beats: [
                { kind: "destaque", text: "ㅏ = a" },
                { kind: "fala", text: "ㅓ = eo entre ó e u." },
              ],
              check: {
                question: "Qual é ㅏ?",
                choices: [
                  { id: "a", text: "a" },
                  { id: "b", text: "o" },
                ],
                correctId: "a",
                reteach: "a",
                reveal: "a",
              },
            },
            {
              id: "vog-2",
              beats: [
                { kind: "destaque", text: "ㅗ e ㅜ" },
                { kind: "fala", text: "o e u." },
              ],
              check: {
                question: "ㅜ?",
                choices: [
                  { id: "a", text: "u" },
                  { id: "b", text: "a" },
                ],
                correctId: "a",
                reteach: "u",
                reveal: "u",
              },
            },
            {
              id: "vog-3",
              beats: [
                { kind: "destaque", text: "ㅣ = i" },
                { kind: "fala", text: "som de i." },
              ],
              check: {
                question: "ㅣ?",
                choices: [
                  { id: "a", text: "i" },
                  { id: "b", text: "a" },
                ],
                correctId: "a",
                reteach: "i",
                reveal: "i",
              },
            },
          ],
          closer: {
            id: "vog-closer",
            type: "feynman",
            prompt: "Cite três vogais",
            guides: ["ㅏ", "ㅗ"],
            rubric: [{ text: "vogais", keywords: ["ㅏ"] }],
            sampleAnswer: "ㅏ ㅗ ㅜ",
            cosmo: 0,
          },
        },
        {
          moment: "pratica",
          title: "Prática",
          intro: "intro",
          items: [
            {
              id: "p1",
              type: "quiz",
              prompt: "ㅏ?",
              choices: [
                { id: "a", text: "a" },
                { id: "b", text: "o" },
              ],
              correctId: "a",
              explanation: "a",
              cosmo: 8,
            },
          ],
        },
      ],
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.violacoes.some((v) => v.codigo === "aula-muitos-passos")).toBe(true);
    expect(resultado.violacoes.some((v) => v.codigo === "muitas-vogais-por-aula")).toBe(true);
    expect(resultado.violacoes.some((v) => v.codigo === "feynman-cedo-alfabeto")).toBe(true);
  });

  it("aceita micro-aula de uma vogal (padrão Duolingo)", () => {
    const resultado = validarPedagogiaLumen({
      topic: "Vogal ㅏ",
      subtitle: "ㅏ · som a",
      stages: [
        {
          moment: "aula",
          title: "Novo som",
          intro: "Só ㅏ hoje.",
          introBeats: [
            { kind: "destaque", text: "ㅏ" },
            { kind: "fala", text: "Som de a como em pato." },
          ],
          steps: [
            {
              id: "vogal-a-learn",
              beats: [
                { kind: "destaque", text: "ㅏ → a" },
                { kind: "fala", text: "Exemplo: 아" },
              ],
              check: {
                question: "ㅏ soa como?",
                choices: [
                  { id: "a", text: "a" },
                  { id: "b", text: "o" },
                ],
                correctId: "a",
                reteach: "a",
                reveal: "a",
              },
            },
          ],
        },
        {
          moment: "pratica",
          title: "Prática",
          intro: "intro",
          items: [
            {
              id: "p1",
              type: "quiz",
              prompt: "Que som faz ㅏ?",
              choices: [
                { id: "a", text: "a" },
                { id: "b", text: "o" },
              ],
              correctId: "a",
              explanation: "ㅏ = a",
              cosmo: 8,
            },
          ],
        },
      ],
    });

    expect(resultado.ok).toBe(true);
  });

  it("rejeita pergunta com 안녕하세요 sem romanização (feedback sílabas)", () => {
    const resultado = validarPedagogiaLumen({
      topic: "Olá",
      subtitle: "teste",
      stages: [
        {
          moment: "aula",
          title: "Aula",
          intro: "intro",
          steps: [
            {
              id: "ola-bad",
              beats: [
                { kind: "destaque", text: "안녕하세요" },
                { kind: "fala", text: "Olá formal." },
              ],
              check: {
                question: "안녕하세요 é usado para…",
                choices: [
                  { id: "a", text: "Olá" },
                  { id: "b", text: "Tchau" },
                ],
                correctId: "a",
                reteach: "olá",
                reveal: "olá",
              },
            },
          ],
        },
        {
          moment: "pratica",
          title: "Prática",
          intro: "intro",
          items: [
            {
              id: "p1",
              type: "quiz",
              prompt: "teste",
              choices: [
                { id: "a", text: "a" },
                { id: "b", text: "b" },
              ],
              correctId: "a",
              explanation: "ok",
              cosmo: 8,
            },
          ],
        },
      ],
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.violacoes.some((v) => v.codigo === "hangul-longo-sem-romanizacao")).toBe(true);
    expect(resultado.violacoes.some((v) => v.codigo === "muitas-silabas-por-aula")).toBe(true);
  });
});
