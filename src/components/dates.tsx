import { useRef, type ReactNode, type TouchEvent } from 'react';

import { isSameMonth, monthGrid } from '../shared/domain/calendar';
import { addDaysToKey, formatMonthYear, parseDateKey, startOfWeekKey, WEEKDAYS_SHORT, type DateKey } from '../shared/domain/time';
import { Icon } from '../ui/Icon';
import { cx } from '../ui/kit';

export function WeekStrip({ selected, today, onSelect, busy }: { selected: DateKey; today: DateKey; onSelect: (d: DateKey) => void; busy: Set<DateKey> }) {
  const start = startOfWeekKey(selected);
  const days = Array.from({ length: 7 }, (_, i) => addDaysToKey(start, i));
  return (
    <div className="week-strip">
      <button type="button" className="week-arrow" onClick={() => onSelect(addDaysToKey(selected, -7))} aria-label="Предыдущая неделя">
        <Icon name="back" size={20} />
      </button>
      <div className="week-days" role="tablist" aria-label="Дни недели">
        {days.map((d, i) => {
          const { day } = parseDateKey(d);
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={d === selected}
              className={cx('week-day', d === selected && 'is-selected', d === today && 'is-today', i >= 5 && 'is-weekend')}
              onClick={() => onSelect(d)}
            >
              <span className="week-day-name">{WEEKDAYS_SHORT[i]}</span>
              <span className="week-day-num">{day}</span>
              <span className={cx('week-day-dot', busy.has(d) && 'is-on')} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <button type="button" className="week-arrow" onClick={() => onSelect(addDaysToKey(selected, 7))} aria-label="Следующая неделя">
        <Icon name="forward" size={20} />
      </button>
    </div>
  );
}

export function MonthGrid({
  year,
  month,
  today,
  selected,
  onSelect,
  onPrev,
  onNext,
  marks,
}: {
  year: number;
  month: number;
  today: DateKey;
  selected: DateKey | null;
  onSelect: (d: DateKey) => void;
  onPrev: () => void;
  onNext: () => void;
  marks: Map<DateKey, string[]>;
}) {
  const grid = monthGrid(year, month);
  const lastRowUsed = grid.slice(35).some((d) => isSameMonth(d, year, month));
  const cells = lastRowUsed ? grid : grid.slice(0, 35);
  return (
    <div className="month">
      <div className="month-head">
        <button type="button" className="week-arrow" onClick={onPrev} aria-label="Предыдущий месяц">
          <Icon name="back" size={20} />
        </button>
        <p className="month-title">{formatMonthYear(year, month)}</p>
        <button type="button" className="week-arrow" onClick={onNext} aria-label="Следующий месяц">
          <Icon name="forward" size={20} />
        </button>
      </div>
      <div key={`${year}-${month}`} className="month-grid month-anim" role="grid">
        {WEEKDAYS_SHORT.map((w) => (
          <span key={w} className="month-weekday" aria-hidden="true">
            {w}
          </span>
        ))}
        {cells.map((d) => {
          const inMonth = isSameMonth(d, year, month);
          const dots = (marks.get(d) ?? []).slice(0, 4);
          return (
            <button
              key={d}
              type="button"
              className={cx('month-cell', !inMonth && 'is-outside', d === today && 'is-today', d === selected && 'is-selected')}
              onClick={() => onSelect(d)}
              aria-label={`${parseDateKey(d).day} ${formatMonthYear(parseDateKey(d).year, parseDateKey(d).month)}${dots.length ? `, событий: ${(marks.get(d) ?? []).length}` : ''}`}
              aria-pressed={d === selected}
            >
              <span className="month-num">{parseDateKey(d).day}</span>
              <span className="month-dots" aria-hidden="true">
                {dots.map((c, i) => (
                  <span key={i} className="month-dot" style={{ background: c }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Горизонтальный свайп для перелистывания дней. */
export function Swipeable({ onPrev, onNext, children }: { onPrev: () => void; onNext: () => void; children: ReactNode }) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (t) start.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const s = start.current;
    start.current = null;
    const t = e.changedTouches[0];
    if (!s || !t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - s.t < 700) {
      if (dx < 0) onNext();
      else onPrev();
    }
  };
  return (
    <div className="swipe-area" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {children}
    </div>
  );
}
