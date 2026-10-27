import { useMemo, useState } from 'react';

import { CalendarItemRow, KIND_STYLE } from '../components/cards';
import { MonthGrid } from '../components/dates';
import { useToday } from '../hooks';
import { isHttpsUrl, openExternal } from '../lib/platform';
import { useNav, type Route } from '../nav';
import { buildCalendarItems, itemsByDay, kindsForDay, shiftMonth, type CalendarItem, type CalendarItemKind } from '../shared/domain/calendar';
import { addDaysToKey, combineDateKeyAndTime, formatDateTimeShort, formatDayMonth, formatTime, formatWeekdayDayMonth, parseDateKey, startOfWeekKey, toDateKey, type DateKey } from '../shared/domain/time';
import { deleteEvent, saveEvent } from '../store/actions';
import { useModel } from '../store/model';
import { newId } from '../store/store';
import { DateInput, FormError, FormRow, TextArea, TextInput, TimeInput, Toggle } from '../ui/form';
import { Icon } from '../ui/Icon';
import { Button, Chip, ChipRow, Empty, IconButton, List, Row, Section, Segmented, SourceBadge } from '../ui/kit';
import { NavAction, Page, TabScreen } from '../ui/layout';
import { useOverlay } from '../ui/overlay';

type Filter = 'class' | 'assignment' | 'exam' | 'payment' | 'personal';

const FILTERS: { value: Filter; label: string; kinds: CalendarItemKind[] }[] = [
  { value: 'class', label: 'Пары', kinds: ['class'] },
  { value: 'assignment', label: 'Дедлайны', kinds: ['assignment'] },
  { value: 'exam', label: 'Сессия', kinds: ['exam', 'credit', 'consultation'] },
  { value: 'payment', label: 'Оплата', kinds: ['payment'] },
  { value: 'personal', label: 'Личные', kinds: ['personal', 'group', 'university'] },
];

export function routeForItem(item: CalendarItem): Route {
  switch (item.kind) {
    case 'class':
      return { name: 'class', id: item.entityId };
    case 'assignment':
      return { name: 'task', id: item.entityId };
    case 'exam':
    case 'credit':
    case 'consultation':
      return { name: 'examForm', id: item.entityId };
    case 'payment':
      return { name: 'payments' };
    default:
      return { name: 'event', id: item.entityId };
  }
}

export function CalendarScreen() {
  const nav = useNav();
  const model = useModel();
  const { today, timeZone } = useToday();
  const [mode, setMode] = useState<'month' | 'week' | 'day'>('month');
  const [selected, setSelected] = useState<DateKey>(today);
  const [month, setMonth] = useState(() => ({ year: parseDateKey(today).year, month: parseDateKey(today).month }));
  const [hidden, setHidden] = useState<Set<Filter>>(new Set());

  const all = useMemo(
    () => buildCalendarItems({ sessions: model.sessions, assignments: model.assignments, exams: model.exams, plans: model.plans, events: model.events }, timeZone, today),
    [model, timeZone, today],
  );
  const hiddenKinds = useMemo(() => new Set(FILTERS.filter((f) => hidden.has(f.value)).flatMap((f) => f.kinds)), [hidden]);
  const items = useMemo(() => all.filter((i) => !hiddenKinds.has(i.kind)), [all, hiddenKinds]);
  const byDay = useMemo(() => itemsByDay(items), [items]);
  const marks = useMemo(() => {
    const map = new Map<DateKey, string[]>();
    for (const [day, list] of byDay) map.set(day, kindsForDay(list).map((k) => KIND_STYLE[k].color));
    return map;
  }, [byDay]);

  const select = (d: DateKey) => {
    setSelected(d);
    const p = parseDateKey(d);
    setMonth({ year: p.year, month: p.month });
  };

  const agenda = (day: DateKey) => {
    const list = byDay.get(day) ?? [];
    return list.length === 0 ? (
      <p className="muted-text small">Ничего не запланировано</p>
    ) : (
      <div className="list">
        {list.map((i) => (
          <CalendarItemRow key={i.key} item={i} onClick={() => nav.push(routeForItem(i))} />
        ))}
      </div>
    );
  };

  const weekStart = startOfWeekKey(selected);

  return (
    <TabScreen title="Календарь" actions={<IconButton icon="plus" label="Новое событие" onClick={() => nav.push({ name: 'eventForm', date: selected })} />}>
      <Segmented
        label="Вид календаря"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'month', label: 'Месяц' },
          { value: 'week', label: 'Неделя' },
          { value: 'day', label: 'День' },
        ]}
      />
      <ChipRow label="Показывать">
        {FILTERS.map((f) => (
          <Chip
            key={f.value}
            label={f.label}
            color={KIND_STYLE[f.kinds[0] ?? 'class'].color}
            selected={!hidden.has(f.value)}
            onClick={() =>
              setHidden((h) => {
                const next = new Set(h);
                if (next.has(f.value)) next.delete(f.value);
                else next.add(f.value);
                return next;
              })
            }
          />
        ))}
      </ChipRow>

      {mode === 'month' ? (
        <>
          <div className="card">
            <MonthGrid
              year={month.year}
              month={month.month}
              today={today}
              selected={selected}
              onSelect={select}
              onPrev={() => setMonth((m) => shiftMonth(m.year, m.month, -1))}
              onNext={() => setMonth((m) => shiftMonth(m.year, m.month, 1))}
              marks={marks}
            />
          </div>
          <Section title={selected === today ? `Сегодня, ${formatDayMonth(selected)}` : formatWeekdayDayMonth(selected)}>{agenda(selected)}</Section>
        </>
      ) : mode === 'week' ? (
        <>
          <div className="range-head">
            <button type="button" className="week-arrow" onClick={() => select(addDaysToKey(selected, -7))} aria-label="Предыдущая неделя">
              <Icon name="back" size={20} />
            </button>
            <p className="month-title">
              {formatDayMonth(weekStart)} – {formatDayMonth(addDaysToKey(weekStart, 6))}
            </p>
            <button type="button" className="week-arrow" onClick={() => select(addDaysToKey(selected, 7))} aria-label="Следующая неделя">
              <Icon name="forward" size={20} />
            </button>
          </div>
          {Array.from({ length: 7 }, (_, i) => addDaysToKey(weekStart, i)).map((d) => (
            <Section key={d} title={d === today ? `Сегодня, ${formatDayMonth(d)}` : formatWeekdayDayMonth(d)}>
              {agenda(d)}
            </Section>
          ))}
        </>
      ) : (
        <>
          <div className="range-head">
            <button type="button" className="week-arrow" onClick={() => select(addDaysToKey(selected, -1))} aria-label="Предыдущий день">
              <Icon name="back" size={20} />
            </button>
            <p className="month-title">{selected === today ? `Сегодня, ${formatDayMonth(selected)}` : formatWeekdayDayMonth(selected)}</p>
            <button type="button" className="week-arrow" onClick={() => select(addDaysToKey(selected, 1))} aria-label="Следующий день">
              <Icon name="forward" size={20} />
            </button>
          </div>
          {selected !== today ? (
            <div className="center">
              <button type="button" className="link-btn" onClick={() => select(today)}>
                К сегодняшнему дню
              </button>
            </div>
          ) : null}
          {agenda(selected)}
        </>
      )}
    </TabScreen>
  );
}

export function EventDetailScreen({ id }: { id: string }) {
  const nav = useNav();
  const model = useModel();
  const overlay = useOverlay();
  const { now, timeZone } = useToday();
  const e = model.data.events.find((x) => x.id === id);
  if (!e) {
    return (
      <Page title="Событие">
        <Empty icon="calendar" title="Событие не найдено" />
      </Page>
    );
  }
  const start = new Date(e.starts_at);
  const day = toDateKey(start, timeZone);
  return (
    <Page title="Событие" right={<NavAction label="Изменить" onClick={() => nav.push({ name: 'eventForm', id })} />}>
      <div className="detail-head" style={{ borderColor: 'var(--green)' }}>
        <div className="badge-row">
          <SourceBadge source={e.source} />
        </div>
        <h2 className="detail-title">{e.title}</h2>
        <p className="detail-sub">
          {e.all_day ? `${formatWeekdayDayMonth(day)}, весь день` : `${formatDateTimeShort(start, timeZone, now)}${e.ends_at ? `–${formatTime(new Date(e.ends_at), timeZone)}` : ''}`}
        </p>
      </div>
      <List>
        {e.location ? <Row icon="pin" title={e.location} subtitle="Место" /> : null}
        {e.description ? <Row icon="file" title={<span className="pre-wrap">{e.description}</span>} subtitle="Описание" /> : null}
        {e.url ? <Row icon="link" title="Открыть ссылку" subtitle={e.url} onClick={() => e.url && openExternal(e.url)} /> : null}
      </List>
      <Section>
        <Button
          variant="danger"
          icon="trash"
          full
          onClick={async () => {
            if (await overlay.confirm({ title: 'Удалить событие?', confirmLabel: 'Удалить', danger: true })) {
              deleteEvent(id);
              overlay.toast('Событие удалено');
              nav.back();
            }
          }}
        >
          Удалить событие
        </Button>
      </Section>
    </Page>
  );
}

export function EventFormScreen({ id, date }: { id?: string; date?: DateKey }) {
  const nav = useNav();
  const model = useModel();
  const overlay = useOverlay();
  const { today, timeZone } = useToday();
  const existing = id ? model.data.events.find((x) => x.id === id) : undefined;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [day, setDay] = useState<DateKey>(existing ? toDateKey(new Date(existing.starts_at), timeZone) : (date ?? today));
  const [allDay, setAllDay] = useState(existing?.all_day ?? false);
  const [start, setStart] = useState(existing && !existing.all_day ? formatTime(new Date(existing.starts_at), timeZone) : '18:00');
  const [end, setEnd] = useState(existing?.ends_at && !existing.all_day ? formatTime(new Date(existing.ends_at), timeZone) : '19:00');
  const [location, setLocation] = useState(existing?.location ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [url, setUrl] = useState(existing?.url ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (title.trim().length < 2) return setError('Введите название события');
    if (!allDay && end <= start) return setError('Окончание должно быть позже начала');
    if (url.trim() && !isHttpsUrl(url.trim())) return setError('Ссылка должна начинаться с https://');
    saveEvent({
      id: existing?.id ?? newId(),
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      url: url.trim() || null,
      starts_at: combineDateKeyAndTime(day, allDay ? '00:00' : start, timeZone).toISOString(),
      ends_at: allDay ? null : combineDateKeyAndTime(day, end, timeZone).toISOString(),
      all_day: allDay,
      source: existing?.source === 'demo' ? 'manual' : (existing?.source ?? 'manual'),
    });
    overlay.toast(existing ? 'Событие сохранено' : 'Событие добавлено');
    nav.back();
  };

  return (
    <Page title={existing ? 'Изменить событие' : 'Новое событие'} backLabel="Отмена" right={<NavAction label="Сохранить" onClick={save} />}>
      <div className="form">
        <TextInput label="Название" value={title} onChange={setTitle} placeholder="Например: встреча с научным руководителем" autoFocus={!existing} />
        <DateInput label="Дата" value={day} onChange={setDay} />
        <Toggle label="Весь день" checked={allDay} onChange={setAllDay} />
        {!allDay ? (
          <FormRow>
            <TimeInput label="Начало" value={start} onChange={setStart} />
            <TimeInput label="Конец" value={end} onChange={setEnd} />
          </FormRow>
        ) : null}
        <TextInput label="Место" optional value={location} onChange={setLocation} />
        <TextArea label="Описание" optional value={description} onChange={setDescription} />
        <TextInput label="Ссылка" optional type="url" inputMode="url" value={url} onChange={setUrl} placeholder="https://" />
        <FormError message={error} />
      </div>
      <div className="form-actions">
        <Button full icon="check" onClick={save}>
          {existing ? 'Сохранить' : 'Добавить событие'}
        </Button>
      </div>
    </Page>
  );
}
