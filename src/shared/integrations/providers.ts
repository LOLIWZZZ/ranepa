/**
 * Реестр источников расписания.
 *
 * Сейчас доступны файловые провайдеры (ICS и CSV). Официальный источник РАНХиГС описан как
 * недоступный: документированного публичного API нет (см. docs/DATA_SOURCES.md). Когда университет
 * предоставит API или выгрузку, серверный коннектор вызовет import_schedule(..., p_source => 'official')
 * с ключом service_role, а здесь достаточно изменить availability и описание.
 */
import { parseCsv } from './csv';
import { parseIcs } from './ics';
import type { ScheduleProvider } from './types';

export const icsProvider: ScheduleProvider = {
  id: 'ics-file',
  title: 'Файл календаря (.ics)',
  description: 'Экспорт из Outlook, Google Календаря, Яндекс Календаря или системы расписания.',
  kind: 'file',
  fileTypes: ['text/calendar', 'application/ics', 'text/x-vcalendar', '*/*'],
  availability: { available: true },
  parse: parseIcs,
};

export const csvProvider: ScheduleProvider = {
  id: 'csv-file',
  title: 'Таблица (.csv)',
  description: 'Excel или Google Таблицы, сохранённые в CSV. Подойдёт шаблон из приложения.',
  kind: 'file',
  fileTypes: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain', '*/*'],
  availability: { available: true },
  parse: parseCsv,
};

export const officialRanepaProvider: ScheduleProvider = {
  id: 'ranepa-official',
  title: 'Официальная система РАНХиГС',
  description: 'Автоматическая загрузка расписания, оценок и платежей из систем университета.',
  kind: 'server',
  availability: {
    available: false,
    reason:
      'Публичный документированный API РАНХиГС не найден. Интеграция будет подключена на сервере, ' +
      'когда университет предоставит официальный доступ. Сейчас используйте импорт файла или ручной ввод.',
  },
};

export const scheduleProviders: readonly ScheduleProvider[] = [icsProvider, csvProvider, officialRanepaProvider];

export function providerForFileName(fileName: string): ScheduleProvider | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.ics') || lower.endsWith('.ical') || lower.endsWith('.ifb')) return icsProvider;
  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) return csvProvider;
  return null;
}

/** Определение формата по содержимому, если расширение не помогло. */
export function providerForContent(content: string): ScheduleProvider {
  return /BEGIN:VCALENDAR/i.test(content.slice(0, 2000)) ? icsProvider : csvProvider;
}
