import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CSV_TEMPLATE, parseCsv, parseCsvRows } from '../../src/shared/integrations/csv';
import { cleanSubjectName, detectClassType, extractTeacher, parseLocation } from '../../src/shared/integrations/heuristics';
import { foldLine, generateIcs, parseIcs, parseIcsDate } from '../../src/shared/integrations/ics';
import { providerForContent, providerForFileName } from '../../src/shared/integrations/providers';
import { session } from './fixtures';

const ctx = { timeZone: 'Europe/Moscow', now: new Date('2026-10-26T06:00:00Z') };

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Test//RU',
  'BEGIN:VEVENT',
  'UID:econ-1',
  'DTSTART;TZID=Europe/Moscow:20261026T090000',
  'DTEND;TZID=Europe/Moscow:20261026T103000',
  'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4',
  'EXDATE;TZID=Europe/Moscow:20261028T090000',
  'SUMMARY:Экономика организации (лекция)',
  'LOCATION:Корпус 1\\, ауд. 305',
  'DESCRIPTION:Преподаватель: Иванов Иван Иванович\\nПринести калькулятор',
  'BEGIN:VALARM',
  'TRIGGER:-PT15M',
  'ACTION:DISPLAY',
  'END:VALARM',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:econ-1',
  'RECURRENCE-ID;TZID=Europe/Moscow:20261102T090000',
  'DTSTART;TZID=Europe/Moscow:20261102T120000',
  'DTEND;TZID=Europe/Moscow:20261102T133000',
  'SUMMARY:Экономика организации (лекция)',
  'LOCATION:Корпус 2\\, ауд. 118',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:eng-1',
  'DTSTART:20261027T060000Z',
  'DURATION:PT1H30M',
  'SUMMARY:Иностранный язык — практика',
  'LOCATION:Онлайн https://example.com/room',
  'STATUS:CANCELLED',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:allday',
  'DTSTART;VALUE=DATE:20261030',
  'SUMMARY:День открытых дверей',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('импорт ICS', () => {
  it('разворачивает повторения, учитывает EXDATE и перенос экземпляра', () => {
    const r = parseIcs(ICS, ctx);
    const econ = r.items.filter((i) => i.subject === 'Экономика организации');
    // COUNT=4: 26.10, 28.10 (исключено), 02.11 (перенесено на 12:00), 04.11
    assert.deepEqual(econ.map((i) => i.starts_at).sort(), [
      '2026-10-26T06:00:00.000Z',
      '2026-11-02T09:00:00.000Z',
      '2026-11-04T06:00:00.000Z',
    ]);
    const moved = econ.find((i) => i.starts_at === '2026-11-02T09:00:00.000Z');
    assert.equal(moved?.external_id, 'econ-1#2026-11-02T06:00:00.000Z');
    assert.equal(moved?.building, 'Корпус 2');
    const first = econ.find((i) => i.starts_at === '2026-10-26T06:00:00.000Z');
    assert.equal(first?.class_type, 'lecture');
    assert.equal(first?.teacher, 'Иванов Иван Иванович');
    assert.equal(first?.room, '305');
    assert.equal(first?.notes, 'Принести калькулятор');
  });

  it('отмена, онлайн-формат, длительность и события на весь день', () => {
    const r = parseIcs(ICS, ctx);
    const eng = r.items.find((i) => i.subject === 'Иностранный язык');
    assert.equal(eng?.status, 'cancelled');
    assert.equal(eng?.format, 'online');
    assert.equal(eng?.online_url, 'https://example.com/room');
    assert.equal(eng?.class_type, 'practice');
    assert.equal(eng?.ends_at, '2026-10-27T07:30:00.000Z');
    assert.equal(r.skipped, 1);
    assert.ok(r.warnings.some((w) => w.includes('весь день')));
  });

  it('распознаёт часовые пояса Windows и сообщает о неизвестных', () => {
    const warnings = new Set<string>();
    assert.equal(parseIcsDate('20261026T090000', 'Russian Standard Time', 'UTC', warnings)?.date.toISOString(), '2026-10-26T06:00:00.000Z');
    parseIcsDate('20261026T090000', 'Mars Time', 'Europe/Moscow', warnings);
    assert.equal(warnings.size, 1);
  });

  it('отклоняет не-календарь', () => {
    assert.equal(parseIcs('hello', ctx).items.length, 0);
  });

  it('экспорт → импорт сохраняет данные', () => {
    const text = generateIcs([session({ notes: 'Заметка; с запятой, и переносом\nстроки' })], { calendarName: 'Тест', now: ctx.now });
    assert.ok(text.split('\r\n').every((line) => Buffer.byteLength(line, 'utf8') <= 75));
    const back = parseIcs(text, ctx);
    assert.equal(back.items.length, 1);
    assert.equal(back.items[0]?.subject, 'Экономика организации');
    assert.equal(back.items[0]?.starts_at, '2026-10-26T07:00:00.000Z');
    assert.equal(back.items[0]?.teacher, 'Иванов И. И.');
    assert.ok(back.items[0]?.notes?.includes('Заметка; с запятой, и переносом'));
  });

  it('перенос длинных строк не разрывает кириллицу', () => {
    const folded = foldLine('SUMMARY:' + 'Ж'.repeat(100));
    assert.ok(folded.split('\r\n ').every((part, i) => Buffer.byteLength(part, 'utf8') <= (i === 0 ? 75 : 74)));
    assert.equal(folded.replace(/\r\n /g, ''), 'SUMMARY:' + 'Ж'.repeat(100));
  });
});

describe('импорт CSV', () => {
  it('шаблон приложения разбирается без ошибок', () => {
    const r = parseCsv(CSV_TEMPLATE, ctx);
    assert.equal(r.items.length, 2);
    assert.equal(r.warnings.length, 0);
    assert.equal(r.items[0]?.starts_at, '2026-11-03T06:00:00.000Z');
    assert.equal(r.items[0]?.class_type, 'lecture');
    assert.equal(r.items[0]?.building, 'Корпус 1');
    assert.equal(r.items[1]?.format, 'online');
  });

  it('запятая, кавычки, диапазон времени, ошибки строк', () => {
    const text = '﻿Дата,Время,Предмет,Аудитория,Корпус\n' +
      '3.11.26,9:00-10:30,"Право, семинар",101,2\n' +
      '04.11.2026,,Математика,,\n' +
      '31.02.2026,10:00-11:00,Ошибка,,\n';
    const r = parseCsv(text, ctx);
    assert.equal(r.items.length, 1);
    assert.equal(r.items[0]?.subject, 'Право, семинар');
    assert.equal(r.items[0]?.class_type, 'seminar');
    assert.equal(r.items[0]?.building, 'Корпус 2');
    assert.equal(r.skipped, 2);
    assert.ok(r.warnings[0]?.startsWith('Строка 3'));
  });

  it('сообщает об отсутствующих столбцах', () => {
    const r = parseCsv('Название;Комментарий\nA;B\n', ctx);
    assert.match(r.warnings[0] ?? '', /обязательные столбцы/);
  });

  it('переводы строк внутри кавычек', () => {
    assert.deepEqual(parseCsvRows('a;"b\nc";d\n1;2;3'), [['a', 'b\nc', 'd'], ['1', '2', '3']]);
  });

  it('повторный импорт даёт те же идентификаторы', () => {
    assert.equal(parseCsv(CSV_TEMPLATE, ctx).items[0]?.external_id, parseCsv(CSV_TEMPLATE, ctx).items[0]?.external_id);
  });
});

describe('эвристики разбора', () => {
  it('тип занятия и название', () => {
    assert.equal(detectClassType('Лабораторная работа №3'), 'lab');
    assert.equal(cleanSubjectName('Лекция: Теория управления'), 'Теория управления');
    assert.equal(cleanSubjectName('Право [сем.]'), 'Право');
  });
  it('место и преподаватель', () => {
    assert.deepEqual(parseLocation('ауд. 4-12, корп. Г'), { building: 'Корпус Г', room: '4-12', rest: null });
    assert.deepEqual(parseLocation('Библиотека'), { building: null, room: null, rest: 'Библиотека' });
    assert.equal(extractTeacher('Лектор - Петров П. П.'), 'Петров П. П.');
  });
  it('выбор провайдера', () => {
    assert.equal(providerForFileName('schedule.ICS')?.id, 'ics-file');
    assert.equal(providerForFileName('rasp.csv')?.id, 'csv-file');
    assert.equal(providerForContent('BEGIN:VCALENDAR\n').id, 'ics-file');
  });
});
