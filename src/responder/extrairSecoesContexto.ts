/**
 * M1 — Seções de contexto como dados (sem avisos repetidos).
 * Regras estáveis moram em instrucao_sistema.md.
 */

import type { ContextoSessao } from "../memoria/esquemaMemoria.js";

export function extrairDadosPresenca(contexto: ContextoSessao): string | null {
  return contexto.contexto_presenca?.trim() || null;
}

export function extrairDadosAmbiente(contexto: ContextoSessao): string | null {
  if (!contexto.contexto_ambiente?.trim()) return null;
  const rotulo =
    contexto.ambiente_atual === "forge" ? "Forge (IDE)" : "Runtime";
  return `${rotulo}:\n${contexto.contexto_ambiente.trim()}`;
}

export function extrairDadosSense(contexto: ContextoSessao): string | null {
  if (!contexto.contexto_sense?.trim()) return null;
  return contexto.contexto_sense.trim();
}

export function extrairDadosMemoria(contexto: ContextoSessao): string | null {
  const linhas: string[] = [];

  if (contexto.fatos.length > 0) {
    linhas.push("Fatos desta sessão:");
    for (const f of contexto.fatos) linhas.push(`- ${f}`);
  }

  const prefs = Object.entries(contexto.preferencias);
  if (prefs.length > 0) {
    linhas.push("Preferências nesta sessão:");
    for (const [k, v] of prefs) linhas.push(`- ${k}: ${v}`);
  }

  if (contexto.pendente_confirmacao) {
    linhas.push(`Aguardando confirmação: "${contexto.pendente_confirmacao.conteudo}"`);
  }

  if (contexto.memorias_longas?.length) {
    const cross = contexto.memorias_longas.filter((m) => m.startsWith("[Conversa "));
    const fatos = contexto.memorias_longas.filter((m) => !m.startsWith("[Conversa "));
    if (cross.length) {
      linhas.push("Trechos de outras conversas:");
      for (const t of cross) linhas.push(t);
    }
    if (fatos.length) {
      linhas.push("Memórias de longo prazo:");
      for (const f of fatos) linhas.push(`- ${f}`);
    }
  }

  return linhas.length > 0 ? linhas.join("\n") : null;
}
