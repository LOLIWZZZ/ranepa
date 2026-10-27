/**
 * Статистика посещаемости.
 *
 * Формула (показывается пользователю): посещаемость = (присутствовал + опоздал) / все отмеченные занятия.
 * Пропуски по уважительной причине учитываются как пропуски, но выводятся отдельно, так как правила
 * их зачёта зависят от института. Официальные и личные записи считаются вместе, но их количество
 * показывается раздельно.
 */

import type { AttendanceRecord, AttendanceStatus, SubjectRef } from './models';
import { addDaysToKey, startOfWeekKey, type DateKey } from './time';

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: 'Присутствовал',
  absent: 'Пропуск',
  late: 'Опоздание',
  excused: 'Уважительная причина',
};

export const ATTENDANCE_FORMULA =
  'Посещаемость = (присутствие + опоздания) ÷ все отмеченные занятия × 100%. ' +
  'Пропуски по уважительной причине входят в знаменатель и показаны отдельно.';

export interface AttendanceStats {
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  attended: number;
  missed: number;
  /** 0…100 или null, если нет данных */
  rate: number | null;
  official: number;
  personal: number;
}

export function computeAttendanceStats(records: readonly Pick<AttendanceRecord, 'status' | 'source'>[]): AttendanceStats {
  const stats: AttendanceStats = {
    total: 0, present: 0, late: 0, absent: 0, excused: 0, attended: 0, missed: 0, rate: null, official: 0, personal: 0,
  };
  for (const r of records) {
    stats.total += 1;
    stats[r.status] += 1;
    if (r.source === 'official') stats.official += 1;
    else stats.personal += 1;
  }
  stats.attended = stats.present + stats.late;
  stats.missed = stats.absent + stats.excused;
  stats.rate = stats.total > 0 ? (stats.attended / stats.total) * 100 : null;
  return stats;
}

export interface SubjectAttendance {
  subject: SubjectRef | null;
  subjectId: string | null;
  stats: AttendanceStats;
}

export function attendanceBySubject(records: readonly AttendanceRecord[]): SubjectAttendance[] {
  const groups = new Map<string, AttendanceRecord[]>();
  for (const r of records) {
    const key = r.subject_id ?? '∅';
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  return [...groups.entries()]
    .map(([key, list]) => ({
      subjectId: key === '∅' ? null : key,
      subject: list.find((r) => r.subject)?.subject ?? null,
      stats: computeAttendanceStats(list),
    }))
    .sort((a, b) => (a.stats.rate ?? 101) - (b.stats.rate ?? 101));
}

export interface WeeklyPoint {
  weekStart: DateKey;
  rate: number | null;
  total: number;
}

/** Посещаемость по неделям за последние N недель (для графика динамики). */
export function weeklyTrend(
  records: readonly Pick<AttendanceRecord, 'status' | 'source' | 'occurred_on'>[],
  todayKey: DateKey,
  weeks = 8,
): WeeklyPoint[] {
  const currentWeek = startOfWeekKey(todayKey);
  const points: WeeklyPoint[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const weekStart = addDaysToKey(currentWeek, -7 * i);
    const weekEnd = addDaysToKey(weekStart, 7);
    const inWeek = records.filter((r) => r.occurred_on >= weekStart && r.occurred_on < weekEnd);
    const stats = computeAttendanceStats(inWeek);
    points.push({ weekStart, rate: stats.rate, total: stats.total });
  }
  return points;
}

/** История по датам (новые сверху). */
export function historyByDate<T extends Pick<AttendanceRecord, 'occurred_on'>>(records: readonly T[]): [DateKey, T[]][] {
  const map = new Map<DateKey, T[]>();
  for (const r of [...records].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))) {
    const list = map.get(r.occurred_on);
    if (list) list.push(r);
    else map.set(r.occurred_on, [r]);
  }
  return [...map.entries()];
}

export type AttendanceTone = 'success' | 'warning' | 'danger' | 'neutral';

export function attendanceTone(rate: number | null): AttendanceTone {
  if (rate === null) return 'neutral';
  if (rate >= 85) return 'success';
  if (rate >= 70) return 'warning';
  return 'danger';
}
