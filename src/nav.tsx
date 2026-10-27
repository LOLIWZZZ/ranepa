/**
 * Навигация: пять вкладок и стек экранов поверх них. Кнопка «Назад» в интерфейсе и
 * системный жест/кнопка «Назад» (на Android) работают через историю браузера.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { IS_PREVIEW } from './lib/env';
import type { DateKey } from './shared/domain/time';

export type Tab = 'home' | 'schedule' | 'tasks' | 'calendar' | 'more';

export type Route =
  | { name: 'class'; id: string }
  | { name: 'classForm'; id?: string; date?: DateKey; subjectId?: string; scope?: 'one' | 'series' }
  | { name: 'task'; id: string }
  | { name: 'taskForm'; id?: string; subjectId?: string; date?: DateKey }
  | { name: 'attendance' }
  | { name: 'attendanceForm'; id?: string }
  | { name: 'grades' }
  | { name: 'gradeSubject'; subjectId: string }
  | { name: 'exams' }
  | { name: 'examForm'; id?: string }
  | { name: 'payments' }
  | { name: 'planForm'; id?: string }
  | { name: 'paymentForm'; planId: string; id?: string }
  | { name: 'subjects'; tab?: 'subjects' | 'teachers' }
  | { name: 'subjectForm'; id?: string }
  | { name: 'teacherForm'; id?: string }
  | { name: 'subject'; id: string }
  | { name: 'event'; id: string }
  | { name: 'eventForm'; id?: string; date?: DateKey }
  | { name: 'import' }
  | { name: 'export' }
  | { name: 'settings' }
  | { name: 'reminders' }
  | { name: 'data' }
  | { name: 'install' }
  | { name: 'about' }
  | { name: 'search' };

interface NavApi {
  tab: Tab;
  stack: Route[];
  setTab: (tab: Tab) => void;
  push: (route: Route) => void;
  /** Заменить верхний экран (например, после сохранения формы открыть карточку) */
  replace: (route: Route) => void;
  back: () => void;
  /** Закрыть все экраны поверх вкладок */
  reset: (tab?: Tab) => void;
}

const NavContext = createContext<NavApi | null>(null);

function historyAvailable(): boolean {
  try {
    // Во встроенном окне (iframe) и в предпросмотре историю не трогаем, чтобы «Назад» не увёл со страницы-родителя.
    if (IS_PREVIEW || window.top !== window.self) return false;
    return typeof history !== 'undefined' && typeof history.pushState === 'function';
  } catch {
    return false;
  }
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [tab, setTabState] = useState<Tab>('home');
  const [stack, setStack] = useState<Route[]>([]);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const useHistory = useRef(historyAvailable());

  useEffect(() => {
    if (!useHistory.current) return undefined;
    try {
      history.replaceState({ depth: 0 }, '');
    } catch {
      useHistory.current = false;
      return undefined;
    }
    const onPop = (e: PopStateEvent) => {
      const depth = typeof (e.state as { depth?: unknown } | null)?.depth === 'number' ? (e.state as { depth: number }).depth : 0;
      setStack((s) => s.slice(0, Math.min(depth, s.length)));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const push = useCallback((route: Route) => {
    const depth = stackRef.current.length + 1;
    setStack((s) => [...s, route]);
    if (useHistory.current) {
      try {
        history.pushState({ depth }, '');
      } catch {
        useHistory.current = false;
      }
    }
  }, []);

  const replace = useCallback((route: Route) => {
    setStack((s) => (s.length === 0 ? [route] : [...s.slice(0, -1), route]));
  }, []);

  const back = useCallback(() => {
    if (stackRef.current.length === 0) return;
    if (useHistory.current) {
      try {
        history.back();
        return;
      } catch {
        useHistory.current = false;
      }
    }
    setStack((s) => s.slice(0, -1));
  }, []);

  const reset = useCallback((next?: Tab) => {
    const depth = stackRef.current.length;
    setStack([]);
    if (next) setTabState(next);
    if (depth > 0 && useHistory.current) {
      try {
        history.go(-depth);
      } catch {
        useHistory.current = false;
      }
    }
  }, []);

  const setTab = useCallback(
    (next: Tab) => {
      if (stackRef.current.length > 0) reset(next);
      else setTabState(next);
      window.scrollTo(0, 0);
    },
    [reset],
  );

  const api = useMemo(() => ({ tab, stack, setTab, push, replace, back, reset }), [tab, stack, setTab, push, replace, back, reset]);
  return <NavContext.Provider value={api}>{children}</NavContext.Provider>;
}

export function useNav(): NavApi {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('NavProvider отсутствует');
  return ctx;
}
