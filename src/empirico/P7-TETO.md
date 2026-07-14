# P7 — A parede era de papel

**Data:** 2026-07-13
**Bateria:** `p7Teto.ts`
**Veredito:** o teto do neurónio de registo **nunca encostava**. Corrigido pela medição.

---

## O que se foi medir

O neurónio de registo (`estado/registroConversa.ts`) calcula um teto de `max_tokens` para o
papo casual. Como o `max_tokens` conta o **raciocínio** junto com a resposta, somei-lhe uma
reserva para o pensamento não ser amordaçado:

```ts
export const RESERVA_RACIOCINIO = 600;
```

Escolhi 600 **com medo**. Nunca medi. Este é o problema inteiro numa linha.

## O número

| | tokens |
|---|---|
| ela **pensa** (média, turno casual) | **35** — e em metade dos turnos, **zero** |
| ela **diz** | **63** |
| o teto que eu enviava (`alvo 25p → 56tk + 600`) | **656** |
| **folga que nunca foi tocada** | **558** |

O pico de raciocínio observado num turno casual foi **139 tokens**. A minha reserva era
**4,3× o pico** e **17× a média**.

## O que isso significa

A parede era **decorativa**. Em todos os turnos casuais, o `max_tokens` estava a meio
quilómetro do corpo — não limitava coisa nenhuma.

E há uma consequência pior, que só se vê olhando para a P4: no braço «com neurónio», a única
coisa que agia era a **diretiva de 12 tokens** no briefing. Ou seja, **eu tinha voltado ao
prompt sem dar por isso** — exatamente aquilo que o Ethan matou («um cérebro que não pode
negociar consigo mesmo»).

E o resultado foi o que o prompt costuma dar:

```
palavras no papo    53  →  62     (piorou)
eco               2/16  →  4/16   (piorou)
iniciativa       15/16  → 13/16   (piorou)
```

A arquitetura não falhou. **Ela nunca foi ligada.**

## O medo era infundado

A terceira parte da bateria pôs uma parede que *encosta de verdade* (`max_tokens = 91`) e
perguntou o que eu temia: ela fica sem voz?

```
«bom dia! tô no busão indo pro trampo, ouvindo música»
  → 26 palavras, sem corte a meio, ainda a fazer pergunta

  «Bom dia! Haha, clássico cenário de busão lotado. Tá ouvindo o quê?
   Vou chutar: um rockzinho pra acordar ou uma sofrência…»
```

Nem truncou, nem perdeu o tom, nem deixou de puxar conversa. É **exatamente** o que os 378
tokens de sermão tentavam pedir — e não conseguiam.

## A correção

```ts
export const RESERVA_RACIOCINIO = 200;  // pico medido 139 + margem
```

Turnos de análise continuam **sem teto nenhum** (`tetoTokens: 0`) — a reserva só existe para
o papo, onde o raciocínio é curto ou inexistente.

## A lição

> Um parâmetro escolhido por medo é um parâmetro que não existe.

Eu construí a parede, escrevi o teste, vi os testes passarem (9/9) e teria commitado a coisa
como «arquitetura» — quando na prática tinha entregue um prompt disfarçado. Os testes
unitários passavam porque testavam a **aritmética** do neurónio, não o efeito dele no mundo.

É o mesmo erro do `memoriaNoBriefing.test.ts`, que passava com o bug porque usava secções
pequenas de mais. Já está escrito e continua a valer:

**Um teste que não apanha o bug não vale nada.**
