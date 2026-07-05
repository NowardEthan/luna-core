/** SQL das tabelas do Mundo Interior (M4–M6). */

export const SQL_MUNDO_INTERIOR = `
CREATE TABLE IF NOT EXISTS diario_entradas (
  id TEXT PRIMARY KEY,
  sessao_id TEXT NOT NULL,
  quando TEXT NOT NULL,
  narrativa TEXT NOT NULL,
  clima TEXT NOT NULL,
  pendencias_json TEXT NOT NULL,
  como_terminou TEXT NOT NULL,
  humor_json TEXT,
  consolidado INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_diario_sessao ON diario_entradas(sessao_id);
CREATE INDEX IF NOT EXISTS idx_diario_consolidado ON diario_entradas(consolidado);

CREATE TABLE IF NOT EXISTS diario_resumos (
  id TEXT PRIMARY KEY,
  nivel TEXT NOT NULL,
  periodo_inicio TEXT NOT NULL,
  periodo_fim TEXT NOT NULL,
  narrativa TEXT NOT NULL,
  pendencias_json TEXT NOT NULL,
  fontes_json TEXT NOT NULL,
  consolidado INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auto_retrato (
  id TEXT PRIMARY KEY DEFAULT 'luna',
  texto TEXT NOT NULL,
  versao INTEGER NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auto_retrato_historico (
  versao INTEGER PRIMARY KEY,
  texto TEXT NOT NULL,
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS humor_clima_global (
  id TEXT PRIMARY KEY DEFAULT 'luna',
  valencia REAL NOT NULL,
  energia REAL NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS humor_relacao_interlocutor (
  interlocutor_id TEXT PRIMARY KEY,
  proximidade REAL NOT NULL,
  disposicao TEXT NOT NULL,
  ultimo_impacto TEXT,
  intensidade REAL NOT NULL DEFAULT 0,
  turnos_desde INTEGER NOT NULL DEFAULT 0,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_humor_relacao_atualizado
  ON humor_relacao_interlocutor(atualizado_em);

CREATE TABLE IF NOT EXISTS humor_evento_recente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  interlocutor_id TEXT,
  narrativa_interna TEXT NOT NULL,
  intensidade REAL NOT NULL,
  criado_em TEXT NOT NULL,
  expira_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_humor_evento_expira
  ON humor_evento_recente(expira_em);

CREATE TABLE IF NOT EXISTS humor_estado (
  id TEXT PRIMARY KEY,
  valencia REAL NOT NULL,
  energia REAL NOT NULL,
  proximidade REAL NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vida_eventos (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  narrativa TEXT NOT NULL,
  intensidade REAL NOT NULL,
  origem TEXT NOT NULL,
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vida_eventos_criado_em
  ON vida_eventos(criado_em DESC);

CREATE TABLE IF NOT EXISTS vida_estado (
  id TEXT PRIMARY KEY DEFAULT 'luna',
  fase TEXT NOT NULL,
  energia_narrativa REAL NOT NULL,
  foco TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vida_resumos_semanais (
  id TEXT PRIMARY KEY,
  semana_inicio TEXT NOT NULL,
  semana_fim TEXT NOT NULL,
  resumo TEXT NOT NULL,
  intensidade_media REAL NOT NULL,
  eventos_json TEXT NOT NULL,
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vida_resumos_semanais_inicio
  ON vida_resumos_semanais(semana_inicio DESC);

CREATE TABLE IF NOT EXISTS luna_gostos (
  id TEXT PRIMARY KEY,
  topico TEXT NOT NULL,
  afinidade REAL NOT NULL,
  evidencia TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_luna_gostos_afinidade
  ON luna_gostos(afinidade DESC);

CREATE TABLE IF NOT EXISTS vontades_narrativas (
  id TEXT PRIMARY KEY,
  sessao_id TEXT,
  vontade TEXT NOT NULL,
  gatilho TEXT NOT NULL,
  prioridade INTEGER NOT NULL,
  status TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vontades_status
  ON vontades_narrativas(status, prioridade DESC);

-- Migração legada: carrega humor_estado single-row no novo clima global.
INSERT INTO humor_clima_global (id, valencia, energia, atualizado_em)
SELECT
  'luna',
  COALESCE(he.valencia, 0.35),
  COALESCE(he.energia, 0.55),
  COALESCE(he.atualizado_em, CURRENT_TIMESTAMP)
FROM humor_estado he
WHERE NOT EXISTS (SELECT 1 FROM humor_clima_global WHERE id = 'luna')
LIMIT 1;

CREATE TABLE IF NOT EXISTS sono_controle (
  id TEXT PRIMARY KEY DEFAULT 'luna',
  ultima_consolidacao TEXT NOT NULL
);
`;
