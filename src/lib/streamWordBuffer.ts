/** Acumula deltas SSE e revela texto por palavra completa, com throttle opcional. */
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

    if (instant) {
      tick(true);
      return;
    }

    if (force) {
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
  };
}

/** Separa texto estável da palavra activa (último token) para animação. */
export function splitStableActiveWord(text: string): { stable: string; active: string } {
  if (!text) return { stable: '', active: '' };
  const match = text.match(/^([\s\S]*?)(\S+\s*)$/);
  if (!match) return { stable: '', active: text };
  return { stable: match[1] ?? '', active: match[2] ?? '' };
}
