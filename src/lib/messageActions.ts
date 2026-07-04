import * as Clipboard from 'expo-clipboard';

import type { ChatMessage } from '../data/fixtures';

export type MessageActionKind = 'copy' | 'resend' | 'redo' | 'fork' | 'branch' | 'truncate' | 'reference';

export type MessageActionFeedback = {
  id: string;
  kind: MessageActionKind;
  role: ChatMessage['role'];
  title: string;
  detail: string;
};

export const MESSAGE_FEEDBACK_MS = 3200;

export function excerpt(text: string, max = 56): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max)}…`;
}

export function messageCopyText(message: ChatMessage): string {
  return (
    message.text?.trim() ||
    message.transcript?.trim() ||
    (message.audio ? '[Mensagem de voz]' : '')
  );
}

export function findPreviousUserMessage(
  messages: ChatMessage[],
  fromId: string,
): ChatMessage | null {
  const index = messages.findIndex((m) => m.id === fromId);
  if (index <= 0) return null;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') return messages[i];
  }
  return null;
}

export function countTailMessages(messages: ChatMessage[], index: number): number {
  return Math.max(0, messages.length - index - 1);
}

export type RedoUserChoice = {
  message: ChatMessage;
  index: number;
  tailCount: number;
};

export function redoUserNeedsChoice(
  messages: ChatMessage[],
  message: ChatMessage,
): RedoUserChoice | null {
  if (message.role !== 'user') return null;
  const index = messages.findIndex((m) => m.id === message.id);
  if (index === -1) return null;
  const tailCount = countTailMessages(messages, index);
  if (tailCount <= 0) return null;
  return { message, index, tailCount };
}

/** Copiar — texto bruto na área de transferência. */
export async function copyMessageAction(message: ChatMessage): Promise<MessageActionFeedback> {
  const text = messageCopyText(message);
  await Clipboard.setStringAsync(text);
  const chars = text.length;
  return {
    id: `copy-${message.id}-${Date.now()}`,
    kind: 'copy',
    role: message.role,
    title: 'Copiado',
    detail:
      message.role === 'luna'
        ? `Resposta da Luna (${chars} caracteres) na área de transferência.`
        : `Sua mensagem (${chars} caracteres) na área de transferência.`,
  };
}

/** Reenviar — user: repete; Luna: repõe prompt anterior no composer. */
export function planResendMessage(
  message: ChatMessage,
  messages: ChatMessage[],
): {
  feedback: MessageActionFeedback;
  composerDraft?: string;
  resendUserText?: string;
} {
  const text = messageCopyText(message);
  if (!text) {
    return {
      feedback: {
        id: `resend-${message.id}-${Date.now()}`,
        kind: 'resend',
        role: message.role,
        title: 'Reenviar',
        detail: 'Esta mensagem não tem texto para reenviar.',
      },
    };
  }

  if (message.role === 'user') {
    return {
      feedback: {
        id: `resend-${message.id}-${Date.now()}`,
        kind: 'resend',
        role: 'user',
        title: 'Reenviar',
        detail: `Repetindo envio: "${excerpt(text)}"`,
      },
      resendUserText: text,
    };
  }

  const prompt = findPreviousUserMessage(messages, message.id);
  if (!prompt) {
    return {
      feedback: {
        id: `resend-${message.id}-${Date.now()}`,
        kind: 'resend',
        role: 'luna',
        title: 'Reenviar',
        detail: 'Não encontrei o prompt anterior nesta conversa.',
      },
    };
  }

  const promptText = messageCopyText(prompt);
  return {
    feedback: {
      id: `resend-${message.id}-${Date.now()}`,
      kind: 'resend',
      role: 'luna',
      title: 'Reenviar',
      detail: `Prompt restaurado no composer: "${excerpt(promptText)}"`,
    },
    composerDraft: promptText,
  };
}

/** Refazer — user: composer; Luna: nova geração. */
export function planRedoMessage(message: ChatMessage): {
  feedback: MessageActionFeedback;
  composerDraft?: string;
  regenerateFromUserText?: string;
} {
  const text = messageCopyText(message);

  if (message.role === 'user') {
    return {
      feedback: {
        id: `redo-${message.id}-${Date.now()}`,
        kind: 'redo',
        role: 'user',
        title: 'Editar e reenviar',
        detail: `Abre no composer: "${excerpt(text)}"`,
      },
      composerDraft: text,
    };
  }

  return {
    feedback: {
      id: `redo-${message.id}-${Date.now()}`,
      kind: 'redo',
      role: 'luna',
      title: 'Gerar nova resposta',
      detail: 'Pedindo nova resposta da Luna…',
    },
    regenerateFromUserText: undefined,
  };
}

export function planRedoLunaRegenerate(
  message: ChatMessage,
  messages: ChatMessage[],
): {
  feedback: MessageActionFeedback;
  regenerateFromUserText?: string;
} {
  const prompt = findPreviousUserMessage(messages, message.id);
  if (!prompt) {
    return {
      feedback: {
        id: `redo-${message.id}-${Date.now()}`,
        kind: 'redo',
        role: 'luna',
        title: 'Gerar nova resposta',
        detail: 'Não encontrei seu prompt anterior.',
      },
    };
  }
  return {
    feedback: {
      id: `redo-${message.id}-${Date.now()}`,
      kind: 'redo',
      role: 'luna',
      title: 'Gerar nova resposta',
      detail: 'Pedindo nova resposta da Luna…',
    },
    regenerateFromUserText: messageCopyText(prompt),
  };
}

export function feedbackForFork(messageCount: number, parentTitle?: string): MessageActionFeedback {
  const parent =
    parentTitle && parentTitle !== 'Luna' ? `"${parentTitle}"` : 'a conversa original';
  return {
    id: `fork-${Date.now()}`,
    kind: 'fork',
    role: 'user',
    title: 'Bifurcar',
    detail:
      messageCount <= 1
        ? `Nova conversa criada. Use o banner no topo para voltar a ${parent}.`
        : `Nova conversa com ${messageCount} mensagens de contexto. Volte a ${parent} pelo banner no topo.`,
  };
}

export function feedbackForBranchContinuation(): MessageActionFeedback {
  return {
    id: `branch-continue-${Date.now()}`,
    kind: 'branch',
    role: 'user',
    title: 'Ramo alternativo',
    detail: 'Continuação iniciada. O ramo anterior fica arquivado acima.',
  };
}

export function feedbackForBranch(archivedCount: number): MessageActionFeedback {
  return {
    id: `branch-${Date.now()}`,
    kind: 'branch',
    role: 'user',
    title: 'Ramificar',
    detail: `Ramo anterior arquivado (${archivedCount} ${archivedCount === 1 ? 'mensagem' : 'mensagens'}). Use o chip de ramificações no topo para trocar de ramo ou ir ao ponto da bifurcação.`,
  };
}

export function feedbackForTimelineSwitch(activeTimeline: 'continuation' | 'archived'): MessageActionFeedback {
  const label = activeTimeline === 'continuation' ? 'Ramo alternativo' : 'Ramo anterior';
  return {
    id: `timeline-${Date.now()}`,
    kind: 'branch',
    role: 'user',
    title: 'Ramo trocado',
    detail: `Agora você está no ${label}. O outro ramo ficou arquivado acima.`,
  };
}

export function feedbackForBranchDeleted(which: 'active' | 'inactive'): MessageActionFeedback {
  return {
    id: `branch-del-${Date.now()}`,
    kind: 'branch',
    role: 'user',
    title: 'Ramo excluído',
    detail:
      which === 'inactive'
        ? 'O ramo arquivado foi removido. A conversa continua só com o ramo atual.'
        : 'O ramo actual foi removido. O outro ramo passou a ser a conversa.',
  };
}

export function feedbackForForkDeleted(title?: string): MessageActionFeedback {
  const label = title ? `"${title}"` : 'A bifurcação';
  return {
    id: `fork-del-${Date.now()}`,
    kind: 'fork',
    role: 'user',
    title: 'Bifurcação excluída',
    detail: `${label} foi apagada da lixeira e desvinculada desta conversa.`,
  };
}

export function feedbackForTruncate(removedCount: number): MessageActionFeedback {
  return {
    id: `truncate-${Date.now()}`,
    kind: 'truncate',
    role: 'user',
    title: 'Apagar e refazer',
    detail:
      removedCount <= 1
        ? '1 mensagem removida — texto no composer.'
        : `${removedCount} mensagens removidas — texto no composer.`,
  };
}

export type MessageSheetAction = 'copy' | 'resend' | 'redo' | 'fork' | 'reference';

export interface MessageSheetActionItem {
  id: MessageSheetAction;
  label: string;
  subtitle: string;
  icon:
    | 'copy-outline'
    | 'arrow-redo-outline'
    | 'create-outline'
    | 'git-branch-outline'
    | 'chatbubble-outline'
    | 'sparkles-outline'
    | 'chatbox-ellipses-outline';
  /** Agrupa visualmente ações secundárias (ex. bifurcar). */
  group?: 'main' | 'branch';
}

function hasEditableUserText(message: ChatMessage): boolean {
  return Boolean(message.text?.trim() || message.transcript?.trim());
}

/** Ações do sheet — separadas por autor da bolha (concept Orbit DS). */
export function sheetActionItemsForMessage(
  message: ChatMessage,
  messages: ChatMessage[],
): MessageSheetActionItem[] {
  const copyText = messageCopyText(message);
  const canCopy = copyText.length > 0;

  if (message.role === 'user') {
    const items: MessageSheetActionItem[] = [];

    if (canCopy) {
      items.push(
        {
          id: 'copy',
          label: 'Copiar',
          subtitle: message.audio ? 'Transcrição ou texto na área de transferência' : 'Texto completo na área de transferência',
          icon: 'copy-outline',
          group: 'main',
        },
        {
          id: 'reference',
          label: 'Referenciar trecho',
          subtitle: 'Selecione um pedaço e pergunte à Luna sobre ele',
          icon: 'chatbox-ellipses-outline',
          group: 'main',
        },
      );
    }

    if (hasEditableUserText(message)) {
      items.push(
        {
          id: 'resend',
          label: 'Reenviar',
          subtitle: 'Repete este envio para a Luna',
          icon: 'arrow-redo-outline',
          group: 'main',
        },
        {
          id: 'redo',
          label: 'Editar e reenviar',
          subtitle: 'Abre no composer para alterar e enviar',
          icon: 'create-outline',
          group: 'main',
        },
      );
    }

    items.push({
      id: 'fork',
      label: 'Bifurcar daqui',
      subtitle: 'Nova conversa — link para voltar à original',
      icon: 'git-branch-outline',
      group: 'branch',
    });

    return items;
  }

  // —— Resposta da Luna ——
  const items: MessageSheetActionItem[] = [];

  if (canCopy) {
    items.push(
      {
        id: 'copy',
        label: 'Copiar resposta',
        subtitle: 'Resposta completa na área de transferência',
        icon: 'copy-outline',
        group: 'main',
      },
      {
        id: 'reference',
        label: 'Referenciar trecho',
        subtitle: 'Selecione um pedaço desta resposta para perguntar à Luna',
        icon: 'chatbox-ellipses-outline',
        group: 'main',
      },
    );
  }

  const prompt = findPreviousUserMessage(messages, message.id);
  const promptText = prompt ? messageCopyText(prompt) : '';

  if (prompt && promptText) {
    items.push(
      {
        id: 'resend',
        label: 'Restaurar prompt',
        subtitle: `Coloca "${excerpt(promptText, 42)}" no composer`,
        icon: 'chatbubble-outline',
        group: 'main',
      },
      {
        id: 'redo',
        label: 'Gerar nova resposta',
        subtitle: 'A Luna responde outra vez ao mesmo prompt',
        icon: 'sparkles-outline',
        group: 'main',
      },
    );
  }

  return items;
}

/** @deprecated Usar sheetActionItemsForMessage */
export function sheetActionsForMessage(message: ChatMessage): MessageSheetAction[] {
  return sheetActionItemsForMessage(message, []).map((i) => i.id);
}
