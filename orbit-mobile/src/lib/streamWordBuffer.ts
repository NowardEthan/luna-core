/** Segmentos de texto para animação fade (palavras + espaços). */
export function tokenizeStreamSegments(text: string): string[] {
  if (!text) return [];
  return text.match(/\S+\s*|\s+/g) ?? [text];
}

/** Duração do fade de opacidade de cada palavra ao entrar. */
export const STREAM_FADE_MS = 820;
/** Intervalo entre revelar cada palavra (a bolha cresce progressivamente). */
export const STREAM_SEGMENT_STAGGER_MAX_MS = 46;
export const STREAM_SEGMENT_STAGGER_MIN_MS = 12;
export const STREAM_STAGGER_BUDGET_MS = 5000;
/** Deslocamento vertical sutil no fade (px). */
export const STREAM_FADE_LIFT_PX = 3;

/** Atraso entre revelar cada palavra (adaptativo ao tamanho do texto). */
export function segmentStaggerMs(segmentCount: number): number {
  if (segmentCount <= 1) return 0;
  return Math.min(
    STREAM_SEGMENT_STAGGER_MAX_MS,
    Math.max(
      STREAM_SEGMENT_STAGGER_MIN_MS,
      Math.floor(STREAM_STAGGER_BUDGET_MS / segmentCount),
    ),
  );
}

/** Tempo estimado para a revelação + fade terminarem (usado pelo caller). */
export function estimateFadeDrainMs(text: string): number {
  const n = tokenizeStreamSegments(text).length;
  if (n <= 1) return STREAM_FADE_MS + 80;
  const stagger = segmentStaggerMs(n);
  return Math.min((n - 1) * stagger + STREAM_FADE_MS + 160, 12_000);
}

/** @deprecated Streaming agora é simulado no cliente (StreamWordReveal). */
export function createWordStreamBuffer(
  onReveal: (text: string) => void,
  options?: { throttleMs?: number; instant?: boolean },
) {
  let buffer = '';
  let revealed = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastRevealAt = 0;
  const throttleMs = options?.throttleMs ?? 100;
  const instant = options?.instant ?? false;

  function nextWordEnd(s: string): number {
    for (let i = 0; i < s.length; i++) {
      if (/\s/.test(s[i]) && i > 0) return i + 1;
    }
    return -1;
  }

  function tick(force = false) {
    const unrevealed = buffer.slice(revealed.length);
    if (!unrevealed) return;

    if (instant || force) {
      revealed = buffer;
      onReveal(revealed);
      return;
    }

    const end = nextWordEnd(unrevealed);
    if (end === -1) return;

    revealed += unrevealed.slice(0, end);
    lastRevealAt = Date.now();
    onReveal(revealed);
  }

  function schedule(force = false) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    if (instant || force) {
      tick(true);
      return;
    }

    const elapsed = Date.now() - lastRevealAt;
    const delay = Math.max(0, throttleMs - elapsed);

    timer = setTimeout(() => {
      timer = null;
      tick(false);
      if (buffer.length > revealed.length) schedule(false);
    }, delay);
  }

  return {
    push(delta: string) {
      if (!delta) return;
      buffer += delta;
      schedule(false);
    },
    flush() {
      schedule(true);
    },
    getText() {
      return buffer;
    },
    waitUntilDrained(): Promise<void> {
      return new Promise((resolve) => {
        const poll = () => {
          if (revealed.length >= buffer.length) {
            if (timer) {
              clearTimeout(timer);
              timer = null;
            }
            resolve();
            return;
          }
          tick(false);
          if (revealed.length < buffer.length) schedule(false);
          setTimeout(poll, throttleMs);
        };
        poll();
      });
    },
  };
}
