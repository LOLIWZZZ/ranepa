import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { buildCalendarExport } from '../src/lib/calendarExport';
import { academicWeek, academicWeekLabel } from '../src/screens/weeks';
import { combineDateKeyAndTime } from '../src/shared/domain/time';
import { parseIcs } from '../src/shared/integrations/ics';
import {
  cancelClass,
  clearDemo,
  createSeries,
  deleteSeriesFrom,
  hasDemo,
  importClasses,
  markAttendance,
  rescheduleClass,
  saveSubject,
  setTaskStatus,
  saveTask,
  signOut,
  undoImport,
  updateSeriesFrom,
} from '../src/store/actions';
import { seedDemo } from '../src/store/demo';
import { buildModel } from '../src/store/model';
import { getData, newId, normalizeData, replaceAll } from '../src/store/store';
import { emptyData } from '../src/store/types';

const TZ = 'Europe/Moscow';

function subject(name = 'Экономическая теория', teacherIds: string[] = []) {
  return saveSubject({ id: newId(), name, short_name: null, color: '#3B5BDB', teacher_ids: teacherIds, notes: null });
}

const fields = (subjectId: string) => ({
  subject_id: subjectId,
  class_type: 'lecture' as const,
  format: 'offline' as const,
  teacher_id: null,
  teacher: null,
  building: 'Корпус 1',
  room: '305',
  location: null,
  online_url: null,
  notes: null,
});

beforeEach(() => replaceAll({ ...emptyData(), settings: { ...emptyData().settings, onboarded: true } }));

describe('серии занятий', () => {
  it('создаёт занятия по дням недели в часовом поясе института', () => {
    const s = subject();
    const n = createSeries(fields(s.id), { startDate: '2026-11-02', endDate: '2026-11-29', weekdays: [1, 3], intervalWeeks: 1, startTime: '09:00', endTime: '10:30', timeZone: TZ });
    assert.equal(n, 8);
    const first = getData().classes.map((c) => c.starts_at).sort()[0];
    assert.equal(first, '2026-11-02T06:00:00.000Z');
  });

  it('«это и следующие» сдвигает время только у будущих занятий серии', () => {
    const s = subject();
    createSeries(fields(s.id), { startDate: '2026-11-02', endDate: '2026-11-23', weekdays: [1], intervalWeeks: 1, startTime: '09:00', endTime: '10:30', timeZone: TZ });
    const sorted = [...getData().classes].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const third = sorted[2]!;
    const changed = updateSeriesFrom(third.id, { ...fields(s.id), room: '401' }, combineDateKeyAndTime('2026-11-16', '10:40', TZ).toISOString(), combineDateKeyAndTime('2026-11-16', '12:10', TZ).toISOString());
    assert.equal(changed, 2);
    const after = [...getData().classes].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    assert.equal(after[0]!.room, '305');
    assert.equal(after[3]!.room, '401');
    assert.equal(after[3]!.starts_at, '2026-11-23T07:40:00.000Z');
    assert.equal(deleteSeriesFrom(after[2]!.id), 2);
    assert.equal(getData().classes.length, 2);
  });

  it('отмена и перенос сохраняют исходное время', () => {
    const s = subject();
    createSeries(fields(s.id), { startDate: '2026-11-02', endDate: '2026-11-02', weekdays: [1], intervalWeeks: 1, startTime: '09:00', endTime: '10:30', timeZone: TZ });
    const c = getData().classes[0]!;
    cancelClass(c.id, 'болезнь');
    assert.equal(getData().classes[0]!.status, 'cancelled');
    rescheduleClass(c.id, '2026-11-05T06:00:00.000Z', '2026-11-05T07:30:00.000Z', null);
    const moved = getData().classes[0]!;
    assert.equal(moved.status, 'rescheduled');
    assert.equal(moved.original_starts_at, '2026-11-02T06:00:00.000Z');
  });
});

describe('посещаемость и задания', () => {
  it('одна отметка на занятие, повторное нажатие снимает её', () => {
    const s = subject();
    createSeries(fields(s.id), { startDate: '2026-10-19', endDate: '2026-10-19', weekdays: [1], intervalWeeks: 1, startTime: '09:00', endTime: '10:30', timeZone: TZ });
    const c = getData().classes[0]!;
    markAttendance(c, 'present', TZ);
    markAttendance(c, 'late', TZ);
    assert.equal(getData().attendance.length, 1);
    assert.equal(getData().attendance[0]!.status, 'late');
    assert.equal(getData().attendance[0]!.occurred_on, '2026-10-19');
    markAttendance(c, null, TZ);
    assert.equal(getData().attendance.length, 0);
  });

  it('статус задания и дата выполнения', () => {
    const id = saveTask(null, { subject_id: null, title: 'Эссе', description: null, due_at: '2026-11-01T20:59:00.000Z', priority: 'high', url: null });
    setTaskStatus(id, 'done');
    assert.ok(getData().tasks[0]!.completed_at);
    setTaskStatus(id, 'in_progress');
    assert.equal(getData().tasks[0]!.completed_at, null);
  });
});

describe('импорт', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:lec-1',
    'DTSTART;TZID=Europe/Moscow:20261103T090000',
    'DTEND;TZID=Europe/Moscow:20261103T103000',
    'RRULE:FREQ=WEEKLY;COUNT=3',
    'SUMMARY:Право (лекция)',
    'LOCATION:Корпус 2, ауд. 214',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  it('создаёт дисциплину, повторный импорт не дублирует, отмена удаляет добавленное', () => {
    const parsed = parseIcs(ics, { timeZone: TZ, now: new Date('2026-10-27T10:00:00Z') });
    assert.equal(parsed.items.length, 3);
    const first = importClasses(parsed.items, 'law.ics', 'ics', 0);
    assert.equal(first.created, 3);
    assert.equal(first.subjectsCreated, 1);
    const second = importClasses(parsed.items, 'law.ics', 'ics', 0);
    assert.equal(second.created, 0);
    assert.equal(second.updated, 3);
    assert.equal(getData().classes.length, 3);
    assert.equal(undoImport(first.record.id), 3);
    assert.equal(getData().classes.length, 0);
    assert.equal(getData().subjects.length, 0, 'пустая импортированная дисциплина удаляется');
  });
});

describe('экспорт в календарь', () => {
  it('добавляет напоминания и пропускает выполненные задания и отменённые пары', () => {
    const s = subject();
    createSeries(fields(s.id), { startDate: '2026-11-02', endDate: '2026-11-09', weekdays: [1], intervalWeeks: 1, startTime: '09:00', endTime: '10:30', timeZone: TZ });
    cancelClass(getData().classes[0]!.id, null);
    const open = saveTask(null, { subject_id: s.id, title: 'Эссе', description: null, due_at: '2026-11-03T20:59:00.000Z', priority: 'medium', url: null });
    const done = saveTask(null, { subject_id: s.id, title: 'Готово', description: null, due_at: '2026-11-03T20:59:00.000Z', priority: 'medium', url: null });
    setTaskStatus(done, 'done');
    const model = buildModel(getData());
    const now = new Date('2026-10-27T09:00:00Z');
    const r = buildCalendarExport(model, getData().settings, { classes: true, deadlines: true, exams: true, payments: true, events: true, alarms: true, calendarName: 'Тест' }, now, '2026-10-27');
    assert.equal(r.counts.classes, 1);
    assert.equal(r.counts.deadlines, 1);
    assert.match(r.ics, new RegExp(`UID:task-${open}@ranepa-student`));
    assert.match(r.ics, /TRIGGER:-PT1425M/, 'за сутки до срока (событие начинается за 15 мин до срока)');
    assert.match(r.ics, /TRIGGER:-PT45M/, 'за час до срока');
    assert.match(r.ics, /TRIGGER:-PT15M/, 'напоминание о паре');
    assert.ok(r.ics.endsWith('END:VCALENDAR\r\n'));
    assert.ok(r.ics.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75), 'строки свёрнуты по RFC 5545');
  });
});

describe('демо-данные и резервная копия', () => {
  it('демо помечено и удаляется, свои записи остаются', () => {
    const own = subject('Моя дисциплина');
    seedDemo(TZ);
    assert.ok(hasDemo(getData()));
    assert.ok(getData().classes.length > 0);
    clearDemo();
    assert.ok(!hasDemo(getData()));
    assert.equal(getData().classes.length, 0);
    assert.deepEqual(getData().subjects.map((s) => s.id), [own.id]);
  });

  it('проверка структуры копии', () => {
    assert.equal(normalizeData({ version: 2 }), null);
    assert.equal(normalizeData({ version: 1, classes: 'x' }), null);
    const restored = normalizeData({ version: 1, settings: { name: 'Анна' }, tasks: [{ id: 'a', title: 'Задача' }, { id: '', title: 'битая' }] });
    assert.ok(restored);
    assert.equal(restored.settings.name, 'Анна');
    assert.equal(restored.settings.timeZone, 'Europe/Moscow');
    assert.equal(restored.tasks.length, 1);
  });
});

describe('учебная неделя', () => {
  it('считает от понедельника недели начала семестра', () => {
    assert.equal(academicWeek('2026-09-01', '2026-09-06'), 1);
    assert.equal(academicWeek('2026-09-01', '2026-09-07'), 2);
    assert.equal(academicWeek('2026-09-01', '2026-10-27'), 9);
    assert.equal(academicWeek('2026-09-01', '2026-08-30'), null);
    assert.equal(academicWeekLabel('2026-09-01', '2026-10-27'), '9-я неделя, нечётная');
    assert.equal(academicWeekLabel(null, '2026-10-27'), null);
  });
});

describe('выход из профиля', () => {
  beforeEach(() => replaceAll(emptyData()));
  it('удаляет профиль и все записи, сохраняет тему и возвращает к первому запуску', () => {
    replaceAll({ ...emptyData(), settings: { ...emptyData().settings, name: 'Иван', group: 'ЦТиРИС-2', onboarded: true, theme: 'dark' } });
    seedDemo(TZ);
    assert.ok(getData().classes.length > 0);
    signOut();
    const d = getData();
    assert.equal(d.settings.onboarded, false);
    assert.equal(d.settings.name, '');
    assert.equal(d.settings.group, '');
    assert.equal(d.settings.theme, 'dark');
    assert.equal(d.classes.length + d.subjects.length + d.teachers.length + d.tasks.length + d.grades.length, 0);
  });
});
