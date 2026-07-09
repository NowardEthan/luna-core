import type { LunaHumorBadge } from '../lib/lunaHumor';

export type Role = 'user' | 'luna';

export interface VoiceClip {
  uri: string;
  durationMs: number;
}

export interface ChatMessage {
  id: string;
  role: Role;
  text?: string;
  /** Quando definido, força renderização plain ou markdown (como Orbit concept). */
  format?: 'plain' | 'markdown';
  audio?: VoiceClip;
  /** Texto transcrito do áudio (STT). */
  transcript?: string;
  transcriptLoading?: boolean;
  transcriptError?: string;
  /** Trecho referenciado neste envio (pergunta sobre citação). */
  reference?: import('../lib/messageReference').ThreadReference;
  /** Imagens e arquivos anexados (como Orbit concept). */
  attachments?: import('../lib/composerAttachmentModel').ComposerAttachment[];
  /** Resposta em streaming SSE (Cerebras). */
  streaming?: boolean;
  /** Texto de raciocínio do modelo (faixa live acima da bolha). */
  reasoning?: string;
  reasoningStreaming?: boolean;
  /** Passos de pesquisa concluídos (web_search / ler_url) — bloco anexado à mensagem. */
  research?: import('../lib/researchTrace').ResearchStep[];
  /** Chamada de ferramenta de pesquisa em andamento — indicador ao vivo. */
  researchLive?: import('../lib/researchTrace').ResearchLive;
  /** Humor dual-layer no turno (chip na bolha). */
  humor?: LunaHumorBadge;
}

export interface SessionItem {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  pinned?: boolean;
  messageCount?: number;
  /** Pasta de organização (null/undefined = solta na raiz). */
  collectionId?: string | null;
}

export interface UserProfile {
  name: string;
  initials: string;
}

export const demoUser: UserProfile = {
  name: 'Ethan',
  initials: 'E',
};

export const sessions: SessionItem[] = [
  { id: 's1', title: 'Órbitas e gravidade', preview: 'Explique como funcionam as órbitas', updatedAt: '1h' },
  { id: 's2', title: 'Plano de estudos', preview: 'Rotina de revisão para a semana', updatedAt: '4h' },
  { id: 's3', title: 'Resumo de história', preview: 'Tópicos sobre a Revolução Industrial', updatedAt: 'ontem' },
];

export const demoThread: ChatMessage[] = [
  { id: '1', role: 'user', text: 'Explique o que é uma órbita.' },
  {
    id: '2',
    role: 'luna',
    text:
      'Uma órbita é o caminho curvo que um corpo faz ao redor de outro por causa da gravidade — como a Lua ao redor da Terra. Quer que eu aprofunde a parte da velocidade?',
  },
  { id: '3', role: 'user', text: 'Sim, e porque não caem um no outro.' },
  {
    id: '4',
    role: 'luna',
    format: 'markdown',
    text:
      'Ótima pergunta! O corpo está sempre "caindo", mas se move tão rápido de lado que vai passando ao lado — esse equilíbrio entre queda e velocidade mantém a órbita estável.\n\nExemplo em Python:\n\n```python\nimport math\n\nG = 6.674e-11\nM = 5.972e24\nr = 6.371e6\n\nv_orbital = math.sqrt(G * M / r)\nprint(f"Velocidade orbital: {v_orbital:.0f} m/s")\n```\n\n**Resumo:** velocidade tangencial + queda contínua = órbita.',
  },
];

export const suggestions = [
  {
    text: 'Explicar um conceito passo a passo',
    subtitle: 'Do básico ao avançado, no seu ritmo',
    icon: 'sparkles' as const,
    accent: '#88C1F2',
  },
  {
    text: 'Montar um plano de estudo',
    subtitle: 'Rotina clara para a semana',
    icon: 'calendar' as const,
    accent: '#6BC4A0',
  },
  {
    text: 'Fazer um quiz de revisão',
    subtitle: 'Perguntas para fixar a matéria',
    icon: 'help-circle' as const,
    accent: '#C792EA',
  },
  {
    text: 'Resumir texto em tópicos',
    subtitle: 'Lista objetiva do essencial',
    icon: 'list' as const,
    accent: '#82AAFF',
  },
];

export const lunaDemoReply =
  'Olá! Sou a Luna — sua companheira no Orbit. Pergunte o que quiser; explico passo a passo, no seu ritmo.';

export const lunaVoiceReply =
  'Recebi seu áudio! Se quiser revisar o que disse, toque em "Transcrever" na bolha. Em que posso ajudar?';
