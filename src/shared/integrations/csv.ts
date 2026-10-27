/**
 * Импорт расписания из CSV (Excel → «Сохранить как CSV», Google Таблицы → «Скачать CSV»).
 *
 * Обязательные столбцы: дата, начало, конец (или «время» в виде 09:00-10:30), дисциплина.
 * Необязательные: тип, преподаватель, корпус, аудитория, формат, ссылка, заметки, место.
 * Разделитель (; , или табуляция) и кодировка BOM определяются автоматически.
 */

import { combineDateKeyAndTime, isDateKey, pad2, parseTime, type DateKey } from '../domain/time';
import { cleanSubjectName, detectClassType, detectFormat, extractHttpsUrl, parseLocation } from './heuristics';
import type { ImportItem, ParseContext, ParseResult } from './types';

type Column =
  | 'date'
  | 'start'
  | 'end'
  | 'time'
  | 'subject'
  | 'type'
  | 'teacher'
  | 'building'
  | 'room'
  | 'format'
  | 'url'
  | 'notes'
  | 'location'
  | 'status';

const ALIASES: Record<Column, string[]> = {
  date: ['дата', 'date', 'день', 'число'],
  start: ['начало', 'времяначала', 'start', 'starts', 'с', 'begin'],
  end: ['конец', 'окончание', 'времяокончания', 'end', 'ends', 'по', 'до'],
  time: ['время', 'time', 'пара'],
  subject: ['дисциплина', 'предмет', 'название', 'subject', 'course', 'занятие'],
  type: ['тип', 'вид', 'типзанятия', 'видзанятия', 'type'],
  teacher: ['преподаватель', 'преп', 'преподаватели', 'teacher', 'lecturer', 'фио'],
  building: ['корпус', 'здание', 'building'],
  room: ['аудитория', 'ауд', 'кабинет', 'room'],
  format: ['формат', 'format', 'формапроведения'],
  url: ['ссылка', 'url', 'link', 'ссылкаподключения'],
  notes: ['заметки', 'комментарий', 'примечание', 'notes', 'comment'],
  location: ['место', 'location', 'адрес'],
  status: ['статус', 'status'],
};

export const CSV_TEMPLATE =
  'Дата;Начало;Конец;Дисциплина;Тип;Преподаватель;Корпус;Аудитория;Формат;Ссылка;Заметки\r\n' +
  '03.11.2026;09:00;10:30;Экономика организации;Лекция;Иванов Иван Иванович;Корпус 1;305;Очно;;\r\n' +
  '03.11.2026;10:40;12:10;Иностранный язык;Практика;;;;Дистанционно;https://example.com/room;Пример строки\r\n';

function normalizeHeader(value: string): string {
  return value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[\s_.\-()]/g, '');
}

export function detectDelimiter(firstLine: string): string {
  const candidates = [';', ',', '\t'];
  let best = ';';
  let bestCount = -1;
  for (const c of candidates) {
    let count = 0;
    let inQuotes = false;
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === c && !inQuotes) count += 1;
    }
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}

/** Разбор CSV по RFC 4180 (кавычки, удвоенные кавычки, переводы строк внутри кавычек). */
export function parseCsvRows(text: string, delimiter?: string): string[][] {
  const input = text.replace(/^﻿/, '');
  const firstLineEnd = input.search(/\r?\n/);
  const delim = delimiter ?? detectDelimiter(firstLineEnd >= 0 ? input.slice(0, firstLineEnd) : input);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

export function mapHeaders(header: string[]): Map<Column, number> {
  const map = new Map<Column, number>();
  header.forEach((raw, index) => {
    const normalized = normalizeHeader(raw);
    for (const [column, aliases] of Object.entries(ALIASES) as [Column, string[]][]) {
      if (!map.has(column) && aliases.includes(normalized)) {
        map.set(column, index);
        return;
      }
    }
  });
  return map;
}

/** «03.11.2026», «3.11.26», «2026-11-03» → '2026-11-03' */
export function parseCsvDate(value: string): DateKey | null {
  const v = value.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (m) {
    const key = `${m[1]}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}`;
    return isDateKey(key) ? key : null;
  }
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/.exec(v);
  if (m) {
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const key = `${year}-${pad2(Number(m[2]))}-${pad2(Number(m[1]))}`;
    return isDateKey(key) ? key : null;
  }
  return null;
}

/** «9:00», «09.00», «0900» → '09:00' */
export function normalizeTime(value: string): string | null {
  const v = value.trim().replace('.', ':');
  const m = /^(\d{1,2}):?(\d{2})$/.exec(v);
  if (!m) return null;
  const t = `${pad2(Number(m[1]))}:${m[2]}`;
  return parseTime(t) ? t : null;
}

export function splitTimeRange(value: string): { start: string; end: string } | null {
  const m = /^\s*(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})\s*$/.exec(value);
  if (!m) return null;
  const start = normalizeTime(m[1]!);
  const end = normalizeTime(m[2]!);
  return start && end ? { start, end } : null;
}

/** «1» → «Корпус 1»; полное название оставляем как есть. */
export function normalizeBuilding(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return /^\d+[А-Яа-яA-Za-z]?$/.test(v) ? `Корпус ${v}` : v;
}

const FORMAT_WORDS: [RegExp, ImportItem['format']][] = [
  [/смеш|гибрид|hybrid/i, 'hybrid'],
  [/дист|онлайн|online|remote/i, 'online'],
  [/оч|offline|ауд/i, 'offline'],
];

export function parseCsv(text: string, ctx: ParseContext): ParseResult {
  const rows = parseCsvRows(text);
  if (rows.length < 2) {
    return { items: [], warnings: ['В файле нет строк с занятиями'], skipped: 0 };
  }
  const header = rows[0] ?? [];
  const columns = mapHeaders(header);
  const missing: string[] = [];
  if (!columns.has('date')) missing.push('«Дата»');
  if (!columns.has('subject')) missing.push('«Дисциплина»');
  if (!columns.has('start') && !columns.has('time')) missing.push('«Начало» или «Время»');
  if (missing.length > 0) {
    return {
      items: [],
      warnings: [`Не найдены обязательные столбцы: ${missing.join(', ')}. Скачайте шаблон CSV в приложении.`],
      skipped: rows.length - 1,
    };
  }

  const cell = (row: string[], column: Column): string => {
    const index = columns.get(column);
    return index === undefined ? '' : (row[index] ?? '').trim();
  };

  const items: ImportItem[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  const seen = new Set<string>();

  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    const fail = (message: string) => {
      skipped += 1;
      if (warnings.length < 30) warnings.push(`Строка ${line}: ${message}`);
    };
    const date = parseCsvDate(cell(row, 'date'));
    if (!date) return fail('не распознана дата (ожидается ДД.ММ.ГГГГ)');
    let start = normalizeTime(cell(row, 'start'));
    let end = normalizeTime(cell(row, 'end'));
    if (!start || !end) {
      const range = splitTimeRange(cell(row, 'time') || cell(row, 'start'));
      if (range) {
        start = start ?? range.start;
        end = end ?? range.end;
      }
    }
    if (!start || !end) return fail('не указано время начала и окончания');
    const subjectRaw = cell(row, 'subject');
    if (!subjectRaw) return fail('не указана дисциплина');

    const startsAt = combineDateKeyAndTime(date, start, ctx.timeZone);
    const endsAt = combineDateKeyAndTime(date, end, ctx.timeZone);
    if (endsAt <= startsAt) return fail('время окончания раньше начала');

    const typeText = cell(row, 'type');
    const url = extractHttpsUrl(cell(row, 'url'));
    const locationText = cell(row, 'location');
    const parsedLocation = parseLocation(locationText);
    const formatText = cell(row, 'format');
    const format = FORMAT_WORDS.find(([re]) => re.test(formatText))?.[1] ?? detectFormat(locationText || null, url);
    const subject = cleanSubjectName(subjectRaw).slice(0, 200);
    const classType = detectClassType(typeText, typeText ? '' : subjectRaw);
    const statusText = cell(row, 'status');

    const externalId = `csv:${date}:${start}:${subject.toLocaleLowerCase('ru-RU')}:${classType}`;
    if (seen.has(externalId)) return fail('дубликат строки');
    seen.add(externalId);

    items.push({
      external_id: externalId,
      subject,
      class_type: classType,
      teacher: cell(row, 'teacher') || null,
      building: normalizeBuilding(cell(row, 'building')) ?? parsedLocation.building,
      room: cell(row, 'room') || parsedLocation.room,
      location: parsedLocation.rest,
      format,
      online_url: url,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: /отмен|cancel/i.test(statusText) ? 'cancelled' : 'scheduled',
      notes: cell(row, 'notes').slice(0, 2000) || null,
    });
  });

  return { items, warnings, skipped };
}
