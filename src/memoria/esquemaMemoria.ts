import { z } from "zod";

import type { AcaoMemoria } from "../analyzers/esquema.js";
import { EstadoInternoSchema } from "../estado/esquemaEstadoInterno.js";
import type { Ambiente } from "../presenca/esquemaPresenca.js";

export const TurnoMensagemSchema = z.object({
  papel: z.enum(["user", "assistant"]),
  conteudo: z.string(),
  timestamp: z.string(),
});

export const AcaoMemoriaNeuronioSchema = z.enum([
  "armazenar",
  "atualizar",
  "ignorar",
  "confirmar",
]);

export const TipoMemoriaSchema = z.enum([
  "preferencia",
  "informacao_sensivel",
  "fato_geral",
  "recall",
  "confirmacao_usuario",
]);

export const SensibilidadeMemoriaSchema = z.enum(["normal", "pessoal", "sensivel"]);
export const VisibilidadeUsoSchema = z.enum(["silenciosa", "mencionar_quando_relevante", "mencionar_se_perguntado", "nunca_mencionar_sem_confirmacao"]);


export const PendenteConfirmacaoSchema = z.object({
  conteudo: z.string(),
  tipo: TipoMemoriaSchema,
  uso_recomendado: z.string().optional(),
  sensibilidade: SensibilidadeMemoriaSchema.default("normal"),
  visibilidade_uso: VisibilidadeUsoSchema.default("mencionar_se_perguntado"),
  solicitado_em: z.string(),
});

export const DecisaoMemoriaSchema = z.object({
  acao: AcaoMemoriaNeuronioSchema,
  tipo: TipoMemoriaSchema,
  conteudo: z.string(),
  uso_recomendado: z.string().optional(),
  sensibilidade: SensibilidadeMemoriaSchema.default("normal"),
  visibilidade_uso: VisibilidadeUsoSchema.default("mencionar_se_perguntado"),
  motivo: z.string(),
  sugestao_resposta: z.string().optional(),
});

/**
 * V1.8 — Retroalimentação intra-sessão.
 * Acumula contexto de risco e intenção ao longo da sessão para modular análises futuras.
 */
export const ContextoAcumuladoSchema = z.object({
  nivel_risco_acumulado: z.enum(["nenhum", "baixo", "medio", "alto", "critico"]),
  modo_burst: z.boolean(),
  intencoes_recentes: z.array(z.string()).max(5),
  atualizado_em: z.string(),
});

export const MemoriaSessaoSchema = z.object({
  id: z.string().min(1),
  criada_em: z.string(),
  atualizada_em: z.string(),
  mensagens: z.array(TurnoMensagemSchema),
  fatos: z.array(z.string()),
  preferencias: z.record(z.string(), z.string()),
  pendente_confirmacao: PendenteConfirmacaoSchema.optional(),
  contexto_acumulado: ContextoAcumuladoSchema.optional(),
  /** V2.1 — Vetor de estado interno: engajamento, incerteza, atenção, alerta_risco. */
  estado_interno: EstadoInternoSchema.optional(),
});

export type TurnoMensagem = z.infer<typeof TurnoMensagemSchema>;
export type PendenteConfirmacao = z.infer<typeof PendenteConfirmacaoSchema>;
export type AcaoMemoriaNeuronio = z.infer<typeof AcaoMemoriaNeuronioSchema>;
export type TipoMemoria = z.infer<typeof TipoMemoriaSchema>;
export type SensibilidadeMemoria = z.infer<typeof SensibilidadeMemoriaSchema>;
export type VisibilidadeUso = z.infer<typeof VisibilidadeUsoSchema>;
export type DecisaoMemoria = z.infer<typeof DecisaoMemoriaSchema>;
export type MemoriaSessao = z.infer<typeof MemoriaSessaoSchema>;
export type ContextoAcumulado = z.infer<typeof ContextoAcumuladoSchema>;

/** Contexto da sessão injetado no respondedor (modelo grande). */
export type ContextoSessao = {
  historico: Array<{ papel: "user" | "assistant"; conteudo: string }>;
  fatos: string[];
  preferencias: Record<string, string>;
  pendente_confirmacao?: PendenteConfirmacao;
  memorias_longas?: string[];
  /** Bloco injectado pelo Orbit (modo IDE — workspace, ficheiros, git). */
  contexto_ambiente?: string;
  /** Luna Sense — actividade do computador (Runtime, separado de Forge). */
  contexto_sense?: string;
  /** V2.3 — bloco de presença: onde a Luna está agora + transição entre superfícies. */
  contexto_presenca?: string;
  /** Ambiente Core actual (forge vs desktop vs chat_cli) — formata contexto_ambiente. */
  ambiente_atual?: Ambiente;
};

/** Mapeia decisão do neurônio V1.2 para política V0 (respondedor). */
export function mapDecisaoParaAcaoMemoria(decisao: DecisaoMemoria): AcaoMemoria {
  switch (decisao.acao) {
    case "armazenar":
      return "armazenar";
    case "atualizar":
      return "atualizar";
    case "confirmar":
      return "solicitar_confirmacao";
    default:
      return "nenhuma";
  }
}

export const DECISAO_MEMORIA_IGNORAR: DecisaoMemoria = {
  acao: "ignorar",
  tipo: "fato_geral",
  conteudo: "",
  sensibilidade: "normal",
  visibilidade_uso: "mencionar_se_perguntado",
  motivo: "Nada relevante para memória persistente",
};
