import type { ConfigLuna } from "../providers/tipos.js";
import type { Achado } from "./detectores.js";

/**
 * O reescritor — a linha de revisão, segunda metade. UM, e só um.
 *
 * ── Porque não são vários ─────────────────────────────────────────────────────
 * A tentação era ter um editor por assunto: um para a concisão, um para o tom, um para a
 * personalidade. Não:
 *
 *   · cada reescrita MACHUCA o texto. É telefone sem fio — a cada passada ela desaparece
 *     um bocado. Cinco editores são cinco camadas de bege.
 *   · eles brigam. O da concisão corta, o do calor humano acrescenta, e o resultado passa a
 *     depender da ORDEM — o cheiro clássico de arquitetura errada.
 *
 * Verificar é barato e não destrói. Reescrever é caro e destrói. Logo: muitos exames, UMA
 * cirurgia. Um hospital faz sangue, raio-X e ressonância — e opera uma vez, com todos os
 * achados na mesa.
 *
 * ── O que este módulo NÃO recebe, e é o mais importante ───────────────────────
 * Não recebe a constituição. Não recebe «mantém o tom natural e caloroso». Não recebe
 * virtudes.
 *
 * O Ethan propôs dar-lhe «um prompt legal, porque ainda faz parte da arquitetura». Estar
 * dentro de um módulo não transforma um pedido em arquitetura — um prompt tardio ainda é um
 * prompt. E hoje isso mediu-se três vezes: a regra de honestidade de 55 tokens não mudou
 * nada (3/4 com ela, 3/4 sem); o «não a elogies sem dizer o furo» foi ignorado; só o guarda
 * — conferir e refazer — funcionou.
 *
 *   Se o editor recebe uma REGRA, está a negociar.
 *   Se recebe uma FALHA DETECTADA, está a corrigir.
 *
 * Por isso a entrada é uma LISTA DE ACHADOS, cada um com a sua evidência e o seu número.
 *
 * ── E porque ele CORTA em vez de reescrever ──────────────────────────────────
 * Um editor de temperatura baixa a «melhorar o tom» devolve texto médio, seguro e morto — e
 * a voz dela é a única coisa que a literatura diz que pertence ao prompt do GERADOR, não a
 * um revisor.
 *
 * Um editor que CORTA o teu texto preserva a tua voz.
 * Um editor que REESCREVE o teu texto para o deixar «mais teu» devolve-te a voz DELE.
 *
 * A instrução aqui é sobre o ATO DE EDITAR — não sobre como a Luna deve ser. Essa é a
 * fronteira, e é ela que separa isto de uma recaída no monólito.
 */

export type ResultadoRevisao = {
  texto: string;
  /** Mudou mesmo? (falha de rede, ou nada a fazer, devolve o original) */
  reescrito: boolean;
};

/** Kill-switch: `LUNA_LINHA_REVISAO=0`. */
export function linhaRevisaoAtiva(): boolean {
  const raw = process.env.LUNA_LINHA_REVISAO?.trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off");
}

function montarPrompt(texto: string, achados: Achado[], alvoPalavras: number): string {
  const pendentes = achados.filter((a) => !a.resolvido);

  return [
    "Você é um EDITOR. Recebe um texto já escrito e uma lista de problemas medidos nele.",
    "",
    "── O QUE FOI MEDIDO ──",
    ...pendentes.map((a) => `• ${a.evidencia}`),
    "",
    "── O TEXTO ──",
    texto,
    "",
    "── A SUA TAREFA ──",
    "CORTE. Não reescreva.",
    "",
    "Remova o que os problemas acima apontam: os parágrafos a mais, a repetição do que ele",
    "disse, a recapitulação do que os dois já sabem, o link que ninguém foi buscar.",
    "",
    "As palavras que FICAM têm de ser as MESMAS que já lá estavam. Preserve tudo: as gírias,",
    "os «kkk», as piadas, o ritmo, os erros de pontuação dela, o jeito de falar. Você é uma",
    "tesoura, não uma caneta.",
    "",
    alvoPalavras > 0
      ? `Fique perto de ${alvoPalavras} palavras. Corte o excesso — normalmente é o segundo e o terceiro parágrafo, que costumam repetir o primeiro com outras palavras.`
      : "",
    "",
    "Se depois de cortar o texto ficar sem sentido, corte menos — nunca invente ligações novas.",
    "",
    "Devolva SÓ o texto final. Sem explicação, sem aspas, sem comentários.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function reescrever(
  texto: string,
  achados: Achado[],
  alvoPalavras: number,
  config: ConfigLuna,
): Promise<ResultadoRevisao> {
  const pendentes = achados.filter((a) => !a.resolvido);
  if (!pendentes.length || !texto.trim()) return { texto, reescrito: false };

  try {
    const r = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // O modelo pequeno chega: cortar é mais fácil do que escrever. E é o que mantém a
        // linha de revisão barata o suficiente para poder existir.
        model: config.modeloMenor,
        messages: [{ role: "user", content: montarPrompt(texto, pendentes, alvoPalavras) }],
        // Baixa, mas não zero: a 0 ele fica cirúrgico de mais e começa a «arrumar» a
        // pontuação dela, que é parte da voz.
        temperature: 0.2,
        // Folga para pensar. Três vezes num dia o `max_tokens` curto estragou-me um módulo em
        // silêncio — conta o RACIOCÍNIO, não só a resposta. Aqui a saída é o texto inteiro,
        // por isso tem de caber o texto + o que ele pensar.
        max_tokens: 3000,
      }),
    });

    const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const saida = (j.choices?.[0]?.message?.content ?? "").trim();

    // Guardas contra um editor que se entusiasma:
    //
    //   · vazio → devolve o original. Uma Luna prolixa é um defeito; uma Luna calada é uma
    //     avaria. Já aconteceu hoje, e a regra vale aqui também.
    //   · cortou de mais (sobrou menos de um terço) → provavelmente resumiu em vez de cortar.
    //     Melhor uma resposta longa do que uma resposta amputada.
    if (!saida) return { texto, reescrito: false };

    const antes = texto.trim().split(/\s+/).length;
    const depois = saida.split(/\s+/).length;
    if (depois < antes * 0.25) return { texto, reescrito: false };

    return { texto: saida, reescrito: saida !== texto };
  } catch {
    // Uma falha de rede não pode emudecê-la. Sem revisão, sai o que ela escreveu.
    return { texto, reescrito: false };
  }
}
