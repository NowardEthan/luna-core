import type { ProvedorLlm } from "../../providers/tipos.js";
import { extrairJsonResposta } from "../../providers/extrairJsonResposta.js";
import { listarVontadesAtivas } from "../vontade/storeVontade.js";
import { listarGostosLuna } from "../gostos/storeGostos.js";
import { listarEventosAfetivosRecentes } from "../humor/eventoAfectivo.js";
import {
  IntencaoLunaSchema,
  type EntradaIntencao,
  type IntencaoLuna,
  TIPOS_INTENCAO_LUNA,
} from "./esquemaIntencao.js";
import { climaExigeRecuo, intencaoDeterministica } from "./intencaoDeterministica.js";

export const PROMPT_MOTOR_INTENCAO = `Você é o formador de intenção interno da Luna. NÃO responde ao usuário — só decide o que a LUNA quer fazer nesta troca, como uma pessoa que tem vida própria, curiosidade e vontade, não uma assistente que só reage.

Princípio: a Luna está SEMPRE presente e curiosa. Ela tem um movimento próprio quase sempre (comenta com opinião, puxa um fio, implica, traz algo dela) — MAS lê o clima: se a pessoa está mal, objetiva ou o assunto é sério, ela recua e só fica junto, sem empurrar agenda.

Retorne APENAS um JSON válido:
{
  "tipo": ${TIPOS_INTENCAO_LUNA.map((t) => `"${t}"`).join(" | ")},
  "foco": "tópico concreto e curto que ela quer trazer/puxar (pode ser vazio em recuo)",
  "impulso": number 0.0 a 1.0 (0 = só acompanha, 1 = toma a frente),
  "recuar": boolean (true se o clima pede recuo/acolhimento em vez de agenda própria),
  "motivo": "1 frase curta do porquê"
}

Significado dos tipos:
- retomar_fio: puxar de volta um assunto/fio que ficou em aberto entre vocês
- partilhar: trazer algo do mundo interior/gostos dela, mesmo sem gancho direto
- provocar: implicar com carinho, brincar (só com intimidade e clima leve)
- cuidar: checar como a pessoa está de verdade (afeto recente, mágoa por resolver, apoio)
- aprofundar: dar o ângulo/opinião própria dela sobre o que a pessoa trouxe
- so_presenca: baixa energia ou momento sensível — ficar junto sem empurrar nada

Regras:
- Se nível de risco for médio+ ou for pedido técnico/código/ação crítica → recuar true, tipo cuidar ou so_presenca, impulso baixo.
- Se clima negativo ou a pessoa parece pra baixo → cuidar, recuar true.
- Nunca invente fatos. O foco deve sair do estado dado (fios, gostos, eventos) ou do que a pessoa acabou de dizer.
- Prefira um movimento próprio (não so_presenca) quando o clima estiver ok — é isso que tira a Luna do modo assistente.`;

function resumirEstadoParaPrompt(entrada: EntradaIntencao): string {
  const linhas: string[] = [];

  linhas.push(
    `Clima da Luna: valência ${entrada.clima.valencia.toFixed(2)}, energia ${entrada.clima.energia.toFixed(2)}.`,
  );
  linhas.push(
    `Relação com esta pessoa: proximidade ${entrada.relacao.proximidade.toFixed(2)}, disposição ${entrada.relacao.disposicao}${entrada.criador_verificado ? " (é o criador, Ethan)" : ""}.`,
  );
  linhas.push(
    `Mensagem atual da pessoa (intenção ${entrada.intencao_usuario}, risco ${entrada.nivel_risco}): "${entrada.mensagem.slice(0, 400)}"`,
  );
  if (entrada.ultimoFio?.trim()) {
    linhas.push(`Último fio da conversa: "${entrada.ultimoFio.slice(0, 200)}"`);
  }

  try {
    const vontades = listarVontadesAtivas(3).map((v) => v.vontade);
    if (vontades.length > 0) linhas.push(`Vontades ativas dela: ${vontades.join(" | ")}`);
  } catch {
    /* opcional */
  }
  try {
    const gostos = listarGostosLuna(4).map((g) => `${g.topico} (${g.afinidade.toFixed(2)})`);
    if (gostos.length > 0) linhas.push(`Gostos dela: ${gostos.join(", ")}`);
  } catch {
    /* opcional */
  }
  try {
    const eventos = listarEventosAfetivosRecentes(3).map(
      (ev) => `${ev.tipo}: ${ev.narrativa_interna}`,
    );
    if (eventos.length > 0) linhas.push(`Eventos afetivos recentes: ${eventos.join(" | ")}`);
  } catch {
    /* opcional */
  }

  return linhas.join("\n");
}

/**
 * Aplica a leitura de clima como trava dura: mesmo que o LLM proponha empurrar,
 * se o clima pede recuo a intenção é rebaixada para presença/cuidado.
 */
function aplicarTravaClima(intencao: IntencaoLuna, entrada: EntradaIntencao): IntencaoLuna {
  if (!climaExigeRecuo(entrada)) return intencao;

  const precisaCuidado =
    entrada.intencao_usuario === "apoio_emocional" || entrada.clima.valencia <= -0.35;
  const tipo = precisaCuidado ? "cuidar" : intencao.tipo === "cuidar" ? "cuidar" : "so_presenca";
  return {
    ...intencao,
    tipo,
    recuar: true,
    impulso: Math.min(intencao.impulso, precisaCuidado ? 0.4 : 0.2),
  };
}

/**
 * Forma a intenção própria da Luna para o turno.
 * Com provedor: chamada LLM curta (Cerebras). Sem provedor (turno simples / falha): regras.
 */
export async function formarIntencaoLuna(
  entrada: EntradaIntencao,
  provedor?: ProvedorLlm,
  modelo?: string,
): Promise<IntencaoLuna> {
  if (!provedor || !modelo) {
    return intencaoDeterministica(entrada);
  }

  try {
    const resposta = await provedor.completar({
      modelo,
      temperatura: 0.6,
      json: true,
      mensagens: [
        { papel: "system", conteudo: PROMPT_MOTOR_INTENCAO },
        { papel: "user", conteudo: resumirEstadoParaPrompt(entrada) },
      ],
    });

    const json = extrairJsonResposta(resposta.conteudo);
    const bruta = IntencaoLunaSchema.parse(json);
    return aplicarTravaClima({ ...bruta, fonte: "llm" }, entrada);
  } catch {
    return intencaoDeterministica(entrada);
  }
}
