/** Импорт расписания, экспорт в Календарь, резервная копия, хранение данных. */
import { useEffect, useMemo, useRef, useState } from 'react';

import { useToday } from '../hooks';
import { buildCalendarExport, type ExportOptions } from '../lib/calendarExport';
import { IS_PREVIEW } from '../lib/env';
import { fileStamp, openCalendarFile, readFileBytes, saveFile } from '../lib/files';
import { isIos, requestPersistentStorage, storageInfo, type StorageInfo } from '../lib/platform';
import { useNav } from '../nav';
import { pluralize } from '../shared/domain/format';
import { CLASS_TYPE_SHORT } from '../shared/domain/schedule';
import { formatDateTimeShort, formatDayMonth, toDateKey } from '../shared/domain/time';
import { CSV_TEMPLATE, parseCsv } from '../shared/integrations/csv';
import { decodeTextFile } from '../shared/integrations/encoding';
import { parseIcs } from '../shared/integrations/ics';
import type { ParseResult } from '../shared/integrations/types';
import { clearDemo, eraseAll, hasDemo, importClasses, isEmpty, undoImport } from '../store/actions';
import { seedDemo } from '../store/demo';
import { useModel } from '../store/model';
import { getData, normalizeData, replaceAll, update, useData } from '../store/store';
import { Toggle } from '../ui/form';
import { Icon } from '../ui/Icon';
import { Badge, Button, Card, List, Notice, Row, Section } from '../ui/kit';
import { Page } from '../ui/layout';
import { useOverlay } from '../ui/overlay';

// ─── Импорт ─────────────────────────────────────────────────────────────────

interface Preview {
  fileName: string;
  format: 'ics' | 'csv';
  encoding: string;
  result: ParseResult;
}

export function ImportScreen() {
  const nav = useNav();
  const data = useData();
  const overlay = useOverlay();
  const { now, timeZone } = useToday();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File) => {
    setError(null);
    setPreview(null);
    if (file.size > 5 * 1024 * 1024) return setError('Файл больше 5 МБ — это не похоже на расписание.');
    try {
      const { text, encoding } = decodeTextFile(await readFileBytes(file));
      const lower = file.name.toLowerCase();
      const isIcs = lower.endsWith('.ics') || lower.endsWith('.ical') || /BEGIN:VCALENDAR/i.test(text.slice(0, 2000));
      const ctx = { timeZone, now: new Date() };
      const result = isIcs ? parseIcs(text, ctx) : parseCsv(text, ctx);
      setPreview({ fileName: file.name, format: isIcs ? 'ics' : 'csv', encoding, result });
    } catch {
      setError('Не удалось прочитать файл. Проверьте, что это .ics или .csv.');
    }
  };

  const range = useMemo(() => {
    if (!preview || preview.result.items.length === 0) return null;
    const keys = preview.result.items.map((i) => toDateKey(new Date(i.starts_at), timeZone)).sort();
    return { from: keys[0] ?? '', to: keys[keys.length - 1] ?? '', subjects: new Set(preview.result.items.map((i) => i.subject.toLocaleLowerCase('ru-RU'))).size };
  }, [preview, timeZone]);

  const doImport = () => {
    if (!preview) return;
    const summary = importClasses(preview.result.items, preview.fileName, preview.format, preview.result.skipped);
    overlay.toast(`Добавлено: ${summary.created}, обновлено: ${summary.updated}`);
    setPreview(null);
    if (input.current) input.current.value = '';
  };

  return (
    <Page title="Импорт расписания">
      <Card>
        <p className="card-title">Файл расписания</p>
        <p className="muted-text">
          Подойдёт календарь <b>.ics</b> (экспорт из Google, Яндекс, Outlook или файл, который прислал староста) или таблица <b>.csv</b> из Excel. Повторный импорт того же файла обновит занятия, а не создаст дубли.
        </p>
        <input
          ref={input}
          id="import-file"
          type="file"
          accept=".ics,.ical,.csv,.txt,text/calendar,text/csv,text/plain"
          className="visually-hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
        <label htmlFor="import-file" className="btn btn-primary btn-full">
          <Icon name="upload" size={20} />
          <span>Выбрать файл</span>
        </label>
        {error ? <p className="form-error">{error}</p> : null}
      </Card>

      {preview ? (
        <Section title="Проверка перед импортом">
          <Card>
            <p className="card-title">{preview.fileName}</p>
            <p className="muted-text">
              {preview.format === 'ics' ? 'Календарь iCalendar' : `Таблица CSV, кодировка ${preview.encoding}`}
              {range ? ` · ${formatDayMonth(range.from)} – ${formatDayMonth(range.to)} · дисциплин: ${range.subjects}` : ''}
            </p>
            <div className="badge-row">
              <Badge tone={preview.result.items.length ? 'success' : 'danger'}>Найдено занятий: {preview.result.items.length}</Badge>
              {preview.result.skipped ? <Badge tone="warning">Пропущено: {preview.result.skipped}</Badge> : null}
            </div>
            {preview.result.warnings.length ? (
              <ul className="warnings">
                {preview.result.warnings.slice(0, 6).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </Card>
          {preview.result.items.length ? (
            <>
              <List>
                {preview.result.items.slice(0, 8).map((i) => (
                  <Row
                    key={i.external_id}
                    title={i.subject}
                    subtitle={[formatDateTimeShort(new Date(i.starts_at), timeZone, now), CLASS_TYPE_SHORT[i.class_type], i.room ? `ауд. ${i.room}` : i.location, i.status === 'cancelled' ? 'отменено' : null]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                ))}
              </List>
              {preview.result.items.length > 8 ? <p className="footnote">и ещё {pluralize(preview.result.items.length - 8, ['занятие', 'занятия', 'занятий'])}</p> : null}
              <Button full icon="check" onClick={doImport}>
                Импортировать {pluralize(preview.result.items.length, ['занятие', 'занятия', 'занятий'])}
              </Button>
            </>
          ) : null}
        </Section>
      ) : null}

      {data.imports.length ? (
        <Section title="История импорта" footnote="Отмена удалит занятия, добавленные этим импортом. Обновлённые занятия останутся.">
          <List>
            {data.imports.map((imp) => (
              <Row
                key={imp.id}
                icon="file"
                title={imp.file_name}
                subtitle={`${formatDateTimeShort(new Date(imp.created_at), timeZone, now)} · добавлено ${imp.created}, обновлено ${imp.updated}`}
                right={
                  <button
                    type="button"
                    className="link-btn"
                    onClick={async () => {
                      if (await overlay.confirm({ title: 'Отменить импорт?', message: `Будут удалены занятия из файла «${imp.file_name}», добавленные при этом импорте.`, confirmLabel: 'Отменить импорт', danger: true })) {
                        const n = undoImport(imp.id);
                        overlay.toast(`Удалено занятий: ${n}`);
                      }
                    }}
                  >
                    Отменить
                  </button>
                }
              />
            ))}
          </List>
        </Section>
      ) : null}

      <Section title="Таблица CSV">
        <Card>
          <p className="muted-text">
            Столбцы: Дата; Начало; Конец; Дисциплина; Тип; Преподаватель; Корпус; Аудитория; Формат; Ссылка; Заметки. Обязательны дата, начало и дисциплина. Разделитель — точка с запятой или запятая, кодировка UTF-8 или Windows-1251.
          </p>
          <Button variant="secondary" icon="download" full disabled={IS_PREVIEW} onClick={() => void saveFile('raspisanie-shablon.csv', 'text/csv;charset=utf-8', `﻿${CSV_TEMPLATE}`, true)}>
            Скачать шаблон CSV
          </Button>
        </Card>
      </Section>

      <Section title="Расписание от старосты">
        <Card>
          <p className="muted-text">
            Староста может заполнить расписание у себя и отправить файл в чат группы: «Ещё» → «Календарь iPhone и резервная копия» → «Отправить расписание группе». Остальным достаточно открыть этот экран и выбрать полученный файл.
          </p>
          <Button variant="ghost" onClick={() => nav.push({ name: 'export' })}>
            Перейти к отправке расписания
          </Button>
        </Card>
      </Section>
      <p className="footnote">Официальной выгрузки расписания РАНХиГС в открытом доступе нет, поэтому приложение не загружает его автоматически.</p>
    </Page>
  );
}

// ─── Экспорт и резервная копия ──────────────────────────────────────────────

export function ExportScreen() {
  const nav = useNav();
  const model = useModel();
  const overlay = useOverlay();
  const { now, today } = useToday();
  const settings = model.data.settings;
  const restoreInput = useRef<HTMLInputElement>(null);
  const [opts, setOpts] = useState<Omit<ExportOptions, 'calendarName'>>({ classes: true, deadlines: true, exams: true, payments: true, events: true, alarms: true });

  const result = useMemo(() => buildCalendarExport(model, settings, { ...opts, calendarName: 'RANEPA Student' }, now, today), [model, settings, opts, now, today]);
  const total = Object.values(result.counts).reduce((a, b) => a + b, 0);

  const shareSchedule = async () => {
    const r = buildCalendarExport(model, settings, { classes: true, deadlines: false, exams: true, payments: false, events: false, alarms: false, calendarName: settings.group ? `Расписание ${settings.group}` : 'Расписание группы' }, now, today);
    if (r.counts.classes + r.counts.exams === 0) return overlay.toast('В расписании нет будущих занятий', 'error');
    const res = await saveFile(`raspisanie${settings.group ? `-${settings.group.replace(/[^\p{L}\p{N}-]+/gu, '')}` : ''}-${fileStamp()}.ics`, 'text/calendar;charset=utf-8', r.ics);
    if (res !== 'cancelled') overlay.toast('Файл расписания готов');
  };

  const backup = async () => {
    const payload = { app: 'ranepa-student', kind: 'backup', exported_at: new Date().toISOString(), data: getData() };
    const res = await saveFile(`ranepa-student-kopiya-${fileStamp()}.json`, 'application/json', JSON.stringify(payload, null, 1));
    if (res !== 'cancelled') {
      update((d) => ({ ...d, lastBackupAt: new Date().toISOString() }));
      overlay.toast('Резервная копия сохранена');
    }
  };

  const restore = async (file: File) => {
    try {
      const text = decodeTextFile(await readFileBytes(file)).text;
      const parsed: unknown = JSON.parse(text);
      const raw = typeof parsed === 'object' && parsed !== null && 'data' in parsed ? (parsed as { data: unknown }).data : parsed;
      const data = normalizeData(raw);
      if (!data) return overlay.toast('Это не резервная копия RANEPA Student', 'error');
      const counts = `${data.classes.length} занятий, ${data.tasks.length} заданий, ${data.grades.length} оценок`;
      if (await overlay.confirm({ title: 'Восстановить из копии?', message: `В копии: ${counts}. Текущие данные на этом устройстве будут заменены.`, confirmLabel: 'Заменить данные', danger: true })) {
        replaceAll({ ...data, settings: { ...data.settings, onboarded: true } });
        overlay.toast('Данные восстановлены');
        nav.reset('home');
      }
    } catch {
      overlay.toast('Не удалось прочитать файл копии', 'error');
    } finally {
      if (restoreInput.current) restoreInput.current.value = '';
    }
  };

  return (
    <Page title="Календарь и копия">
      {IS_PREVIEW ? (
        <Notice tone="warning" icon="info" title="В предпросмотре файлы не сохраняются" />
      ) : null}
      <Section title="Календарь iPhone">
        <Card>
          <p className="muted-text">Напоминания о парах и сроках придут из Календаря.</p>
          <Toggle label="Пары" hint={String(result.counts.classes)} checked={opts.classes} onChange={(v) => setOpts((o) => ({ ...o, classes: v }))} />
          <Toggle label="Дедлайны" hint={String(result.counts.deadlines)} checked={opts.deadlines} onChange={(v) => setOpts((o) => ({ ...o, deadlines: v }))} />
          <Toggle label="Сессия" hint={String(result.counts.exams)} checked={opts.exams} onChange={(v) => setOpts((o) => ({ ...o, exams: v }))} />
          <Toggle label="Оплата" hint={String(result.counts.payments)} checked={opts.payments} onChange={(v) => setOpts((o) => ({ ...o, payments: v }))} />
          <Toggle label="Личные события" hint={String(result.counts.events)} checked={opts.events} onChange={(v) => setOpts((o) => ({ ...o, events: v }))} />
          <Toggle label="С напоминаниями" checked={opts.alarms} onChange={(v) => setOpts((o) => ({ ...o, alarms: v }))} />
          <div className="stack">
            <Button full icon="calendar" disabled={IS_PREVIEW || total === 0} onClick={() => openCalendarFile(result.ics)}>
              Добавить в Календарь ({total})
            </Button>
            <Button full variant="secondary" icon="share" disabled={IS_PREVIEW || total === 0} onClick={() => void saveFile(`ranepa-student-${fileStamp()}.ics`, 'text/calendar;charset=utf-8', result.ics)}>
              Файл .ics
            </Button>
          </div>
          <details className="formula">
            <summary>Если события не добавились</summary>
            <p>
              {isIos() ? 'Сохраните файл в «Файлы», откройте его и нажмите «Добавить все». ' : 'Откройте файл в приложении календаря. '}
              При повторном добавлении события могут задвоиться.
            </p>
          </details>
        </Card>
      </Section>

      <Section title="Группе">
        <Card>
          <p className="muted-text">Только пары и экзамены — без ваших оценок и заданий.</p>
          <Button full variant="secondary" icon="users" disabled={IS_PREVIEW} onClick={() => void shareSchedule()}>
            Отправить расписание
          </Button>
        </Card>
      </Section>

      <Section title="Резервная копия" footnote={model.data.lastBackupAt ? `Последняя копия: ${formatDateTimeShort(new Date(model.data.lastBackupAt), settings.timeZone, now)}` : 'Копию ещё не делали.'}>
        <Card>
          <p className="muted-text">Данные хранятся только на этом телефоне.</p>
          <div className="stack">
            <Button full icon="download" disabled={IS_PREVIEW} onClick={() => void backup()}>
              Сохранить копию
            </Button>
            <input
              ref={restoreInput}
              id="restore-file"
              type="file"
              accept=".json,application/json"
              className="visually-hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void restore(f);
              }}
            />
            <label htmlFor="restore-file" className="btn btn-secondary btn-full">
              <Icon name="upload" size={20} />
              <span>Восстановить из копии</span>
            </label>
          </div>
        </Card>
      </Section>
    </Page>
  );
}

// ─── Хранение данных ────────────────────────────────────────────────────────

export function DataScreen() {
  const nav = useNav();
  const data = useData();
  const overlay = useOverlay();
  const { timeZone } = useToday();
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    void storageInfo().then(setInfo);
  }, []);

  const demo = hasDemo(data);

  return (
    <Page title="Хранение данных">
      <Card>
        <p className="card-title">Где хранятся данные</p>
        <p className="muted-text">Только в памяти этого браузера на этом устройстве. Никуда не отправляются, аккаунт не нужен. Если удалить приложение с экрана «Домой» или очистить данные Safari, записи пропадут — делайте резервную копию.</p>
        <List>
          <Row
            icon="data"
            title="Защита от автоматической очистки"
            subtitle={info?.persisted === true ? 'Включена' : info?.persisted === false ? 'Не подтверждена браузером' : 'Браузер не сообщает'}
            right={
              info?.persisted ? undefined : (
                <button
                  type="button"
                  className="link-btn"
                  onClick={async () => {
                    const ok = await requestPersistentStorage();
                    setInfo(await storageInfo());
                    overlay.toast(ok ? 'Браузер сохранит данные' : 'Браузер не подтвердил запрос', ok ? 'default' : 'error');
                  }}
                >
                  Запросить
                </button>
              )
            }
          />
          <Row icon="file" title="Записей" value={String(data.classes.length + data.tasks.length + data.attendance.length + data.grades.length + data.exams.length + data.plans.length + data.payments.length + data.events.length)} />
          {info?.usageBytes !== null && info?.usageBytes !== undefined ? <Row icon="layers" title="Занято" value={`${Math.max(1, Math.round(info.usageBytes / 1024))} КБ`} /> : null}
        </List>
        <Button variant="secondary" full icon="download" onClick={() => nav.push({ name: 'export' })}>
          Резервная копия
        </Button>
      </Card>

      <Section title="Демо-данные">
        <Card>
          <p className="muted-text">Вымышленные пары, задания, оценки и платежи с пометкой «Демо», чтобы посмотреть приложение в работе. Удаляются одной кнопкой и не затрагивают ваши записи.</p>
          {demo ? (
            <Button
              full
              variant="secondary"
              onClick={() => {
                clearDemo();
                overlay.toast('Демо-данные удалены');
              }}
            >
              Удалить демо-данные
            </Button>
          ) : (
            <Button
              full
              variant="secondary"
              icon="plus"
              onClick={() => {
                seedDemo(timeZone);
                overlay.toast('Демо-данные добавлены');
                nav.reset('home');
              }}
            >
              Добавить демо-данные
            </Button>
          )}
        </Card>
      </Section>

      {!isEmpty(data) ? (
        <Section title="Удалить всё">
          <Card>
            <p className="muted-text">Удалит расписание, задания, оценки, посещаемость и платежи с этого устройства. Настройки профиля останутся. Действие нельзя отменить.</p>
            <label className="field-label" htmlFor="erase-confirm">
              Введите УДАЛИТЬ для подтверждения
            </label>
            <input id="erase-confirm" className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoCapitalize="characters" autoComplete="off" />
            <Button
              full
              variant="danger"
              icon="trash"
              disabled={confirmText.trim().toUpperCase() !== 'УДАЛИТЬ'}
              onClick={() => {
                eraseAll();
                setConfirmText('');
                overlay.toast('Все записи удалены');
                nav.reset('home');
              }}
            >
              Удалить все записи
            </Button>
          </Card>
        </Section>
      ) : null}

      <Notice tone="neutral" icon="info">
        Приложению не нужен логин от университета: оно не подключается к системам РАНХиГС и не запрашивает ваши учётные данные.
      </Notice>
    </Page>
  );
}
