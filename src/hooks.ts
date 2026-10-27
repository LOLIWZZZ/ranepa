import { useEffect, useState } from 'react';

import { toDateKey, type DateKey } from './shared/domain/time';
import { useData } from './store/store';

/** Текущее время с обновлением раз в interval мс и при возвращении в приложение. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);
  return now;
}

export function useToday(intervalMs?: number): { now: Date; today: DateKey; timeZone: string } {
  const now = useNow(intervalMs);
  const timeZone = useData().settings.timeZone;
  return { now, today: toDateKey(now, timeZone), timeZone };
}
