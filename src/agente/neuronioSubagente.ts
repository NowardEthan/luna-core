import type { ConfigLuna, ProvedorLlm } from "../providers/tipos.js";

export type EspecialidadeNeuronio = "orientacao" | "auditoria";

const SYSTEM_POR_ESPECIALIDADE: Record<EspecialidadeNeuronio, string> = {
  orientacao:
    "Você é o neurônio de Orientação da Luna (subagente). Ela te consulta sobre como " +
    "seguir num artefato/livro/plano. Responda em pt-BR, 3–6 frases objetivas: " +
    "(1) o que ler agora (estrutura vs uma seção — no máx. 1–2 seções), " +
    "(2) se já dá pra escrever/continuar, " +
    "(3) o próximo passo concreto (qual tool / after_secao). " +
    "PROIBIDO ping-pong de capítulos. NÃO escreva o artefato. NÃO fale com o usuário final — " +
    "fale só com a Luna.",
  auditoria:
    "Você é o neurônio de Auditoria da Luna (subagente). Ela te pede pra conferir se uma " +
    "edição ficou coerente. Responda em pt-BR, 3–6 frases: o que conferir (estrutura vs " +
    "trecho), riscos (tom, cânone, seções sumidas), e se precisa de mão cirúrgica ou já " +
    "pode fechar falando com o usuário. NÃO reescreva o artefato. NÃO faça ping-pong de leituras.",
};

/**
 * Subagente curto — a Luna chama via `consultar_neuronio`. Um LLM pequeno/barato por consulta.
 */
export async function consultarNeuronioSubagente(
  deps: { provedor: ProvedorLlm; config: ConfigLuna },
  args: Record<string, unknown>,
): Promise<string> {
  const especialidadeRaw = String(args.especialidade ?? args.neuronio ?? "orientacao")
    .trim()
    .toLowerCase();
  const especialidade: EspecialidadeNeuronio =
    especialidadeRaw === "auditoria" ? "auditoria" : "orientacao";
  const pergunta = String(args.pergunta ?? args.pedido ?? "").trim();
  if (!pergunta) {
    return "ERRO: passa em `pergunta` o que você quer saber do neurônio (1–3 frases).";
  }
  const contexto = String(args.contexto ?? "").trim();

  const user =
    (contexto ? `Contexto (trecho/índice/estado):\n${contexto.slice(0, 4000)}\n\n` : "") +
    `Pedido da Luna:\n${pergunta}`;

  try {
    const resp = await deps.provedor.completar({
      modelo: deps.config.modeloMenor || deps.config.modeloMaior,
      mensagens: [
        { papel: "system", conteudo: SYSTEM_POR_ESPECIALIDADE[especialidade] },
        { papel: "user", conteudo: user },
      ],
      temperatura: 0.35,
      maxTokens: 450,
      raciocinioAtivo: false,
    });
    const texto = resp.conteudo.trim();
    if (!texto) {
      return "ERRO: o neurônio não devolveu texto. Decide sozinha com o índice e age.";
    }
    return (
      `Neurônio «${especialidade}» respondeu:\n${texto}\n\n` +
      `Usa isto pra decidir a próxima mão — depois age (escrever/ler UMA seção) ou fala com o Ethan.`
    );
  } catch (erro) {
    return `ERRO ao consultar neurônio: ${erro instanceof Error ? erro.message : String(erro)}`;
  }
}
