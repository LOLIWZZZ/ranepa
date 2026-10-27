/**
 * Импорт и экспорт iCalendar (RFC 5545).
 *
 * Поддерживается: VEVENT, DTSTART/DTEND/DURATION (UTC, TZID, «плавающее» время, VALUE=DATE),
 * RRULE с FREQ=DAILY|WEEKLY (INTERVAL, COUNT, UNTIL, BYDAY), EXDATE, RECURRENCE-ID, STATUS:CANCELLED.
 * Правила MONTHLY/YEARLY не разворачиваются — импортируется только первое занятие с предупреждением.
 */

import { CLASS_TYPE_SHORT, sessionLocation, sessionTeacherName } from '../domain/schedule';
import type { ClassSession } from '../domain/models';
import { DAY, isValidTimeZone, MINUTE, zonedTimeToUtc, getZonedParts, pad2 } from '../domain/time';
import {
  cleanSubjectName,
  detectClassType,
  detectFormat,
  extractHttpsUrl,
  extractTeacher,
  parseLocation,
  stableHash,
} from './heuristics';
import type { ImportItem, ParseContext, ParseResult } from './types';

interface Property {
  name: string;
  params: Record<string, string>;
  value: string;
}

type Component = Map<string, Property[]>;

/** Часовые пояса Windows (Outlook/Exchange) → IANA для регионов России. */
const WINDOWS_ZONES: Record<string, string> = {
  'Russian Standard Time': 'Europe/Moscow',
  'Kaliningrad Standard Time': 'Europe/Kaliningrad',
  'Russia Time Zone 3': 'Europe/Samara',
  'Volgograd Standard Time': 'Europe/Volgograd',
  'Astrakhan Standard Time': 'Europe/Astrakhan',
  'Saratov Standard Time': 'Europe/Saratov',
  'Ekaterinburg Standard Time': 'Asia/Yekaterinburg',
  'Omsk Standard Time': 'Asia/Omsk',
  'N. Central Asia Standard Time': 'Asia/Novosibirsk',
  'Altai Standard Time': 'Asia/Barnaul',
  'Tomsk Standard Time': 'Asia/Tomsk',
  'North Asia Standard Time': 'Asia/Krasnoyarsk',
  'North Asia East Standard Time': 'Asia/Irkutsk',
  'Transbaikal Standard Time': 'Asia/Chita',
  'Yakutsk Standard Time': 'Asia/Yakutsk',
  'Vladivostok Standard Time': 'Asia/Vladivostok',
  'Sakhalin Standard Time': 'Asia/Sakhalin',
  'Magadan Standard Time': 'Asia/Magadan',
  'Russia Time Zone 10': 'Asia/Srednekolymsk',
  'Russia Time Zone 11': 'Asia/Kamchatka',
  'UTC': 'UTC',
};

const MAX_ITEMS = 3000;
const WINDOW_BEFORE_DAYS = 60;
const WINDOW_AFTER_DAYS = 240;

export function unfoldLines(text: string): string[] {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
    .filter((line) => line.length > 0);
}

export function parseContentLine(line: string): Property | null {
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ':' && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const segments: string[] = [];
  let current = '';
  inQuotes = false;
  for (const ch of head) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ';' && !inQuotes) {
      segments.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  segments.push(current);
  const [name, ...paramParts] = segments;
  if (!name) return null;
  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const eq = part.indexOf('=');
    if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value };
}

export function unescapeText(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_, ch: string) => (ch === 'n' || ch === 'N' ? '\n' : ch));
}

interface ParsedDate {
  date: Date;
  allDay: boolean;
}

function resolveZone(tzid: string | undefined, fallback: string, warnings: Set<string>): string {
  if (!tzid) return fallback;
  const cleaned = tzid.replace(/^\/+/, '');
  if (isValidTimeZone(cleaned)) return cleaned;
  const mapped = WINDOWS_ZONES[cleaned];
  if (mapped) return mapped;
  warnings.add(`Неизвестный часовой пояс «${tzid}» — использован ${fallback}`);
  return fallback;
}

export function parseIcsDate(value: string, tzid: string | undefined, fallbackZone: string, warnings: Set<string>): ParsedDate | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (m[4] === undefined) {
    const zone = resolveZone(tzid, fallbackZone, warnings);
    return { date: zonedTimeToUtc(year, month, day, 0, 0, zone), allDay: true };
  }
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6] ?? '0');
  if (m[7] === 'Z') {
    return { date: new Date(Date.UTC(year, month - 1, day, hour, minute, second)), allDay: false };
  }
  const zone = resolveZone(tzid, fallbackZone, warnings);
  const base = zonedTimeToUtc(year, month, day, hour, minute, zone);
  return { date: new Date(base.getTime() + second * 1000), allDay: false };
}

/** ISO 8601 длительность (PT1H30M, P1D) → миллисекунды. */
export function parseDuration(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const ms =
    Number(m[2] ?? 0) * 7 * DAY +
    Number(m[3] ?? 0) * DAY +
    Number(m[4] ?? 0) * 60 * MINUTE +
    Number(m[5] ?? 0) * MINUTE +
    Number(m[6] ?? 0) * 1000;
  return sign * ms;
}

const WEEKDAY_CODES: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };

interface RRule {
  freq: string;
  interval: number;
  count: number | null;
  until: Date | null;
  byDay: number[];
}

export function parseRRule(value: string, zone: string, warnings: Set<string>): RRule | null {
  const parts = new Map<string, string>();
  for (const piece of value.split(';')) {
    const [k, v] = piece.split('=');
    if (k && v) parts.set(k.toUpperCase(), v);
  }
  const freq = parts.get('FREQ');
  if (!freq) return null;
  const untilRaw = parts.get('UNTIL');
  const until = untilRaw ? parseIcsDate(untilRaw, undefined, zone, warnings)?.date ?? null : null;
  const byDay = (parts.get('BYDAY') ?? '')
    .split(',')
    .map((d) => WEEKDAY_CODES[d.replace(/^[+-]?\d+/, '').toUpperCase()])
    .filter((d): d is number => d !== undefined);
  return {
    freq: freq.toUpperCase(),
    interval: Math.max(1, Number(parts.get('INTERVAL') ?? '1') || 1),
    count: parts.has('COUNT') ? Math.max(1, Number(parts.get('COUNT')) || 1) : null,
    until,
    byDay,
  };
}

/** Развёртывание повторений в местном времени зоны (сохраняет «стенное» время при переходах). */
export function expandRule(start: Date, zone: string, rule: RRule, windowStart: Date, windowEnd: Date, limit: number): Date[] {
  const p = getZonedParts(start, zone);
  const results: Date[] = [];
  const pushIfInRange = (d: Date) => {
    if (d.getTime() >= windowStart.getTime() && d.getTime() <= windowEnd.getTime()) results.push(d);
  };
  let produced = 0;
  const stop = (d: Date) =>
    (rule.until !== null && d.getTime() > rule.until.getTime()) ||
    (rule.count !== null && produced >= rule.count) ||
    d.getTime() > windowEnd.getTime() ||
    results.length >= limit;

  const baseUtcDay = Date.UTC(p.year, p.month - 1, p.day);
  if (rule.freq === 'DAILY') {
    for (let i = 0; i < 5000; i += 1) {
      const dayUtc = new Date(baseUtcDay + i * rule.interval * DAY);
      const occ = zonedTimeToUtc(dayUtc.getUTCFullYear(), dayUtc.getUTCMonth() + 1, dayUtc.getUTCDate(), p.hour, p.minute, zone);
      if (stop(occ)) break;
      produced += 1;
      pushIfInRange(occ);
    }
    return results;
  }
  if (rule.freq === 'WEEKLY') {
    const days = rule.byDay.length > 0 ? [...rule.byDay].sort((a, b) => a - b) : [p.isoWeekday];
    const weekStartUtc = baseUtcDay - (p.isoWeekday - 1) * DAY;
    for (let week = 0; week < 1000; week += 1) {
      let stopped = false;
      for (const wd of days) {
        const dayUtc = new Date(weekStartUtc + (week * rule.interval * 7 + (wd - 1)) * DAY);
        if (dayUtc.getTime() < baseUtcDay) continue;
        const occ = zonedTimeToUtc(dayUtc.getUTCFullYear(), dayUtc.getUTCMonth() + 1, dayUtc.getUTCDate(), p.hour, p.minute, zone);
        if (stop(occ)) {
          stopped = true;
          break;
        }
        produced += 1;
        pushIfInRange(occ);
      }
      if (stopped) break;
    }
    return results;
  }
  pushIfInRange(start);
  return results;
}

function first(component: Component, name: string): Property | undefined {
  return component.get(name)?.[0];
}

function readComponents(lines: string[]): Component[] {
  const events: Component[] = [];
  let current: Component | null = null;
  let depth = 0;
  for (const line of lines) {
    const prop = parseContentLine(line);
    if (!prop) continue;
    if (prop.name === 'BEGIN') {
      if (prop.value.toUpperCase() === 'VEVENT' && depth === 0) {
        current = new Map();
      } else if (current) {
        depth += 1; // вложенные VALARM и т.п. пропускаем
      }
      continue;
    }
    if (prop.name === 'END') {
      if (current && depth > 0) depth -= 1;
      else if (current && prop.value.toUpperCase() === 'VEVENT') {
        events.push(current);
        current = null;
      }
      continue;
    }
    if (current && depth === 0) {
      const list = current.get(prop.name);
      if (list) list.push(prop);
      else current.set(prop.name, [prop]);
    }
  }
  return events;
}

function toItem(
  ev: Component,
  start: Date,
  durationMs: number,
  uid: string,
  cancelled: boolean,
): ImportItem {
  const summary = unescapeText(first(ev, 'SUMMARY')?.value ?? '').trim();
  const description = unescapeText(first(ev, 'DESCRIPTION')?.value ?? '').trim();
  const locationRaw = unescapeText(first(ev, 'LOCATION')?.value ?? '').trim();
  const categories = unescapeText(first(ev, 'CATEGORIES')?.value ?? '');
  const urlProp = first(ev, 'URL')?.value ?? null;
  const onlineUrl = extractHttpsUrl(urlProp, locationRaw, description);
  const loc = parseLocation(locationRaw);
  const teacher = extractTeacher(description);
  const notes = description
    .split('\n')
    .filter((line) => !/(преподаватель|преп\.?|лектор|teacher)\s*[:\-–]/i.test(line))
    .join('\n')
    .trim();
  return {
    external_id: `${uid}#${start.toISOString()}`,
    subject: cleanSubjectName(summary).slice(0, 200),
    class_type: detectClassType(summary, categories, description),
    teacher,
    building: loc.building,
    room: loc.room,
    location: loc.rest,
    format: detectFormat(locationRaw || null, onlineUrl),
    online_url: onlineUrl,
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + Math.max(durationMs, 5 * MINUTE)).toISOString(),
    status: cancelled ? 'cancelled' : 'scheduled',
    notes: notes ? notes.slice(0, 2000) : null,
  };
}

export function parseIcs(text: string, ctx: ParseContext): ParseResult {
  const warnings = new Set<string>();
  let skipped = 0;
  const lines = unfoldLines(text);
  if (!lines.some((l) => l.toUpperCase().startsWith('BEGIN:VCALENDAR'))) {
    return { items: [], warnings: ['Файл не похож на календарь iCalendar (.ics)'], skipped: 0 };
  }
  const events = readComponents(lines);
  const windowStart = new Date(ctx.now.getTime() - WINDOW_BEFORE_DAYS * DAY);
  const windowEnd = new Date(ctx.now.getTime() + WINDOW_AFTER_DAYS * DAY);

  const overrides = new Map<string, Component[]>();
  const masters: Component[] = [];
  for (const ev of events) {
    if (first(ev, 'RECURRENCE-ID')) {
      const uid = first(ev, 'UID')?.value ?? '';
      const list = overrides.get(uid);
      if (list) list.push(ev);
      else overrides.set(uid, [ev]);
    } else {
      masters.push(ev);
    }
  }

  const items: ImportItem[] = [];
  const add = (item: ImportItem) => {
    if (items.length < MAX_ITEMS) items.push(item);
  };

  const readTiming = (ev: Component): { start: ParsedDate; durationMs: number; zone: string } | null => {
    const dtstart = first(ev, 'DTSTART');
    if (!dtstart) return null;
    const zone = resolveZone(dtstart.params.TZID, ctx.timeZone, warnings);
    const start = parseIcsDate(dtstart.value, dtstart.params.TZID, ctx.timeZone, warnings);
    if (!start) return null;
    const dtend = first(ev, 'DTEND');
    const duration = first(ev, 'DURATION');
    let durationMs = start.allDay ? DAY : 90 * MINUTE;
    if (dtend) {
      const end = parseIcsDate(dtend.value, dtend.params.TZID, ctx.timeZone, warnings);
      if (end) durationMs = end.date.getTime() - start.date.getTime();
    } else if (duration) {
      durationMs = parseDuration(duration.value) ?? durationMs;
    }
    return { start, durationMs, zone };
  };

  for (const ev of masters) {
    const summary = first(ev, 'SUMMARY')?.value?.trim();
    const timing = readTiming(ev);
    if (!summary || !timing) {
      skipped += 1;
      continue;
    }
    if (timing.start.allDay) {
      warnings.add('События на весь день пропущены — импортируются только занятия со временем');
      skipped += 1;
      continue;
    }
    if (timing.durationMs <= 0 || timing.durationMs > 16 * 60 * MINUTE) {
      skipped += 1;
      continue;
    }
    const uid = first(ev, 'UID')?.value ?? `noid-${stableHash(summary + timing.start.date.toISOString())}`;
    const cancelled = (first(ev, 'STATUS')?.value ?? '').toUpperCase() === 'CANCELLED';
    const rruleProp = first(ev, 'RRULE');
    let starts: Date[] = [timing.start.date];
    if (rruleProp) {
      const rule = parseRRule(rruleProp.value, timing.zone, warnings);
      if (rule && (rule.freq === 'DAILY' || rule.freq === 'WEEKLY')) {
        starts = expandRule(timing.start.date, timing.zone, rule, windowStart, windowEnd, MAX_ITEMS);
      } else {
        warnings.add('Некоторые правила повторения (ежемесячные/ежегодные) не поддерживаются — импортировано первое занятие');
      }
    } else if (timing.start.date < windowStart || timing.start.date > windowEnd) {
      starts = [];
    }
    const exdates = new Set<number>();
    for (const ex of ev.get('EXDATE') ?? []) {
      for (const v of ex.value.split(',')) {
        const d = parseIcsDate(v, ex.params.TZID, ctx.timeZone, warnings);
        if (d) exdates.add(d.date.getTime());
      }
    }
    const overrideStarts = new Set<number>();
    for (const ov of overrides.get(uid) ?? []) {
      const rid = first(ov, 'RECURRENCE-ID');
      const parsed = rid ? parseIcsDate(rid.value, rid.params.TZID, ctx.timeZone, warnings) : null;
      if (parsed) overrideStarts.add(parsed.date.getTime());
    }
    for (const s of starts) {
      if (exdates.has(s.getTime()) || overrideStarts.has(s.getTime())) continue;
      add(toItem(ev, s, timing.durationMs, uid, cancelled));
    }
  }

  for (const [uid, list] of overrides) {
    for (const ov of list) {
      const timing = readTiming(ov);
      if (!timing || timing.start.allDay || !first(ov, 'SUMMARY')) {
        skipped += 1;
        continue;
      }
      const rid = first(ov, 'RECURRENCE-ID');
      const original = rid ? parseIcsDate(rid.value, rid.params.TZID, ctx.timeZone, warnings) : null;
      const cancelled = (first(ov, 'STATUS')?.value ?? '').toUpperCase() === 'CANCELLED';
      const item = toItem(ov, timing.start.date, timing.durationMs, uid, cancelled);
      // Идентификатор — по исходной дате экземпляра, чтобы перенос обновлял занятие, а не дублировал.
      if (original) item.external_id = `${uid}#${original.date.toISOString()}`;
      add(item);
    }
  }

  if (items.length >= MAX_ITEMS) warnings.add(`Импортировано только первые ${MAX_ITEMS} занятий`);
  return { items, warnings: [...warnings], skipped };
}

// ─── Экспорт ───────────────────────────────────────────────────────────────────

export function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/** Перенос строк длиннее 75 октетов (RFC 5545 §3.1), не разрывая символы UTF-8. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const len = utf8Length(ch.codePointAt(0) ?? 0);
    const limit = out.length === 0 ? 75 : 74; // строки продолжения начинаются с пробела
    if (bytes + len > limit) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += len;
  }
  out.push(current);
  return out.join('\r\n ');
}

function formatUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  );
}

export function generateIcs(sessions: readonly ClassSession[], options: { calendarName: string; now?: Date }): string {
  const stamp = formatUtc(options.now ?? new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RANEPA Student//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(options.calendarName)}`,
  ];
  for (const s of sessions) {
    const teacher = sessionTeacherName(s);
    const location = sessionLocation(s);
    const description = [
      CLASS_TYPE_SHORT[s.class_type],
      teacher ? `Преподаватель: ${teacher}` : null,
      s.online_url ? `Подключение: ${s.online_url}` : null,
      s.notes,
    ]
      .filter(Boolean)
      .join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.id}@ranepa-student`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${formatUtc(new Date(s.starts_at))}`,
      `DTEND:${formatUtc(new Date(s.ends_at))}`,
      `SUMMARY:${escapeText(`${s.subject?.name ?? 'Занятие'} (${CLASS_TYPE_SHORT[s.class_type].toLowerCase()})`)}`,
    );
    if (location) lines.push(`LOCATION:${escapeText(location)}`);
    if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
    if (s.online_url) lines.push(`URL:${s.online_url}`);
    if (s.status === 'cancelled') lines.push('STATUS:CANCELLED');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
