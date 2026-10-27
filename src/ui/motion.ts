/** Небольшие помощники для анимаций появления и исчезновения. */
import { useEffect, useReducer, useRef, useState } from 'react';

export const EXIT_MS = 220;

/** Держит элемент на экране ещё EXIT_MS после закрытия, чтобы успела проиграться анимация ухода. */
export function usePresence(open: boolean, ms = EXIT_MS): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return undefined;
    }
    const t = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
  }, [open, ms]);
  return { mounted: open || mounted, closing: !open && mounted };
}

export interface LayerItem<T> {
  key: string;
  item: T;
  index: number;
  leaving: boolean;
}

/**
 * Список экранов стека с «уходящими»: снятый экран остаётся ещё на EXIT_MS с флагом leaving,
 * чтобы уехать вправо, а не исчезнуть мгновенно.
 */
export function useLeavingLayers<T>(items: readonly T[], keyOf: (item: T, index: number) => string, ms = EXIT_MS): LayerItem<T>[] {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const leaving = useRef(new Map<string, LayerItem<T>>());
  const previous = useRef<LayerItem<T>[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const current: LayerItem<T>[] = items.map((item, index) => ({ key: keyOf(item, index), item, index, leaving: false }));
  const keys = new Set(current.map((c) => c.key));
  for (const p of previous.current) {
    // Уходит только снятый сверху экран; замена экрана на том же месте анимируется появлением нового.
    if (!keys.has(p.key) && p.index >= current.length && !leaving.current.has(p.key)) {
      leaving.current.set(p.key, { ...p, leaving: true });
      const t = setTimeout(() => {
        leaving.current.delete(p.key);
        timers.current.delete(t);
        rerender();
      }, ms);
      timers.current.add(t);
    }
  }
  for (const k of keys) leaving.current.delete(k);
  previous.current = current;

  useEffect(() => {
    const all = timers.current;
    return () => {
      for (const t of all) clearTimeout(t);
    };
  }, []);

  return [...current, ...leaving.current.values()].sort((a, b) => a.index - b.index);
}
