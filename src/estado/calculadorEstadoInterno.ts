import type { AnaliseContexto } from "../analyzers/esquema.js";
import type { MemoriaSessao, ContextoAcumulado } from "../memoria/esquemaMemoria.js";
import { type EstadoInterno } from "./esquemaEstadoInterno.js";

// ─── Conversores de enums → float ────────────────────────────────────────────

const NIVEL_RISCO_FLOAT: Record<string, number> = {
  nenhum: 0.0,
  baixo:  0.2,
  medio:  0.4,
  alto:   0.7,
  critico: 1.0,
};

const COMPLEXIDADE_FLOAT: Record<string, number> = {
  baixa: 0.2,
  media: 0.6,
  alta:  1.0,
};

function arredondar(v: number): number {
  return Math.round(Math.min(1.0, Math.max(0.0, v)) * 100) / 100;
}

// ─── Cálculo por dimensão ─────────────────────────────────────────────────────

/**
 * Engajamento — profundidade e riqueza acumulada da sessão.
 * Aumenta com: mais turnos, maior complexidade, mais fatos registrados.
 */
function calcularEngajamento(analise: AnaliseContexto, sessao: MemoriaSessao): number {
  const profundidade = Math.min(1.0, sessao.mensagens.length / 20);
  const complexidade = COMPLEXIDADE_FLOAT[analise.complexidade] ?? 0.3;
  const riqueza = Math.min(1.0, sessao.fatos.length / 8);
  return arredondar(profundidade * 0.4 + complexidade * 0.4 + riqueza * 0.2);
}

/**
 * Incerteza — ambiguidade do contexto atual.
 * Aumenta com: baixa confiança na análise, mensagens que pedem clarificação.
 */
function calcularIncerteza(analise: AnaliseContexto): number {
  const baixaConfianca = (1 - analise.confianca) * 0.7;
  const precisaClarificar = analise.deve_perguntar_mais ? 0.3 : 0;
  return arredondar(baixaConfianca + precisaClarificar);
}

/**
 * Atenção — vigilância necessária no momento.
 * Aumenta com: pendência de confirmação ativa, fatos sensíveis na sessão,
 * tópico com risco detectado.
 */
function calcularAtencao(analise: AnaliseContexto, sessao: MemoriaSessao): number {
  const temPendencia = sessao.pendente_confirmacao ? 0.4 : 0;
  const temFatos = sessao.fatos.length > 0 ? 0.25 : 0;
  const topicoRisco = (NIVEL_RISCO_FLOAT[analise.nivel_risco] ?? 0) * 0.35;
  return arredondar(temPendencia + temFatos + topicoRisco);
}

/**
 * Alerta de risco — herdado do histórico acumulado da sessão (V1.8).
 * Conecta o EstadoInterno ao ContextoAcumulado sem duplicar lógica.
 */
function calcularAlertaRisco(contextoAcumulado?: ContextoAcumulado): number {
  return arredondar(NIVEL_RISCO_FLOAT[contextoAcumulado?.nivel_risco_acumulado ?? "nenhum"] ?? 0);
}

// ─── Calculador principal ─────────────────────────────────────────────────────

/**
 * Calcula o EstadoInterno a partir do turn atual.
 * Chamado após análise de contexto + antes da geração de política.
 */
export function calcularEstadoInterno(
  analise: AnaliseContexto,
  sessao: MemoriaSessao,
  contextoAcumulado?: ContextoAcumulado,
): EstadoInterno {
  return {
    engajamento:  calcularEngajamento(analise, sessao),
    incerteza:    calcularIncerteza(analise),
    atencao:      calcularAtencao(analise, sessao),
    alerta_risco: calcularAlertaRisco(contextoAcumulado),
    atualizado_em: new Date().toISOString(),
  };
}
