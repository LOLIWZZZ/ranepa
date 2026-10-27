/**
 * Работа с датами и часовыми поясами без сторонних библиотек.
 *
 * Все моменты времени хранятся как абсолютные (UTC, timestamptz в БД). Отображение и «календарные»
 * операции (какой это день, начало недели, 10:00 по местному времени) выполняются в часовом поясе
 * института — по умолчанию Europe/Moscow. Преобразования учитывают переходы на летнее время.
 *
 * DateKey — строка 'YYYY-MM-DD', обозначающая календарный день (без времени и пояса).
 */

export type DateKey = string;

export const DEFAULT_TIME_ZONE = 'Europe/Moscow';
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export interface ZonedParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 1 = понедельник … 7 = воскресенье (ISO) */
  isoWeekday: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Проверяет, что часовой пояс поддерживается движком JS устройства. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    getFormatter(timeZone).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function isoWeekdayFromYmd(year: number, month: number, day: number): number {
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = вс
  return dow === 0 ? 7 : dow;
}

/** Части даты в указанном часовом поясе. */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = getFormatter(timeZone);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;
  if (typeof formatter.formatToParts === 'function') {
    for (const part of formatter.formatToParts(date)) {
      const value = Number(part.value);
      switch (part.type) {
        case 'year':
          year = value;
          break;
        case 'month':
          month = value;
          break;
        case 'day':
          day = value;
          break;
        case 'hour':
          hour = value === 24 ? 0 : value;
          break;
        case 'minute':
          minute = value;
          break;
        case 'second':
          second = value;
          break;
        default:
          break;
      }
    }
  } else {
    // Резервный разбор строки вида "10/26/2026, 23:13:05"
    const match = /(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2}):(\d{2})/.exec(formatter.format(date));
    if (!match) throw new Error('Не удалось определить дату в часовом поясе ' + timeZone);
    month = Number(match[1]);
    day = Number(match[2]);
    year = Number(match[3]);
    hour = Number(match[4]) % 24;
    minute = Number(match[5]);
    second = Number(match[6]);
  }
  return { year, month, day, hour, minute, second, isoWeekday: isoWeekdayFromYmd(year, month, day) };
}

/** Смещение часового пояса относительно UTC в минутах для данного момента. */
export function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const p = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - (date.getTime() - date.getMilliseconds())) / MINUTE);
}

/**
 * Местное время (стенные часы) в поясе → абсолютный момент.
 * Для несуществующего времени (переход весной) результат сдвигается вперёд,
 * для неоднозначного (переход осенью) берётся первое вхождение.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset1 = timeZoneOffsetMinutes(new Date(naiveUtc), timeZone);
  let candidate = naiveUtc - offset1 * MINUTE;
  const offset2 = timeZoneOffsetMinutes(new Date(candidate), timeZone);
  if (offset2 !== offset1) {
    const alternative = naiveUtc - offset2 * MINUTE;
    const altOffset = timeZoneOffsetMinutes(new Date(alternative), timeZone);
    candidate = altOffset === offset2 ? Math.min(candidate, alternative) : Math.max(candidate, alternative);
  }
  return new Date(candidate);
}

export function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function toDateKey(date: Date, timeZone: string): DateKey {
  const p = getZonedParts(date, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

export function parseDateKey(key: DateKey): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Некорректная дата: ${key}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function isDateKey(value: string): value is DateKey {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { year, month, day } = parseDateKey(value);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function addDaysToKey(key: DateKey, days: number): DateKey {
  const { year, month, day } = parseDateKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function diffDaysBetweenKeys(from: DateKey, to: DateKey): number {
  const a = parseDateKey(from);
  const b = parseDateKey(to);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY);
}

export function isoWeekdayOfKey(key: DateKey): number {
  const { year, month, day } = parseDateKey(key);
  return isoWeekdayFromYmd(year, month, day);
}

/** Понедельник недели, в которую входит день. */
export function startOfWeekKey(key: DateKey): DateKey {
  return addDaysToKey(key, 1 - isoWeekdayOfKey(key));
}

export function weekKeys(weekStart: DateKey): DateKey[] {
  return Array.from({ length: 7 }, (_, i) => addDaysToKey(weekStart, i));
}

/** Начало календарного дня в поясе (как абсолютный момент). */
export function startOfDayUtc(key: DateKey, timeZone: string): Date {
  const { year, month, day } = parseDateKey(key);
  return zonedTimeToUtc(year, month, day, 0, 0, timeZone);
}

/** Полуинтервал [начало дня from; начало дня после to) в UTC — для запросов к серверу. */
export function rangeForKeys(from: DateKey, to: DateKey, timeZone: string): { start: Date; end: Date } {
  return { start: startOfDayUtc(from, timeZone), end: startOfDayUtc(addDaysToKey(to, 1), timeZone) };
}

/** 'HH:MM' → { hour, minute } */
export function parseTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function combineDateKeyAndTime(key: DateKey, time: string, timeZone: string): Date {
  const t = parseTime(time);
  if (!t) throw new Error(`Некорректное время: ${time}`);
  const { year, month, day } = parseDateKey(key);
  return zonedTimeToUtc(year, month, day, t.hour, t.minute, timeZone);
}

export function formatTime(date: Date, timeZone: string): string {
  const p = getZonedParts(date, timeZone);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MINUTE);
}

// ─── Русские названия ──────────────────────────────────────────────────────────

export const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
] as const;

export const MONTHS_NOMINATIVE = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
] as const;

export const MONTHS_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
] as const;

export const WEEKDAYS = [
  'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье',
] as const;

export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

/** «26 октября» */
export function formatDayMonth(key: DateKey): string {
  const { month, day } = parseDateKey(key);
  return `${day} ${MONTHS_GENITIVE[month - 1]}`;
}

/** «26 октября 2026» */
export function formatFullDate(key: DateKey): string {
  const { year } = parseDateKey(key);
  return `${formatDayMonth(key)} ${year}`;
}

/** «Понедельник, 26 октября» */
export function formatWeekdayDayMonth(key: DateKey): string {
  const weekday = WEEKDAYS[isoWeekdayOfKey(key) - 1] ?? '';
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${formatDayMonth(key)}`;
}

export function formatShortDate(key: DateKey): string {
  const { day, month, year } = parseDateKey(key);
  return `${pad2(day)}.${pad2(month)}.${year}`;
}

/** «Сегодня», «Завтра», «Вчера» или «Пн, 26 окт» */
export function formatRelativeDay(key: DateKey, todayKey: DateKey): string {
  const diff = diffDaysBetweenKeys(todayKey, key);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  if (diff === -1) return 'Вчера';
  const { day, month } = parseDateKey(key);
  return `${WEEKDAYS_SHORT[isoWeekdayOfKey(key) - 1]}, ${day} ${MONTHS_SHORT[month - 1]}`;
}

/** «Сегодня, 10:00», «Завтра, 23:59», «28 окт, 18:00» */
export function formatDateTimeShort(date: Date, timeZone: string, now: Date): string {
  const key = toDateKey(date, timeZone);
  const today = toDateKey(now, timeZone);
  const diff = diffDaysBetweenKeys(today, key);
  const time = formatTime(date, timeZone);
  if (diff === 0) return `Сегодня, ${time}`;
  if (diff === 1) return `Завтра, ${time}`;
  if (diff === -1) return `Вчера, ${time}`;
  const { day, month, year } = parseDateKey(key);
  const nowYear = parseDateKey(today).year;
  return `${day} ${MONTHS_SHORT[month - 1]}${year !== nowYear ? ` ${year}` : ''}, ${time}`;
}

export function formatMonthYear(year: number, month: number): string {
  return `${MONTHS_NOMINATIVE[month - 1]} ${year}`;
}

/** Учебный год для даты: сентябрь–август, например «2026/2027». */
export function academicYearOf(key: DateKey): string {
  const { year, month } = parseDateKey(key);
  const start = month >= 9 ? year : year - 1;
  return `${start}/${start + 1}`;
}
