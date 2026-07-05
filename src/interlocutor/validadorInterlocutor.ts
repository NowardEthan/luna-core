import type { InterlocutorPipeline } from "./esquemaInterlocutor.js";
import { ehCriadorVerificado } from "./ehCriadorVerificado.js";

type InterlocutorEntrada = Partial<InterlocutorPipeline> | null | undefined;

/**
 * Sanitiza o bloco de interlocutor para evitar elevação indevida de criador.
 */
export function sanitizarInterlocutorPipeline(interlocutor: InterlocutorEntrada): InterlocutorPipeline | undefined {
  const uid = interlocutor?.uid?.trim();
  if (!uid) return undefined;

  return {
    uid,
    criador_verificado: ehCriadorVerificado(uid),
    display_name: interlocutor?.display_name?.trim() || undefined,
  };
}
