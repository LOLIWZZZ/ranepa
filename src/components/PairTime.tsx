import { formatDurationMinutes } from '../shared/domain/format';
import { addMinutesToTime, minutesBetweenTimes } from '../store/rules';
import { FormRow, TimeInput } from '../ui/form';
import { Button } from '../ui/kit';

export interface PairTimeValue {
  start: string;
  end: string;
  /** Пользователь сам задал окончание (пара длиннее или короче обычной) */
  custom: boolean;
}

/** Начальное состояние: своё окончание, если длительность отличается от стандартной. */
export function initialPairTime(start: string, end: string, pairMinutes: number): PairTimeValue {
  return { start, end, custom: minutesBetweenTimes(start, end) !== pairMinutes };
}

/**
 * Время пары. Окончание подставляется само: начало + длительность пары (по умолчанию 1 ч 20 мин).
 * Кнопка «Сделать пару длиннее» открывает поле окончания, «Обычная длительность» возвращает расчёт.
 */
export function PairTime({ value, onChange, pairMinutes, errors }: { value: PairTimeValue; onChange: (v: PairTimeValue) => void; pairMinutes: number; errors?: { start?: string; end?: string } }) {
  const auto = addMinutesToTime(value.start, pairMinutes);
  const setStart = (start: string) => {
    if (value.custom) {
      // сохраняем выбранную длительность при сдвиге начала
      const duration = minutesBetweenTimes(value.start, value.end);
      const end = duration && duration > 0 ? addMinutesToTime(start, duration) : null;
      onChange({ ...value, start, end: end ?? value.end });
    } else {
      onChange({ ...value, start, end: addMinutesToTime(start, pairMinutes) ?? value.end });
    }
  };
  const duration = minutesBetweenTimes(value.start, value.end);

  if (!value.custom) {
    return (
      <div className="pair-time">
        <FormRow>
          <TimeInput label="Начало" value={value.start} onChange={setStart} error={errors?.start} />
          <div className="field">
            <span className="field-label">Конец</span>
            <div className="input input-static" aria-live="polite">
              {auto ?? '—'}
            </div>
          </div>
        </FormRow>
        <div className="pair-time-hint">
          <span>{formatDurationMinutes(pairMinutes)}</span>
          <Button size="sm" variant="ghost" icon="clock" onClick={() => onChange({ ...value, custom: true, end: auto ?? value.end })}>
            Сделать длиннее
          </Button>
        </div>
        {errors?.end ? <p className="field-error">{errors.end}</p> : null}
      </div>
    );
  }

  return (
    <div className="pair-time">
      <FormRow>
        <TimeInput label="Начало" value={value.start} onChange={setStart} error={errors?.start} />
        <TimeInput label="Конец" value={value.end} onChange={(end) => onChange({ ...value, end })} error={errors?.end} />
      </FormRow>
      <div className="pair-time-hint">
        <span>{duration && duration > 0 ? formatDurationMinutes(duration) : 'Конец раньше начала'}</span>
        <Button size="sm" variant="ghost" icon="refresh" onClick={() => onChange({ ...value, custom: false, end: auto ?? value.end })}>
          Обычная ({formatDurationMinutes(pairMinutes)})
        </Button>
      </div>
    </div>
  );
}

/** Проверка времени: окончание позже начала и не позже полуночи. */
export function pairTimeErrors(v: PairTimeValue): { start?: string; end?: string } {
  const errors: { start?: string; end?: string } = {};
  if (!/^\d{1,2}:\d{2}$/.test(v.start)) errors.start = 'Укажите время';
  const duration = minutesBetweenTimes(v.start, v.end);
  if (duration === null) errors.end = 'Пара не может заканчиваться после полуночи';
  else if (duration <= 0) errors.end = 'Окончание должно быть позже начала';
  return errors;
}
