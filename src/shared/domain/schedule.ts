/** Бизнес-логика расписания: статусы занятий, текущая/следующая пара, группировка, повторения. */

import type { ClassFormat, ClassSession, ClassType, DataSource } from './models';
import {
  addDaysToKey,
  combineDateKeyAndTime,
  diffDaysBetweenKeys,
  isoWeekdayOfKey,
  parseTime,
  toDateKey,
  type DateKey,
} from './time';

export const CLASS_TYPE_LABELS: Record<ClassType, string> = {
  lecture: 'Лекция',
  seminar: 'Семинар',
  practice: 'Практическое занятие',
  lab: 'Лабораторная работа',
  consultation: 'Консультация',
  other: 'Занятие',
};

export const CLASS_TYPE_SHORT: Record<ClassType, string> = {
  lecture: 'Лекция',
  seminar: 'Семинар',
  practice: 'Практика',
  lab: 'Лаб. работа',
  consultation: 'Консультация',
  other: 'Занятие',
};

export const CLASS_FORMAT_LABELS: Record<ClassFormat, string> = {
  offline: 'Очно',
  online: 'Дистанционно',
  hybrid: 'Смешанный формат',
};

export const SOURCE_LABELS: Record<DataSource, string> = {
  official: 'Официальные данные',
  imported: 'Импорт из файла',
  manual: 'Введено вручную',
  demo: 'Демо-данные',
};

export type SessionPhase = 'upcoming' | 'ongoing' | 'finished' | 'cancelled';

export function sessionPhase(session: Pick<ClassSession, 'starts_at' | 'ends_at' | 'status'>, now: Date): SessionPhase {
  if (session.status === 'cancelled') return 'cancelled';
  const start = Date.parse(session.starts_at);
  const end = Date.parse(session.ends_at);
  const t = now.getTime();
  if (t < start) return 'upcoming';
  if (t < end) return 'ongoing';
  return 'finished';
}

/** Доля прошедшего времени занятия (0…1) — для индикатора текущей пары. */
export function sessionProgress(session: Pick<ClassSession, 'starts_at' | 'ends_at'>, now: Date): number {
  const start = Date.parse(session.starts_at);
  const end = Date.parse(session.ends_at);
  if (end <= start) return 0;
  return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
}

export function sortByStart<T extends Pick<ClassSession, 'starts_at'>>(sessions: readonly T[]): T[] {
  return [...sessions].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

export interface CurrentAndNext<T> {
  current: T | null;
  next: T | null;
}

/** Текущая (идёт сейчас) и следующая (ближайшая будущая) пары; отменённые пропускаются. */
export function findCurrentAndNext<T extends Pick<ClassSession, 'starts_at' | 'ends_at' | 'status'>>(
  sessions: readonly T[],
  now: Date,
): CurrentAndNext<T> {
  let current: T | null = null;
  let next: T | null = null;
  for (const s of sortByStart(sessions)) {
    const phase = sessionPhase(s, now);
    if (phase === 'ongoing' && !current) current = s;
    if (phase === 'upcoming' && !next) next = s;
    if (current && next) break;
  }
  return { current, next };
}

export function groupByDay<T extends Pick<ClassSession, 'starts_at'>>(
  sessions: readonly T[],
  timeZone: string,
): Map<DateKey, T[]> {
  const map = new Map<DateKey, T[]>();
  for (const s of sortByStart(sessions)) {
    const key = toDateKey(new Date(s.starts_at), timeZone);
    const list = map.get(key);
    if (list) list.push(s);
    else map.set(key, [s]);
  }
  return map;
}

export interface ScheduleFilter {
  subjectId?: string | null;
  teacherId?: string | null;
  classType?: ClassType | null;
  query?: string;
  hideCancelled?: boolean;
}

export function normalizeSearch(text: string): string {
  return text.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();
}

export function sessionTeacherName(s: Pick<ClassSession, 'teacher' | 'teacher_note'>): string | null {
  return s.teacher?.full_name ?? s.teacher_note ?? null;
}

export function sessionLocation(s: Pick<ClassSession, 'classroom' | 'location_note' | 'format'>): string | null {
  const parts: string[] = [];
  if (s.classroom) {
    if (s.classroom.building) parts.push(s.classroom.building.name);
    parts.push(`ауд. ${s.classroom.name}`);
  }
  if (s.location_note) parts.push(s.location_note);
  if (parts.length === 0 && s.format === 'online') return 'Онлайн';
  return parts.length > 0 ? parts.join(', ') : null;
}

export function filterSessions<T extends ClassSession>(sessions: readonly T[], filter: ScheduleFilter): T[] {
  const q = filter.query ? normalizeSearch(filter.query) : '';
  return sessions.filter((s) => {
    if (filter.hideCancelled && s.status === 'cancelled') return false;
    if (filter.subjectId && s.subject_id !== filter.subjectId) return false;
    if (filter.teacherId && s.teacher_id !== filter.teacherId) return false;
    if (filter.classType && s.class_type !== filter.classType) return false;
    if (q) {
      const haystack = normalizeSearch(
        [s.subject?.name, s.subject?.short_name, sessionTeacherName(s), sessionLocation(s), s.notes]
          .filter(Boolean)
          .join(' '),
      );
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/** Сколько пар осталось сегодня (не отменённых и не закончившихся). */
export function remainingToday<T extends Pick<ClassSession, 'starts_at' | 'ends_at' | 'status'>>(
  sessions: readonly T[],
  now: Date,
  timeZone: string,
): T[] {
  const today = toDateKey(now, timeZone);
  return sortByStart(sessions).filter(
    (s) =>
      toDateKey(new Date(s.starts_at), timeZone) === today &&
      s.status !== 'cancelled' &&
      Date.parse(s.ends_at) > now.getTime(),
  );
}

// ─── Повторяющиеся занятия ─────────────────────────────────────────────────────

export interface RecurrenceInput {
  /** Первый день периода (включительно) */
  startDate: DateKey;
  /** Последний день периода (включительно) */
  endDate: DateKey;
  /** ISO-дни недели: 1 = пн … 7 = вс */
  weekdays: number[];
  /** 1 — каждую неделю, 2 — через неделю (числитель/знаменатель) */
  intervalWeeks: 1 | 2;
  startTime: string;
  endTime: string;
  timeZone: string;
}

export const MAX_OCCURRENCES = 200;

export class RecurrenceError extends Error {}

/** Генерирует экземпляры занятия для периода; время — в часовом поясе института. */
export function generateOccurrences(input: RecurrenceInput): { starts_at: string; ends_at: string }[] {
  const start = parseTime(input.startTime);
  const end = parseTime(input.endTime);
  if (!start || !end) throw new RecurrenceError('Укажите время в формате ЧЧ:ММ');
  if (end.hour * 60 + end.minute <= start.hour * 60 + start.minute) {
    throw new RecurrenceError('Время окончания должно быть позже начала');
  }
  const totalDays = diffDaysBetweenKeys(input.startDate, input.endDate);
  if (totalDays < 0) throw new RecurrenceError('Дата окончания повторения раньше даты начала');
  if (totalDays > 366) throw new RecurrenceError('Период повторения не может быть больше года');
  const weekdays = new Set(input.weekdays.filter((d) => d >= 1 && d <= 7));
  if (weekdays.size === 0) throw new RecurrenceError('Выберите хотя бы один день недели');

  const firstWeekMonday = addDaysToKey(input.startDate, 1 - isoWeekdayOfKey(input.startDate));
  const result: { starts_at: string; ends_at: string }[] = [];
  for (let i = 0; i <= totalDays; i += 1) {
    const day = addDaysToKey(input.startDate, i);
    if (!weekdays.has(isoWeekdayOfKey(day))) continue;
    const weekIndex = Math.floor(diffDaysBetweenKeys(firstWeekMonday, day) / 7);
    if (weekIndex % input.intervalWeeks !== 0) continue;
    result.push({
      starts_at: combineDateKeyAndTime(day, input.startTime, input.timeZone).toISOString(),
      ends_at: combineDateKeyAndTime(day, input.endTime, input.timeZone).toISOString(),
    });
    if (result.length > MAX_OCCURRENCES) {
      throw new RecurrenceError(`Слишком много занятий (больше ${MAX_OCCURRENCES}). Сократите период.`);
    }
  }
  return result;
}

/** Типичная сетка пар (можно поменять в форме): используется как подсказка времени. */
export const TYPICAL_SLOTS: readonly { start: string; end: string }[] = [
  { start: '09:00', end: '10:30' },
  { start: '10:40', end: '12:10' },
  { start: '12:40', end: '14:10' },
  { start: '14:20', end: '15:50' },
  { start: '16:00', end: '17:30' },
  { start: '17:40', end: '19:10' },
  { start: '19:20', end: '20:50' },
];

/** Описание изменения статуса для карточки: «Перенесено с 26 окт, 10:00». */
export function isRescheduled(session: Pick<ClassSession, 'status' | 'original_starts_at'>): boolean {
  return session.status === 'rescheduled' && session.original_starts_at !== null;
}
