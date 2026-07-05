import { UID_CRIADOR_CANONICO, type InterlocutorPipeline } from "./esquemaInterlocutor.js";

export type PerfilInterlocutor = "ethan" | "geral";

export type RegrasInterlocutor = {
  perfil: PerfilInterlocutor;
  eh_criador_verificado: boolean;
  habilitar_modo_ethan: boolean;
  aplicar_anti_reivindicacao: boolean;
};

function uidCanonico(): string {
  return (process.env.LUNA_CRIADOR_UID?.trim() || UID_CRIADOR_CANONICO).trim();
}

export function ehInterlocutorEthan(interlocutor?: InterlocutorPipeline): boolean {
  if (!interlocutor?.uid) return false;
  if (interlocutor.criador_verificado) return true;
  return interlocutor.uid === uidCanonico();
}

export function montarMatrizInterlocutor(interlocutor?: InterlocutorPipeline): RegrasInterlocutor {
  const ehEthan = ehInterlocutorEthan(interlocutor);
  return {
    perfil: ehEthan ? "ethan" : "geral",
    eh_criador_verificado: ehEthan,
    habilitar_modo_ethan: ehEthan,
    aplicar_anti_reivindicacao: !ehEthan,
  };
}
