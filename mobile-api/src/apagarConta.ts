import { getAuth } from "firebase-admin/auth";

import { getAdminFirestore, getFirebaseAdminApp } from "./firebaseAdmin.js";

/**
 * Apaga TUDO do usuário — o direito de exclusão da LGPD.
 *
 * `recursiveDelete` sob `users/{uid}` varre o documento e todas as subcoleções (conversas +
 * mensagens, luna/humor_relacao, memoria/fatos, routine, routine_log, routine_sets,
 * routine_items, gamestate) sem eu precisar enumerar cada uma — o que fecha o furo de esquecer
 * uma coleção nova amanhã. O mundo interior da Luna (`luna_mundo/...`, global e partilhado) não
 * é dado pessoal do usuário e fica intocado. Por fim, remove o login do Firebase Auth para que
 * a conta suma de vez e o e-mail possa ser reusado.
 */
export async function apagarContaDoUsuario(uid: string): Promise<void> {
  const db = getAdminFirestore();
  const app = getFirebaseAdminApp();
  if (!db || !app) {
    throw new Error("Firebase admin não configurado — não dá para apagar a conta com segurança.");
  }

  await db.recursiveDelete(db.doc(`users/${uid}`));

  try {
    await getAuth(app).deleteUser(uid);
  } catch (err) {
    // Se o login já não existir, o dado já foi — para o usuário, a conta sumiu. Só repropaga
    // erros de verdade.
    const code = (err as { code?: string }).code;
    if (code !== "auth/user-not-found") throw err;
  }
}
