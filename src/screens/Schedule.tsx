import { useMemo, useState } from 'react';

import { ClassCard } from '../components/cards';
import { Swipeable, WeekStrip } from '../components/dates';
import { useToday } from '../hooks';
import { useNav } from '../nav';
import type { ClassType } from '../shared/domain/models';
import { CLASS_TYPE_LABELS, filterSessions, groupByDay, type ScheduleFilter } from '../shared/domain/schedule';
import { timeZoneLabel } from '../shared/domain/timezones';
import { addDaysToKey, deviceTimeZone, formatDayMonth, formatWeekdayDayMonth, startOfWeekKey, timeZoneOffsetMinutes, type DateKey } from '../shared/domain/time';
import { useModel } from '../store/model';
import { overlappingIds } from '../store/rules';
import { Toggle } from '../ui/form';
import { Button, Chip, ChipRow, Empty, IconButton, Notice, Segmented } from '../ui/kit';
import { TabScreen } from '../ui/layout';
import { Sheet, SheetDone } from '../ui/overlay';
import { academicWeekLabel } from './weeks';

export function ScheduleScreen() {
  const nav = useNav();
  const model = useModel();
  const { now, today, timeZone } = useToday();
  const [mode, setMode] = useState<'day' | 'week'>('day');
  const [selected, setSelected] = useState<DateKey>(today);
  const [filter, setFilter] = useState<ScheduleFilter>({});
  const [filtersOpen, setFiltersOpen] = useState(false);

  const weekStart = startOfWeekKey(selected);
  const weekEnd = addDaysToKey(weekStart, 6);
  const filtered = useMemo(() => filterSessions(model.sessions, filter), [model.sessions, filter]);
  const byDay = useMemo(() => groupByDay(filtered, timeZone), [filtered, timeZone]);
  const busy = useMemo(() => {
    const set = new Set<DateKey>();
    for (const [day, list] of byDay) if (list.some((s) => s.status !== 'cancelled')) set.add(day);
    return set;
  }, [byDay]);
  const dayList = byDay.get(selected) ?? [];
  const overlaps = useMemo(() => overlappingIds(model.data.classes), [model.data.classes]);
  const weekKeys = new Set(Array.from({ length: 7 }, (_, i) => addDaysToKey(startOfWeekKey(selected), i)));
  const overlapInView = (mode === 'day' ? dayList : [...byDay.entries()].filter(([d]) => weekKeys.has(d)).flatMap(([, l]) => l)).some((s) => overlaps.has(s.id));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysToKey(weekStart, i));
  const activeFilters = (filter.subjectId ? 1 : 0) + (filter.classType ? 1 : 0) + (filter.hideCancelled ? 1 : 0);
  const week = academicWeekLabel(model.data.settings.semesterStart, selected);
  const tzDiffers = timeZoneOffsetMinutes(now, deviceTimeZone()) !== timeZoneOffsetMinutes(now, timeZone);

  const subjects = [...model.data.subjects].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const types = Object.keys(CLASS_TYPE_LABELS) as ClassType[];

  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const goTo = (d: DateKey) => {
    if (d === selected) return;
    setDirection(d > selected ? 'next' : 'prev');
    setSelected(d);
  };
  const open = (id: string) => nav.push({ name: 'class', id });

  return (
    <TabScreen
      title="Расписание"
      subtitle={`${formatDayMonth(weekStart)} – ${formatDayMonth(weekEnd)}${week ? ` · ${week}` : ''}`}
      actions={
        <>
          <IconButton icon="filter" label={activeFilters ? `Фильтры, активно: ${activeFilters}` : 'Фильтры'} active={activeFilters > 0} onClick={() => setFiltersOpen(true)} />
          <IconButton icon="plus" label="Добавить занятие" onClick={() => nav.push({ name: 'classForm', date: selected })} />
        </>
      }
    >
      <Segmented
        label="Вид расписания"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'day', label: 'День' },
          { value: 'week', label: 'Неделя' },
        ]}
      />
      <WeekStrip selected={selected} today={today} onSelect={goTo} busy={busy} />
      {overlapInView ? (
        <Notice tone="danger" icon="alert" title="Две пары в одно время — перенесите одну" />
      ) : null}
      {tzDiffers ? <p className="footnote">Время указано по часовому поясу института: {timeZoneLabel(timeZone)}</p> : null}

      {mode === 'day' ? (
        <Swipeable onPrev={() => goTo(addDaysToKey(selected, -1))} onNext={() => goTo(addDaysToKey(selected, 1))}>
          <div key={selected} className={`day-anim from-${direction}`}>
          <div className="day-head">
            <h2 className="section-title">{selected === today ? `Сегодня, ${formatDayMonth(selected)}` : formatWeekdayDayMonth(selected)}</h2>
            {selected !== today ? (
              <button type="button" className="link-btn" onClick={() => goTo(today)}>
                К сегодняшнему дню
              </button>
            ) : null}
          </div>
          {dayList.length === 0 ? (
            model.sessions.length === 0 ? (
              <Empty
                icon="schedule"
                title="Расписание пустое"
                text="Добавьте пары или загрузите файл."
                action={{ label: 'Добавить занятие', onClick: () => nav.push({ name: 'classForm', date: selected }) }}
                secondary={{ label: 'Импорт файла', onClick: () => nav.push({ name: 'import' }) }}
              />
            ) : (
              <Empty icon="sun" title={activeFilters ? 'Нет занятий по фильтру' : 'Занятий нет'} />
            )
          ) : (
            <div className="stack">
              {dayList.map((s) => (
                <ClassCard key={s.id} session={s} now={now} timeZone={timeZone} attendance={model.attendanceByClass.get(s.id)} conflict={overlaps.has(s.id)} onClick={() => open(s.id)} />
              ))}
            </div>
          )}
          </div>
        </Swipeable>
      ) : (
        <div key={startOfWeekKey(selected)} className={`stack-lg day-anim from-${direction}`}>
          {weekDays.map((d) => {
            const list = byDay.get(d) ?? [];
            return (
              <section key={d} className="week-section">
                <h2 className={d === today ? 'section-title is-today' : 'section-title'}>
                  {d === today ? `Сегодня, ${formatDayMonth(d)}` : formatWeekdayDayMonth(d)}
                </h2>
                {list.length === 0 ? (
                  <p className="muted-text small">Нет занятий</p>
                ) : (
                  <div className="stack">
                    {list.map((s) => (
                      <ClassCard key={s.id} session={s} now={now} timeZone={timeZone} attendance={model.attendanceByClass.get(s.id)} conflict={overlaps.has(s.id)} compact onClick={() => open(s.id)} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          <div className="inline-actions center">
            <Button variant="secondary" size="sm" icon="back" onClick={() => goTo(addDaysToKey(selected, -7))}>
              Прошлая неделя
            </Button>
            <Button variant="secondary" size="sm" onClick={() => goTo(addDaysToKey(selected, 7))}>
              Следующая неделя
            </Button>
          </div>
        </div>
      )}

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Фильтры" footer={<SheetDone onClick={() => setFiltersOpen(false)} />}>
        <p className="field-label">Дисциплина</p>
        <ChipRow label="Дисциплина">
          <Chip label="Все" selected={!filter.subjectId} onClick={() => setFilter((f) => ({ ...f, subjectId: null }))} />
          {subjects.map((s) => (
            <Chip key={s.id} label={s.short_name ?? s.name} color={s.color} selected={filter.subjectId === s.id} onClick={() => setFilter((f) => ({ ...f, subjectId: f.subjectId === s.id ? null : s.id }))} />
          ))}
        </ChipRow>
        <p className="field-label">Тип занятия</p>
        <ChipRow label="Тип занятия">
          <Chip label="Все" selected={!filter.classType} onClick={() => setFilter((f) => ({ ...f, classType: null }))} />
          {types.map((t) => (
            <Chip key={t} label={CLASS_TYPE_LABELS[t]} selected={filter.classType === t} onClick={() => setFilter((f) => ({ ...f, classType: f.classType === t ? null : t }))} />
          ))}
        </ChipRow>
        <Toggle label="Скрыть отменённые" checked={!!filter.hideCancelled} onChange={(v) => setFilter((f) => ({ ...f, hideCancelled: v }))} />
        {activeFilters > 0 ? (
          <Button variant="ghost" onClick={() => setFilter({})}>
            Сбросить фильтры
          </Button>
        ) : null}
      </Sheet>
    </TabScreen>
  );
}
