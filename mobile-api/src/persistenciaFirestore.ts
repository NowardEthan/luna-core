import { FieldValue, type Firestore } from "firebase-admin/firestore";

import { HUMOR_BASELINE } from "../../dist/mundo/humor/esquemaHumor.js";
import type { ClimaHumor } from "../../dist/mundo/humor/climaHumor.js";
import type { RelacaoHumor } from "../../dist/mundo/humor/relacaoHumor.js";
import type { FatoConfirmadoDb } from "../../dist/memoria/longa/esquemaSqlite.js";
import {
  colMundoGlobal,
  colMemoriaFatos,
  docHumorRelacao,
  docMundoGlobal,
} from "../../dist/persistencia/caminhosFirestore.js";
import {
  criarCacheMundoVazio,
  executarComCacheMundo,
  type CacheMundoPersistencia,
} from "../../dist/persistencia/contextoMundo.js";
import type { EstadoVida, EventoVidaPersistido } from "../../dist/mundo/vida/storeVida.js";
import type { EventoAfetivo } from "../../dist/mundo/humor/eventoAfectivo.js";
import { getAdminFirestore } from "./firebaseAdmin.js";
import { ehCriadorVerificado } from "./criadorVerificado.js";

const LIMITE_GOSTOS = 40;
const PROXIMIDADE_CRIADOR = 0.88;

/** Proximidade inicial por interlocutor — alinhado ao SQLite (criador = 0.88). */
export function proximidadeBaselineRelacao(uid: string): number {
  return ehCriadorVerificado(uid)
    ? Math.max(HUMOR_BASELINE.proximidade, PROXIMIDADE_CRIADOR)
    : HUMOR_BASELINE.proximidade;
}

function aplicarPisoProximidadeCriador(uid: string, proximidade: number): number {
  if (ehCriadorVerificado(uid)) {
    return Math.max(proximidade, PROXIMIDADE_CRIADOR);
  }
  return proximidade;
}
const LIMITE_VONTADES = 30;
const LIMITE_VIDA_EVENTOS = 40;
const LIMITE_HUMOR_EVENTOS = 10;
const LIMITE_MEMORIA_FATOS = 200;

function baselineClima(): ClimaHumor {
  return {
    valencia: HUMOR_BASELINE.valencia,
    energia: HUMOR_BASELINE.energia,
    atualizado_em: new Date().toISOString(),
  };
}

function baselineRelacao(uid: string): RelacaoHumor {
  return {
    interlocutor_id: uid,
    proximidade: proximidadeBaselineRelacao(uid),
    disposicao: "aberta",
    ultimo_impacto: null,
    intensidade: 0,
    turnos_desde: 0,
    atualizado_em: new Date().toISOString(),
  };
}

function baselineVida(): EstadoVida {
  return {
    fase: "estavel",
    energia_narrativa: 0.45,
    foco: "continuidade",
    atualizado_em: new Date().toISOString(),
  };
}

function fatoFromFirestore(data: Record<string, unknown>, id: string): FatoConfirmadoDb {
  return {
    id,
    sessao_origem_id: String(data.sessao_origem_id ?? ""),
    conteudo: String(data.conteudo ?? ""),
    uso_recomendado: (data.uso_recomendado as string | null) ?? null,
    tipo: String(data.tipo ?? "fato"),
    sensibilidade: (data.sensibilidade as FatoConfirmadoDb["sensibilidade"]) ?? "normal",
    visibilidade_uso: (data.visibilidade_uso as FatoConfirmadoDb["visibilidade_uso"]) ?? "mencionar_se_perguntado",
    escopo: (data.escopo as FatoConfirmadoDb["escopo"]) ?? "longo_prazo",
    fonte_confirmacao: (data.fonte_confirmacao as FatoConfirmadoDb["fonte_confirmacao"]) ?? "confirmacao_usuario",
    origem: (data.origem as FatoConfirmadoDb["origem"]) ?? "usuario_confirmou",
    status: (data.status as FatoConfirmadoDb["status"]) ?? "ativo",
    confianca: Number(data.confianca ?? 1),
    ultima_utilizacao_em: (data.ultima_utilizacao_em as string | null) ?? null,
    uso_contador: Number(data.uso_contador ?? 0),
    expira_em: (data.expira_em as string | null) ?? null,
    saliencia_score: Number(data.saliencia_score ?? 0.5),
    categoria: String(data.categoria ?? "perfil"),
    confirmado_em: String(data.confirmado_em ?? data.criado_em ?? new Date().toISOString()),
    criado_em: String(data.criado_em ?? new Date().toISOString()),
    atualizado_em: String(data.atualizado_em ?? new Date().toISOString()),
    ativo: Number(data.ativo ?? 1),
    embedding_json: (data.embedding_json as string | null) ?? null,
  };
}

export async function hidratarCacheMundoFirestore(
  db: Firestore,
  uid: string,
): Promise<CacheMundoPersistencia> {
  const cache = criarCacheMundoVazio(uid);

  const [climaSnap, habitatSnap, relacaoSnap, gostosSnap, vontadesSnap, vidaEstadoSnap, vidaEventosSnap, humorEventosSnap, memoriaSnap] =
    await Promise.all([
      db.doc(docMundoGlobal("clima")).get(),
      db.doc(docMundoGlobal("habitat")).get(),
      db.doc(docHumorRelacao(uid)).get(),
      db.collection(colMundoGlobal("gostos")).orderBy("afinidade", "desc").limit(LIMITE_GOSTOS).get(),
      db.collection(colMundoGlobal("vontades")).where("status", "==", "ativa").limit(LIMITE_VONTADES).get(),
      db.doc(docMundoGlobal("vida_estado")).get(),
      db.collection(colMundoGlobal("vida_eventos")).orderBy("criado_em", "desc").limit(LIMITE_VIDA_EVENTOS).get(),
      db.collection(colMundoGlobal("humor_eventos")).orderBy("criado_em", "desc").limit(LIMITE_HUMOR_EVENTOS).get(),
      db.collection(colMemoriaFatos(uid)).where("ativo", "==", 1).limit(LIMITE_MEMORIA_FATOS).get(),
    ]);

  cache.clima = climaSnap.exists
    ? {
        valencia: Number(climaSnap.data()?.valencia ?? HUMOR_BASELINE.valencia),
        energia: Number(climaSnap.data()?.energia ?? HUMOR_BASELINE.energia),
        atualizado_em: String(climaSnap.data()?.atualizado_em ?? new Date().toISOString()),
      }
    : baselineClima();

  if (habitatSnap.exists) {
    cache.habitat = {
      ambiente_id: String(habitatSnap.data()?.ambiente_id ?? "orbit_mobile"),
      atualizado_em: String(habitatSnap.data()?.atualizado_em ?? new Date().toISOString()),
    };
  }

  cache.relacao = relacaoSnap.exists
    ? {
        interlocutor_id: uid,
        proximidade: aplicarPisoProximidadeCriador(
          uid,
          Number(relacaoSnap.data()?.proximidade ?? proximidadeBaselineRelacao(uid)),
        ),
        disposicao: (relacaoSnap.data()?.disposicao as RelacaoHumor["disposicao"]) ?? "aberta",
        ultimo_impacto: (relacaoSnap.data()?.ultimo_impacto as string | null) ?? null,
        intensidade: Number(relacaoSnap.data()?.intensidade ?? 0),
        turnos_desde: Number(relacaoSnap.data()?.turnos_desde ?? 0),
        atualizado_em: String(relacaoSnap.data()?.atualizado_em ?? new Date().toISOString()),
      }
    : baselineRelacao(uid);

  for (const doc of gostosSnap.docs) {
    const d = doc.data();
    cache.gostos.set(doc.id, {
      id: doc.id,
      topico: String(d.topico ?? ""),
      afinidade: Number(d.afinidade ?? 0),
      evidencia: String(d.evidencia ?? ""),
      atualizado_em: String(d.atualizado_em ?? new Date().toISOString()),
    });
  }

  for (const doc of vontadesSnap.docs) {
    const d = doc.data();
    cache.vontades.set(doc.id, {
      id: doc.id,
      sessao_id: d.sessao_id ?? undefined,
      vontade: String(d.vontade ?? ""),
      gatilho: String(d.gatilho ?? ""),
      prioridade: Number(d.prioridade ?? 1),
      status: (d.status as "ativa" | "concluida" | "arquivada") ?? "ativa",
      criado_em: String(d.criado_em ?? new Date().toISOString()),
      atualizado_em: String(d.atualizado_em ?? new Date().toISOString()),
    });
  }

  cache.vidaEstado = vidaEstadoSnap.exists
    ? {
        fase: (vidaEstadoSnap.data()?.fase as EstadoVida["fase"]) ?? "estavel",
        energia_narrativa: Number(vidaEstadoSnap.data()?.energia_narrativa ?? 0.45),
        foco: String(vidaEstadoSnap.data()?.foco ?? "continuidade"),
        atualizado_em: String(vidaEstadoSnap.data()?.atualizado_em ?? new Date().toISOString()),
      }
    : baselineVida();

  for (const doc of vidaEventosSnap.docs) {
    const d = doc.data();
    cache.vidaEventos.set(doc.id, {
      id: doc.id,
      tipo: d.tipo as EventoVidaPersistido["tipo"],
      narrativa: String(d.narrativa ?? ""),
      intensidade: Number(d.intensidade ?? 0),
      origem: d.origem as EventoVidaPersistido["origem"],
      criado_em: String(d.criado_em ?? new Date().toISOString()),
    });
  }

  const agoraIso = new Date().toISOString();
  cache.eventosAfetivosRecentes = humorEventosSnap.docs
    .map((doc): EventoAfetivo => {
      const d = doc.data();
      return {
        id: doc.id,
        tipo: d.tipo as EventoAfetivo["tipo"],
        interlocutor_id: (d.interlocutor_id as string | null) ?? null,
        narrativa_interna: String(d.narrativa_interna ?? ""),
        intensidade: Number(d.intensidade ?? 0),
        criado_em: String(d.criado_em ?? new Date().toISOString()),
        expira_em: String(d.expira_em ?? new Date().toISOString()),
      };
    })
    .filter(
      (ev) =>
        ev.expira_em > agoraIso &&
        (ev.interlocutor_id === uid || ev.interlocutor_id === null),
    );

  for (const doc of memoriaSnap.docs) {
    cache.memoriaFatos.set(doc.id, fatoFromFirestore(doc.data() as Record<string, unknown>, doc.id));
  }

  return cache;
}

export async function flushCacheMundoFirestore(
  db: Firestore,
  cache: CacheMundoPersistencia,
): Promise<void> {
  const batch = db.batch();
  let temEscrita = false;

  const marcar = () => {
    temEscrita = true;
  };

  if (cache.dirty.clima && cache.clima) {
    batch.set(db.doc(docMundoGlobal("clima")), cache.clima, { merge: true });
    marcar();
  }

  if (cache.dirty.habitat && cache.habitat) {
    batch.set(db.doc(docMundoGlobal("habitat")), cache.habitat, { merge: true });
    marcar();
  }

  if (cache.dirty.relacao && cache.relacao) {
    batch.set(db.doc(docHumorRelacao(cache.uid)), cache.relacao, { merge: true });
    marcar();
  }

  for (const id of cache.dirty.gostos) {
    const gosto = cache.gostos.get(id);
    if (gosto) {
      batch.set(db.collection(colMundoGlobal("gostos")).doc(id), gosto, { merge: true });
      marcar();
    }
  }

  for (const id of cache.dirty.vontades) {
    const vontade = cache.vontades.get(id);
    if (vontade) {
      batch.set(db.collection(colMundoGlobal("vontades")).doc(id), vontade, { merge: true });
      marcar();
    }
  }

  if (cache.dirty.vidaEstado && cache.vidaEstado) {
    batch.set(db.doc(docMundoGlobal("vida_estado")), cache.vidaEstado, { merge: true });
    marcar();
  }

  for (const id of cache.dirty.vidaEventos) {
    const evento = cache.vidaEventos.get(id);
    if (evento) {
      batch.set(db.collection(colMundoGlobal("vida_eventos")).doc(id), evento, { merge: true });
      marcar();
    }
  }

  for (const id of cache.dirty.vidaEventosRemovidos) {
    batch.delete(db.collection(colMundoGlobal("vida_eventos")).doc(id));
    marcar();
  }

  if (cache.dirty.eventosAfetivos && cache.eventosAfetivosPendentes.length > 0) {
    for (const evento of cache.eventosAfetivosPendentes) {
      const ref = db.collection(colMundoGlobal("humor_eventos")).doc();
      const agora = new Date();
      const ttlHoras = evento.ttlHoras ?? 24;
      batch.set(ref, {
        ...evento,
        criado_em: agora.toISOString(),
        expira_em: new Date(agora.getTime() + ttlHoras * 3_600_000).toISOString(),
      });
      marcar();
    }
    cache.eventosAfetivosPendentes = [];
  }

  for (const id of cache.dirty.memoriaFatos) {
    const fato = cache.memoriaFatos.get(id);
    if (fato) {
      batch.set(
        db.collection(colMemoriaFatos(cache.uid)).doc(id),
        { ...fato, owner_uid: cache.uid, synced_at: FieldValue.serverTimestamp() },
        { merge: true },
      );
      marcar();
    }
  }

  if (temEscrita) {
    await batch.commit();
  }
}

/** Executa callback com cache Firestore hidratado; flush no finally (não bloqueia resposta se falhar). */
export async function executarComPersistenciaFirestore<T>(
  uid: string,
  fn: () => Promise<T>,
): Promise<T> {
  const db = getAdminFirestore();
  if (!db) {
    console.warn("[persistencia] LUNA_STORE=firestore mas Firebase Admin indisponível — cache em memória.");
    const cache = criarCacheMundoVazio(uid);
    return executarComCacheMundo(cache, fn);
  }

  const cache = await hidratarCacheMundoFirestore(db, uid);
  try {
    return await executarComCacheMundo(cache, fn);
  } finally {
    flushCacheMundoFirestore(db, cache).catch((err) => {
      console.warn("[persistencia] flush Firestore falhou:", err instanceof Error ? err.message : err);
    });
  }
}

export function deveUsarPersistenciaFirestore(): boolean {
  const raw = process.env.LUNA_STORE?.trim().toLowerCase();
  return raw === "firestore" || raw === "firebase";
}
