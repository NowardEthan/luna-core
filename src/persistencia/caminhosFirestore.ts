/** Caminhos Firestore — alinhados com `orbit-mobile/src/lib/firebase/paths.ts`. */

export const FS = {
  lunaMundo: "luna_mundo",
  lunaState: "state",
  users: "users",
  memoria: "memoria",
  fatos: "fatos",
  lunaUser: "luna",
  routine: "routine",
} as const;

/** Documento global da Luna (clima, habitat, vida_estado). */
export function docMundoGlobal(nome: string): string {
  return `${FS.lunaMundo}/${nome}`;
}

/** Subcoleção global sob luna_mundo/state/{nome}. */
export function colMundoGlobal(sub: string): string {
  return `${FS.lunaMundo}/${FS.lunaState}/${sub}`;
}

export function docHumorRelacao(uid: string): string {
  return `${FS.users}/${uid}/${FS.lunaUser}/humor_relacao`;
}

export function colMemoriaFatos(uid: string): string {
  return `${FS.users}/${uid}/${FS.memoria}`;
}

/**
 * A rotina do utilizador — os blocos recorrentes do dia.
 *
 * Escrita pelo Orbit (`orbit-mobile/src/lib/firebase/firestoreRoutine.ts`) e LIDA aqui. É
 * essa partilha que faz a funcionalidade existir: se a rotina vivesse só no telemóvel, a
 * Luna nunca saberia que ele está no ônibus.
 */
export function colRotina(uid: string): string {
  return `${FS.users}/${uid}/${FS.routine}`;
}

/** O registo do dia: o que aconteceu com cada bloco (feito / hoje_nao / ignorado). */
export function colRotinaLog(uid: string): string {
  return `${FS.users}/${uid}/routine_log`;
}

/** As rotinas alternativas (Férias, Semana de provas…). */
export function colRotinaSets(uid: string): string {
  return `${FS.users}/${uid}/routine_sets`;
}

/** Os itens (subtarefas, tarefasDoDia) marcados/adicionados por dia. */
export function colRotinaItems(uid: string): string {
  return `${FS.users}/${uid}/routine_items`;
}
