import { z } from "zod";

/**
 * V2.3 — Estado de Presença
 *
 * Luna ocupa um lugar por vez. Este esquema modela onde ela está,
 * o que está fazendo, e em que estado de disponibilidade se encontra.
 *
 * Analogia: uma pessoa pode estar em casa, no trabalho ou a caminho —
 * nunca nos três ao mesmo tempo. Transições são explícitas e auditáveis.
 */

export const AmbienteSchema = z.enum([
  "chat_cli",    // interface CLI de desenvolvimento
  "desktop",     // Orbit — chat normal (desktop Electron)
  "forge",       // Orbit — Luna Forge (IDE integrado: editor, terminal, git)
  "api",         // chamada direta via API
  "lumen",       // portal Lumen (futuro)
  "desconhecido",
]);

export const StatusPresencaSchema = z.enum([
  "presente",         // ativa e engajada no ambiente atual
  "ausente",          // fora de qualquer ambiente — disponível para transitar
  "transicao",        // em movimento entre ambientes
  "recado_pendente",  // deixou recado; temporariamente indisponível
]);

export const AtividadeSchema = z.enum([
  "conversa_ativa",    // conversa em andamento com o usuário
  "aguardando_input",  // presente mas aguardando próxima mensagem
  "processando",       // executando tarefa (reflexão, análise longa…)
  "reflexao",          // consolidação pós-sessão
  "ociosa",            // sem atividade recente
]);

export const EstadoPresencaSchema = z.object({
  ambiente: AmbienteSchema,
  status: StatusPresencaSchema,
  atividade: AtividadeSchema,
  timestamp_entrada: z.string(),
  sessao_id: z.string().optional(),
  recado: z.string().optional(),
});

export type Ambiente = z.infer<typeof AmbienteSchema>;
export type StatusPresenca = z.infer<typeof StatusPresencaSchema>;
export type Atividade = z.infer<typeof AtividadeSchema>;
export type EstadoPresenca = z.infer<typeof EstadoPresencaSchema>;

export const PRESENCA_INICIAL: EstadoPresenca = {
  ambiente: "chat_cli",
  status: "ausente",
  atividade: "ociosa",
  timestamp_entrada: new Date().toISOString(),
};

/**
 * Rótulos legíveis de cada ambiente, em 1ª pessoa para a Luna.
 * Usados para descrever a presença no prompt do respondedor.
 */
export const ROTULO_AMBIENTE: Record<Ambiente, string> = {
  chat_cli: "o chat de linha de comando (CLI de desenvolvimento)",
  desktop: "o Luna Chat (app desktop — conversa geral, sem IDE)",
  forge: "o Luna Forge (ambiente de desenvolvimento — editor, terminal, git)",
  api: "uma chamada direta via API",
  lumen: "o portal Lumen",
  desconhecido: "um ambiente não identificado",
};
