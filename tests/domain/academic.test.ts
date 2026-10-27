import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  countAssignments,
  deadlineInfo,
  displayStatus,
  filterAssignments,
  sortAssignments,
  toggledStatus,
} from '../../src/shared/domain/assignments';
import { attendanceBySubject, computeAttendanceStats, weeklyTrend } from '../../src/shared/domain/attendance';
import { cumulativeProgress, gradeDisplayValue, gradesBySubject, numericMark, summarizeGrades } from '../../src/shared/domain/grades';
import { nextUnpaidPlan, planNeedsAttention, summarizePlan } from '../../src/shared/domain/payments';
import { assignment, attendance, grade, plan, subject2 } from './fixtures';

const now = new Date('2026-10-26T07:00:00Z');
const progress = (status: 'not_started' | 'in_progress' | 'done' | 'submitted', completed_at: string | null = null) => ({
  assignment_id: 'a', user_id: 'u', status, completed_at, submitted_at: null, note: null, reminder_minutes: null, version: 1,
});

describe('домашние задания', () => {
  it('просрочено — вычисляемый статус', () => {
    const a = assignment({ due_at: '2026-10-25T20:59:00Z' });
    assert.equal(displayStatus(a, now), 'overdue');
    assert.equal(displayStatus({ ...a, progress: progress('done') }, now), 'done');
  });

  it('подпись срока', () => {
    assert.deepEqual(deadlineInfo(assignment({ due_at: '2026-10-26T09:30:00Z' }), now), { label: 'Осталось 2 ч 30 мин', tone: 'urgent' });
    assert.deepEqual(deadlineInfo(assignment({ due_at: '2026-10-26T19:00:00Z' }), now), { label: 'Осталось 12 ч', tone: 'urgent' });
    assert.deepEqual(deadlineInfo(assignment({ due_at: '2026-10-29T07:00:00Z' }), now), { label: 'Осталось 3 дня', tone: 'neutral' });
    assert.deepEqual(deadlineInfo(assignment({ due_at: '2026-10-24T07:00:00Z' }), now), { label: 'Просрочено на 2 дня', tone: 'overdue' });
    assert.deepEqual(deadlineInfo(assignment({ due_at: null }), now), { label: 'Без срока', tone: 'neutral' });
  });

  it('сортировка: ближайший дедлайн, без срока, завершённые в конце', () => {
    const done = assignment({ title: 'done', due_at: '2026-10-26T08:00:00Z', progress: progress('done', '2026-10-25T00:00:00Z') });
    const later = assignment({ title: 'later', due_at: '2026-11-01T08:00:00Z' });
    const none = assignment({ title: 'none', due_at: null });
    const soon = assignment({ title: 'soon', due_at: '2026-10-27T08:00:00Z' });
    const overdue = assignment({ title: 'overdue', due_at: '2026-10-20T08:00:00Z' });
    assert.deepEqual(sortAssignments([done, later, none, soon, overdue]).map((a) => a.title), ['overdue', 'soon', 'later', 'none', 'done']);
  });

  it('фильтры и поиск', () => {
    const a = assignment({ title: 'Эссе по праву', subject_id: subject2.id, subject: subject2 });
    const b = assignment({ title: 'Расчёт себестоимости', progress: progress('submitted') });
    const c = assignment({ title: 'Личная задача', owner_id: 'u', group_id: null, due_at: '2026-10-20T00:00:00Z' });
    assert.deepEqual(filterAssignments([a, b, c], { status: 'open' }, now).map((x) => x.title), ['Эссе по праву', 'Личная задача']);
    assert.deepEqual(filterAssignments([a, b, c], { status: 'overdue' }, now).map((x) => x.title), ['Личная задача']);
    assert.deepEqual(filterAssignments([a, b, c], { query: 'РАСЧЕТ' }, now).map((x) => x.title), ['Расчёт себестоимости']);
    assert.equal(filterAssignments([a, b, c], { subjectId: subject2.id }, now).length, 1);
  });

  it('счётчики для главного экрана', () => {
    const endOfToday = new Date('2026-10-26T21:00:00Z');
    const counters = countAssignments([
      assignment({ due_at: '2026-10-26T20:00:00Z' }),
      assignment({ due_at: '2026-10-20T20:00:00Z' }),
      assignment({ due_at: '2026-10-30T20:00:00Z', progress: progress('done') }),
    ], now, endOfToday);
    assert.deepEqual(counters, { open: 2, overdue: 1, dueToday: 1, done: 1 });
  });

  it('быстрое переключение статуса', () => {
    assert.equal(toggledStatus('not_started'), 'done');
    assert.equal(toggledStatus('submitted'), 'in_progress');
  });
});

describe('посещаемость', () => {
  it('процент и разбивка по источникам', () => {
    const stats = computeAttendanceStats([
      attendance({ status: 'present', source: 'official' }),
      attendance({ status: 'late' }),
      attendance({ status: 'absent' }),
      attendance({ status: 'excused' }),
    ]);
    assert.equal(stats.rate, 50);
    assert.equal(stats.attended, 2);
    assert.equal(stats.missed, 2);
    assert.equal(stats.official, 1);
    assert.equal(stats.personal, 3);
  });

  it('нет данных — нет процента', () => {
    assert.equal(computeAttendanceStats([]).rate, null);
  });

  it('по дисциплинам: худшие сверху', () => {
    const list = attendanceBySubject([
      attendance({ status: 'present' }),
      attendance({ status: 'absent', subject_id: subject2.id, subject: subject2 }),
    ]);
    assert.equal(list[0]?.subject?.name, subject2.name);
  });

  it('динамика по неделям', () => {
    const points = weeklyTrend([
      attendance({ occurred_on: '2026-10-26', status: 'present' }),
      attendance({ occurred_on: '2026-10-19', status: 'absent' }),
    ], '2026-10-28', 3);
    assert.deepEqual(points.map((p) => [p.weekStart, p.rate]), [['2026-10-12', null], ['2026-10-19', 0], ['2026-10-26', 100]]);
  });
});

describe('успеваемость (пользовательский расчёт)', () => {
  it('отметки и проценты считаются раздельно и с весами', () => {
    const summary = summarizeGrades([
      grade({ mark: '5', weight: 1 }),
      grade({ mark: 'хорошо', weight: 2 }),
      grade({ mark: 'зачтено' }),
      grade({ score: 18, max_score: 20, weight: 1 }),
      grade({ score: 30, max_score: 50, weight: 3 }),
    ]);
    assert.equal(summary.averageMark?.toFixed(3), '4.333');
    assert.equal(summary.averagePercent, (90 + 60 * 3) / 4);
    assert.equal(summary.passed, 1);
    assert.equal(summary.markCount, 2);
  });

  it('распознаёт отметки', () => {
    assert.equal(numericMark('4'), 4);
    assert.equal(numericMark('Отлично'), 5);
    assert.equal(numericMark('зачтено'), null);
    assert.equal(numericMark('10'), null);
    assert.equal(gradeDisplayValue({ score: 18, max_score: 20, mark: null }), '18/20');
  });

  it('рейтинг дисциплин и динамика', () => {
    const list = gradesBySubject([
      grade({ score: 5, max_score: 10, graded_on: '2026-10-01' }),
      grade({ score: 9, max_score: 10, subject_id: subject2.id, subject: subject2, graded_on: '2026-10-02' }),
    ]);
    assert.equal(list[0]?.subject?.name, subject2.name);
    const points = cumulativeProgress([
      grade({ score: 5, max_score: 10, graded_on: '2026-10-01' }),
      grade({ score: 10, max_score: 10, graded_on: '2026-10-01' }),
      grade({ score: 0, max_score: 10, graded_on: '2026-10-05' }),
    ]);
    assert.deepEqual(points.map((p) => [p.date, p.averagePercent]), [['2026-10-01', 75], ['2026-10-05', 50]]);
  });
});

describe('оплата обучения', () => {
  it('статусы начисления', () => {
    const p = plan({ amount_due: 150000, due_date: '2026-11-05' });
    assert.equal(summarizePlan(p, [], '2026-10-26').status, 'pending');
    assert.equal(summarizePlan(p, [{ amount: 50000, source: 'manual' }], '2026-10-26').status, 'partial');
    assert.equal(summarizePlan(p, [{ amount: 50000, source: 'manual' }], '2026-11-06').status, 'overdue');
    const paid = summarizePlan(p, [{ amount: 100000.1, source: 'manual' }, { amount: 49999.9, source: 'official' }], '2026-11-10');
    assert.equal(paid.status, 'paid');
    assert.equal(paid.remainingKopecks, 0);
    assert.equal(paid.confirmedKopecks, 4_999_990);
    assert.equal(paid.fullyConfirmed, false);
  });

  it('напоминание и ближайшее начисление', () => {
    const soon = plan({ due_date: '2026-10-30' });
    const later = plan({ due_date: '2027-02-01' });
    const s = summarizePlan(soon, [], '2026-10-26');
    assert.equal(s.daysLeft, 4);
    assert.equal(planNeedsAttention(s, 7), true);
    assert.equal(planNeedsAttention(summarizePlan(later, [], '2026-10-26'), 7), false);
    assert.equal(nextUnpaidPlan([later, soon], '2026-10-26')?.plan.id, soon.id);
  });
});

import { bucketAssignments } from '../../src/shared/domain/assignments';
import { toDateKey } from '../../src/shared/domain/time';

describe('группировка заданий по срокам', () => {
  it('просрочено, сегодня, завтра, неделя, позже, без срока, выполнено', () => {
    const tz = 'Europe/Moscow';
    const key = (iso: string) => toDateKey(new Date(iso), tz);
    const items = [
      assignment({ title: 'later', due_at: '2026-11-20T10:00:00Z' }),
      assignment({ title: 'today', due_at: '2026-10-26T18:00:00Z' }),
      assignment({ title: 'overdue', due_at: '2026-10-25T10:00:00Z' }),
      assignment({ title: 'tomorrow', due_at: '2026-10-27T10:00:00Z' }),
      assignment({ title: 'week', due_at: '2026-10-30T10:00:00Z' }),
      assignment({ title: 'none', due_at: null }),
      assignment({ title: 'done', due_at: '2026-10-27T10:00:00Z', progress: progress('done') }),
    ];
    const buckets = bucketAssignments(items, now, key, '2026-10-26', '2026-11-01', '2026-10-27');
    assert.deepEqual(buckets.map((b) => [b.bucket, b.data.map((a) => a.title)]), [
      ['overdue', ['overdue']],
      ['today', ['today']],
      ['tomorrow', ['tomorrow']],
      ['week', ['week']],
      ['later', ['later']],
      ['none', ['none']],
      ['done', ['done']],
    ]);
  });
});
