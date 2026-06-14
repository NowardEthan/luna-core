import { randomUUID } from "node:crypto";
import type {
  HabitoComportamental,
  PerfilComportamental,
  TipoHabito,
} from "./esquemaPerfil.js";
import {
  CONFIRMACOES_MINIMAS,
  CONFIANCA_ALTA,
  CONFIANCA_MINIMA,
} from "./esquemaPerfil.js";

/**
 * Retorna hábitos ativos para a intenção atual.
 * Um hábito ativa quando: contexto corresponde E confiança/confirmações atingem o threshold.
 */
export function ativarHabitos(
  perfil: PerfilComportamental,
  intencao: string,
): HabitoComportamental[] {
  return perfil.habitos.filter((h) => {
    const contextoOk =
      h.contextos.includes("*") || h.contextos.includes(intencao);
    const confiancaOk =
      (h.confirmacoes >= CONFIRMACOES_MINIMAS && h.confianca >= CONFIANCA_MINIMA) ||
      (h.confirmacoes >= 1 && h.confianca >= CONFIANCA_ALTA);
    return contextoOk && confiancaOk;
  });
}

/**
 * Adiciona novo hábito ao perfil ou incrementa confirmações se já existe
 * (match por normalização de texto).
 */
export function adicionarOuIncrementarHabito(
  perfil: PerfilComportamental,
  descricao: string,
  intencao: string,
  tipo: TipoHabito = "pessoal",
  confianca = 0.7,
): void {
  const descNorm = descricao.trim().toLowerCase();
  const existente = perfil.habitos.find(
    (h) => h.descricao.trim().toLowerCase() === descNorm,
  );

  if (existente) {
    existente.confirmacoes += 1;
    existente.confianca = Math.min(1, existente.confianca + 0.05);
    existente.atualizado_em = new Date().toISOString();
    if (!existente.contextos.includes(intencao) && !existente.contextos.includes("*")) {
      existente.contextos.push(intencao);
    }
  } else {
    const agora = new Date().toISOString();
    perfil.habitos.push({
      id: randomUUID(),
      descricao: descricao.trim(),
      contextos: ["*"],
      tipo,
      confirmacoes: 1,
      confianca,
      criado_em: agora,
      atualizado_em: agora,
    });
  }
}

/**
 * V3.2 — Renderiza bloco de perfil comportamental para o system prompt do respondedor.
 * Só injeta se houver hábitos ativos.
 */
export function gerarBlocoPerfilComportamental(
  habitos: HabitoComportamental[],
): string | null {
  if (habitos.length === 0) return null;
  const linhas = habitos.map((h) => `- ${h.descricao}`);
  return `Sobre o usuário:\n${linhas.join("\n")}`;
}
