import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  filterSessions,
  findCurrentAndNext,
  generateOccurrences,
  groupByDay,
  RecurrenceError,
  remainingToday,
  sessionLocation,
  sessionPhase,
  sessionProgress,
} from '../../src/shared/domain/schedule';
import { formatTime } from '../../src/shared/domain/time';
import { session, subject2 } from './fixtures';

const TZ = 'Europe/Moscow';

describe('статус занятия', () => {
  const s = session({ starts_at: '2026-10-26T07:00:00Z', ends_at: '2026-10-26T08:30:00Z' });
  it('до, во время и после', () => {
    assert.equal(sessionPhase(s, new Date('2026-10-26T06:59:00Z')), 'upcoming');
    assert.equal(sessionPhase(s, new Date('2026-10-26T07:30:00Z')), 'ongoing');
    assert.equal(sessionPhase(s, new Date('2026-10-26T08:30:00Z')), 'finished');
    assert.equal(sessionPhase({ ...s, status: 'cancelled' }, new Date('2026-10-26T07:30:00Z')), 'cancelled');
  });
  it('прогресс текущей пары', () => {
    assert.equal(sessionProgress(s, new Date('2026-10-26T07:45:00Z')), 0.5);
  });
});

describe('текущая и следующая пара', () => {
  const first = session({ starts_at: '2026-10-26T06:00:00Z', ends_at: '2026-10-26T07:30:00Z' });
  const cancelled = session({ starts_at: '2026-10-26T07:40:00Z', ends_at: '2026-10-26T09:10:00Z', status: 'cancelled' });
  const second = session({ starts_at: '2026-10-26T09:40:00Z', ends_at: '2026-10-26T11:10:00Z' });
  it('пропускает отменённые занятия', () => {
    const r = findCurrentAndNext([second, cancelled, first], new Date('2026-10-26T07:00:00Z'));
    assert.equal(r.current?.id, first.id);
    assert.equal(r.next?.id, second.id);
  });
  it('оставшиеся пары сегодня', () => {
    const r = remainingToday([first, cancelled, second], new Date('2026-10-26T08:00:00Z'), TZ);
    assert.deepEqual(r.map((x) => x.id), [second.id]);
  });
});

describe('группировка и фильтры', () => {
  it('группирует по дням в часовом поясе института', () => {
    const late = session({ starts_at: '2026-10-25T21:30:00Z', ends_at: '2026-10-25T22:30:00Z' }); // пн 00:30 МСК
    const map = groupByDay([late], TZ);
    assert.deepEqual([...map.keys()], ['2026-10-26']);
  });
  it('фильтрует по дисциплине, типу и поиску (ё = е)', () => {
    const a = session({ class_type: 'lecture' });
    const b = session({ subject_id: subject2.id, subject: subject2, teacher_note: 'Семёнов С. С.' });
    assert.equal(filterSessions([a, b], { classType: 'lecture' }).length, 1);
    assert.equal(filterSessions([a, b], { subjectId: subject2.id })[0]?.id, b.id);
    assert.equal(filterSessions([a, b], { query: 'семенов' })[0]?.id, b.id);
    assert.equal(filterSessions([a, b], { query: 'корпус 1' }).length, 2);
  });
  it('собирает место проведения', () => {
    assert.equal(sessionLocation(session()), 'Корпус 1, ауд. 305');
    assert.equal(sessionLocation(session({ classroom: null, format: 'online' })), 'Онлайн');
  });
});

describe('повторяющиеся занятия', () => {
  it('каждую неделю по понедельникам и средам', () => {
    const list = generateOccurrences({
      startDate: '2026-10-26', endDate: '2026-11-08', weekdays: [1, 3], intervalWeeks: 1,
      startTime: '10:40', endTime: '12:10', timeZone: TZ,
    });
    assert.equal(list.length, 4);
    assert.equal(list[0]?.starts_at, '2026-10-26T07:40:00.000Z');
    assert.equal(formatTime(new Date(list[3]!.ends_at), TZ), '12:10');
  });
  it('через неделю (числитель/знаменатель)', () => {
    const list = generateOccurrences({
      startDate: '2026-10-28', endDate: '2026-11-25', weekdays: [3], intervalWeeks: 2,
      startTime: '09:00', endTime: '10:30', timeZone: TZ,
    });
    assert.deepEqual(list.map((x) => x.starts_at.slice(0, 10)), ['2026-10-28', '2026-11-11', '2026-11-25']);
  });
  it('проверяет входные данные', () => {
    assert.throws(() => generateOccurrences({
      startDate: '2026-10-26', endDate: '2026-10-20', weekdays: [1], intervalWeeks: 1, startTime: '09:00', endTime: '10:00', timeZone: TZ,
    }), RecurrenceError);
    assert.throws(() => generateOccurrences({
      startDate: '2026-10-26', endDate: '2026-11-20', weekdays: [1], intervalWeeks: 1, startTime: '10:00', endTime: '09:00', timeZone: TZ,
    }), /позже начала/);
  });
});
