/** Caminhos Firestore — alinhados com `orbit-mobile/src/lib/firebase/paths.ts`. */

export const FS = {
  lunaMundo: "luna_mundo",
  lunaState: "state",
  users: "users",
  memoria: "memoria",
  fatos: "fatos",
  lunaUser: "luna",
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
