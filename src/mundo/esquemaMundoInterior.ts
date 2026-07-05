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

CREATE TABLE IF NOT EXISTS humor_estado (
  id TEXT PRIMARY KEY,
  valencia REAL NOT NULL,
  energia REAL NOT NULL,
  proximidade REAL NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sono_controle (
  id TEXT PRIMARY KEY DEFAULT 'luna',
  ultima_consolidacao TEXT NOT NULL
);
`;
