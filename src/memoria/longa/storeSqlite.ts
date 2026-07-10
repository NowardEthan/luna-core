import { createRequire } from "node:module";
import type DatabaseType from "better-sqlite3";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);

const RAIZ_PACOTE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

import { SQL_CRIAR_TABELAS, type FatoConfirmadoDb } from "./esquemaSqlite.js";
import { getCacheMundo } from "../../persistencia/contextoMundo.js";
import { sqliteFallbackPermitido } from "../../persistencia/modoStore.js";
import { obterMotorEmbeddings } from "./motorEmbeddings.js";
import { calcularCosineSimilarity } from "./cosineSimilarity.js";
import { calcularSaliencia, calcularScoreRetrieval, type InputSaliencia } from "./calculadorSaliencia.js";
import { inferirCategoria, CATEGORIAS_RELACIONADAS, type CategoriaMemoria } from "./categorizador.js";

const CAMINHO_DB = join(RAIZ_PACOTE, "logs", "memoria.db");

let dbInstancia: DatabaseType.Database | null = null;

function carregarSqlite(): typeof DatabaseType {
  return require("better-sqlite3") as typeof DatabaseType;
}

export function obterDb(): DatabaseType.Database {
  if (!sqliteFallbackPermitido()) {
    throw new Error(
      "SQLite indisponível com LUNA_STORE=firestore — use cache Firestore (executarComPersistenciaFirestore).",
    );
  }
  if (!dbInstancia) {
    const dirLogs = join(RAIZ_PACOTE, "logs");
    if (!existsSync(dirLogs)) mkdirSync(dirLogs, { recursive: true });

    dbInstancia = new (carregarSqlite())(CAMINHO_DB);
    dbInstancia.pragma("journal_mode = WAL");
    dbInstancia.exec(SQL_CRIAR_TABELAS);

    // Migração simplificada V1.3.5
    try {
      dbInstancia.exec("ALTER TABLE fatos_confirmados ADD COLUMN visibilidade_uso TEXT NOT NULL DEFAULT 'mencionar_se_perguntado'");
    } catch (e) {
      // Ignora se a coluna já existir
    }
    
    // Migração simplificada V1.4
    try {
      dbInstancia.exec("ALTER TABLE fatos_confirmados ADD COLUMN embedding_json TEXT");
    } catch (e) {
      // Ignora
    }
    
    // Migração simplificada V1.4b
    try {
      dbInstancia.exec("ALTER TABLE fatos_confirmados ADD COLUMN origem TEXT NOT NULL DEFAULT 'usuario_confirmou'");
      dbInstancia.exec("ALTER TABLE fatos_confirmados ADD COLUMN status TEXT NOT NULL DEFAULT 'ativo'");
      dbInstancia.exec("ALTER TABLE fatos_confirmados ADD COLUMN confianca REAL NOT NULL DEFAULT 1.0");
      dbInstancia.exec("ALTER TABLE fatos_confirmados ADD COLUMN ultima_utilizacao_em TEXT");
      dbInstancia.exec("ALTER TABLE fatos_confirmados ADD COLUMN uso_contador INTEGER NOT NULL DEFAULT 0");
      dbInstancia.exec("ALTER TABLE fatos_confirmados ADD COLUMN expira_em TEXT");
    } catch (e) {
      // Ignora
    }

    // Migração V1.6 — saliência
    try {
      dbInstancia.exec("ALTER TABLE fatos_confirmados ADD COLUMN saliencia_score REAL NOT NULL DEFAULT 0.5");
    } catch (e) {
      // Ignora se já existir
    }

    // Migração V1.7 — categoria semântica
    try {
      dbInstancia.exec("ALTER TABLE fatos_confirmados ADD COLUMN categoria TEXT NOT NULL DEFAULT 'perfil'");
    } catch (e) {
      // Ignora se já existir
    }
    try {
      dbInstancia.exec("CREATE INDEX IF NOT EXISTS idx_fatos_categoria ON fatos_confirmados(categoria)");
    } catch (e) {
      // Ignora
    }
  }
  return dbInstancia;
}

export function inserirFatoLongo(
  sessaoOrigemId: string,
  conteudo: string,
  tipo: string,
  sensibilidade: "normal" | "pessoal" | "sensivel",
  visibilidadeUso: "silenciosa" | "mencionar_quando_relevante" | "mencionar_se_perguntado" | "nunca_mencionar_sem_confirmacao",
  escopo: "sessao" | "longo_prazo" | "perfil",
  fonteConfirmacao: "confirmacao_usuario" | "inferencia_confirmada" | "import_manual" | "inferencia_reflexao",
  usoRecomendado?: string,
  embeddingJson?: string,
  camposReflexao?: {
    origem: "usuario_confirmou" | "reflexao" | "sistema" | "import_manual";
    status: "ativo" | "pendente_confirmacao" | "arquivado" | "esquecido";
    confianca: number;
    expira_em?: string;
    saliencia_score?: number;
    utilidade_futura?: "baixa" | "media" | "alta";
  }
): FatoConfirmadoDb {
  const cache = getCacheMundo();
  const agora = new Date().toISOString();

  // Dedupe na fonte: o mesmo fato reconfirmado não deve virar linha nova.
  // Sem isto, "Prefiro respostas curtas" acumulou 29 cópias e era injetado 29x
  // no contexto de todo turno (sinal virava ruído).
  const chaveDedupe = conteudo.trim().toLowerCase();
  if (cache) {
    const existenteCache = [...cache.memoriaFatos.values()].find(
      (f) =>
        f.ativo === 1 &&
        f.escopo === escopo &&
        f.conteudo.trim().toLowerCase() === chaveDedupe,
    );
    if (existenteCache) {
      const atualizado = { ...existenteCache, atualizado_em: agora };
      cache.memoriaFatos.set(atualizado.id, atualizado);
      cache.dirty.memoriaFatos.add(atualizado.id);
      return atualizado;
    }
  } else if (sqliteFallbackPermitido()) {
    const existenteDb = obterDb()
      .prepare(
        `SELECT * FROM fatos_confirmados
         WHERE ativo = 1 AND escopo = ? AND lower(trim(conteudo)) = ?
         LIMIT 1`,
      )
      .get(escopo, chaveDedupe) as FatoConfirmadoDb | undefined;
    if (existenteDb) {
      obterDb()
        .prepare(`UPDATE fatos_confirmados SET atualizado_em = ? WHERE id = ?`)
        .run(agora, existenteDb.id);
      return { ...existenteDb, atualizado_em: agora };
    }
  }

  const inputSaliencia: InputSaliencia = {
    tipo,
    sensibilidade,
    visibilidade_uso: visibilidadeUso,
    fonte_confirmacao: fonteConfirmacao,
    confianca: camposReflexao?.confianca,
    utilidade_futura: camposReflexao?.utilidade_futura,
  };
  const salienciaScore = camposReflexao?.saliencia_score ?? calcularSaliencia(inputSaliencia).score;
  const categoria = inferirCategoria(conteudo, tipo);

  const novo: FatoConfirmadoDb = {
    id: randomUUID(),
    sessao_origem_id: sessaoOrigemId,
    conteudo,
    uso_recomendado: usoRecomendado ?? null,
    tipo,
    sensibilidade,
    visibilidade_uso: visibilidadeUso,
    escopo,
    fonte_confirmacao: fonteConfirmacao,
    origem: camposReflexao?.origem ?? (fonteConfirmacao === "import_manual" ? "import_manual" : "usuario_confirmou"),
    status: camposReflexao?.status ?? "ativo",
    confianca: camposReflexao?.confianca ?? 1.0,
    ultima_utilizacao_em: null,
    uso_contador: 0,
    expira_em: camposReflexao?.expira_em ?? null,
    saliencia_score: salienciaScore,
    categoria,
    confirmado_em: agora,
    criado_em: agora,
    atualizado_em: agora,
    ativo: 1,
    embedding_json: embeddingJson ?? null,
  };

  if (cache) {
    cache.memoriaFatos.set(novo.id, novo);
    cache.dirty.memoriaFatos.add(novo.id);
    return novo;
  }

  if (!sqliteFallbackPermitido()) return novo;

  const db = obterDb();
  const stmt = db.prepare(`
    INSERT INTO fatos_confirmados (
      id, sessao_origem_id, conteudo, uso_recomendado, tipo,
      sensibilidade, visibilidade_uso, escopo, fonte_confirmacao,
      origem, status, confianca, ultima_utilizacao_em, uso_contador, expira_em,
      saliencia_score, categoria, confirmado_em, criado_em, atualizado_em, ativo, embedding_json
    ) VALUES (
      @id, @sessao_origem_id, @conteudo, @uso_recomendado, @tipo,
      @sensibilidade, @visibilidade_uso, @escopo, @fonte_confirmacao,
      @origem, @status, @confianca, @ultima_utilizacao_em, @uso_contador, @expira_em,
      @saliencia_score, @categoria, @confirmado_em, @criado_em, @atualizado_em, @ativo, @embedding_json
    )
  `);

  stmt.run(novo);
  return novo;
}

/**
 * Busca memórias de perfil confirmadas — injetadas globalmente no contexto do LLM.
 * Filtra status='ativo' para evitar vazar fatos pendentes de confirmação do usuário.
 */
export function buscarFatosDePerfil(): FatoConfirmadoDb[] {
  const cache = getCacheMundo();
  if (cache) {
    return [...cache.memoriaFatos.values()]
      .filter((f) => f.escopo === "perfil" && f.ativo === 1 && f.status === "ativo")
      .sort((a, b) => b.saliencia_score - a.saliencia_score || b.atualizado_em.localeCompare(a.atualizado_em));
  }

  if (!sqliteFallbackPermitido()) return [];

  const db = obterDb();
  const stmt = db.prepare(`
    SELECT * FROM fatos_confirmados
    WHERE escopo = 'perfil' AND ativo = 1 AND status = 'ativo'
    ORDER BY saliencia_score DESC, atualizado_em DESC
  `);
  return stmt.all() as FatoConfirmadoDb[];
}

/**
 * Busca memórias usando retrieval semântico por categoria + cosseno (V1.7).
 *
 * Fluxo:
 * 1. Infere a categoria da mensagem (contexto da query)
 * 2. Busca primária: fatos da mesma categoria, rankeados por score combinado
 * 3. Fallback: se primário retornar menos que `limit`, complementa com
 *    categorias relacionadas para evitar gaps de contexto cruzado
 */
export async function buscarFatosPorSimilaridade(mensagem: string, threshold = 0.3, limit = 5): Promise<FatoConfirmadoDb[]> {
  if (!mensagem.trim()) return [];

  const cache = getCacheMundo();
  const db = cache ? null : sqliteFallbackPermitido() ? obterDb() : null;

  const motor = obterMotorEmbeddings();
  const msgVector = await motor.gerarEmbedding(mensagem);
  const categoriaQuery = inferirCategoria(mensagem);

  function rankear(fatos: FatoConfirmadoDb[]): Array<{ fato: FatoConfirmadoDb; score: number }> {
    const resultado: Array<{ fato: FatoConfirmadoDb; score: number }> = [];
    for (const fato of fatos) {
      if (!fato.embedding_json) continue;
      try {
        const dbVector = JSON.parse(fato.embedding_json) as number[];
        const cosine = calcularCosineSimilarity(msgVector, dbVector);
        if (cosine >= threshold) {
          const score = calcularScoreRetrieval(cosine, fato.saliencia_score ?? 0.5);
          resultado.push({ fato, score });
        }
      } catch {
        // embedding corrompido, ignora
      }
    }
    return resultado.sort((a, b) => b.score - a.score);
  }

  function fatosAtivosLongoPrazo(): FatoConfirmadoDb[] {
    if (cache) {
      return [...cache.memoriaFatos.values()].filter(
        (f) => f.ativo === 1 && f.status === "ativo" && f.embedding_json,
      );
    }
    if (!db) return [];
    const stmt = db!.prepare(`
      SELECT * FROM fatos_confirmados
      WHERE ativo = 1 AND status = 'ativo' AND embedding_json IS NOT NULL
    `);
    return stmt.all() as FatoConfirmadoDb[];
  }

  // Busca primária — mesma categoria da query
  const primarios = rankear(
    fatosAtivosLongoPrazo().filter(
      (f) => f.escopo !== "perfil" && f.categoria === categoriaQuery,
    ),
  );

  if (primarios.length >= limit) {
    return primarios.slice(0, limit).map((r) => r.fato);
  }

  // Fallback — categorias relacionadas para complementar
  const idsJaIncluidos = new Set(primarios.map((r) => r.fato.id));
  const categoriasRelacionadas = CATEGORIAS_RELACIONADAS[categoriaQuery] ?? [];

  const candidatosFallback = fatosAtivosLongoPrazo().filter(
    (f) =>
      f.escopo !== "perfil" &&
      categoriasRelacionadas.includes(f.categoria as CategoriaMemoria) &&
      !idsJaIncluidos.has(f.id),
  );
  const fallbacks = rankear(candidatosFallback);

  const combinados = [...primarios, ...fallbacks];
  return combinados.slice(0, limit).map((r) => r.fato);
}

/** Lista fatos ativos para UI (Orbit MemoriesPanel). */
export function listarFatosAtivos(limit = 100): FatoConfirmadoDb[] {
  const db = obterDb();
  const stmt = db.prepare(`
    SELECT * FROM fatos_confirmados
    WHERE ativo = 1 AND status = 'ativo'
    ORDER BY saliencia_score DESC, atualizado_em DESC
    LIMIT ?
  `);
  return stmt.all(limit) as FatoConfirmadoDb[];
}

/**
 * Eleva retroativamente a saliência de um fato já persistido.
 * Usado pela reflexão pós-sessão quando candidato tem utilidade_futura=alta.
 */
export function elevarSaliencia(id: string, novoScore: number): void {
  const db = obterDb();
  const score = Math.min(1.0, Math.max(0.1, novoScore));
  db.prepare(
    `UPDATE fatos_confirmados SET saliencia_score = ?, atualizado_em = ? WHERE id = ?`,
  ).run(score, new Date().toISOString(), id);
}

