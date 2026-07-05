import { UID_CRIADOR_CANONICO } from "./esquemaInterlocutor.js";

/** Verifica se o UID Firebase corresponde ao criador canónico (env ou valor default de dev). */
export function ehCriadorVerificado(uid: string | null | undefined): boolean {
  if (!uid) return false;
  const canon = (process.env.LUNA_CRIADOR_UID?.trim() || UID_CRIADOR_CANONICO).trim();
  if (uid === canon) return true;
  const lista = process.env.LUNA_CRIADOR_UIDS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return lista?.includes(uid) ?? false;
}
