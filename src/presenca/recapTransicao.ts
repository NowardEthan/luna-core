import { carregarSessao } from "../memoria/storeSessao.js";

/**
 * V2.3 — Resumo curto do fim de uma sessão, usado como recap de continuidade
 * quando a Luna transita de uma superfície para outra (ex.: chat → Forge).
 *
 * Carrega a sessão anterior (em ficheiro) e devolve os últimos turnos
 * resumidos. Mantido fora de `contextoPresenca` para preservar a pureza
 * daquele módulo (sem I/O).
 */
export function montarRecapSessao(sessaoId: string, maxTurnos = 4): string | undefined {
  const sessao = carregarSessao(sessaoId);
  if (!sessao || sessao.mensagens.length === 0) return undefined;

  const linhas = sessao.mensagens.slice(-maxTurnos).map((m) => {
    const quem = m.papel === "user" ? "Usuário" : "Luna";
    const txt = m.conteudo.replace(/\s+/g, " ").trim().slice(0, 240);
    return `${quem}: ${txt}`;
  });

  return linhas.length > 0 ? linhas.join("\n") : undefined;
}
