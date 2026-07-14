import type { Firestore } from "firebase-admin/firestore";

import { colRotina, colRotinaLog } from "../../dist/persistencia/caminhosFirestore.js";
import type { BlocoRotinaCore, RegistoDia } from "../../dist/estado/neuronioRotina.js";

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
      };
    });
  } catch {
    // Sem rotina, ela continua a saber as horas — só não sabe o dia dele. Degradar, nunca
    // falhar: um erro a ler o calendário não pode derrubar a conversa.
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
export function maosDaRotina(db: Firestore, uid: string) {
  return {
    ler: () => lerRotina(db, uid),

    criar: async (b: {
      titulo: string;
      dias: number[];
      inicio: number;
      fim: number;
      nota?: string;
      notificar: boolean;
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
        origem: "luna",
        criadoEm: new Date(),
      });
      return ref.id;
    },

    apagar: async (id: string): Promise<void> => {
      await db.collection(colRotina(uid)).doc(id).delete();
    },
  };
}
