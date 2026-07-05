/** Modo de persistência — sqlite (local/CLI) ou firestore (Railway/mobile). */

export type ModoPersistencia = "sqlite" | "firestore";

export function obterModoPersistencia(): ModoPersistencia {
  const raw = process.env.LUNA_STORE?.trim().toLowerCase();
  if (raw === "firestore" || raw === "firebase") return "firestore";
  return "sqlite";
}

export function usarPersistenciaFirestore(): boolean {
  return obterModoPersistencia() === "firestore";
}
