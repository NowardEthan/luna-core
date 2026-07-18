import { getAdminFirestore } from "./firebaseAdmin.js";

export type Ideia = {
  id: string;
  texto: string;
  createdAt: number; // timestamp ms
  origem: "luna" | "user";
  status: "pendente" | "arquivado";
};

/**
 * Cria uma nova ideia na caixa de entrada (inbox) do usuário.
 */
export async function criarIdeia(uid: string, texto: string, origem: "luna" | "user"): Promise<string> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore admin indisponível — não consegui guardar a ideia.");
  const ref = db.collection("users").doc(uid).collection("ideias").doc();
  const ideia: Ideia = {
    id: ref.id,
    texto,
    createdAt: Date.now(),
    origem,
    status: "pendente",
  };
  await ref.set(ideia);
  return ref.id;
}

/**
 * Lê todas as ideias (pendentes e arquivadas) do usuário.
 */
export async function lerIdeias(uid: string): Promise<Ideia[]> {
  const db = getAdminFirestore();
  if (!db) return [];
  const ref = db.collection("users").doc(uid).collection("ideias");
  const snap = await ref.orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => d.data() as Ideia);
}

