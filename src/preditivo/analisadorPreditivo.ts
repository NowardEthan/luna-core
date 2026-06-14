import type { AnaliseContexto } from "../analyzers/esquema.js";
import type { EstadoInterno } from "../estado/esquemaEstadoInterno.js";
import type { MemoriaSessao, TurnoMensagem } from "../memoria/esquemaMemoria.js";
import type { PadraoPrior, PriorIntencao, TomEsperado } from "./esquemaPreditivo.js";

const MAPA_TOM: Record<string, TomEsperado> = {
  pedido_tecnico: "tecnico",
  pergunta_tecnica: "tecnico",
  pedido_codigo: "tecnico",
  conversa_casual: "casual",
  apoio_emocional: "apoio",
  pergunta_sensivel: "apoio",
  pergunta_identitaria: "exploratorio",
  exploratorio: "exploratorio",
};

function intencoesTom(intencao: string): TomEsperado {
  return MAPA_TOM[intencao] ?? "casual";
}

function derivarPadrao(historico: string[], atual: string): PadraoPrior {
  if (historico.length === 0) return "novo";
  const janela = [...historico, atual].slice(-3);
  if (janela.every((i) => i === janela[0])) return "consistente";
  const anteriores = janela.slice(0, -1);
  const anteriorConsistente = anteriores.length >= 2 && anteriores.every((a) => a === anteriores[0]);
  if (anteriorConsistente && janela[janela.length - 1] !== anteriores[0]) return "transicao";
  return "novo";
}

function derivarTomDominante(historico: string[], atual: string): TomEsperado {
  const janela = [...historico, atual].slice(-3);
  const contagem = new Map<TomEsperado, number>();
  for (const i of janela) {
    const t = intencoesTom(i);
    contagem.set(t, (contagem.get(t) ?? 0) + 1);
  }
  // tom do turno atual tem peso duplo
  const tomAtual = intencoesTom(atual);
  contagem.set(tomAtual, (contagem.get(tomAtual) ?? 0) + 1);
  return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

function extrairTopico(mensagens: TurnoMensagem[]): string {
  const recentes = mensagens.filter((m) => m.papel === "user").slice(-2);
  if (recentes.length === 0) return "início de conversa";
  const ultima = recentes[recentes.length - 1]!.conteudo.trim();
  return ultima.length > 80 ? ultima.slice(0, 77) + "..." : ultima;
}

function montarDica(
  padrao: PadraoPrior,
  tom: TomEsperado,
  estado: EstadoInterno | undefined,
  historico: string[],
): string {
  const partes: string[] = [];

  if (padrao === "consistente") {
    if (tom === "casual") partes.push("Conversa fluindo de forma leve e contínua — manter energia, sem formalidade.");
    else if (tom === "tecnico") partes.push("Modo técnico estabelecido — resposta direta e precisa, sem rodeios.");
    else if (tom === "apoio") partes.push("Usuário em modo de compartilhamento — presença e escuta antes de soluções.");
    else partes.push("Exploração ativa — acompanhar o raciocínio, não redirecionar.");
  } else if (padrao === "transicao") {
    const deIntencao = historico[0] ?? "?";
    partes.push(`Mudança de padrão: vinha em modo ${intencoesTom(deIntencao)}, agora virou ${tom}. Adaptar ao tom atual sem perder a continuidade.`);
  } else {
    partes.push("Primeiro turno ou virada de assunto — calibrar a partir desta mensagem.");
  }

  if (estado) {
    if (estado.engajamento > 0.7) partes.push("Engajamento elevado — usuário presente e ativo.");
    if (estado.incerteza > 0.5) partes.push("Ambiguidade detectada — preferir clareza e confirmar se necessário.");
    if (estado.alerta_risco > 0.4) partes.push("Atenção elevada — manter cautela proporcional.");
  }

  return partes.join(" ");
}

/**
 * V3.1 — Gera prior preditivo de intenção a partir do histórico da sessão.
 * Baseado em regras sobre intencoes_recentes + estado_interno. Zero latência extra.
 */
export function gerarPriorIntencao(
  sessao: MemoriaSessao | undefined,
  analiseAtual: AnaliseContexto,
): PriorIntencao | null {
  if (!sessao) return null;

  const historico = sessao.contexto_acumulado?.intencoes_recentes ?? [];
  const estado = sessao.estado_interno;

  if (historico.length === 0 && sessao.mensagens.length === 0) return null;

  const padrao = derivarPadrao(historico, analiseAtual.intencao);
  const tom = derivarTomDominante(historico, analiseAtual.intencao);
  const topico = extrairTopico(sessao.mensagens);
  const dica = montarDica(padrao, tom, estado, historico);

  return { topico_recente: topico, padrao, tom_esperado: tom, dica_respondedor: dica };
}

export function gerarBlocoContextoPreditivo(prior: PriorIntencao): string {
  return `Contexto desta conversa: ${prior.dica_respondedor} Tópico recente: "${prior.topico_recente}".`;
}
