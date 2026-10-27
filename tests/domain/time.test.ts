import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  academicYearOf,
  addDaysToKey,
  combineDateKeyAndTime,
  diffDaysBetweenKeys,
  formatDateTimeShort,
  formatRelativeDay,
  formatTime,
  formatWeekdayDayMonth,
  getZonedParts,
  isDateKey,
  rangeForKeys,
  startOfWeekKey,
  toDateKey,
  zonedTimeToUtc,
} from '../../src/shared/domain/time';

describe('часовые пояса', () => {
  it('переводит московское время в UTC (UTC+3, без летнего времени)', () => {
    const d = zonedTimeToUtc(2026, 10, 26, 10, 0, 'Europe/Moscow');
    assert.equal(d.toISOString(), '2026-10-26T07:00:00.000Z');
  });

  it('учитывает разные часовые пояса филиалов', () => {
    assert.equal(zonedTimeToUtc(2026, 10, 26, 10, 0, 'Asia/Novosibirsk').toISOString(), '2026-10-26T03:00:00.000Z');
    assert.equal(zonedTimeToUtc(2026, 10, 26, 10, 0, 'Asia/Vladivostok').toISOString(), '2026-10-26T00:00:00.000Z');
  });

  it('корректно обрабатывает переход на летнее время (весна: несуществующее время сдвигается вперёд)', () => {
    // 8 марта 2026, Нью-Йорк: 02:00 → 03:00
    const d = zonedTimeToUtc(2026, 3, 8, 2, 30, 'America/New_York');
    assert.equal(formatTime(d, 'America/New_York'), '03:30');
  });

  it('переход осенью: неоднозначное время — первое вхождение', () => {
    // 1 ноября 2026, Нью-Йорк: 01:30 бывает дважды (EDT и EST)
    const d = zonedTimeToUtc(2026, 11, 1, 1, 30, 'America/New_York');
    assert.equal(d.toISOString(), '2026-11-01T05:30:00.000Z');
  });

  it('стенное время сохраняется при смене смещения', () => {
    const before = combineDateKeyAndTime('2026-10-24', '10:00', 'Europe/Berlin');
    const after = combineDateKeyAndTime('2026-10-26', '10:00', 'Europe/Berlin');
    assert.equal(formatTime(before, 'Europe/Berlin'), '10:00');
    assert.equal(formatTime(after, 'Europe/Berlin'), '10:00');
    assert.equal(after.getTime() - before.getTime(), 2 * 24 * 3600_000 + 3600_000);
  });

  it('день недели и дата в поясе', () => {
    const d = new Date('2026-10-25T22:30:00Z'); // в Москве уже понедельник 01:30
    assert.equal(toDateKey(d, 'Europe/Moscow'), '2026-10-26');
    assert.equal(getZonedParts(d, 'Europe/Moscow').isoWeekday, 1);
    assert.equal(toDateKey(d, 'UTC'), '2026-10-25');
  });
});

describe('календарные ключи дат', () => {
  it('арифметика дат и границы месяцев', () => {
    assert.equal(addDaysToKey('2026-10-31', 1), '2026-11-01');
    assert.equal(addDaysToKey('2026-03-01', -1), '2026-02-28');
    assert.equal(addDaysToKey('2028-03-01', -1), '2028-02-29');
    assert.equal(diffDaysBetweenKeys('2026-10-26', '2026-11-02'), 7);
  });

  it('неделя начинается с понедельника', () => {
    assert.equal(startOfWeekKey('2026-10-26'), '2026-10-26');
    assert.equal(startOfWeekKey('2026-11-01'), '2026-10-26');
    assert.equal(startOfWeekKey('2026-10-28'), '2026-10-26');
  });

  it('валидация ключа даты', () => {
    assert.equal(isDateKey('2026-02-29'), false);
    assert.equal(isDateKey('2028-02-29'), true);
    assert.equal(isDateKey('2026-13-01'), false);
  });

  it('диапазон дней для запросов — полуинтервал в UTC', () => {
    const r = rangeForKeys('2026-10-26', '2026-11-01', 'Europe/Moscow');
    assert.equal(r.start.toISOString(), '2026-10-25T21:00:00.000Z');
    assert.equal(r.end.toISOString(), '2026-11-01T21:00:00.000Z');
  });
});

describe('форматирование на русском', () => {
  it('полная дата с днём недели', () => {
    assert.equal(formatWeekdayDayMonth('2026-10-26'), 'Понедельник, 26 октября');
  });

  it('относительные дни', () => {
    assert.equal(formatRelativeDay('2026-10-26', '2026-10-26'), 'Сегодня');
    assert.equal(formatRelativeDay('2026-10-27', '2026-10-26'), 'Завтра');
    assert.equal(formatRelativeDay('2026-10-25', '2026-10-26'), 'Вчера');
    assert.equal(formatRelativeDay('2026-10-29', '2026-10-26'), 'Чт, 29 окт');
  });

  it('дата и время коротко', () => {
    const now = new Date('2026-10-26T08:00:00Z');
    assert.equal(formatDateTimeShort(new Date('2026-10-27T20:59:00Z'), 'Europe/Moscow', now), 'Завтра, 23:59');
    assert.equal(formatDateTimeShort(new Date('2027-01-15T07:00:00Z'), 'Europe/Moscow', now), '15 янв 2027, 10:00');
  });

  it('учебный год', () => {
    assert.equal(academicYearOf('2026-10-26'), '2026/2027');
    assert.equal(academicYearOf('2027-05-10'), '2026/2027');
  });
});
