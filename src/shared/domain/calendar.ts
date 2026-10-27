/** Единый календарь: приведение пар, дедлайнов, экзаменов, оплат и событий к общему виду. */

import { formatMoneyKopecks } from './format';
import type { Assignment, CalendarEvent, ClassSession, DataSource, Exam, ExamKind, TuitionPlan } from './models';
import { isCompleted, storedStatus } from './assignments';
import { summarizePlan } from './payments';
import { CLASS_TYPE_SHORT, sessionLocation } from './schedule';
import {
  addDaysToKey,
  formatTime,
  parseDateKey,
  pad2,
  startOfDayUtc,
  startOfWeekKey,
  toDateKey,
  type DateKey,
} from './time';

export type CalendarItemKind =
  | 'class'
  | 'assignment'
  | 'exam'
  | 'credit'
  | 'consultation'
  | 'payment'
  | 'personal'
  | 'group'
  | 'university';

export const CALENDAR_KIND_LABELS: Record<CalendarItemKind, string> = {
  class: 'Пары',
  assignment: 'Дедлайны',
  exam: 'Экзамены',
  credit: 'Зачёты',
  consultation: 'Консультации',
  payment: 'Оплата',
  personal: 'Личные',
  group: 'События группы',
  university: 'Мероприятия',
};

export const EXAM_KIND_LABELS: Record<ExamKind, string> = {
  exam: 'Экзамен',
  credit: 'Зачёт',
  graded_credit: 'Дифференцированный зачёт',
  consultation: 'Консультация',
  retake: 'Пересдача',
  defense: 'Защита',
};

export interface CalendarItem {
  /** Уникальный ключ: «тип:id» */
  key: string;
  kind: CalendarItemKind;
  entityId: string;
  title: string;
  subtitle: string | null;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  dateKey: DateKey;
  cancelled: boolean;
  completed: boolean;
  source: DataSource;
}

export function examCalendarKind(kind: ExamKind): CalendarItemKind {
  if (kind === 'credit' || kind === 'graded_credit') return 'credit';
  if (kind === 'consultation') return 'consultation';
  return 'exam';
}

export interface CalendarSources {
  sessions?: readonly ClassSession[];
  assignments?: readonly Assignment[];
  exams?: readonly Exam[];
  plans?: readonly TuitionPlan[];
  events?: readonly CalendarEvent[];
}

export function buildCalendarItems(sources: CalendarSources, timeZone: string, todayKey: DateKey): CalendarItem[] {
  const items: CalendarItem[] = [];

  for (const s of sources.sessions ?? []) {
    const start = new Date(s.starts_at);
    const end = new Date(s.ends_at);
    const location = sessionLocation(s);
    items.push({
      key: `class:${s.id}`,
      kind: 'class',
      entityId: s.id,
      title: s.subject?.name ?? 'Занятие',
      subtitle: [`${formatTime(start, timeZone)}–${formatTime(end, timeZone)}`, CLASS_TYPE_SHORT[s.class_type], location]
        .filter(Boolean)
        .join(' · '),
      startsAt: start,
      endsAt: end,
      allDay: false,
      dateKey: toDateKey(start, timeZone),
      cancelled: s.status === 'cancelled',
      completed: false,
      source: s.source,
    });
  }

  for (const a of sources.assignments ?? []) {
    if (!a.due_at) continue;
    const due = new Date(a.due_at);
    items.push({
      key: `assignment:${a.id}`,
      kind: 'assignment',
      entityId: a.id,
      title: a.title,
      subtitle: [`до ${formatTime(due, timeZone)}`, a.subject?.name].filter(Boolean).join(' · '),
      startsAt: due,
      endsAt: null,
      allDay: false,
      dateKey: toDateKey(due, timeZone),
      cancelled: false,
      completed: isCompleted(storedStatus(a)),
      source: a.source,
    });
  }

  for (const e of sources.exams ?? []) {
    const start = new Date(e.starts_at);
    items.push({
      key: `exam:${e.id}`,
      kind: examCalendarKind(e.kind),
      entityId: e.id,
      title: `${EXAM_KIND_LABELS[e.kind]}: ${e.subject?.name ?? 'дисциплина'}`,
      subtitle: [formatTime(start, timeZone), sessionLocation({ classroom: e.classroom, location_note: e.location_note, format: e.format })]
        .filter(Boolean)
        .join(' · '),
      startsAt: start,
      endsAt: e.ends_at ? new Date(e.ends_at) : null,
      allDay: false,
      dateKey: toDateKey(start, timeZone),
      cancelled: false,
      completed: false,
      source: e.source,
    });
  }

  for (const p of sources.plans ?? []) {
    const summary = summarizePlan(p, p.payments, todayKey);
    items.push({
      key: `payment:${p.id}`,
      kind: 'payment',
      entityId: p.id,
      title: `Оплата: ${p.title}`,
      subtitle: summary.status === 'paid' ? 'Оплачено' : `Осталось ${formatMoneyKopecks(summary.remainingKopecks)}`,
      startsAt: startOfDayUtc(p.due_date, timeZone),
      endsAt: null,
      allDay: true,
      dateKey: p.due_date,
      cancelled: false,
      completed: summary.status === 'paid',
      source: p.source,
    });
  }

  for (const ev of sources.events ?? []) {
    const start = new Date(ev.starts_at);
    const end = ev.ends_at ? new Date(ev.ends_at) : null;
    items.push({
      key: `event:${ev.id}`,
      kind: ev.kind,
      entityId: ev.id,
      title: ev.title,
      subtitle: [
        ev.all_day ? 'Весь день' : end ? `${formatTime(start, timeZone)}–${formatTime(end, timeZone)}` : formatTime(start, timeZone),
        ev.location,
      ]
        .filter(Boolean)
        .join(' · '),
      startsAt: start,
      endsAt: end,
      allDay: ev.all_day,
      dateKey: toDateKey(start, timeZone),
      cancelled: false,
      completed: false,
      source: ev.source,
    });
  }

  return items.sort((a, b) => {
    if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey);
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return a.startsAt.getTime() - b.startsAt.getTime();
  });
}

export function itemsByDay(items: readonly CalendarItem[]): Map<DateKey, CalendarItem[]> {
  const map = new Map<DateKey, CalendarItem[]>();
  for (const item of items) {
    const list = map.get(item.dateKey);
    if (list) list.push(item);
    else map.set(item.dateKey, [item]);
  }
  return map;
}

/** Сетка месяца: 6 недель × 7 дней, неделя начинается с понедельника. */
export function monthGrid(year: number, month: number): DateKey[] {
  const first = `${year}-${pad2(month)}-01`;
  const start = startOfWeekKey(first);
  return Array.from({ length: 42 }, (_, i) => addDaysToKey(start, i));
}

export function isSameMonth(key: DateKey, year: number, month: number): boolean {
  const p = parseDateKey(key);
  return p.year === year && p.month === month;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** Уникальные типы событий за день (для точек в месячной сетке), в фиксированном порядке. */
export function kindsForDay(items: readonly CalendarItem[]): CalendarItemKind[] {
  const order: CalendarItemKind[] = ['exam', 'credit', 'assignment', 'payment', 'class', 'consultation', 'university', 'group', 'personal'];
  const present = new Set(items.filter((i) => !i.cancelled).map((i) => i.kind));
  return order.filter((k) => present.has(k));
}
