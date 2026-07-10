import type { Timestamp } from 'firebase/firestore';

export type FirestoreMessageRole = 'user' | 'luna' | 'assistant';

export type FirestoreMessageDoc = {
  role: FirestoreMessageRole;
  text?: string;
  audioDurationMs?: number;
  transcript?: string;
  createdAt?: Timestamp;
  attachments?: {
    id: string;
    kind: 'image' | 'file';
    name: string;
    size: number;
    mime: string;
    /** URL HTTPS no Firebase Storage — persiste imagens/arquivos entre sessões. */
    uri?: string;
  }[];
  /** URL HTTPS do áudio no Firebase Storage. */
  audioUrl?: string;
  reference?: {
    kind?: 'message' | 'document';
    messageId: string;
    role: 'user' | 'luna';
    messageIndex: number;
    excerpt: string;
    fullText?: string;
    attachmentId?: string;
    attachmentName?: string;
    attachmentUri?: string;
  };
  /** Passos de pesquisa (web_search / ler_url) executados para gerar esta resposta. */
  research?: {
    ferramenta: string;
    argumento: string;
    sucesso?: boolean;
    fontes?: { title?: string; url: string }[];
  }[];
  /** Raciocínio da Luna — persistido para sobreviver a reload/background do app. */
  reasoning?: string;
};

/** Doc mobile (subcollection messages) + legacy Orbit desktop (messages[] embutido). */
export type FirestoreConversationDoc = {
  title?: string;
  preview?: string;
  lunaSessaoId?: string;
  updatedAt?: Timestamp | number;
  createdAt?: Timestamp | number;
  /** Legacy orbit-legacy: array de mensagens no doc pai */
  messages?: LegacyEmbeddedMessage[];
  /** IDs de mensagens apagadas (tombstone — esconde legacy + subcollection). */
  deletedMessageIds?: string[];
  /** Soft delete — conversa na lixeira (sem regras extra). */
  deletedAt?: Timestamp | number;
  messageCount?: number;
  /** Fixada no perfil / lista de conversas. */
  pinned?: boolean;
  /** Pasta de organização. */
  collectionId?: string | null;
  /** Título definido manualmente — não sobrescrever com deriveTitle. */
  titleLocked?: boolean;
};

export type FirestoreCollectionDoc = {
  name: string;
  parentId?: string | null;
  createdAt?: Timestamp | number;
  updatedAt?: Timestamp | number;
};

export type FirestoreTrashConversationDoc = FirestoreConversationDoc & {
  deletedAt?: Timestamp;
  originalConversationId: string;
  messageCount?: number;
};

export type FirestoreTrashMessageDoc = FirestoreMessageDoc & {
  deletedAt?: Timestamp;
  originalMessageId: string;
};

/** Mensagem embutida no doc (orbit-legacy cloudSync). */
export type LegacyEmbeddedMessage = {
  id?: string;
  role?: string;
  text?: string;
  audioDurationMs?: number;
  transcript?: string;
};
