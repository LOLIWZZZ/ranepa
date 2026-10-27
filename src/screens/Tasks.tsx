import { useMemo, useState } from 'react';

import { TaskCard } from '../components/cards';
import { MonthGrid } from '../components/dates';
import { SubjectPicker } from '../components/SubjectPicker';
import { useToday } from '../hooks';
import { isHttpsUrl, openExternal } from '../lib/platform';
import { useNav } from '../nav';
import {
  BUCKET_LABELS,
  bucketAssignments,
  countAssignments,
  deadlineInfo,
  displayStatus,
  filterAssignments,
  PRIORITY_LABELS,
  STATUS_LABELS,
  storedStatus,
  toggledStatus,
  type AssignmentStatusFilter,
} from '../shared/domain/assignments';
import { shiftMonth } from '../shared/domain/calendar';
import type { AssignmentStatus, PriorityLevel } from '../shared/domain/models';
import { addDaysToKey, combineDateKeyAndTime, formatDateTimeShort, formatDayMonth, formatTime, parseDateKey, startOfDayUtc, startOfWeekKey, toDateKey, type DateKey } from '../shared/domain/time';
import { deleteTask, saveTask, setTaskStatus } from '../store/actions';
import { useModel } from '../store/model';
import { DateInput, FormRow, TextArea, TextInput, TimeInput, Toggle } from '../ui/form';
import { Badge, Button, Card, Chip, ChipRow, Empty, IconButton, List, Row, Section, Segmented, SourceBadge } from '../ui/kit';
import { NavAction, Page, TabScreen } from '../ui/layout';
import { useOverlay } from '../ui/overlay';

const STATUS_CHIPS: { value: AssignmentStatusFilter; label: string }[] = [
  { value: 'open', label: 'Открытые' },
  { value: 'overdue', label: 'Просрочено' },
  { value: 'done', label: 'Выполнено' },
  { value: 'all', label: 'Все' },
];

export function TasksScreen() {
  const nav = useNav();
  const model = useModel();
  const { now, today, timeZone } = useToday();
  const [status, setStatus] = useState<AssignmentStatusFilter>('open');
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [day, setDay] = useState<DateKey | null>(null);
  const [month, setMonth] = useState(() => ({ year: parseDateKey(today).year, month: parseDateKey(today).month }));

  const items = model.assignments;
  const subjects = useMemo(() => {
    const ids = new Set(items.map((a) => a.subject_id).filter(Boolean));
    return model.data.subjects.filter((s) => ids.has(s.id)).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [items, model.data.subjects]);

  const filtered = useMemo(() => {
    const base = filterAssignments(items, { status: day ? 'all' : status, subjectId, query: search }, now);
    return day ? base.filter((a) => a.due_at && toDateKey(new Date(a.due_at), timeZone) === day) : base;
  }, [items, status, subjectId, search, now, day, timeZone]);

  const sections = useMemo(
    () => bucketAssignments(filtered, now, (iso) => toDateKey(new Date(iso), timeZone), today, addDaysToKey(startOfWeekKey(today), 6), addDaysToKey(today, 1)),
    [filtered, now, timeZone, today],
  );
  const counters = useMemo(() => countAssignments(items, now, startOfDayUtc(addDaysToKey(today, 1), timeZone)), [items, now, today, timeZone]);

  const marks = useMemo(() => {
    const map = new Map<DateKey, string[]>();
    for (const a of items) {
      if (!a.due_at) continue;
      const key = toDateKey(new Date(a.due_at), timeZone);
      const done = storedStatus(a) === 'done' || storedStatus(a) === 'submitted';
      map.set(key, [...(map.get(key) ?? []), done ? 'var(--success)' : (a.subject?.color ?? 'var(--accent)')]);
    }
    return map;
  }, [items, timeZone]);

  return (
    <TabScreen
      title="Задания"
      subtitle={`Открыто: ${counters.open}${counters.overdue > 0 ? ` · просрочено: ${counters.overdue}` : ''}`}
      actions={
        <>
          <IconButton icon="search" label="Поиск по заданиям" active={searchOpen} onClick={() => setSearchOpen((v) => !v)} />
          <IconButton icon="calendar" label="Календарь дедлайнов" active={calendarOpen} onClick={() => setCalendarOpen((v) => !v)} />
          <IconButton icon="plus" label="Новое задание" onClick={() => nav.push({ name: 'taskForm' })} />
        </>
      }
    >
      {searchOpen ? <TextInput label="Поиск" type="search" inputMode="search" value={search} onChange={setSearch} placeholder="Название, описание, дисциплина" autoFocus /> : null}
      {calendarOpen ? (
        <Card>
          <MonthGrid
            year={month.year}
            month={month.month}
            today={today}
            selected={day}
            onSelect={(d) => setDay((cur) => (cur === d ? null : d))}
            onPrev={() => setMonth((m) => shiftMonth(m.year, m.month, -1))}
            onNext={() => setMonth((m) => shiftMonth(m.year, m.month, 1))}
            marks={marks}
          />
          {day ? <p className="footnote center">Задания со сроком {formatDayMonth(day)}. Нажмите на день ещё раз, чтобы сбросить.</p> : null}
        </Card>
      ) : null}
      {!day ? (
        <ChipRow label="Статус">
          {STATUS_CHIPS.map((c) => (
            <Chip key={c.value} label={c.label} selected={status === c.value} onClick={() => setStatus(c.value)} />
          ))}
        </ChipRow>
      ) : null}
      {subjects.length > 0 ? (
        <ChipRow label="Дисциплина">
          <Chip label="Все дисциплины" selected={!subjectId} onClick={() => setSubjectId(null)} />
          {subjects.map((s) => (
            <Chip key={s.id} label={s.short_name ?? s.name} color={s.color} selected={subjectId === s.id} onClick={() => setSubjectId(subjectId === s.id ? null : s.id)} />
          ))}
        </ChipRow>
      ) : null}

      {items.length === 0 ? (
        <Empty
          icon="tasks"
          title="Заданий пока нет"
          text="Добавьте задание со сроком."
          action={{ label: 'Добавить задание', onClick: () => nav.push({ name: 'taskForm' }) }}
        />
      ) : sections.length === 0 ? (
        <Empty icon="search" title="Ничего не найдено" />
      ) : (
        sections.map((section) => (
          <Section key={section.bucket} title={`${BUCKET_LABELS[section.bucket]} · ${section.data.length}`}>
            {section.data.map((a) => (
              <TaskCard key={a.id} task={a} now={now} onClick={() => nav.push({ name: 'task', id: a.id })} onToggle={() => setTaskStatus(a.id, toggledStatus(storedStatus(a)))} />
            ))}
          </Section>
        ))
      )}
    </TabScreen>
  );
}

const STATUS_OPTIONS: { value: AssignmentStatus; label: string }[] = [
  { value: 'not_started', label: 'Не начато' },
  { value: 'in_progress', label: 'В процессе' },
  { value: 'submitted', label: 'Отправлено' },
  { value: 'done', label: 'Готово' },
];

export function TaskDetailScreen({ id }: { id: string }) {
  const nav = useNav();
  const model = useModel();
  const overlay = useOverlay();
  const { now, timeZone } = useToday();
  const task = model.assignments.find((a) => a.id === id);
  if (!task) {
    return (
      <Page title="Задание">
        <Empty icon="tasks" title="Задание не найдено" text="Возможно, его удалили." />
      </Page>
    );
  }
  const status = displayStatus(task, now);
  const info = deadlineInfo(task, now);
  const url = model.data.tasks.find((t) => t.id === id)?.url ?? null;

  return (
    <Page title="Задание" right={<NavAction label="Изменить" onClick={() => nav.push({ name: 'taskForm', id })} />}>
      <div className="detail-head" style={{ borderColor: task.subject?.color ?? 'var(--accent)' }}>
        <div className="badge-row">
          <Badge tone={status === 'overdue' ? 'danger' : status === 'done' || status === 'submitted' ? 'success' : 'primary'}>{STATUS_LABELS[status]}</Badge>
          {task.priority !== 'medium' ? <Badge tone={task.priority === 'high' ? 'accent' : 'neutral'} icon="flag">{`Приоритет: ${PRIORITY_LABELS[task.priority].toLowerCase()}`}</Badge> : null}
          <SourceBadge source={task.source} />
        </div>
        <h2 className="detail-title">{task.title}</h2>
        <p className="detail-sub">{task.due_at ? `Срок: ${formatDateTimeShort(new Date(task.due_at), timeZone, now)} · ${info.label.toLowerCase()}` : 'Без срока'}</p>
      </div>

      <Section title="Статус">
        <Segmented label="Статус задания" value={storedStatus(task)} onChange={(v) => setTaskStatus(id, v)} options={STATUS_OPTIONS} />
      </Section>

      <List>
        {task.subject ? <Row icon="book" title={task.subject.name} subtitle="Дисциплина" onClick={() => task.subject_id && nav.push({ name: 'subject', id: task.subject_id })} /> : null}
        {task.description ? <Row icon="file" title={<span className="pre-wrap">{task.description}</span>} subtitle="Описание" /> : null}
        {url ? <Row icon="link" title="Открыть материалы" subtitle={url} onClick={() => openExternal(url)} /> : null}
      </List>

      <Section>
        <Button
          variant="danger"
          icon="trash"
          full
          onClick={async () => {
            if (await overlay.confirm({ title: 'Удалить задание?', confirmLabel: 'Удалить', danger: true })) {
              deleteTask(id);
              overlay.toast('Задание удалено');
              nav.back();
            }
          }}
        >
          Удалить задание
        </Button>
      </Section>
    </Page>
  );
}

export function TaskFormScreen({ id, subjectId, date }: { id?: string; subjectId?: string; date?: DateKey }) {
  const nav = useNav();
  const model = useModel();
  const overlay = useOverlay();
  const { today, timeZone } = useToday();
  const existing = id ? model.data.tasks.find((t) => t.id === id) : undefined;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [subject, setSubject] = useState<string | null>(existing?.subject_id ?? subjectId ?? null);
  const [hasDeadline, setHasDeadline] = useState(existing ? existing.due_at !== null : true);
  const [day, setDay] = useState<DateKey>(existing?.due_at ? toDateKey(new Date(existing.due_at), timeZone) : (date ?? addDaysToKey(today, 1)));
  const [time, setTime] = useState(existing?.due_at ? formatTime(new Date(existing.due_at), timeZone) : '23:59');
  const [priority, setPriority] = useState<PriorityLevel>(existing?.priority ?? 'medium');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [url, setUrl] = useState(existing?.url ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = () => {
    const next: Record<string, string> = {};
    if (title.trim().length < 2) next.title = 'Введите название задания';
    if (hasDeadline && !day) next.day = 'Укажите дату';
    if (hasDeadline && !/^\d{2}:\d{2}$/.test(time)) next.time = 'Укажите время';
    if (url.trim() && !isHttpsUrl(url.trim())) next.url = 'Нужна ссылка, начинающаяся с https://';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const savedId = saveTask(existing?.id ?? null, {
      title: title.trim(),
      subject_id: subject,
      due_at: hasDeadline ? combineDateKeyAndTime(day, time, timeZone).toISOString() : null,
      priority,
      description: description.trim() || null,
      url: url.trim() || null,
    });
    overlay.toast(existing ? 'Задание сохранено' : 'Задание добавлено');
    if (existing) nav.back();
    else nav.replace({ name: 'task', id: savedId });
  };

  return (
    <Page title={existing ? 'Изменить задание' : 'Новое задание'} backLabel="Отмена" right={<NavAction label="Сохранить" onClick={save} />}>
      <div className="form">
        <TextInput label="Название" value={title} onChange={setTitle} placeholder="Например: эссе по теме 3" error={errors.title} autoFocus={!existing} />
        <SubjectPicker value={subject} onChange={setSubject} optional />
        <Toggle label="Есть срок сдачи" checked={hasDeadline} onChange={setHasDeadline} />
        {hasDeadline ? (
          <>
            <FormRow>
              <DateInput label="Дата" value={day} onChange={setDay} error={errors.day} />
              <TimeInput label="Время" value={time} onChange={setTime} error={errors.time} />
            </FormRow>
            <ChipRow label="Быстрый выбор срока">
              <Chip label="Сегодня" selected={day === today} onClick={() => setDay(today)} />
              <Chip label="Завтра" selected={day === addDaysToKey(today, 1)} onClick={() => setDay(addDaysToKey(today, 1))} />
              <Chip label="Через неделю" selected={day === addDaysToKey(today, 7)} onClick={() => setDay(addDaysToKey(today, 7))} />
            </ChipRow>
          </>
        ) : null}
        <p className="field-label">Приоритет</p>
        <Segmented
          label="Приоритет"
          value={priority}
          onChange={setPriority}
          options={[
            { value: 'low', label: 'Низкий' },
            { value: 'medium', label: 'Средний' },
            { value: 'high', label: 'Высокий' },
          ]}
        />
        <TextArea label="Описание" optional value={description} onChange={setDescription} placeholder="Что нужно сделать, требования к оформлению" rows={4} />
        <TextInput label="Ссылка на материалы" optional type="url" inputMode="url" value={url} onChange={setUrl} placeholder="https://" error={errors.url} />
      </div>
      <div className="form-actions">
        <Button full onClick={save} icon="check">
          {existing ? 'Сохранить' : 'Добавить задание'}
        </Button>
      </div>
    </Page>
  );
}
