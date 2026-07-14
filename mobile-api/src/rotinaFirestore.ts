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
