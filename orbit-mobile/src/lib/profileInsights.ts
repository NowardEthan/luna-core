import type { SessionItem } from '../data/fixtures';
import type { UserProfileMilestones } from './firebase/userProfileTypes';

export type ProfileStats = {
  conversations: number;
  messages: number;
  pinned: number;
};

export type ProfileActivityItem = {
  id: string;
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  text: string;
  date: string;
};

export type ProfileAchievement = {
  id: string;
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  label: string;
  earned: boolean;
  hint?: string;
};

export function computeProfileStats(sessions: SessionItem[]): ProfileStats {
  const messages = sessions.reduce((sum, s) => sum + (s.messageCount ?? 0), 0);
  const pinned = sessions.filter((s) => s.pinned).length;
  return {
    conversations: sessions.length,
    messages,
    pinned,
  };
}

export function resolvePinnedSessions(
  sessions: SessionItem[],
  localPinIds: string[] | undefined,
): SessionItem[] {
  const localSet = new Set(localPinIds ?? []);
  return sessions.filter((s) => s.pinned || localSet.has(s.id)).slice(0, 6);
}

export function buildProfileActivity(sessions: SessionItem[]): ProfileActivityItem[] {
  return sessions.slice(0, 8).map((session) => ({
    id: session.id,
    icon: 'chatbubble-ellipses-outline',
    text: session.preview
      ? `«${session.title}» — ${session.preview}`
      : `Conversa "${session.title}" atualizada`,
    date: session.updatedAt,
  }));
}

export function computeAchievements(input: {
  stats: ProfileStats;
  isAnonymous: boolean;
  cloud: boolean;
  milestones: UserProfileMilestones;
}): ProfileAchievement[] {
  const { stats, isAnonymous, cloud, milestones } = input;
  return [
    {
      id: 'first-chat',
      icon: 'chatbubbles',
      label: 'Primeira conversa',
      earned: stats.conversations >= 1,
      hint: 'Envie uma mensagem à Luna',
    },
    {
      id: 'ten-chats',
      icon: 'planet-outline',
      label: '10 conversas',
      earned: stats.conversations >= 10,
      hint: `${Math.min(stats.conversations, 10)}/10`,
    },
    {
      id: 'google',
      icon: 'logo-google',
      label: 'Conta Google',
      earned: !isAnonymous,
      hint: 'Vincule na seção acima',
    },
    {
      id: 'cloud',
      icon: 'cloud-outline',
      label: 'Sync na nuvem',
      earned: cloud && !isAnonymous,
    },
    {
      id: 'voice',
      icon: 'mic',
      label: 'Mensagem de voz',
      earned: milestones.voiceMessage === true,
      hint: 'Grave áudio numa conversa',
    },
    {
      id: 'files',
      icon: 'document-text-outline',
      label: 'Leitor de arquivos',
      earned: milestones.fileAttachment === true,
      hint: 'Anexe um PDF ou documento',
    },
    {
      id: 'images',
      icon: 'image-outline',
      label: 'Visão Luna',
      earned: milestones.imageAttachment === true,
      hint: 'Envie uma imagem',
    },
    {
      id: 'pin',
      icon: 'pin',
      label: 'Conversa fixada',
      earned: stats.pinned >= 1,
      hint: 'Fixe uma conversa abaixo',
    },
  ];
}

export function formatMemberSince(value: unknown): string {
  let date: Date | null = null;
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    date = (value as { toDate: () => Date }).toDate();
  } else if (typeof value === 'number') {
    date = new Date(value);
  } else if (value instanceof Date) {
    date = value;
  }
  if (!date || Number.isNaN(date.getTime())) return 'Recente';
  return date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}
