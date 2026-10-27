import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatCountdown,
  formatDurationMinutes,
  formatMoneyKopecks,
  formatTimer,
  greetingName,
  parseMoneyInput,
  plural,
  rublesToKopecks,
  shortName,
} from '../../src/shared/domain/format';

describe('склонение и суммы', () => {
  it('выбирает правильную форму слова', () => {
    const forms = ['день', 'дня', 'дней'] as const;
    assert.equal(plural(1, forms), 'день');
    assert.equal(plural(2, forms), 'дня');
    assert.equal(plural(5, forms), 'дней');
    assert.equal(plural(11, forms), 'дней');
    assert.equal(plural(21, forms), 'день');
    assert.equal(plural(112, forms), 'дней');
    assert.equal(plural(23, forms), 'дня');
  });

  it('форматирует суммы в рублях без ошибок округления', () => {
    assert.equal(formatMoneyKopecks(15_000_000), '150 000 ₽');
    assert.equal(formatMoneyKopecks(123_450), '1 234,50 ₽');
    assert.equal(rublesToKopecks(0.1 + 0.2), 30);
    assert.equal(rublesToKopecks('1234.56'), 123_456);
  });

  it('разбирает ввод суммы', () => {
    assert.equal(parseMoneyInput('150 000'), 15_000_000);
    assert.equal(parseMoneyInput('1 234,5'), 123_450);
    assert.equal(parseMoneyInput('12,345'), null);
    assert.equal(parseMoneyInput('abc'), null);
  });
});

describe('время и имена', () => {
  it('длительность и обратный отсчёт', () => {
    assert.equal(formatDurationMinutes(90), '1 ч 30 мин');
    assert.equal(formatDurationMinutes(45), '45 мин');
    const now = new Date('2026-10-26T07:00:00Z');
    assert.equal(formatCountdown(new Date('2026-10-26T07:25:00Z'), now), 'через 25 мин');
    assert.equal(formatCountdown(new Date('2026-10-26T09:10:00Z'), now), 'через 2 ч 10 мин');
    assert.equal(formatCountdown(new Date('2026-10-29T07:00:00Z'), now), 'через 3 дня');
    assert.equal(formatTimer(new Date('2026-10-26T07:24:10Z'), now), '00:24:10');
  });

  it('имена', () => {
    assert.equal(shortName('Иванов Иван Иванович'), 'Иванов И. И.');
    assert.equal(greetingName('Анна Смирнова'), 'Анна');
  });
});
