/**
 * Локальное хранилище: состояние в памяти + сохранение в localStorage.
 * Подписка компонентов — через useSyncExternalStore.
 */
import { useSyncExternalStore } from 'react';

import { DEFAULT_SETTINGS, emptyData, type AppData, type Settings } from './types';

const STORAGE_KEY = 'ranepa-student:data:v1';

// Инициализируется в конце модуля, после объявления констант проверки структуры.
let state: AppData;
let saveError: string | null = null;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function load(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    return normalizeData(JSON.parse(raw)) ?? emptyData();
  } catch {
    return emptyData();
  }
}

function persist(): void {
  saveTimer = null;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (saveError) {
      saveError = null;
      emit();
    }
  } catch (error) {
    saveError =
      error instanceof DOMException && error.name === 'QuotaExceededError'
        ? 'На устройстве закончилось место для данных приложения. Удалите старые записи или сделайте резервную копию.'
        : 'Не удалось сохранить изменения на устройстве. Проверьте, что Safari не в режиме «Частный доступ».';
    emit();
  }
}

function emit(): void {
  for (const l of listeners) l();
}

export function getData(): AppData {
  return state;
}

export function update(mutator: (data: AppData) => AppData): void {
  state = mutator(state);
  emit();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 120);
}

export function replaceAll(data: AppData): void {
  update(() => data);
}

/** Немедленно записать отложенные изменения (при сворачивании приложения). */
export function flush(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    persist();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useData(): AppData {
  return useSyncExternalStore(subscribe, getData, getData);
}

export function useSaveError(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => saveError,
    () => saveError,
  );
}

export function updateSettings(patch: Partial<Settings>): void {
  update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
}

// ─── Проверка структуры (загрузка и восстановление из резервной копии) ─────────

const COLLECTIONS = ['teachers', 'subjects', 'classes', 'tasks', 'attendance', 'grades', 'exams', 'plans', 'payments', 'events', 'imports'] as const;

const REQUIRED_FIELDS: Record<(typeof COLLECTIONS)[number], string[]> = {
  teachers: ['id', 'name'],
  subjects: ['id', 'name'],
  classes: ['id', 'subject_id', 'starts_at', 'ends_at'],
  tasks: ['id', 'title'],
  attendance: ['id', 'occurred_on', 'status'],
  grades: ['id', 'title'],
  exams: ['id', 'subject_id', 'starts_at'],
  plans: ['id', 'title', 'due_date'],
  payments: ['id', 'plan_id', 'paid_on'],
  events: ['id', 'title', 'starts_at'],
  imports: ['id', 'file_name'],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Возвращает данные в актуальном формате или null, если это не данные приложения. */
export function normalizeData(raw: unknown): AppData | null {
  if (!isRecord(raw) || raw.version !== 1) return null;
  const base = emptyData();
  const settings = isRecord(raw.settings) ? raw.settings : {};
  const result: AppData = {
    ...base,
    settings: { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings>) },
    lastBackupAt: typeof raw.lastBackupAt === 'string' ? raw.lastBackupAt : null,
  };
  for (const key of COLLECTIONS) {
    const list = raw[key];
    if (list === undefined) continue;
    if (!Array.isArray(list)) return null;
    const fields = REQUIRED_FIELDS[key];
    const valid = list.filter((item) => isRecord(item) && fields.every((f) => typeof item[f] === 'string' && item[f] !== ''));
    (result as unknown as Record<string, unknown[]>)[key] = valid;
  }
  return migrate(result);
}

/**
 * Перевод данных прежнего формата: у дисциплины было одно текстовое поле «teacher»,
 * теперь — справочник преподавателей и ссылки teacher_ids. Занятиям добавляется teacher_id.
 */
function migrate(data: AppData): AppData {
  const teachers = [...data.teachers];
  const byName = new Map(teachers.map((t) => [t.name.trim().toLocaleLowerCase('ru-RU'), t.id]));
  const teacherIdFor = (name: string, source: AppData['subjects'][number]['source']): string => {
    const key = name.trim().toLocaleLowerCase('ru-RU');
    const found = byName.get(key);
    if (found) return found;
    const id = newId();
    teachers.push({ id, name: name.trim(), notes: null, source, created_at: new Date().toISOString() });
    byName.set(key, id);
    return id;
  };
  const subjects = data.subjects.map((s) => {
    const legacy = (s as unknown as { teacher?: unknown }).teacher;
    let ids = Array.isArray(s.teacher_ids) ? s.teacher_ids.filter((id) => typeof id === 'string') : [];
    if (ids.length === 0 && typeof legacy === 'string' && legacy.trim()) ids = [teacherIdFor(legacy, s.source)];
    const { teacher: _drop, ...rest } = s as typeof s & { teacher?: unknown };
    void _drop;
    return { ...rest, teacher_ids: ids.slice(0, 2) };
  });
  const teacherIds = new Set(teachers.map((t) => t.id));
  return {
    ...data,
    teachers,
    subjects: subjects.map((s) => ({ ...s, teacher_ids: s.teacher_ids.filter((id) => teacherIds.has(id)) })),
    classes: data.classes.map((c) => ({ ...c, teacher_id: c.teacher_id && teacherIds.has(c.teacher_id) ? c.teacher_id : null, teacher: c.teacher ?? null })),
  };
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

state = load();
