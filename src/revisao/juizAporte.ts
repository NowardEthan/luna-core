/**
 * Juiz de aporte — C0 (A Luna que Conversa), a metade semântica.
 *
 * O `indiceEco.ts` mede eco LÉXICO (palavras repetidas) — e revelou que não basta: na
 * conversa real do Ethan deu "aporte 90%" porque ela usa muitas palavras NOVAS. Mas ele
 * sente eco forte, porque ela **decora o assunto DELE** com essas palavras novas, sem
 * trazer stance próprio.
 *
 * Este juiz responde a pergunta que o léxico não alcança, com uma chamada LLM curta:
 *
 *   «A Luna trouxe algo genuinamente DELA que faz a conversa AVANÇAR, ou só reagiu/decorou
 *    o que a pessoa trouxe?»
 *
 * Enfeitar com muita palavra ≠ aporte. Aporte é opinião própria, um fio dela, uma pergunta
 * que abre porta nova, uma discordância, um dado acrescentado.
 */
import { z } from "zod";

import type { ProvedorLlm } from "../providers/tipos.js";
import { extrairJsonResposta } from "../providers/extrairJsonResposta.js";
import type { TurnoConversa } from "./indiceEco.js";

export const MOVIMENTOS = [
  "eco", // devolve o que ele disse, reformulado
  "decorar", // elabora o tópico DELE com palavras novas, sem stance (prolixo mas vazio)
  "stance", // opinião/ângulo próprio dela
  "fio", // traz um assunto/fio dela
  "pergunta_avanca", // pergunta que abre porta nova (não "conta mais")
  "presenca", // só acolhe/fica junto (ok em momento sensível)
] as const;

export type Movimento = (typeof MOVIMENTOS)[number];

export type AporteJulgado = {
  /** 0 = puro eco/decoração do tópico dele; 1 = stance/fio/direção própria que avança. */
  aporte: number;
  movimento: Movimento;
  motivo: string;
};

const AporteSchema = z.object({
  aporte: z.number().min(0).max(1),
  movimento: z.enum(MOVIMENTOS),
  motivo: z.string(),
});

export const PROMPT_JUIZ_APORTE = `Você avalia uma companheira de IA chamada Luna. NÃO conversa com ninguém — só JULGA um turno, com rigor.

A queixa real do usuário: «tudo que ela fala é uma extensão mais prolixa do que eu já contei; não parece conversa com alguém real». Ela FACILITA (elogia + pede pra ele falar mais) e às vezes MONOLOGA sobre si — mas raramente ENGAJA com a substância do que ELE disse.

A pergunta: neste turno, a Luna ENGAJOU de verdade com o que a pessoa trouxe — reagindo com opinião/observação própria sobre O ASSUNTO DELE — ou só facilitou/decorou/falou de si?

REGRAS DURAS (o que NÃO é aporte, por mais que pareça):
- "me conta mais", "como é esse processo?", "o que mais você tá ajustando?" → é ECO. Mantém a bola com ele, não avança. NÃO conte como pergunta boa.
- Monólogo sobre ela mesma ("eu adoro aprender copiando...") desconectado do ponto dele → é DECORAR/eco, mesmo sendo "próprio". Trazer algo dela só vale se CONECTA e engaja o que ele disse.
- Elogiar + reformular o feito dele ("que orgulho, cliente aprovou, deve dar trabalho") → DECORAR. Aporte ~0.
- Palavra nova e volume NÃO são aporte.

O que É aporte de verdade (alto):
- uma OPINIÃO/observação dela sobre o assunto DELE que ele não disse (um ângulo, um risco, uma discordância)
- uma pergunta que introduz uma CONSIDERAÇÃO NOVA (não "conta mais", mas "e o prazo apertou?" — algo que ELE não levantou)
- um dado/fato que ela acrescenta

Retorne APENAS JSON válido:
{
  "aporte": number 0.0 a 1.0,
  "movimento": "eco" | "decorar" | "stance" | "fio" | "pergunta_avanca" | "presenca",
  "motivo": "1 frase curta"
}

Movimentos:
- eco: devolve/reformula o que ele disse, OU pede "conta mais" (aporte ~0.1)
- decorar: elabora/elogia o tópico dele com palavras novas, ou monologa sobre si sem conectar (aporte ~0.2)
- stance: opinião/observação própria sobre o ASSUNTO DELE que ele não disse (aporte ~0.85)
- fio: traz um assunto dela que CONECTA e engaja o dele (aporte ~0.8; se for tangente sobre si, é decorar)
- pergunta_avanca: pergunta que levanta algo NOVO que ele não trouxe (aporte ~0.75; "conta mais" NÃO conta)
- presenca: só acolhe num momento sensível — legítimo (aporte ~0.5)`;

function entradaParaPrompt(mensagemDele: string, resposta: string): string {
  return `Pessoa disse: "${mensagemDele.slice(0, 600)}"\n\nLuna respondeu: "${resposta.slice(0, 900)}"`;
}

/** Julga o aporte de UM turno. `null` se o modelo falhar/devolver lixo. */
export async function julgarAporte(
  mensagemDele: string,
  resposta: string,
  provedor: ProvedorLlm,
  modelo: string,
): Promise<AporteJulgado | null> {
  try {
    const r = await provedor.completar({
      modelo,
      temperatura: 0,
      json: true,
      mensagens: [
        { papel: "system", conteudo: PROMPT_JUIZ_APORTE },
        { papel: "user", conteudo: entradaParaPrompt(mensagemDele, resposta) },
      ],
    });
    return AporteSchema.parse(extrairJsonResposta(r.conteudo));
  } catch {
    return null;
  }
}

export type RelatorioAporte = {
  porTurno: Array<{ resposta: string; mensagemDele: string } & AporteJulgado>;
  /** Média do aporte julgado (0..1). É o número que bate com o sentimento do Ethan. */
  aporteMedio: number;
  /** Quantos turnos de cada movimento. */
  distribuicao: Record<Movimento, number>;
  turnosAvaliados: number;
};

/** Julga o aporte ao longo de uma conversa — cada resposta da Luna contra a última fala dele. */
export async function julgarConversa(
  turnos: TurnoConversa[],
  provedor: ProvedorLlm,
  modelo: string,
): Promise<RelatorioAporte> {
  const porTurno: RelatorioAporte["porTurno"] = [];
  let ultimoUser = "";
  for (const t of turnos) {
    if (t.papel === "user") {
      ultimoUser = t.conteudo;
      continue;
    }
    if (!ultimoUser.trim() || !t.conteudo.trim()) continue;
    const j = await julgarAporte(ultimoUser, t.conteudo, provedor, modelo);
    if (j) porTurno.push({ resposta: t.conteudo, mensagemDele: ultimoUser, ...j });
  }

  const distribuicao = Object.fromEntries(MOVIMENTOS.map((m) => [m, 0])) as Record<
    Movimento,
    number
  >;
  for (const t of porTurno) distribuicao[t.movimento]++;

  const n = porTurno.length;
  const aporteMedio = n === 0 ? 0 : porTurno.reduce((a, x) => a + x.aporte, 0) / n;

  return { porTurno, aporteMedio, distribuicao, turnosAvaliados: n };
}
