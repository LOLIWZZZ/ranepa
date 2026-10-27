/** Бизнес-логика домашних заданий: статусы, дедлайны, сортировка и фильтрация. */

import { formatDurationMinutes, pluralize } from './format';
import type { Assignment, AssignmentStatus, PriorityLevel } from './models';
import { normalizeSearch } from './schedule';
import { DAY, HOUR, MINUTE } from './time';

/** Отображаемый статус: к хранимым добавляется вычисляемый «просрочено». */
export type DisplayStatus = AssignmentStatus | 'overdue';

export const STATUS_LABELS: Record<DisplayStatus, string> = {
  not_started: 'Не начато',
  in_progress: 'В процессе',
  done: 'Выполнено',
  submitted: 'Отправлено на проверку',
  overdue: 'Просрочено',
};

export const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
};

const PRIORITY_WEIGHT: Record<PriorityLevel, number> = { high: 0, medium: 1, low: 2 };

export function storedStatus(a: Pick<Assignment, 'progress'>): AssignmentStatus {
  return a.progress?.status ?? 'not_started';
}

export function isCompleted(status: AssignmentStatus): boolean {
  return status === 'done' || status === 'submitted';
}

/** Просроченным считается незавершённое задание с прошедшим дедлайном. */
export function displayStatus(a: Pick<Assignment, 'progress' | 'due_at'>, now: Date): DisplayStatus {
  const status = storedStatus(a);
  if (!isCompleted(status) && a.due_at && Date.parse(a.due_at) < now.getTime()) return 'overdue';
  return status;
}

export type DeadlineTone = 'neutral' | 'soon' | 'urgent' | 'overdue' | 'done';

export interface DeadlineInfo {
  label: string;
  tone: DeadlineTone;
}

/** «Осталось 3 дня», «Осталось 5 ч», «Просрочено на 2 дня», «Без срока». */
export function deadlineInfo(a: Pick<Assignment, 'progress' | 'due_at'>, now: Date): DeadlineInfo {
  if (isCompleted(storedStatus(a))) return { label: STATUS_LABELS[storedStatus(a)], tone: 'done' };
  if (!a.due_at) return { label: 'Без срока', tone: 'neutral' };
  const diff = Date.parse(a.due_at) - now.getTime();
  if (diff < 0) {
    const overdue = -diff;
    if (overdue < HOUR) return { label: `Просрочено на ${Math.max(1, Math.round(overdue / MINUTE))} мин`, tone: 'overdue' };
    if (overdue < DAY) return { label: `Просрочено на ${Math.round(overdue / HOUR)} ч`, tone: 'overdue' };
    return { label: `Просрочено на ${pluralize(Math.floor(overdue / DAY), ['день', 'дня', 'дней'])}`, tone: 'overdue' };
  }
  if (diff < HOUR) return { label: `Осталось ${Math.max(1, Math.ceil(diff / MINUTE))} мин`, tone: 'urgent' };
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    const minutes = Math.floor((diff % HOUR) / MINUTE);
    const text = hours < 3 ? formatDurationMinutes(hours * 60 + minutes) : `${hours} ч`;
    return { label: `Осталось ${text}`, tone: 'urgent' };
  }
  const days = Math.floor(diff / DAY);
  return { label: `Осталось ${pluralize(days, ['день', 'дня', 'дней'])}`, tone: days <= 2 ? 'soon' : 'neutral' };
}

/**
 * Порядок: сначала незавершённые по ближайшему дедлайну (просроченные первыми),
 * без срока — после них, завершённые — в конце (недавно завершённые выше).
 */
export function sortAssignments<T extends Assignment>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const aDone = isCompleted(storedStatus(a));
    const bDone = isCompleted(storedStatus(b));
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (aDone && bDone) {
      return Date.parse(b.progress?.completed_at ?? b.issued_at) - Date.parse(a.progress?.completed_at ?? a.issued_at);
    }
    const aDue = a.due_at ? Date.parse(a.due_at) : Number.POSITIVE_INFINITY;
    const bDue = b.due_at ? Date.parse(b.due_at) : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    const pr = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    if (pr !== 0) return pr;
    return a.title.localeCompare(b.title, 'ru');
  });
}

export type AssignmentStatusFilter = DisplayStatus | 'open' | 'all';

export interface AssignmentFilter {
  status?: AssignmentStatusFilter;
  subjectId?: string | null;
  query?: string;
  scope?: 'all' | 'group' | 'personal';
}

export function filterAssignments<T extends Assignment>(items: readonly T[], filter: AssignmentFilter, now: Date): T[] {
  const q = filter.query ? normalizeSearch(filter.query) : '';
  return items.filter((a) => {
    const status = displayStatus(a, now);
    if (filter.status && filter.status !== 'all') {
      if (filter.status === 'open') {
        if (isCompleted(storedStatus(a))) return false;
      } else if (status !== filter.status) {
        return false;
      }
    }
    if (filter.subjectId && a.subject_id !== filter.subjectId) return false;
    if (filter.scope === 'group' && !a.group_id) return false;
    if (filter.scope === 'personal' && !a.owner_id) return false;
    if (q) {
      const hay = normalizeSearch([a.title, a.description, a.subject?.name, a.teacher?.full_name, a.teacher_note].filter(Boolean).join(' '));
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export interface AssignmentCounters {
  open: number;
  overdue: number;
  dueToday: number;
  done: number;
}

export function countAssignments(items: readonly Assignment[], now: Date, endOfToday: Date): AssignmentCounters {
  let open = 0;
  let overdue = 0;
  let dueToday = 0;
  let done = 0;
  for (const a of items) {
    const status = displayStatus(a, now);
    if (status === 'done' || status === 'submitted') {
      done += 1;
      continue;
    }
    open += 1;
    if (status === 'overdue') overdue += 1;
    else if (a.due_at && Date.parse(a.due_at) < endOfToday.getTime()) dueToday += 1;
  }
  return { open, overdue, dueToday, done };
}

/** Ближайшие незавершённые задания с дедлайном (для главного экрана). */
export function upcomingDeadlines<T extends Assignment>(items: readonly T[], now: Date, limit = 3): T[] {
  return sortAssignments(items)
    .filter((a) => !isCompleted(storedStatus(a)) && a.due_at !== null)
    .slice(0, limit)
    .filter((a) => a.due_at !== null && Date.parse(a.due_at) > now.getTime() - 7 * DAY);
}

/** Следующий статус при быстром переключении галочкой. */
export function toggledStatus(current: AssignmentStatus): AssignmentStatus {
  return isCompleted(current) ? 'in_progress' : 'done';
}

export type DeadlineBucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none' | 'done';

export const BUCKET_LABELS: Record<DeadlineBucket, string> = {
  overdue: 'Просрочено',
  today: 'Сегодня',
  tomorrow: 'Завтра',
  week: 'На этой неделе',
  later: 'Позже',
  none: 'Без срока',
  done: 'Выполнено',
};

/** Группировка списка заданий по срокам (дни считаются в часовом поясе института). */
export function bucketAssignments<T extends Assignment>(
  items: readonly T[],
  now: Date,
  dueDayKey: (iso: string) => string,
  todayKey: string,
  weekEndKey: string,
  tomorrowKey: string,
): { bucket: DeadlineBucket; data: T[] }[] {
  const order: DeadlineBucket[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'none', 'done'];
  const map = new Map<DeadlineBucket, T[]>();
  for (const a of sortAssignments(items)) {
    let bucket: DeadlineBucket;
    if (isCompleted(storedStatus(a))) bucket = 'done';
    else if (!a.due_at) bucket = 'none';
    else if (Date.parse(a.due_at) < now.getTime()) bucket = 'overdue';
    else {
      const day = dueDayKey(a.due_at);
      if (day === todayKey) bucket = 'today';
      else if (day === tomorrowKey) bucket = 'tomorrow';
      else if (day <= weekEndKey) bucket = 'week';
      else bucket = 'later';
    }
    const list = map.get(bucket);
    if (list) list.push(a);
    else map.set(bucket, [a]);
  }
  return order.filter((b) => map.has(b)).map((bucket) => ({ bucket, data: map.get(bucket) ?? [] }));
}
