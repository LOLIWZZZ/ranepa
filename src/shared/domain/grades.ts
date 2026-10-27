/**
 * Успеваемость: пользовательский расчёт средних значений.
 *
 * Правила оценивания (балльно-рейтинговая система, веса, пересчёт в пятибалльную шкалу)
 * различаются по институтам РАНХиГС и не публикуются в машиночитаемом виде. Поэтому приложение
 * НЕ рассчитывает «официальный» средний балл, а показывает две прозрачные метрики:
 *  1. Средняя оценка — среднее арифметическое числовых отметок 2–5 (взвешенное по весу работы).
 *  2. Средний процент — взвешенное среднее (баллы ÷ максимум) по работам, где указан максимум.
 * «Зачтено/не зачтено» в средние не входят и считаются отдельно.
 */

import type { Grade, GradeKind, SubjectRef } from './models';
import type { DateKey } from './time';

export const GRADE_KIND_LABELS: Record<GradeKind, string> = {
  assignment: 'Задание',
  test: 'Тест',
  control: 'Контрольная работа',
  colloquium: 'Коллоквиум',
  credit: 'Зачёт',
  exam: 'Экзамен',
  coursework: 'Курсовая работа',
  other: 'Другое',
};

export const GRADES_FORMULA =
  'Средняя оценка = Σ(отметка × вес) ÷ Σ(вес) по отметкам от 2 до 5. ' +
  'Средний процент = Σ(баллы ÷ максимум × вес) ÷ Σ(вес) по работам с указанным максимумом. ' +
  'Это пользовательский расчёт: официальный рейтинг определяется правилами вашего института.';

const WORD_MARKS: Record<string, number> = {
  'отлично': 5,
  'хорошо': 4,
  'удовлетворительно': 3,
  'удовл': 3,
  'неудовлетворительно': 2,
  'неуд': 2,
};

const PASS_WORDS = ['зачтено', 'зачёт', 'зачет', 'сдано', 'pass'];
const FAIL_WORDS = ['не зачтено', 'незачет', 'незачёт', 'не сдано', 'fail'];

/** Числовая отметка 2–5 из текстового поля mark, иначе null. */
export function numericMark(mark: string | null): number | null {
  if (!mark) return null;
  const normalized = mark.trim().toLocaleLowerCase('ru-RU').replace(',', '.');
  const asNumber = Number(normalized);
  if (Number.isFinite(asNumber) && asNumber >= 2 && asNumber <= 5) return asNumber;
  return WORD_MARKS[normalized] ?? null;
}

export function passFail(mark: string | null): 'pass' | 'fail' | null {
  if (!mark) return null;
  const normalized = mark.trim().toLocaleLowerCase('ru-RU');
  if (FAIL_WORDS.includes(normalized)) return 'fail';
  if (PASS_WORDS.includes(normalized)) return 'pass';
  return null;
}

/** Процент выполнения работы или null, если максимум не указан. */
export function gradePercent(g: Pick<Grade, 'score' | 'max_score'>): number | null {
  if (g.score === null || g.max_score === null || g.max_score <= 0) return null;
  return (g.score / g.max_score) * 100;
}

export interface GradeSummary {
  count: number;
  averageMark: number | null;
  markCount: number;
  averagePercent: number | null;
  percentCount: number;
  passed: number;
  failed: number;
}

export function summarizeGrades(grades: readonly Pick<Grade, 'score' | 'max_score' | 'mark' | 'weight'>[]): GradeSummary {
  let markSum = 0;
  let markWeight = 0;
  let markCount = 0;
  let percentSum = 0;
  let percentWeight = 0;
  let percentCount = 0;
  let passed = 0;
  let failed = 0;
  for (const g of grades) {
    const weight = g.weight > 0 ? g.weight : 1;
    const mark = numericMark(g.mark);
    if (mark !== null) {
      markSum += mark * weight;
      markWeight += weight;
      markCount += 1;
    }
    const percent = gradePercent(g);
    if (percent !== null) {
      percentSum += percent * weight;
      percentWeight += weight;
      percentCount += 1;
    }
    const pf = passFail(g.mark);
    if (pf === 'pass') passed += 1;
    if (pf === 'fail') failed += 1;
  }
  return {
    count: grades.length,
    averageMark: markWeight > 0 ? markSum / markWeight : null,
    markCount,
    averagePercent: percentWeight > 0 ? percentSum / percentWeight : null,
    percentCount,
    passed,
    failed,
  };
}

export interface SubjectGrades {
  subjectId: string | null;
  subject: SubjectRef | null;
  grades: Grade[];
  summary: GradeSummary;
}

/** Группировка по дисциплинам; сортировка по среднему проценту (рейтинг дисциплин). */
export function gradesBySubject(grades: readonly Grade[]): SubjectGrades[] {
  const map = new Map<string, Grade[]>();
  for (const g of grades) {
    const key = g.subject_id ?? '∅';
    const list = map.get(key);
    if (list) list.push(g);
    else map.set(key, [g]);
  }
  return [...map.entries()]
    .map(([key, list]) => ({
      subjectId: key === '∅' ? null : key,
      subject: list.find((g) => g.subject)?.subject ?? null,
      grades: [...list].sort((a, b) => b.graded_on.localeCompare(a.graded_on)),
      summary: summarizeGrades(list),
    }))
    .sort((a, b) => {
      const ap = a.summary.averagePercent ?? (a.summary.averageMark !== null ? (a.summary.averageMark / 5) * 100 : -1);
      const bp = b.summary.averagePercent ?? (b.summary.averageMark !== null ? (b.summary.averageMark / 5) * 100 : -1);
      return bp - ap;
    });
}

export interface ProgressPoint {
  date: DateKey;
  averagePercent: number | null;
  averageMark: number | null;
}

/** Накопительная динамика средних по датам (для графика прогресса в семестре). */
export function cumulativeProgress(grades: readonly Grade[]): ProgressPoint[] {
  const sorted = [...grades].sort((a, b) => a.graded_on.localeCompare(b.graded_on));
  const points: ProgressPoint[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    if (!current) continue;
    const next = sorted[i + 1];
    if (next && next.graded_on === current.graded_on) continue;
    const summary = summarizeGrades(sorted.slice(0, i + 1));
    points.push({ date: current.graded_on, averagePercent: summary.averagePercent, averageMark: summary.averageMark });
  }
  return points;
}

export function gradeDisplayValue(g: Pick<Grade, 'score' | 'max_score' | 'mark'>): string {
  if (g.mark) return g.mark;
  if (g.score !== null && g.max_score !== null) return `${formatScore(g.score)}/${formatScore(g.max_score)}`;
  if (g.score !== null) return formatScore(g.score);
  return '—';
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}

export type GradeTone = 'success' | 'warning' | 'danger' | 'neutral';

export function gradeTone(g: Pick<Grade, 'score' | 'max_score' | 'mark'>): GradeTone {
  const pf = passFail(g.mark);
  if (pf === 'pass') return 'success';
  if (pf === 'fail') return 'danger';
  const mark = numericMark(g.mark);
  const percent = mark !== null ? (mark / 5) * 100 : gradePercent(g);
  if (percent === null) return 'neutral';
  if (percent >= 80) return 'success';
  if (percent >= 60) return 'warning';
  return 'danger';
}
