import {
  listarEventosAfetivosRecentes,
  type EventoAfetivo,
  type TipoEventoAfetivo,
} from "./eventoAfectivo.js";

const ROTULO_ECO: Record<TipoEventoAfetivo, string> = {
  carinho: "houve carinho explícito no tom recentemente",
  magoa: "o tom ficou magoado ou desrespeitoso na última vez",
  irritacao: "veio irritação no tom recentemente",
  desculpas: "houve pedido de desculpas no tom recentemente",
};

function eventoRelevante(eventos: EventoAfetivo[], interlocutorId?: string | null): EventoAfetivo | null {
  const filtrados = eventos.filter(
    (ev) => !interlocutorId || ev.interlocutor_id === interlocutorId || ev.interlocutor_id === null,
  );
  if (filtrados.length === 0) return null;

  const prioridade: TipoEventoAfetivo[] = ["magoa", "irritacao", "carinho", "desculpas"];
  for (const tipo of prioridade) {
    const match = filtrados.find((ev) => ev.tipo === tipo);
    if (match) return match;
  }
  return filtrados[0] ?? null;
}

/**
 * Uma linha discreta de continuidade afetiva para o bloco de humor.
 * Retorna null se não houver evento recente relevante.
 */
export function formatarEcoAfetivo(interlocutorId?: string | null): string | null {
  try {
    const eventos = listarEventosAfetivosRecentes(5);
    const evento = eventoRelevante(eventos, interlocutorId);
    if (!evento) return null;

    const rotulo = ROTULO_ECO[evento.tipo] ?? evento.narrativa_interna;
    const detalhe = evento.narrativa_interna.trim();
    const complemento =
      detalhe && !detalhe.toLowerCase().includes(rotulo.slice(0, 12))
        ? ` (${detalhe})`
        : "";

    return `Eco recente com esta pessoa: ${rotulo}${complemento} — carregue isso com naturalidade, sem dramatizar.`;
  } catch {
    return null;
  }
}
