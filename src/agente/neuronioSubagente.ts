import type { ConfigLuna, ProvedorLlm } from "../providers/tipos.js";

export type EspecialidadeNeuronio =
  | "orientacao"
  | "auditoria"
  | "canone"
  | "pesquisa";

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
  canone:
    "Você é o neurônio de Cânone da Luna (subagente). Ela te consulta sobre fatos FIXOS do " +
    "artefato (nomes, idades, relações, decisões). Responda em pt-BR, 3–6 frases: " +
    "(1) que fato anotar/editar/apagar, " +
    "(2) a ação exata de `anotar_canone` (adicionar | editar | apagar + campos), " +
    "(3) se há risco de contradizer o texto já escrito. " +
    "NÃO reescreva capítulos. NÃO invente biografia — só o que o contexto sustenta. " +
    "Fale só com a Luna.",
  pesquisa:
    "Você é o neurônio de Pesquisa da Luna (subagente). Ela te pergunta SE e COMO buscar " +
    "fato público (web). Viés padrão: SE for fato do mundo que pode envelhecer " +
    "(notícia, preço, versão, lei, evento, status), diga PRA BUSCAR — o treino dela não é fonte " +
    "atualizada. Contexto local basta só pra dado DELE (finanças/rotina/doc/cânone) ou opinião " +
    "sem fato verificável. Responda em pt-BR, 3–6 frases: " +
    "(1) web_search / ler_url — sim ou não (e por quê), " +
    "(2) se sim, 1–2 queries concretas em português (inclua o ano se for «atual/hoje»), " +
    "(3) o que NÃO inventar. " +
    "NÃO execute a busca. NÃO invente URLs nem números. Fale só com a Luna.",
};

const ALIASES: Record<string, EspecialidadeNeuronio> = {
  orientacao: "orientacao",
  orientação: "orientacao",
  auditoria: "auditoria",
  canone: "canone",
  cânone: "canone",
  pesquisa: "pesquisa",
  web: "pesquisa",
};

export function resolverEspecialidadeNeuronio(
  raw: string,
): EspecialidadeNeuronio | null {
  const k = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return ALIASES[k] ?? null;
}

/**
 * Subagente curto — a Luna chama via `consultar_neuronio`. Um LLM pequeno/barato por consulta.
 */
export async function consultarNeuronioSubagente(
  deps: { provedor: ProvedorLlm; config: ConfigLuna },
  args: Record<string, unknown>,
): Promise<string> {
  const especialidadeRaw = String(args.especialidade ?? args.neuronio ?? "orientacao");
  const especialidade =
    resolverEspecialidadeNeuronio(especialidadeRaw) ?? "orientacao";
  const pergunta = String(args.pergunta ?? args.pedido ?? "").trim();
  if (!pergunta) {
    return "ERRO: passa em `pergunta` o que você quer saber do neurônio (1–3 frases).";
  }
  const contexto = String(args.contexto ?? "").trim();

  const user =
    (contexto ? `Contexto (trecho/índice/cânone/estado):\n${contexto.slice(0, 4000)}\n\n` : "") +
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
      `Usa isto pra decidir a próxima mão — depois age (tool) ou fala com o Ethan. ` +
      `Não consulte outro neurônio em seguida sem ter agido.`
    );
  } catch (erro) {
    return `ERRO ao consultar neurônio: ${erro instanceof Error ? erro.message : String(erro)}`;
  }
}
