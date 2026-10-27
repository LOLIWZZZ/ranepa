import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { defaultTeacherId } from '../src/screens/ClassScreens';
import { formatPoints, parsePoints, pointsForSubject, validateAddition } from '../src/lib/points';
import { combineDateKeyAndTime } from '../src/shared/domain/time';
import {
  cancelClass,
  createSeries,
  deleteTeacher,
  ensureTeacher,
  importClasses,
  rescheduleClass,
  restoreClass,
  saveClass,
  saveSubject,
  ScheduleConflictError,
} from '../src/store/actions';
import { buildModel } from '../src/store/model';
import { addMinutesToTime, findConflicts, minutesBetweenTimes, overlappingIds } from '../src/store/rules';
import { getData, newId, normalizeData, replaceAll } from '../src/store/store';
import { emptyData, type GradeItem, type Subject } from '../src/store/types';

const TZ = 'Europe/Moscow';
const at = (day: string, time: string) => combineDateKeyAndTime(day, time, TZ).toISOString();

beforeEach(() => replaceAll({ ...emptyData(), settings: { ...emptyData().settings, onboarded: true } }));

function subject(name = 'Право', teacherIds: string[] = []): Subject {
  return saveSubject({ id: newId(), name, short_name: null, color: '#3B5BDB', teacher_ids: teacherIds, notes: null });
}
const fields = (subjectId: string) => ({
  subject_id: subjectId,
  class_type: 'lecture' as const,
  format: 'offline' as const,
  teacher_id: null,
  teacher: null,
  building: null,
  room: '305',
  location: null,
  online_url: null,
  notes: null,
});

describe('длительность пары', () => {
  it('конец пары = начало + 1 ч 20 мин', () => {
    assert.equal(addMinutesToTime('09:00', 80), '10:20');
    assert.equal(addMinutesToTime('10:30', 80), '11:50');
    assert.equal(addMinutesToTime('8:15', 80), '09:35');
    assert.equal(addMinutesToTime('23:00', 80), null, 'за полночь — нельзя');
    assert.equal(minutesBetweenTimes('09:00', '10:20'), 80);
  });
  it('настройка по умолчанию — 80 минут', () => {
    assert.equal(emptyData().settings.pairMinutes, 80);
  });
});

describe('одна пара в одно время', () => {
  it('нельзя поставить вторую пару на занятое время', () => {
    const s = subject();
    saveClass(null, fields(s.id), at('2026-11-02', '09:00'), at('2026-11-02', '10:20'));
    assert.throws(() => saveClass(null, fields(s.id), at('2026-11-02', '09:00'), at('2026-11-02', '10:20')), ScheduleConflictError);
    assert.throws(() => saveClass(null, fields(s.id), at('2026-11-02', '10:00'), at('2026-11-02', '11:20')), ScheduleConflictError, 'частичное пересечение');
    assert.equal(getData().classes.length, 1);
  });

  it('пары встык и отменённые пары не мешают', () => {
    const s = subject();
    const first = saveClass(null, fields(s.id), at('2026-11-02', '09:00'), at('2026-11-02', '10:20'));
    saveClass(null, fields(s.id), at('2026-11-02', '10:20'), at('2026-11-02', '11:40'));
    cancelClass(first, null);
    saveClass(null, fields(s.id), at('2026-11-02', '09:00'), at('2026-11-02', '10:00'));
    assert.equal(getData().classes.length, 3);
    assert.throws(() => restoreClass(first), ScheduleConflictError, 'вернуть отменённую пару на занятое время нельзя');
  });

  it('редактирование самой пары не считается конфликтом, перенос на занятое время — считается', () => {
    const s = subject();
    const a = saveClass(null, fields(s.id), at('2026-11-02', '09:00'), at('2026-11-02', '10:20'));
    saveClass(null, fields(s.id), at('2026-11-02', '12:00'), at('2026-11-02', '13:20'));
    saveClass(a, { ...fields(s.id), room: '401' }, at('2026-11-02', '09:10'), at('2026-11-02', '10:30'));
    assert.throws(() => rescheduleClass(a, at('2026-11-02', '12:30'), at('2026-11-02', '13:50'), null), ScheduleConflictError);
  });

  it('серия не создаётся, если одно из занятий попадает на занятое время', () => {
    const s = subject();
    saveClass(null, fields(s.id), at('2026-11-16', '09:30'), at('2026-11-16', '10:50'));
    assert.throws(
      () => createSeries(fields(s.id), { startDate: '2026-11-02', endDate: '2026-11-30', weekdays: [1], intervalWeeks: 1, startTime: '09:00', endTime: '10:20', timeZone: TZ }),
      (e: unknown) => e instanceof ScheduleConflictError && /16 ноября/.test(e.message),
    );
    assert.equal(getData().classes.length, 1);
  });

  it('импорт пропускает пары на занятое время', () => {
    const s = subject('Право');
    saveClass(null, fields(s.id), at('2026-11-03', '09:00'), at('2026-11-03', '10:20'));
    const item = (id: string, start: string, end: string) => ({
      external_id: id, subject: 'Экономика', class_type: 'seminar' as const, teacher: 'Петров Пётр Петрович', building: null, room: null, location: null,
      format: 'offline' as const, online_url: null, starts_at: at('2026-11-03', start), ends_at: at('2026-11-03', end), status: 'scheduled' as const, notes: null,
    });
    const r = importClasses([item('a', '09:30', '10:50'), item('b', '11:00', '12:20'), item('c', '12:00', '13:20')], 'f.ics', 'ics', 0);
    assert.equal(r.created, 1);
    assert.equal(r.conflicts, 2);
    const created = getData().classes.find((c) => c.external_id === 'b');
    assert.ok(created?.teacher_id, 'преподаватель из файла попадает в справочник');
    assert.deepEqual(getData().subjects.find((x) => x.name === 'Экономика')?.teacher_ids, [created?.teacher_id]);
  });

  it('находит уже существующие пересечения', () => {
    const list = [
      { id: 'a', status: 'scheduled', starts_at: at('2026-11-02', '09:00'), ends_at: at('2026-11-02', '10:20') },
      { id: 'b', status: 'scheduled', starts_at: at('2026-11-02', '09:00'), ends_at: at('2026-11-02', '10:20') },
      { id: 'c', status: 'scheduled', starts_at: at('2026-11-02', '10:20'), ends_at: at('2026-11-02', '11:40') },
      { id: 'd', status: 'cancelled', starts_at: at('2026-11-02', '10:30'), ends_at: at('2026-11-02', '11:00') },
    ];
    assert.deepEqual([...overlappingIds(list)].sort(), ['a', 'b']);
    assert.deepEqual(findConflicts(list, [{ starts_at: at('2026-11-02', '10:00'), ends_at: at('2026-11-02', '10:30') }]).map((c) => c.id), ['a', 'b', 'c']);
  });
});

describe('преподаватели', () => {
  it('преподаватель подставляется сам: лекция — первый, семинар — второй', () => {
    assert.equal(defaultTeacherId(['t1', 't2'], 'lecture'), 't1');
    assert.equal(defaultTeacherId(['t1', 't2'], 'seminar'), 't2');
    assert.equal(defaultTeacherId(['t1'], 'seminar'), 't1');
    assert.equal(defaultTeacherId([], 'lecture'), null);
  });

  it('в занятии без выбранного преподавателя показывается преподаватель дисциплины', () => {
    const t = ensureTeacher('Иванова Мария Петровна');
    assert.equal(ensureTeacher('  иванова   мария петровна ').id, t.id, 'без дублей при другом регистре и пробелах');
    const s = subject('Право', [t.id]);
    saveClass(null, fields(s.id), at('2026-11-02', '09:00'), at('2026-11-02', '10:20'));
    assert.equal(buildModel(getData()).sessions[0]?.teacher_note, 'Иванова Мария Петровна');
    deleteTeacher(t.id);
    assert.deepEqual(getData().subjects[0]?.teacher_ids, []);
  });

  it('старые данные (одно поле «преподаватель») переводятся в справочник', () => {
    const old = {
      version: 1,
      subjects: [
        { id: 's1', name: 'Право', teacher: 'Сидоров С. С.', color: '#000', source: 'manual' },
        { id: 's2', name: 'Экономика', teacher: 'Сидоров С. С.', color: '#000', source: 'manual' },
        { id: 's3', name: 'Логика', teacher: null, color: '#000', source: 'manual' },
      ],
      classes: [{ id: 'c1', subject_id: 's1', starts_at: '2026-11-02T06:00:00Z', ends_at: '2026-11-02T07:20:00Z', teacher: null }],
    };
    const d = normalizeData(old);
    assert.ok(d);
    assert.equal(d.teachers.length, 1);
    assert.equal(d.subjects[0]?.teacher_ids[0], d.teachers[0]?.id);
    assert.equal(d.subjects[1]?.teacher_ids[0], d.teachers[0]?.id);
    assert.deepEqual(d.subjects[2]?.teacher_ids, []);
    assert.equal(d.classes[0]?.teacher_id, null);
    assert.ok(!('teacher' in (d.subjects[0] as object)));
  });
});

describe('100-балльная система', () => {
  const g = (score: number | null, day: string, mark: string | null = null): GradeItem => ({
    id: newId(), subject_id: 's', kind: 'assignment', title: 'x', score, max_score: null, mark, weight: 1, graded_on: day, note: null, source: 'manual',
  });
  const s: Subject = { id: 's', name: 'Право', short_name: null, color: '#000', teacher_ids: [], notes: null, source: 'manual', created_at: '' };

  it('баллы складываются с предыдущими', () => {
    const p = pointsForSubject(s, [g(10, '2026-10-01'), g(7.5, '2026-10-05'), g(-2, '2026-10-06'), g(null, '2026-10-02', '5')]);
    assert.equal(p.total, 15.5);
    assert.equal(p.entries[0]?.runningTotal, 15.5, 'новые сверху с накопленной суммой');
    assert.equal(p.entries[2]?.runningTotal, 10);
    assert.equal(p.legacy.length, 1, 'старые отметки без баллов не входят в сумму');
  });

  it('сумма не больше 100 и не меньше 0', () => {
    assert.equal(validateAddition(90, 10), null);
    assert.match(validateAddition(90, 15) ?? '', /можно добавить не больше 10/);
    assert.match(validateAddition(100, 1) ?? '', /уже 100/);
    assert.match(validateAddition(3, -5) ?? '', /меньше нуля/);
    assert.match(validateAddition(3, 0) ?? '', /отличное от нуля/);
  });

  it('разбор ввода', () => {
    assert.equal(parsePoints('5'), 5);
    assert.equal(parsePoints('7,5'), 7.5);
    assert.equal(parsePoints('−2'), -2);
    assert.equal(parsePoints('abc'), null);
    assert.equal(parsePoints('1000'), null);
    assert.equal(formatPoints(15.5), '15,5');
  });
});
