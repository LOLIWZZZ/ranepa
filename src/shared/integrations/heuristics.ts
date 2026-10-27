/** Разбор свободного текста из файлов расписания: тип занятия, корпус/аудитория, преподаватель, ссылки. */

import type { ClassFormat, ClassType } from '../domain/models';

const TYPE_PATTERNS: [RegExp, ClassType][] = [
  [/лаб/i, 'lab'],
  [/лекц/i, 'lecture'],
  [/семин/i, 'seminar'],
  [/практ/i, 'practice'],
  [/консульт/i, 'consultation'],
  [/\blecture\b/i, 'lecture'],
  [/\bseminar\b/i, 'seminar'],
  [/\b(practice|practical|workshop)\b/i, 'practice'],
  [/\blab\b/i, 'lab'],
];

export function detectClassType(...texts: (string | null | undefined)[]): ClassType {
  const text = texts.filter(Boolean).join(' ');
  for (const [pattern, type] of TYPE_PATTERNS) {
    if (pattern.test(text)) return type;
  }
  return 'other';
}

/** Убирает из названия пометки типа занятия: «Экономика (лекция)», «Лекция: Право», «Право [сем.]». */
export function cleanSubjectName(summary: string): string {
  let s = summary.trim();
  s = s.replace(/[([{]\s*(лекц\S*|семин\S*|практ\S*|лаб\S*|консульт\S*|сем\.?|пр\.?|лк\.?)\s*[)\]}]/gi, '');
  s = s.replace(/^(лекция|семинар|практика|практическое занятие|лабораторная работа|консультация)\s*[:\-–—]\s*/i, '');
  s = s.replace(/\s*[\-–—:]\s*(лекция|семинар|практика|практическое занятие|лабораторная работа|консультация)$/i, '');
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s || summary.trim();
}

const URL_RE = /https:\/\/[^\s<>"')]+/i;

export function extractHttpsUrl(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    if (!t) continue;
    const m = URL_RE.exec(t);
    if (m) return m[0].replace(/[.,;]+$/, '');
  }
  return null;
}

const ONLINE_RE = /(онлайн|дистанц|zoom|teams|вебинар|webinar|webex|телемост|jazz|сферум|online)/i;

export function detectFormat(location: string | null, url: string | null): ClassFormat {
  const isOnline = ONLINE_RE.test(location ?? '') || (url !== null && !location);
  if (isOnline && location && !ONLINE_RE.test(location)) return 'hybrid';
  return isOnline ? 'online' : 'offline';
}

export interface ParsedLocation {
  building: string | null;
  room: string | null;
  rest: string | null;
}

/**
 * «Корпус 1, ауд. 305» → { building: 'Корпус 1', room: '305' }
 * «ауд. 4-12» → { room: '4-12' }; прочий текст сохраняется в rest.
 */
export function parseLocation(raw: string | null | undefined): ParsedLocation {
  if (!raw) return { building: null, room: null, rest: null };
  let text = raw.replace(URL_RE, '').trim();
  let room: string | null = null;
  let building: string | null = null;

  const roomMatch = /(?:ауд(?:итория)?|каб(?:инет)?|комн(?:ата)?|room)\.?\s*№?\s*([A-Za-zА-Яа-яЁё0-9][A-Za-zА-Яа-яЁё0-9\-/.]*)/i.exec(text);
  if (roomMatch?.[1]) {
    room = roomMatch[1].replace(/\.$/, '');
    text = text.replace(roomMatch[0], ' ');
  }
  const buildingMatch = /(?:корп(?:ус)?|к\.|здание|building)\s*\.?\s*№?\s*[«"]?([A-Za-zА-Яа-яЁё0-9][A-Za-zА-Яа-яЁё0-9\-/]*)[»"]?/i.exec(text);
  if (buildingMatch?.[1]) {
    building = `Корпус ${buildingMatch[1]}`;
    text = text.replace(buildingMatch[0], ' ');
  }
  const rest = text.replace(/[,;\s]+/g, ' ').trim();
  return { building, room, rest: rest.length > 0 ? rest : null };
}

/** «Преподаватель: Иванов И. И.» в описании → «Иванов И. И.» */
export function extractTeacher(description: string | null | undefined): string | null {
  if (!description) return null;
  const m = /(?:преподаватель|преп\.?|лектор|teacher|instructor)\s*[:\-–]\s*([^\n;]+)/i.exec(description);
  const name = m?.[1]?.trim();
  return name && name.length >= 2 ? name.slice(0, 160) : null;
}

/** Простой стабильный хеш строки (djb2) для идентификаторов без UID. */
export function stableHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
