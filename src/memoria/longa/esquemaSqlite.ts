export type FatoConfirmadoDb = {
  id: string; // uuid
  sessao_origem_id: string;
  conteudo: string;
  uso_recomendado: string | null;
  tipo: string;
  sensibilidade: string; // 'normal' | 'pessoal' | 'sensivel'
  visibilidade_uso: string; // 'silenciosa' | 'mencionar_quando_relevante' | 'mencionar_se_perguntado' | 'nunca_mencionar_sem_confirmacao'
  escopo: "sessao" | "longo_prazo" | "perfil";
  fonte_confirmacao: "confirmacao_usuario" | "inferencia_confirmada" | "import_manual" | "inferencia_reflexao";

  origem: "usuario_confirmou" | "reflexao" | "sistema" | "import_manual";
  status: "ativo" | "pendente_confirmacao" | "arquivado" | "esquecido";
  confianca: number;
  ultima_utilizacao_em: string | null;
  uso_contador: number;
  expira_em: string | null;

  /** V1.6 — Score de saliência (0..1). Memórias mais significativas sobem no ranking de retrieval. */
  saliencia_score: number;

  /** V1.7 — Categoria semântica: preferencia | perfil | estado | contexto_tecnico | objetivo | limite */
  categoria: string;

  confirmado_em: string;
  criado_em: string;
  atualizado_em: string;
  ativo: number; // 0 ou 1
  embedding_json?: string | null;
};

export const SQL_CRIAR_TABELAS = `
CREATE TABLE IF NOT EXISTS fatos_confirmados (
  id TEXT PRIMARY KEY,
  sessao_origem_id TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  uso_recomendado TEXT,
  tipo TEXT NOT NULL,
  sensibilidade TEXT NOT NULL,
  visibilidade_uso TEXT NOT NULL DEFAULT 'mencionar_se_perguntado',
  escopo TEXT NOT NULL,
  fonte_confirmacao TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT 'usuario_confirmou',
  status TEXT NOT NULL DEFAULT 'ativo',
  confianca REAL NOT NULL DEFAULT 1.0,
  ultima_utilizacao_em TEXT,
  uso_contador INTEGER NOT NULL DEFAULT 0,
  expira_em TEXT,
  saliencia_score REAL NOT NULL DEFAULT 0.5,
  categoria TEXT NOT NULL DEFAULT 'perfil',
  confirmado_em TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  embedding_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_fatos_tipo ON fatos_confirmados(tipo);
CREATE INDEX IF NOT EXISTS idx_fatos_escopo ON fatos_confirmados(escopo);
CREATE INDEX IF NOT EXISTS idx_fatos_ativo ON fatos_confirmados(ativo);
`;
