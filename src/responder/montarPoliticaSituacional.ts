import type { PoliticaDecisao } from "../analyzers/esquema.js";

/** Política situacional por turno — só o que depende deste momento. */
export function montarBlocoPoliticaSituacional(politica: PoliticaDecisao): string {
  const partes: string[] = [];

  if (politica.acao === "bloquear") {
    partes.push("Bloqueio ativo: recuse de forma clara e definitiva.");
  }

  if (politica.acao === "perguntar" && politica.modo === "acao_critica") {
    partes.push(
      "Ação crítica: exija confirmação explícita com caminho exato antes de qualquer execução.",
    );
  } else if (politica.acao === "perguntar" && politica.modo !== "conversa_casual") {
    partes.push("Confirme com o usuário antes de sugerir execução.");
  }

  if (politica.autonomia === "nenhuma" && politica.modo !== "acao_critica") {
    partes.push("Autonomia zero: apenas oriente ou recuse.");
  }

  if (!politica.markdown_permitido) {
    partes.push("Formato: texto simples, sem markdown.");
  }

  if (politica.tom === "acolhedor_afetivo") {
    partes.push("Tom: apoio emocional — presença antes de soluções.");
  }

  if (politica.acao_memoria === "armazenar") {
    partes.push("Memória: guardar silenciosamente e continuar a conversa.");
  } else if (politica.acao_memoria === "solicitar_confirmacao") {
    partes.push("Memória: pedir confirmação antes de prometer persistência.");
  }

  if (politica.nivel_seguranca === "alto" || politica.nivel_seguranca === "critico") {
    partes.push(`Segurança: ${politica.nivel_seguranca}.`);
  }

  const diretrizes =
    politica.nivel_seguranca !== "nenhum" || politica.acao !== "responder"
      ? politica.diretrizes_ativas
      : [];
  if (diretrizes.length > 0) {
    partes.push(diretrizes.map((d) => `— ${d}`).join("\n"));
  }

  return partes.length > 0 ? partes.join("\n") : "Sem restrições situacionais além da Constituição.";
}
