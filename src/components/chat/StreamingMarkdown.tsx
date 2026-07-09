import React, { useEffect, useMemo, useRef, useState } from 'react';
import { segmentStaggerMs, tokenizeStreamSegments } from '../../lib/streamWordBuffer';
import { useMotionProfile } from '../../hooks/useMotionProfile';
import { MessageMarkdown } from './MessageMarkdown';

type Props = {
  text: string;
  highlightExcerpt?: string;
};

/** Reparsear markdown a cada palavra é caro em respostas longas — agrupa
 * a atualização visível em janelas de ~70ms em vez de a cada tick. */
const RENDER_THROTTLE_MS = 70;

/**
 * Markdown revelado progressivamente: a estrutura (headers, listas, negrito)
 * já aparece formatada desde a primeira palavra — só o conteúdo vai
 * enchendo — em vez de mostrar a sintaxe crua e só formatar no final.
 */
export function StreamingMarkdown({ text, highlightExcerpt }: Props) {
  const { reduceMotion } = useMotionProfile();
  const segments = useMemo(() => tokenizeStreamSegments(text), [text]);
  const total = segments.length;
  const stagger = useMemo(() => segmentStaggerMs(total), [total]);

  const [visibleCount, setVisibleCount] = useState(reduceMotion ? total : 0);
  const visibleCountRef = useRef(visibleCount);
  visibleCountRef.current = visibleCount;

  useEffect(() => {
    if (reduceMotion) {
      setVisibleCount(total);
      return;
    }
    if (total <= visibleCountRef.current) return;

    let raw = visibleCountRef.current;
    let lastFlush = 0;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const tick = () => {
      raw = Math.min(raw + 1, total);
      const now = Date.now();
      const done = raw >= total;
      if (done || now - lastFlush >= RENDER_THROTTLE_MS) {
        lastFlush = now;
        setVisibleCount(raw);
      }
      if (done && intervalId) clearInterval(intervalId);
    };

    const bootId = requestAnimationFrame(() => {
      tick();
      if (raw < total) intervalId = setInterval(tick, stagger);
    });

    return () => {
      cancelAnimationFrame(bootId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [reduceMotion, total, stagger]);

  const visibleText = useMemo(
    () => segments.slice(0, visibleCount).join(''),
    [segments, visibleCount],
  );

  return <MessageMarkdown content={visibleText || ' '} highlightExcerpt={highlightExcerpt} />;
}
