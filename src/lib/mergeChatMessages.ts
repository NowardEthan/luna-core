import type { ChatMessage } from '../data/fixtures';
import { userMessageIdForLuna } from './chatMessageIds';

/** Garante que a resposta da Luna fique sempre depois da mensagem do usuário do par. */
export function stabilizeLunaAfterUser(messages: ChatMessage[]): ChatMessage[] {
  const result = [...messages];
  for (let i = 0; i < result.length; i++) {
    const msg = result[i];
    if (msg.role !== 'luna') continue;
    const userId = userMessageIdForLuna(msg.id);
    if (!userId) continue;
    const userIdx = result.findIndex((m) => m.id === userId);
    if (userIdx < 0 || userIdx < i) continue;
    const [luna] = result.splice(i, 1);
    const insertAt = result.findIndex((m) => m.id === userId) + 1;
    result.splice(insertAt, 0, luna);
  }
  return result;
}

/**
 * Mescla Firestore + local sem inverter o par user→luna quando o servidor
 * grava a resposta antes do cliente terminar de persistir a pergunta.
 */
export function mergeFirestoreAndLocalMessages(
  firestoreMessages: ChatMessage[],
  localMessages: ChatMessage[],
  map: Map<string, ChatMessage>,
): ChatMessage[] {
  const firestoreIds = new Set(firestoreMessages.map((m) => m.id));
  const localOnlyIds = new Set(
    localMessages.filter((m) => !firestoreIds.has(m.id)).map((m) => m.id),
  );

  const deferredLuna: ChatMessage[] = [];
  const ordered: ChatMessage[] = [];

  for (const m of firestoreMessages) {
    const merged = map.get(m.id) ?? m;
    if (m.role === 'luna') {
      const userId = userMessageIdForLuna(m.id);
      if (userId && localOnlyIds.has(userId)) {
        deferredLuna.push(merged);
        continue;
      }
    }
    ordered.push(merged);
  }

  for (const m of localMessages) {
    if (!firestoreIds.has(m.id)) {
      ordered.push(map.get(m.id) ?? m);
    }
  }

  for (const luna of deferredLuna) {
    const userId = userMessageIdForLuna(luna.id);
    if (!userId) {
      ordered.push(luna);
      continue;
    }
    const userIdx = ordered.findIndex((m) => m.id === userId);
    if (userIdx >= 0) {
      ordered.splice(userIdx + 1, 0, luna);
    } else {
      ordered.push(luna);
    }
  }

  return stabilizeLunaAfterUser(ordered);
}
