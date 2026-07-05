import type { Timestamp } from 'firebase/firestore';

/** Campos extra do perfil em `users/{uid}` (compatível com Luna legacy). */
export type FirestoreUserProfileDoc = {
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  /** Avatar personalizado (sobrepõe photoURL do Auth quando definido). */
  avatarUrl?: string | null;
  /** Imagem de capa do perfil. */
  coverUrl?: string | null;
  plan?: string;
  /** Estado de assinatura — escrito pelo backend (Asaas). */
  billing?: unknown;
  bio?: string;
  /** Marcos desbloqueados para conquistas no perfil. */
  milestones?: UserProfileMilestones;
  createdAt?: Timestamp | number;
  updatedAt?: Timestamp | number;
};

export type UserProfileMilestones = {
  voiceMessage?: boolean;
  fileAttachment?: boolean;
  imageAttachment?: boolean;
  documentReference?: boolean;
};

export type OrbitUserProfile = {
  displayName: string;
  bio: string;
  plan: string;
  memberSinceLabel: string;
  milestones: UserProfileMilestones;
  loading: boolean;
  cloud: boolean;
};

export const EMPTY_MILESTONES: UserProfileMilestones = {};
