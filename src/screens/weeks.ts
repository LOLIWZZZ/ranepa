import { diffDaysBetweenKeys, startOfWeekKey, type DateKey } from '../shared/domain/time';

/** Номер учебной недели от начала семестра (неделя начала — первая). null, если дата раньше старта. */
export function academicWeek(semesterStart: DateKey | null, day: DateKey): number | null {
  if (!semesterStart) return null;
  const diff = diffDaysBetweenKeys(startOfWeekKey(semesterStart), startOfWeekKey(day));
  if (diff < 0) return null;
  const week = Math.floor(diff / 7) + 1;
  return week <= 30 ? week : null;
}

/** «9-я неделя, нечётная» — для заголовков. */
export function academicWeekLabel(semesterStart: DateKey | null, day: DateKey): string | null {
  const week = academicWeek(semesterStart, day);
  if (week === null) return null;
  return `${week}-я неделя, ${week % 2 === 1 ? 'нечётная' : 'чётная'}`;
}
