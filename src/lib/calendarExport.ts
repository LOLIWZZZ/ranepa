/**
 * Экспорт в календарь (iCalendar, RFC 5545) с напоминаниями VALARM.
 * На iPhone веб-приложение без сервера не может само планировать уведомления, поэтому
 * напоминания ставятся через системный Календарь: он уведомит о паре или дедлайне вовремя.
 */
import { formatMoneyKopecks } from '../shared/domain/format';
import { EXAM_KIND_LABELS } from '../shared/domain/calendar';
import { isCompleted, storedStatus } from '../shared/domain/assignments';
import { summarizePlan } from '../shared/domain/payments';
import { CLASS_TYPE_SHORT, sessionLocation, sessionTeacherName } from '../shared/domain/schedule';
import { addDaysToKey, pad2, toDateKey, type DateKey } from '../shared/domain/time';
import { escapeText, foldLine } from '../shared/integrations/ics';
import type { Model } from '../store/model';
import type { Settings } from '../store/types';

export interface ExportOptions {
  classes: boolean;
  deadlines: boolean;
  exams: boolean;
  payments: boolean;
  events: boolean;
  /** Добавлять напоминания */
  alarms: boolean;
  calendarName: string;
}

function utc(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  );
}

function dateValue(key: DateKey): string {
  return key.replace(/-/g, '');
}

function alarm(minutesBefore: number, description: string): string[] {
  const m = Math.max(0, Math.round(minutesBefore));
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(description)}`, `TRIGGER:-PT${m}M`, 'END:VALARM'];
}

export interface ExportResult {
  ics: string;
  counts: { classes: number; deadlines: number; exams: number; payments: number; events: number };
}

export function buildCalendarExport(model: Model, settings: Settings, options: ExportOptions, now: Date, todayKey: DateKey): ExportResult {
  const stamp = utc(now);
  const counts = { classes: 0, deadlines: 0, exams: 0, payments: 0, events: 0 };
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RANEPA Student Web//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(options.calendarName)}`,
  ];
  const fromMs = now.getTime() - 60 * 60_000;

  if (options.classes) {
    for (const s of model.sessions) {
      if (s.status === 'cancelled' || Date.parse(s.ends_at) < fromMs) continue;
      const teacher = sessionTeacherName(s);
      const location = sessionLocation(s);
      const title = `${s.subject?.name ?? 'Занятие'} (${CLASS_TYPE_SHORT[s.class_type].toLowerCase()})`;
      const description = [teacher ? `Преподаватель: ${teacher}` : null, s.online_url ? `Подключение: ${s.online_url}` : null, s.notes]
        .filter(Boolean)
        .join('\n');
      lines.push('BEGIN:VEVENT', `UID:class-${s.id}@ranepa-student`, `DTSTAMP:${stamp}`, `DTSTART:${utc(new Date(s.starts_at))}`, `DTEND:${utc(new Date(s.ends_at))}`, `SUMMARY:${escapeText(title)}`);
      if (location) lines.push(`LOCATION:${escapeText(location)}`);
      if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
      if (s.online_url) lines.push(`URL:${s.online_url}`);
      if (options.alarms && settings.classReminderMinutes > 0) lines.push(...alarm(settings.classReminderMinutes, title));
      lines.push('END:VEVENT');
      counts.classes += 1;
    }
  }

  if (options.deadlines) {
    for (const a of model.assignments) {
      if (!a.due_at || isCompleted(storedStatus(a)) || Date.parse(a.due_at) < fromMs) continue;
      const due = new Date(a.due_at);
      const start = new Date(due.getTime() - 15 * 60_000);
      const title = `Срок: ${a.title}`;
      lines.push(
        'BEGIN:VEVENT',
        `UID:task-${a.id}@ranepa-student`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${utc(start)}`,
        `DTEND:${utc(due)}`,
        `SUMMARY:${escapeText(title)}`,
      );
      const description = [a.subject?.name ? `Дисциплина: ${a.subject.name}` : null, a.description].filter(Boolean).join('\n');
      if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
      if (options.alarms) {
        for (const minutes of [...settings.deadlineReminderMinutes].sort((x, y) => y - x)) {
          if (due.getTime() - minutes * 60_000 > now.getTime()) lines.push(...alarm(Math.max(0, minutes - 15), title));
        }
      }
      lines.push('END:VEVENT');
      counts.deadlines += 1;
    }
  }

  if (options.exams) {
    for (const e of model.exams) {
      if (Date.parse(e.starts_at) < fromMs) continue;
      const start = new Date(e.starts_at);
      const end = e.ends_at ? new Date(e.ends_at) : new Date(start.getTime() + 90 * 60_000);
      const title = `${EXAM_KIND_LABELS[e.kind]}: ${e.subject?.name ?? ''}`.trim();
      const location = sessionLocation(e);
      lines.push('BEGIN:VEVENT', `UID:exam-${e.id}@ranepa-student`, `DTSTAMP:${stamp}`, `DTSTART:${utc(start)}`, `DTEND:${utc(end)}`, `SUMMARY:${escapeText(title)}`);
      if (location) lines.push(`LOCATION:${escapeText(location)}`);
      if (e.notes) lines.push(`DESCRIPTION:${escapeText(e.notes)}`);
      if (options.alarms) {
        if (settings.examReminderDays > 0) lines.push(...alarm(settings.examReminderDays * 1440, title));
        lines.push(...alarm(60, title));
      }
      lines.push('END:VEVENT');
      counts.exams += 1;
    }
  }

  if (options.payments) {
    for (const p of model.plans) {
      const summary = summarizePlan(p, p.payments, todayKey);
      if (summary.status === 'paid' || p.due_date < todayKey) continue;
      const title = `Оплата: ${p.title}`;
      lines.push(
        'BEGIN:VEVENT',
        `UID:plan-${p.id}@ranepa-student`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${dateValue(p.due_date)}`,
        `DTEND;VALUE=DATE:${dateValue(addDaysToKey(p.due_date, 1))}`,
        `SUMMARY:${escapeText(title)}`,
        `DESCRIPTION:${escapeText(`Осталось оплатить: ${formatMoneyKopecks(summary.remainingKopecks)}`)}`,
      );
      if (options.alarms && settings.paymentReminderDays > 0) {
        // За N дней в час напоминаний: триггер отсчитывается от полуночи дня оплаты.
        lines.push(...alarm(settings.paymentReminderDays * 1440 - settings.reminderHour * 60, title));
      }
      lines.push('END:VEVENT');
      counts.payments += 1;
    }
  }

  if (options.events) {
    for (const e of model.events) {
      const start = new Date(e.starts_at);
      if ((e.ends_at ? Date.parse(e.ends_at) : start.getTime()) < fromMs) continue;
      lines.push('BEGIN:VEVENT', `UID:event-${e.id}@ranepa-student`, `DTSTAMP:${stamp}`);
      if (e.all_day) {
        const key = toDateKey(start, settings.timeZone);
        lines.push(`DTSTART;VALUE=DATE:${dateValue(key)}`, `DTEND;VALUE=DATE:${dateValue(addDaysToKey(key, 1))}`);
      } else {
        const end = e.ends_at ? new Date(e.ends_at) : new Date(start.getTime() + 60 * 60_000);
        lines.push(`DTSTART:${utc(start)}`, `DTEND:${utc(end)}`);
      }
      lines.push(`SUMMARY:${escapeText(e.title)}`);
      if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
      if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
      if (options.alarms && !e.all_day) lines.push(...alarm(30, e.title));
      lines.push('END:VEVENT');
      counts.events += 1;
    }
  }

  lines.push('END:VCALENDAR');
  return { ics: lines.map(foldLine).join('\r\n') + '\r\n', counts };
}
