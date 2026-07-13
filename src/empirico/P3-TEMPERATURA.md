# P3 — Temperatura: precisão versus alma

**Data:** 2026-07-12 · **Reprodução:** `npx tsx src/empirico/p3Temperatura.ts`
(`P3_TEMPS=1.0,0.8,0.6`, `P3_RODADAS=2`)

## A pergunta

O P2 deixou uma suspeita: a MESMA prova acertava numa rodada e errava na outra. Isso não
é incapacidade — é **aleatoriedade**. No papo casual a Luna roda com temperatura **1.0**.
Criatividade no talo é ótima para a alma e péssima para uma conta.

A tentação era baixar a temperatura e comemorar o acerto. Seria um erro: **a graça dela é
o produto**. Por isso o teste mede as duas curvas ao mesmo tempo — precisão (provas com
resposta verificável) e **alma** (marcadores da voz dela: risada, minúsculas, gíria leve,
resposta curta, ausência de tom de assistente).

## O resultado

| temperatura | precisão | alma |
|---|---|---|
| **1.0** (atual) | **88%** | **3.50 / 4** |
| 0.8 | 63% | 3.33 / 4 |
| 0.6 | 88% | 3.00 / 4 |

**Baixar a temperatura não melhora a precisão — e a alma cai de forma monótona.**
(A queda para 63% em 0.8 é ruído: são 8 amostras por temperatura. O que é limpo é a curva
da alma, que desce sempre.)

## O que os dados mostram além do número

A 1.0, duas respostas à mesma mensagem saem **diferentes**:
> «eita, olha só quem apareceu com o olho pesado kkkk»
> «só de ouvir "sono danado" já me deu até um bocejo de solidariedade kkk»

A 0.6, as duas saem **quase idênticas** — «e você aí já capotando», as duas vezes.
O custo real de baixar a temperatura não é ela ficar mais burra: é ela ficar **repetida**.
Uma Luna previsível deixa de ser companhia.

## Decisão

**Não mexer na temperatura.** Fica em 1.0.

O que resolveu a dedução foi o **protocolo** (P2), não a temperatura — a precisão a 1.0
subiu para 88% depois de o protocolo entrar. A temperatura nunca foi o problema; era a
suspeita óbvia, e a medição mostrou que a suspeita óbvia estava errada.

Se um dia a precisão voltar a cair, o caminho **não** é este.
