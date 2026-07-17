import { FieldValue, type Firestore } from "firebase-admin/firestore";

import {
  colRotina,
  colRotinaLog,
  colRotinaSets,
  colRotinaItems,
} from "../../dist/persistencia/caminhosFirestore.js";
import {
  hojeISOnoFuso,
  type BlocoRotinaCore,
  type RegistoDia,
  type RotinaSetCore,
} from "../../dist/estado/neuronioRotina.js";

/**
 * A rotina dele, lida do Firestore.
 *
 * É o último elo — e sem ele a Luna tinha os olhos e nada lhes chegava. O Orbit escreve os
 * blocos (`orbit-mobile/src/lib/firebase/firestoreRoutine.ts`), e aqui eles são lidos, no
 * mesmo caminho: `users/{uid}/routine`.
 *
 * É isto que a faz passar de «são 8h40» para «ele está no ônibus a fazer o duolingo, e
 * faltam-lhe 20 minutos para o trabalho».
 */

/** Um bloco a mais no briefing não mata; uma rotina inteira de 200 blocos, sim. */
const LIMITE_BLOCOS = 40;

export async function lerRotina(db: Firestore, uid: string): Promise<BlocoRotinaCore[]> {
  try {
    const snap = await db.collection(colRotina(uid)).limit(LIMITE_BLOCOS).get();

    return snap.docs.map((d) => {
      const b = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        titulo: String(b.titulo ?? ""),
        dias: Array.isArray(b.dias) ? b.dias.map(Number) : [],
        inicio: Number(b.inicio ?? 0),
        fim: Number(b.fim ?? 0),
        nota: typeof b.nota === "string" ? b.nota : undefined,
        origem: b.origem === "luna" ? "luna" : "ethan",
        ...(typeof b.setId === "string" ? { setId: b.setId } : {}),
        ...(b.alarme === true ? { alarme: true } : {}),
        ...(typeof b.roteiro === "string" && b.roteiro.trim() ? { roteiro: b.roteiro } : {}),
        ...(b.pausa && typeof b.pausa === "object" && "ate" in b.pausa
          ? { pausa: b.pausa as { de?: string; ate: string } }
          : {}),
        passos: Array.isArray(b.passos)
          ? (b.passos as Array<Record<string, unknown>>).map((p) => ({
              id: String(p.id ?? ""),
              texto: String(p.texto ?? ""),
              feito: p.feito === true,
            }))
          : undefined,
        subtarefas: Array.isArray(b.subtarefas)
          ? (b.subtarefas as Array<Record<string, unknown>>).map((t) => ({
              id: String(t.id ?? ""),
              texto: String(t.texto ?? ""),
              feito: t.feito === true,
              ...(typeof t.hora === "number" ? { hora: t.hora } : {}),
              ...(t.notificar === true ? { notificar: true } : {}),
            }))
          : undefined,
      };
    });
  } catch {
    // Sem rotina, ela continua a saber as horas — só não sabe o dia dele. Degradar, nunca
    // falhar: um erro a ler o calendário não pode derrubar a conversa.
    return [];
  }
}

/** As rotinas alternativas — para o servidor saber qual vigora hoje (e ver só ela). */
export async function lerRotinaSets(db: Firestore, uid: string): Promise<RotinaSetCore[]> {
  try {
    const snap = await db.collection(colRotinaSets(uid)).limit(40).get();
    return snap.docs.map((d) => {
      const r = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        nome: String(r.nome ?? ""),
        de: typeof r.de === "string" ? r.de : undefined,
        ate: typeof r.ate === "string" ? r.ate : undefined,
      };
    });
  } catch {
    return [];
  }
}

/**
 * O registo dos últimos dias — é isto que a faz reparar que ele sumiu.
 *
 * Duas semanas chegam: um sumiço de 14 dias já não é um sumiço, é uma mudança de vida, e
 * isso não se resolve com um cutucão.
 */
const DIAS_DE_MEMORIA = 14;

export async function lerRegistosRotina(db: Firestore, uid: string): Promise<RegistoDia[]> {
  try {
    const snap = await db
      .collection(colRotinaLog(uid))
      .orderBy("dia", "desc")
      .limit(DIAS_DE_MEMORIA * 8)
      .get();

    return snap.docs.map((d) => {
      const r = d.data() as Record<string, unknown>;
      return {
        blocoId: String(r.blocoId ?? ""),
        dia: String(r.dia ?? ""),
        estado: (r.estado === "feito" || r.estado === "hoje_nao" ? r.estado : "ignorado") as
          | "feito"
          | "hoje_nao"
          | "ignorado",
      };
    });
  } catch {
    return [];
  }
}

/**
 * As mãos dela — ler, criar, apagar.
 *
 * Tudo o que ela cria nasce com `origem: "luna"`, e o ecrã mostra «sugerido pela Luna». Ele
 * apaga com um toque. Uma companheira que mexe na agenda de alguém tem de deixar rasto:
 * uma alteração invisível na vida de uma pessoa não é ajuda, é intrusão.
 */
export function maosDaRotina(db: Firestore, uid: string, timeZone?: string) {
  return {
    ler: () => lerRotina(db, uid),

    criar: async (b: {
      titulo: string;
      dias: number[];
      inicio: number;
      fim: number;
      nota?: string;
      notificar: boolean;
      setId?: string | null;
      alarme?: boolean;
    }): Promise<string> => {
      const ref = db.collection(colRotina(uid)).doc();
      await ref.set({
        titulo: b.titulo,
        dias: b.dias,
        inicio: b.inicio,
        fim: b.fim,
        cor: "#9B7DD9", // violeta — a cor dela, para se ver ao longe o que foi ela que pôs
        notificar: b.notificar,
        ...(b.nota ? { nota: b.nota } : {}),
        // Em qual rotina alternativa (Férias…). Ausente = Normal. É o que a deixa montar uma
        // rotina inteira: sem isto, os blocos caíam todos na Normal, e a «Férias» ficava vazia.
        ...(b.setId ? { setId: b.setId } : {}),
        ...(b.alarme === true ? { alarme: true } : {}),
        origem: "luna",
        criadoEm: new Date(),
      });
      return ref.id;
    },

    /**
     * Edição PARCIAL: `merge: true` muda só os campos que vieram.
     *
     * Se ela pedir «adianta o duolingo para as 8h», o `set` sem merge apagaria o título, os
     * dias, a nota e a cor — tudo o que não veio no pedido. Ele descobriria dias depois que
     * a nota que escreveu desapareceu porque pediu para mudar uma hora.
     */
    editar: async (
      id: string,
      campos: Partial<{
        titulo: string;
        dias: number[];
        inicio: number;
        fim: number;
        nota?: string;
        notificar: boolean;
        roteiro?: string;
        passos?: Array<{ id: string; texto: string; feito: boolean }>;
        guia?: string;
        subtarefas?: Array<{ id: string; texto: string; feito: boolean; hora?: number; notificar?: boolean }>;
        pausa?: { de?: string; ate: string } | null;
        setId?: string | null;
        alarme?: boolean;
      }>,
    ): Promise<void> => {
      const patch: Record<string, unknown> = {};
      if (campos.titulo !== undefined) patch.titulo = campos.titulo;
      if (campos.dias !== undefined) patch.dias = campos.dias;
      if (campos.inicio !== undefined) patch.inicio = campos.inicio;
      if (campos.fim !== undefined) patch.fim = campos.fim;
      if (campos.notificar !== undefined) patch.notificar = campos.notificar;
      if (campos.alarme !== undefined) patch.alarme = campos.alarme;
      // `null` devolve à Normal (apagar o campo). No Firestore, undefined não remove — é preciso null.
      if (campos.setId !== undefined) patch.setId = campos.setId ?? null;
      if (campos.roteiro !== undefined) patch.roteiro = campos.roteiro;
      if (campos.passos !== undefined) patch.passos = campos.passos;
      if (campos.guia !== undefined) patch.guia = campos.guia;
      if (campos.subtarefas !== undefined) patch.subtarefas = campos.subtarefas;
      // `null` retoma: no Firestore, apagar é null explícito (undefined não remove).
      if (campos.pausa !== undefined) patch.pausa = campos.pausa ?? null;
      // Nota vazia = apagar a nota. `undefined` no Firestore não remove; é preciso ser explícito.
      if ("nota" in campos) patch.nota = campos.nota ?? null;

      if (!Object.keys(patch).length) return;
      await db.collection(colRotina(uid)).doc(id).set(patch, { merge: true });
    },

    apagar: async (id: string): Promise<void> => {
      await db.collection(colRotina(uid)).doc(id).delete();
    },

    adicionarExtra: async (id: string, tarefas: Array<{ id: string; texto: string; feito: boolean; hora?: number; notificar?: boolean }>): Promise<void> => {
      const dia = hojeISOnoFuso(timeZone);
      const docId = `${id}_${dia}`;
      const ref = db.collection(colRotinaItems(uid)).doc(docId);
      await ref.set(
        {
          blocoId: id,
          dia,
          tarefasDoDia: FieldValue.arrayUnion(...tarefas),
        },
        { merge: true }
      );
    },

    // ── As rotinas alternativas (blocos programáveis) ────────────────────────────
    // A Normal não é documento nenhum: é a ausência de período. Só as alternativas
    // (Férias, Provas…) vivem em routine_sets, cada uma com o seu de/até.
    lerRotinas: () => lerRotinaSets(db, uid),

    criarRotina: async (r: { nome: string; de?: string; ate?: string }): Promise<string> => {
      const ref = db.collection(colRotinaSets(uid)).doc();
      await ref.set({
        nome: r.nome,
        cor: "#9B7DD9", // violeta — a cor dela, para se ver que foi a Luna que montou
        ...(r.de ? { de: r.de } : {}),
        ...(r.ate ? { ate: r.ate } : {}),
        origem: "luna",
        criadoEm: new Date(),
      });
      return ref.id;
    },

    editarRotina: async (
      id: string,
      campos: { nome?: string; de?: string | null; ate?: string | null },
    ): Promise<void> => {
      const patch: Record<string, unknown> = {};
      if (campos.nome !== undefined) patch.nome = campos.nome;
      // `null` tira o período (passa a trocar à mão). undefined não remove no Firestore.
      if (campos.de !== undefined) patch.de = campos.de ?? null;
      if (campos.ate !== undefined) patch.ate = campos.ate ?? null;
      if (!Object.keys(patch).length) return;
      await db.collection(colRotinaSets(uid)).doc(id).set(patch, { merge: true });
    },

    apagarRotina: async (id: string): Promise<void> => {
      await db.collection(colRotinaSets(uid)).doc(id).delete();
    },
  };
}
