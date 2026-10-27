/**
 * Балльно-рейтинговая система: по каждой дисциплине до 100 баллов за семестр.
 * Студент вносит баллы по мере получения, они суммируются.
 */
import type { GradeItem, Subject } from '../store/types';

export const POINTS_MAX = 100;

export interface PointsEntry extends GradeItem {
  /** Сумма после этой записи */
  runningTotal: number;
}

export interface SubjectPoints {
  subject: Subject;
  total: number;
  /** Записи с баллами, новые сверху, с накопленной суммой */
  entries: PointsEntry[];
  /** Старые записи без баллов (отметки «5», «зачтено» из прежней версии) — в сумму не входят */
  legacy: GradeItem[];
  lastAt: string | null;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function pointsForSubject(subject: Subject, grades: readonly GradeItem[]): SubjectPoints {
  const own = grades.filter((g) => g.subject_id === subject.id);
  const scored = own.filter((g) => typeof g.score === 'number' && Number.isFinite(g.score));
  const chronological = [...scored].sort((a, b) => a.graded_on.localeCompare(b.graded_on) || a.id.localeCompare(b.id));
  let sum = 0;
  const entries: PointsEntry[] = chronological.map((g) => {
    sum = round(sum + (g.score ?? 0));
    return { ...g, runningTotal: sum };
  });
  return {
    subject,
    total: sum,
    entries: entries.reverse(),
    legacy: own.filter((g) => !scored.includes(g)),
    lastAt: entries[0]?.graded_on ?? null,
  };
}

export function pointsBySubject(subjects: readonly Subject[], grades: readonly GradeItem[]): SubjectPoints[] {
  return subjects.map((s) => pointsForSubject(s, grades)).sort((a, b) => a.subject.name.localeCompare(b.subject.name, 'ru'));
}

/** Разбор числа баллов: «12», «7,5», «-2». */
export function parsePoints(text: string): number | null {
  const normalized = text.trim().replace(',', '.').replace('−', '-');
  if (!/^[-+]?\d{1,3}(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Текст ошибки или null, если баллы можно добавить к текущей сумме. */
export function validateAddition(currentTotal: number, delta: number): string | null {
  if (delta === 0) return 'Введите число баллов, отличное от нуля';
  const next = round(currentTotal + delta);
  if (next > POINTS_MAX) {
    const left = round(POINTS_MAX - currentTotal);
    return left > 0 ? `Сумма превысит ${POINTS_MAX}: сейчас ${formatPoints(currentTotal)}, можно добавить не больше ${formatPoints(left)}` : `По дисциплине уже ${POINTS_MAX} баллов`;
  }
  if (next < 0) return `Сумма не может быть меньше нуля: сейчас ${formatPoints(currentTotal)}`;
  return null;
}

export function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace('.', ',');
}

export function signedPoints(value: number): string {
  return value > 0 ? `+${formatPoints(value)}` : `−${formatPoints(Math.abs(value))}`;
}
