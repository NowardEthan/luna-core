import { useCallback, useMemo, useState } from 'react';

/** Seleção múltipla — long-press inicia; tap alterna itens. */
function useMultiSelection() {
  const [selected, setSelected] = useState<Map<string, string>>(() => new Map());
  const [confirming, setConfirming] = useState(false);
  const [armed, setArmed] = useState(false);

  const active = armed || selected.size > 0;
  const count = selected.size;

  const selectedIds = useMemo(() => [...selected.keys()], [selected]);

  const summaryTitle = useMemo(() => {
    if (count === 0) return '';
    const titles = [...selected.values()];
    if (count === 1) return titles[0] ?? '';
    return `${titles[0] ?? 'Conversa'} +${count - 1}`;
  }, [count, selected]);

  const enter = useCallback((id: string, title: string) => {
    setArmed(false);
    setSelected((prev) => {
      const next = new Map(prev);
      next.set(id, title);
      return next;
    });
    setConfirming(false);
  }, []);

  const arm = useCallback(() => {
    setArmed(true);
    setConfirming(false);
  }, []);

  const exit = useCallback(() => {
    setArmed(false);
    setSelected(new Map());
    setConfirming(false);
  }, []);

  const toggle = useCallback((id: string, title: string) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, title);
      return next;
    });
    setConfirming(false);
  }, []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const requestConfirm = useCallback(() => setConfirming(true), []);
  const cancelConfirm = useCallback(() => setConfirming(false), []);

  return {
    active,
    count,
    selectedIds,
    summaryTitle,
    enter,
    arm,
    exit,
    toggle,
    isSelected,
    confirming,
    requestConfirm,
    cancelConfirm,
  };
}

export function useConversationSelection() {
  const base = useMultiSelection();
  return {
    ...base,
    confirmingDelete: base.confirming,
    requestDelete: base.requestConfirm,
    cancelDelete: base.cancelConfirm,
  };
}

export type ConversationSelection = ReturnType<typeof useConversationSelection>;

export type TrashAction = 'restore' | 'permanent';

export function useTrashSelection() {
  const {
    active,
    count,
    selectedIds,
    summaryTitle,
    enter: baseEnter,
    exit: baseExit,
    toggle: baseToggle,
    isSelected,
  } = useMultiSelection();
  const [pendingAction, setPendingAction] = useState<TrashAction | null>(null);

  const exit = useCallback(() => {
    baseExit();
    setPendingAction(null);
  }, [baseExit]);

  const toggle = useCallback(
    (id: string, title: string) => {
      baseToggle(id, title);
      setPendingAction(null);
    },
    [baseToggle],
  );

  const enter = useCallback(
    (id: string, title: string) => {
      baseEnter(id, title);
      setPendingAction(null);
    },
    [baseEnter],
  );

  const requestAction = useCallback((action: TrashAction) => setPendingAction(action), []);
  const cancelAction = useCallback(() => setPendingAction(null), []);

  return {
    active,
    count,
    selectedIds,
    summaryTitle,
    enter,
    exit,
    toggle,
    isSelected,
    pendingAction,
    requestAction,
    cancelAction,
  };
}

export type TrashSelection = ReturnType<typeof useTrashSelection>;
