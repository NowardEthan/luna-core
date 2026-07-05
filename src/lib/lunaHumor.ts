/** Payload de humor vindo da Luna Mobile API (luna-core → humorParaBadge). */
export type LunaHumorTema =
  | 'caloroso'
  | 'neutro'
  | 'animado'
  | 'magoado'
  | 'chateado'
  | 'contido';

export type LunaHumorBadge = {
  emoji: string;
  label: string;
  tema: LunaHumorTema;
  narrativa?: string;
  accessibilityLabel: string;
};

const TEMAS: LunaHumorTema[] = [
  'caloroso',
  'neutro',
  'animado',
  'magoado',
  'chateado',
  'contido',
];

export function parseHumorBadge(raw: unknown): LunaHumorBadge | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.emoji !== 'string' || typeof o.label !== 'string') return undefined;
  const temaRaw = typeof o.tema === 'string' ? o.tema : 'neutro';
  const tema = TEMAS.includes(temaRaw as LunaHumorTema) ? (temaRaw as LunaHumorTema) : 'neutro';
  return {
    emoji: o.emoji,
    label: o.label,
    tema,
    narrativa: typeof o.narrativa === 'string' ? o.narrativa : undefined,
    accessibilityLabel:
      typeof o.accessibilityLabel === 'string'
        ? o.accessibilityLabel
        : `Humor da Luna: ${o.label}`,
  };
}

/** Cor de acento por tema — alinhado ao Orbit DS. */
export const HUMOR_TEMA_COR: Record<LunaHumorTema, string> = {
  caloroso: '#F5D047',
  neutro: '#9CA3B0',
  animado: '#88C1F2',
  magoado: '#B39DDB',
  chateado: '#E57373',
  contido: '#6BC4A0',
};
