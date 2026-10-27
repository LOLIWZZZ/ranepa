/**
 * Общий формат занятий, получаемых из любого источника (файл ICS/CSV, будущий официальный коннектор).
 * Совпадает с элементами массива p_items серверной функции import_schedule().
 */
import type { ClassFormat, ClassType } from '../domain/models';

export interface ImportItem {
  /** Стабильный идентификатор занятия в источнике — повторный импорт обновляет, а не дублирует */
  external_id: string;
  subject: string;
  class_type: ClassType;
  teacher: string | null;
  building: string | null;
  room: string | null;
  location: string | null;
  format: ClassFormat;
  online_url: string | null;
  starts_at: string;
  ends_at: string;
  status: 'scheduled' | 'cancelled';
  notes: string | null;
}

export interface ParseResult {
  items: ImportItem[];
  warnings: string[];
  /** Сколько записей источника не удалось разобрать */
  skipped: number;
}

export interface ParseContext {
  /** Часовой пояс для времени без указания пояса */
  timeZone: string;
  now: Date;
}

export type ProviderAvailability = { available: true } | { available: false; reason: string };

/**
 * Модуль-провайдер источника расписания. Новые источники (например, официальное API РАНХиГС,
 * если оно появится) подключаются реализацией этого интерфейса без изменения остального кода.
 */
export interface ScheduleProvider {
  id: string;
  title: string;
  description: string;
  kind: 'file' | 'server';
  /** MIME-типы и расширения для выбора файла */
  fileTypes?: string[];
  availability: ProviderAvailability;
  parse?: (content: string, ctx: ParseContext) => ParseResult;
}
