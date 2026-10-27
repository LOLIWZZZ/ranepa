/** Форматирование чисел, сумм и длительностей на русском языке. */

import { DAY, HOUR, MINUTE } from './time';

/** Выбор формы слова по числу: plural(5, ['день', 'дня', 'дней']) → 'дней'. */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export function pluralize(n: number, forms: readonly [string, string, string]): string {
  return `${n} ${plural(n, forms)}`;
}

const NBSP = ' ';

/** Группировка разрядов неразрывным пробелом: 150000 → «150 000». */
export function formatInteger(value: number): string {
  const sign = value < 0 ? '−' : '';
  const digits = String(Math.abs(Math.round(value)));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** Сумма в копейках → «150 000 ₽» или «1 234,50 ₽». */
export function formatMoneyKopecks(kopecks: number): string {
  const sign = kopecks < 0 ? '−' : '';
  const abs = Math.abs(Math.round(kopecks));
  const rubles = Math.floor(abs / 100);
  const rest = abs % 100;
  const rublesText = formatInteger(rubles);
  return `${sign}${rublesText}${rest > 0 ? `,${String(rest).padStart(2, '0')}` : ''}${NBSP}₽`;
}

/** Рубли (number из БД, numeric(12,2)) → копейки без ошибок округления. */
export function rublesToKopecks(rubles: number | string): number {
  const value = typeof rubles === 'string' ? Number(rubles.replace(',', '.')) : rubles;
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function kopecksToRubles(kopecks: number): number {
  return Math.round(kopecks) / 100;
}

/** Разбор суммы, введённой пользователем: «150 000», «1 234,5» → копейки. */
export function parseMoneyInput(text: string): number | null {
  const normalized = text.replace(/[\s ₽]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** «1 ч 30 мин», «45 мин», «2 ч». */
export function formatDurationMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

/**
 * Обратный отсчёт до момента: «через 25 мин», «через 2 ч 10 мин», «через 3 дня».
 * Для прошедшего момента — «сейчас».
 */
export function formatCountdown(target: Date, now: Date): string {
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return 'сейчас';
  if (diff < MINUTE) return 'меньше минуты';
  if (diff < HOUR) {
    const m = Math.ceil(diff / MINUTE);
    return `через ${m} мин`;
  }
  if (diff < DAY) {
    const totalMinutes = Math.ceil(diff / MINUTE);
    return `через ${formatDurationMinutes(totalMinutes)}`;
  }
  const days = Math.floor(diff / DAY);
  return `через ${pluralize(days, ['день', 'дня', 'дней'])}`;
}

/** Компактный таймер для карточки ближайшей пары: «00:24:10» или «2 ч 15 мин». */
export function formatTimer(target: Date, now: Date): string {
  const diff = Math.max(0, target.getTime() - now.getTime());
  if (diff >= DAY) return formatCountdown(target, now).replace(/^через /, '');
  const totalSeconds = Math.floor(diff / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatPercent(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits).replace('.', ',')}%`;
}

export function formatDecimal(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(digits).replace('.', ',');
}

/** Инициалы для аватара: «Иванов Иван» → «ИИ». */
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p.charAt(0).toUpperCase());
  return letters.join('') || '?';
}

/** «Иванов Иван Иванович» → «Иванов И. И.» */
export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return fullName.trim();
  const [last, ...rest] = parts;
  return `${last} ${rest.map((p) => `${p.charAt(0).toUpperCase()}.`).join(' ')}`;
}

/** Имя для приветствия — первое слово из «Имя Фамилия» (так поле подписано при регистрации). */
export function greetingName(fullName: string): string {
  return fullName.trim().split(/\s+/).filter(Boolean)[0] ?? '';
}

export function greetingByHour(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Доброе утро';
  if (hour >= 12 && hour < 17) return 'Добрый день';
  if (hour >= 17 && hour < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}
