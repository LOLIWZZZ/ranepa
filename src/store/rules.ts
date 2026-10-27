/** Правила расписания: длительность пары и запрет пересечений. Чистые функции, покрыты тестами. */

export const DEFAULT_PAIR_MINUTES = 80;

/** «09:00» + 80 мин → «10:20». null, если время некорректно или переходит за полночь. */
export function addMinutesToTime(time: string, minutes: number): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const total = Number(m[1]) * 60 + Number(m[2]) + minutes;
  if (total >= 24 * 60 || total < 0) return null;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function minutesBetweenTimes(start: string, end: string): number | null {
  const a = /^(\d{1,2}):(\d{2})$/.exec(start.trim());
  const b = /^(\d{1,2}):(\d{2})$/.exec(end.trim());
  if (!a || !b) return null;
  return Number(b[1]) * 60 + Number(b[2]) - (Number(a[1]) * 60 + Number(a[2]));
}

export interface Interval {
  starts_at: string;
  ends_at: string;
}

interface Slot extends Interval {
  id: string;
  status: string;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return Date.parse(a.starts_at) < Date.parse(b.ends_at) && Date.parse(b.starts_at) < Date.parse(a.ends_at);
}

/**
 * Занятия из existing, которые пересекаются по времени хотя бы с одним из candidates.
 * Отменённые занятия и занятия из ignoreIds (например, само редактируемое) не учитываются.
 */
export function findConflicts<T extends Slot>(existing: readonly T[], candidates: readonly Interval[], ignoreIds: ReadonlySet<string> = new Set()): T[] {
  const result: T[] = [];
  for (const c of existing) {
    if (c.status === 'cancelled' || ignoreIds.has(c.id)) continue;
    if (candidates.some((x) => overlaps(c, x))) result.push(c);
  }
  return result.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/** Есть ли пересечения внутри самого набора (например, в серии с неверными параметрами). */
export function hasInternalOverlap(items: readonly Interval[]): boolean {
  const sorted = [...items].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev && cur && overlaps(prev, cur)) return true;
  }
  return false;
}

/** id занятий, которые пересекаются с другими (для предупреждения о данных, созданных раньше). */
export function overlappingIds<T extends Slot>(classes: readonly T[]): Set<string> {
  const active = classes.filter((c) => c.status !== 'cancelled').sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const ids = new Set<string>();
  let maxEnd = -Infinity;
  let maxEndId: string | null = null;
  for (const c of active) {
    const start = Date.parse(c.starts_at);
    if (start < maxEnd && maxEndId) {
      ids.add(c.id);
      ids.add(maxEndId);
    }
    const end = Date.parse(c.ends_at);
    if (end > maxEnd) {
      maxEnd = end;
      maxEndId = c.id;
    }
  }
  return ids;
}
