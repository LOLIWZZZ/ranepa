/** Изменение данных. Все функции чистые относительно состояния и вызывают update(). */
import type { AttendanceStatus, AssignmentStatus } from '../shared/domain/models';
import { CLASS_TYPE_SHORT, generateOccurrences, type RecurrenceInput } from '../shared/domain/schedule';
import { formatTime, toDateKey, formatDayMonth } from '../shared/domain/time';
import type { ImportItem } from '../shared/integrations/types';
import { findConflicts, hasInternalOverlap, type Interval } from './rules';
import { getData, newId, replaceAll, update } from './store';
import {
  DEFAULT_SETTINGS,
  emptyData,
  SUBJECT_COLORS,
  type AppData,
  type Attendance,
  type ClassItem,
  type EventItem,
  type ExamItem,
  type GradeItem,
  type ImportRecord,
  type PaymentItem,
  type Plan,
  type Subject,
  type Task,
  type Teacher,
} from './types';

const nowIso = () => new Date().toISOString();

function upsert<T extends { id: string }>(list: readonly T[], item: T): T[] {
  const index = list.findIndex((x) => x.id === item.id);
  if (index === -1) return [...list, item];
  const copy = [...list];
  copy[index] = item;
  return copy;
}

// ─── Дисциплины ─────────────────────────────────────────────────────────────

export function nextSubjectColor(data: AppData = getData()): string {
  const used = new Map<string, number>();
  for (const s of data.subjects) used.set(s.color, (used.get(s.color) ?? 0) + 1);
  let best: string = SUBJECT_COLORS[0];
  let bestCount = Number.POSITIVE_INFINITY;
  for (const c of SUBJECT_COLORS) {
    const n = used.get(c) ?? 0;
    if (n < bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}

export function saveSubject(subject: Omit<Subject, 'created_at' | 'source'> & Partial<Pick<Subject, 'source' | 'created_at'>>): Subject {
  const existing = getData().subjects.find((s) => s.id === subject.id);
  const item: Subject = {
    source: 'manual',
    created_at: nowIso(),
    ...existing,
    ...subject,
  };
  update((d) => ({ ...d, subjects: upsert(d.subjects, item) }));
  return item;
}

export function findSubjectByName(name: string, data: AppData = getData()): Subject | undefined {
  const key = name.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  return data.subjects.find((s) => s.name.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е') === key);
}

/** Удаляет дисциплину вместе с её занятиями, экзаменами и баллами; у заданий дисциплина сбрасывается. */
export function deleteSubject(id: string): void {
  update((d) => {
    const classIds = new Set(d.classes.filter((c) => c.subject_id === id).map((c) => c.id));
    return {
      ...d,
      subjects: d.subjects.filter((s) => s.id !== id),
      classes: d.classes.filter((c) => c.subject_id !== id),
      exams: d.exams.filter((e) => e.subject_id !== id),
      tasks: d.tasks.map((t) => (t.subject_id === id ? { ...t, subject_id: null } : t)),
      grades: d.grades.filter((g) => g.subject_id !== id),
      attendance: d.attendance
        .filter((a) => !(a.class_id && classIds.has(a.class_id)))
        .map((a) => (a.subject_id === id ? { ...a, subject_id: null } : a)),
    };
  });
}

// ─── Преподаватели ──────────────────────────────────────────────────────────

const nameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');

export function findTeacherByName(name: string, data: AppData = getData()): Teacher | undefined {
  const key = nameKey(name);
  return data.teachers.find((t) => nameKey(t.name) === key);
}

export function saveTeacher(teacher: { id: string; name: string; notes: string | null }): Teacher {
  const existing = getData().teachers.find((t) => t.id === teacher.id);
  const item: Teacher = { source: 'manual', created_at: nowIso(), ...existing, ...teacher, name: teacher.name.trim().replace(/\s+/g, ' ') };
  update((d) => ({ ...d, teachers: upsert(d.teachers, item) }));
  return item;
}

/** Найти преподавателя по ФИО или добавить в справочник. */
export function ensureTeacher(name: string): Teacher {
  return findTeacherByName(name) ?? saveTeacher({ id: newId(), name, notes: null });
}

/** Удаляет преподавателя: у дисциплин и занятий ссылка на него снимается. */
export function deleteTeacher(id: string): void {
  update((d) => ({
    ...d,
    teachers: d.teachers.filter((t) => t.id !== id),
    subjects: d.subjects.map((s) => (s.teacher_ids.includes(id) ? { ...s, teacher_ids: s.teacher_ids.filter((x) => x !== id) } : s)),
    classes: d.classes.map((c) => (c.teacher_id === id ? { ...c, teacher_id: null } : c)),
  }));
}

export function teacherName(id: string | null | undefined, data: AppData = getData()): string | null {
  return id ? (data.teachers.find((t) => t.id === id)?.name ?? null) : null;
}

// ─── Занятия ────────────────────────────────────────────────────────────────

/** Попытка поставить занятие на время, когда уже есть другая пара. */
export class ScheduleConflictError extends Error {
  constructor(readonly conflicts: ClassItem[], timeZone: string) {
    const data = getData();
    const first = conflicts[0];
    const describe = (c: ClassItem) => {
      const subject = data.subjects.find((x) => x.id === c.subject_id)?.name ?? 'Занятие';
      const start = new Date(c.starts_at);
      return `${formatDayMonth(toDateKey(start, timeZone))}, ${formatTime(start, timeZone)}–${formatTime(new Date(c.ends_at), timeZone)} — ${subject} (${CLASS_TYPE_SHORT[c.class_type].toLowerCase()})`;
    };
    super(
      first
        ? conflicts.length === 1
          ? `В это время уже стоит пара: ${describe(first)}. В одно время может быть только одна пара.`
          : `Время пересекается с ${conflicts.length} парами, например: ${describe(first)}. В одно время может быть только одна пара.`
        : 'Пары пересекаются по времени',
    );
    this.name = 'ScheduleConflictError';
  }
}

function assertNoConflicts(candidates: readonly Interval[], ignoreIds: ReadonlySet<string>, timeZone: string): void {
  if (hasInternalOverlap(candidates)) throw new ScheduleConflictError([], timeZone);
  const conflicts = findConflicts(getData().classes, candidates, ignoreIds);
  if (conflicts.length > 0) throw new ScheduleConflictError(conflicts, timeZone);
}

export type ClassFields = Omit<
  ClassItem,
  'id' | 'starts_at' | 'ends_at' | 'status' | 'original_starts_at' | 'status_note' | 'series_id' | 'source' | 'external_id' | 'import_id' | 'updated_at'
>;

export function saveClass(id: string | null, fields: ClassFields, startsAt: string, endsAt: string, timeZone = getData().settings.timeZone): string {
  const existing = id ? getData().classes.find((c) => c.id === id) : undefined;
  if (existing?.status !== 'cancelled') assertNoConflicts([{ starts_at: startsAt, ends_at: endsAt }], new Set(id ? [id] : []), timeZone);
  const item: ClassItem = existing
    ? { ...existing, ...fields, starts_at: startsAt, ends_at: endsAt, updated_at: nowIso() }
    : {
        id: newId(),
        ...fields,
        starts_at: startsAt,
        ends_at: endsAt,
        status: 'scheduled',
        original_starts_at: null,
        status_note: null,
        series_id: null,
        source: 'manual',
        external_id: null,
        import_id: null,
        updated_at: nowIso(),
      };
  update((d) => ({ ...d, classes: upsert(d.classes, item) }));
  return item.id;
}

/** Создаёт серию повторяющихся занятий. Возвращает количество созданных. */
export function createSeries(fields: ClassFields, recurrence: RecurrenceInput): number {
  const occurrences = generateOccurrences(recurrence);
  assertNoConflicts(occurrences, new Set(), recurrence.timeZone);
  const seriesId = newId();
  const stamp = nowIso();
  const items: ClassItem[] = occurrences.map((o) => ({
    id: newId(),
    ...fields,
    starts_at: o.starts_at,
    ends_at: o.ends_at,
    status: 'scheduled',
    original_starts_at: null,
    status_note: null,
    series_id: seriesId,
    source: 'manual',
    external_id: null,
    import_id: null,
    updated_at: stamp,
  }));
  update((d) => ({ ...d, classes: [...d.classes, ...items] }));
  return items.length;
}

/**
 * Изменяет это и следующие занятия серии: поля применяются ко всем, а время (часы и минуты
 * начала/окончания) сдвигается на ту же величину, что и у выбранного занятия.
 */
export function updateSeriesFrom(classId: string, fields: ClassFields, startsAt: string, endsAt: string, timeZone = getData().settings.timeZone): number {
  const data = getData();
  const base = data.classes.find((c) => c.id === classId);
  if (!base || !base.series_id) {
    saveClass(classId, fields, startsAt, endsAt, timeZone);
    return 1;
  }
  const shiftStart = Date.parse(startsAt) - Date.parse(base.starts_at);
  const duration = Date.parse(endsAt) - Date.parse(startsAt);
  const from = Date.parse(base.starts_at);
  const affected = data.classes.filter((c) => c.series_id === base.series_id && Date.parse(c.starts_at) >= from);
  const moved = affected
    .filter((c) => c.status !== 'cancelled')
    .map((c) => {
      const start = Date.parse(c.starts_at) + shiftStart;
      return { starts_at: new Date(start).toISOString(), ends_at: new Date(start + duration).toISOString() };
    });
  assertNoConflicts(moved, new Set(affected.map((c) => c.id)), timeZone);
  let count = 0;
  const stamp = nowIso();
  update((d) => ({
    ...d,
    classes: d.classes.map((c) => {
      if (c.series_id !== base.series_id || Date.parse(c.starts_at) < from) return c;
      count += 1;
      const start = Date.parse(c.starts_at) + shiftStart;
      return {
        ...c,
        ...fields,
        starts_at: new Date(start).toISOString(),
        ends_at: new Date(start + duration).toISOString(),
        updated_at: stamp,
      };
    }),
  }));
  return count;
}

export function deleteClass(id: string): void {
  update((d) => ({
    ...d,
    classes: d.classes.filter((c) => c.id !== id),
    attendance: d.attendance.filter((a) => a.class_id !== id),
  }));
}

export function deleteSeriesFrom(classId: string): number {
  const base = getData().classes.find((c) => c.id === classId);
  if (!base) return 0;
  if (!base.series_id) {
    deleteClass(classId);
    return 1;
  }
  const from = Date.parse(base.starts_at);
  const removed = new Set(
    getData()
      .classes.filter((c) => c.series_id === base.series_id && Date.parse(c.starts_at) >= from)
      .map((c) => c.id),
  );
  update((d) => ({
    ...d,
    classes: d.classes.filter((c) => !removed.has(c.id)),
    attendance: d.attendance.filter((a) => !(a.class_id && removed.has(a.class_id))),
  }));
  return removed.size;
}

export function cancelClass(id: string, note: string | null): void {
  update((d) => ({
    ...d,
    classes: d.classes.map((c) => (c.id === id ? { ...c, status: 'cancelled', status_note: note, updated_at: nowIso() } : c)),
  }));
}

export function restoreClass(id: string, timeZone = getData().settings.timeZone): void {
  const item = getData().classes.find((c) => c.id === id);
  if (item) assertNoConflicts([item], new Set([id]), timeZone);
  update((d) => ({
    ...d,
    classes: d.classes.map((c) =>
      c.id === id ? { ...c, status: c.original_starts_at ? 'rescheduled' : 'scheduled', status_note: null, updated_at: nowIso() } : c,
    ),
  }));
}

export function rescheduleClass(id: string, startsAt: string, endsAt: string, note: string | null, timeZone = getData().settings.timeZone): void {
  assertNoConflicts([{ starts_at: startsAt, ends_at: endsAt }], new Set([id]), timeZone);
  update((d) => ({
    ...d,
    classes: d.classes.map((c) =>
      c.id === id
        ? {
            ...c,
            status: 'rescheduled',
            original_starts_at: c.original_starts_at ?? c.starts_at,
            starts_at: startsAt,
            ends_at: endsAt,
            status_note: note,
            updated_at: nowIso(),
          }
        : c,
    ),
  }));
}

// ─── Задания ────────────────────────────────────────────────────────────────

export type TaskFields = Pick<Task, 'subject_id' | 'title' | 'description' | 'due_at' | 'priority' | 'url'>;

export function saveTask(id: string | null, fields: TaskFields): string {
  const existing = id ? getData().tasks.find((t) => t.id === id) : undefined;
  const stamp = nowIso();
  const item: Task = existing
    ? { ...existing, ...fields, updated_at: stamp }
    : { id: newId(), ...fields, status: 'not_started', completed_at: null, source: 'manual', created_at: stamp, updated_at: stamp };
  update((d) => ({ ...d, tasks: upsert(d.tasks, item) }));
  return item.id;
}

export function setTaskStatus(id: string, status: AssignmentStatus): void {
  const done = status === 'done' || status === 'submitted';
  update((d) => ({
    ...d,
    tasks: d.tasks.map((t) =>
      t.id === id ? { ...t, status, completed_at: done ? (t.completed_at ?? nowIso()) : null, updated_at: nowIso() } : t,
    ),
  }));
}

export function deleteTask(id: string): void {
  update((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) }));
}

// ─── Посещаемость ───────────────────────────────────────────────────────────

/** Отметка посещения занятия; status = null снимает отметку. */
export function markAttendance(cls: ClassItem, status: AttendanceStatus | null, timeZone: string, note: string | null = null): void {
  update((d) => {
    const others = d.attendance.filter((a) => a.class_id !== cls.id);
    if (!status) return { ...d, attendance: others };
    const existing = d.attendance.find((a) => a.class_id === cls.id);
    const record: Attendance = {
      id: existing?.id ?? newId(),
      class_id: cls.id,
      subject_id: cls.subject_id,
      occurred_on: toDateKey(new Date(cls.starts_at), timeZone),
      status,
      note: note ?? existing?.note ?? null,
      source: existing?.source === 'demo' ? 'manual' : (existing?.source ?? 'manual'),
      updated_at: nowIso(),
    };
    return { ...d, attendance: [...others, record] };
  });
}

export function saveAttendance(record: Omit<Attendance, 'updated_at' | 'source'> & { source?: Attendance['source'] }): void {
  const item: Attendance = { source: 'manual', ...record, updated_at: nowIso() };
  update((d) => ({ ...d, attendance: upsert(d.attendance, item) }));
}

export function deleteAttendance(id: string): void {
  update((d) => ({ ...d, attendance: d.attendance.filter((a) => a.id !== id) }));
}

// ─── Оценки, экзамены, оплата, события ───────────────────────────────────────

export function saveGrade(item: GradeItem): void {
  update((d) => ({ ...d, grades: upsert(d.grades, item) }));
}
export function deleteGrade(id: string): void {
  update((d) => ({ ...d, grades: d.grades.filter((g) => g.id !== id) }));
}

export function saveExam(item: ExamItem): void {
  update((d) => ({ ...d, exams: upsert(d.exams, item) }));
}
export function deleteExam(id: string): void {
  update((d) => ({ ...d, exams: d.exams.filter((e) => e.id !== id) }));
}

export function savePlan(item: Plan): void {
  update((d) => ({ ...d, plans: upsert(d.plans, item) }));
}
export function deletePlan(id: string): void {
  update((d) => ({ ...d, plans: d.plans.filter((p) => p.id !== id), payments: d.payments.filter((p) => p.plan_id !== id) }));
}

export function savePayment(item: PaymentItem): void {
  update((d) => ({ ...d, payments: upsert(d.payments, item) }));
}
export function deletePayment(id: string): void {
  update((d) => ({ ...d, payments: d.payments.filter((p) => p.id !== id) }));
}

export function saveEvent(item: EventItem): void {
  update((d) => ({ ...d, events: upsert(d.events, item) }));
}
export function deleteEvent(id: string): void {
  update((d) => ({ ...d, events: d.events.filter((e) => e.id !== id) }));
}

// ─── Импорт расписания ──────────────────────────────────────────────────────

export interface ImportSummary {
  created: number;
  updated: number;
  subjectsCreated: number;
  /** Пропущено из-за пересечения с уже стоящими парами */
  conflicts: number;
  record: ImportRecord;
}

/**
 * Импорт занятий из файла: дисциплины и преподаватели создаются по названию/ФИО, повторный импорт
 * обновляет записи по external_id. Занятия, пересекающиеся по времени с уже стоящими парами,
 * не добавляются — в одно время может быть только одна пара.
 */
export function importClasses(items: readonly ImportItem[], fileName: string, format: 'ics' | 'csv', skipped: number): ImportSummary {
  const data = getData();
  const importId = newId();
  const stamp = nowIso();
  const subjects = [...data.subjects];
  const teachers = [...data.teachers];
  let subjectsCreated = 0;

  const teacherFor = (name: string | null): string | null => {
    if (!name || !name.trim()) return null;
    const found = findTeacherByName(name, { ...data, teachers });
    if (found) return found.id;
    const t: Teacher = { id: newId(), name: name.trim().replace(/\s+/g, ' '), notes: null, source: 'imported', created_at: stamp };
    teachers.push(t);
    return t.id;
  };

  const subjectFor = (name: string, teacherId: string | null): string => {
    const index = subjects.findIndex((x) => x.id === findSubjectByName(name, { ...data, subjects })?.id);
    const found = index >= 0 ? subjects[index] : undefined;
    if (found) {
      if (teacherId && !found.teacher_ids.includes(teacherId) && found.teacher_ids.length < 2) {
        subjects[index] = { ...found, teacher_ids: [...found.teacher_ids, teacherId] };
      }
      return found.id;
    }
    const subject: Subject = {
      id: newId(),
      name: name.trim(),
      short_name: null,
      color: nextSubjectColor({ ...data, subjects }),
      teacher_ids: teacherId ? [teacherId] : [],
      notes: null,
      source: 'imported',
      created_at: stamp,
    };
    subjects.push(subject);
    subjectsCreated += 1;
    return subject.id;
  };

  const byExternal = new Map<string, ClassItem>();
  for (const c of data.classes) if (c.external_id) byExternal.set(c.external_id, c);

  let created = 0;
  let updated = 0;
  let conflicts = 0;
  const changed = new Map<string, ClassItem>();
  const added: ClassItem[] = [];
  /** Итоговое расписание с учётом уже принятых строк файла — для проверки пересечений */
  const occupied = (): ClassItem[] => [...data.classes.filter((c) => !changed.has(c.id)).map((c) => c), ...changed.values(), ...added];

  for (const item of items) {
    const existing = byExternal.get(item.external_id);
    if (existing?.source === 'manual') continue; // ручные правки не перезаписываем
    if (item.status !== 'cancelled' && findConflicts(occupied(), [item], new Set(existing ? [existing.id] : [])).length > 0) {
      conflicts += 1;
      continue;
    }
    const teacherId = teacherFor(item.teacher);
    const subjectId = subjectFor(item.subject, teacherId);
    const fields = {
      subject_id: subjectId,
      class_type: item.class_type,
      format: item.format,
      starts_at: item.starts_at,
      ends_at: item.ends_at,
      status: item.status,
      teacher_id: teacherId,
      teacher: teacherId ? null : item.teacher,
      building: item.building,
      room: item.room,
      location: item.location,
      online_url: item.online_url,
      notes: item.notes,
      updated_at: stamp,
    } as const;
    if (existing) {
      changed.set(existing.id, { ...existing, ...fields, original_starts_at: null, status_note: null });
      updated += 1;
    } else {
      const createdItem: ClassItem = {
        id: newId(),
        ...fields,
        original_starts_at: null,
        status_note: null,
        series_id: null,
        source: 'imported',
        external_id: item.external_id,
        import_id: importId,
      };
      added.push(createdItem);
      byExternal.set(item.external_id, createdItem);
      created += 1;
    }
  }

  const record: ImportRecord = { id: importId, file_name: fileName, format, created_at: stamp, created, updated, skipped: skipped + conflicts };
  update((d) => ({
    ...d,
    teachers,
    subjects,
    classes: [...d.classes.map((c) => changed.get(c.id) ?? c), ...added],
    imports: [record, ...d.imports].slice(0, 20),
  }));
  return { created, updated, subjectsCreated, conflicts, record };
}

/** Отмена импорта: удаляет занятия, добавленные этим импортом, и пустые импортированные дисциплины. */
export function undoImport(importId: string): number {
  const data = getData();
  const removed = new Set(data.classes.filter((c) => c.import_id === importId).map((c) => c.id));
  update((d) => {
    const classes = d.classes.filter((c) => !removed.has(c.id));
    const usedSubjects = new Set([...classes.map((c) => c.subject_id), ...d.exams.map((e) => e.subject_id)]);
    const usedByTasks = new Set(d.tasks.map((t) => t.subject_id));
    return {
      ...d,
      classes,
      attendance: d.attendance.filter((a) => !(a.class_id && removed.has(a.class_id))),
      subjects: d.subjects.filter((s) => s.source !== 'imported' || usedSubjects.has(s.id) || usedByTasks.has(s.id)),
      imports: d.imports.filter((i) => i.id !== importId),
    };
  });
  return removed.size;
}

// ─── Демо-данные и очистка ──────────────────────────────────────────────────

export function hasDemo(data: AppData): boolean {
  return (
    data.subjects.some((s) => s.source === 'demo') ||
    data.classes.some((c) => c.source === 'demo') ||
    data.tasks.some((t) => t.source === 'demo')
  );
}

export function clearDemo(): void {
  update((d) => {
    const demoClasses = new Set(d.classes.filter((c) => c.source === 'demo').map((c) => c.id));
    const demoPlans = new Set(d.plans.filter((p) => p.source === 'demo').map((p) => p.id));
    const demoSubjects = new Set(d.subjects.filter((s) => s.source === 'demo').map((s) => s.id));
    const classes = d.classes.filter((c) => c.source !== 'demo');
    const stillUsed = new Set(classes.map((c) => c.subject_id));
    const removeSubject = (id: string) => demoSubjects.has(id) && !stillUsed.has(id);
    return {
      ...d,
      subjects: d.subjects.filter((s) => !removeSubject(s.id)),
      teachers: d.teachers.filter(
        (t) => t.source !== 'demo' || d.subjects.some((s) => !removeSubject(s.id) && s.teacher_ids.includes(t.id)),
      ),
      classes,
      tasks: d.tasks.filter((t) => t.source !== 'demo').map((t) => (t.subject_id && removeSubject(t.subject_id) ? { ...t, subject_id: null } : t)),
      attendance: d.attendance.filter((a) => a.source !== 'demo' && !(a.class_id && demoClasses.has(a.class_id))),
      grades: d.grades.filter((g) => g.source !== 'demo'),
      exams: d.exams.filter((e) => e.source !== 'demo'),
      plans: d.plans.filter((p) => p.source !== 'demo'),
      payments: d.payments.filter((p) => p.source !== 'demo' && !demoPlans.has(p.plan_id)),
      events: d.events.filter((e) => e.source !== 'demo'),
    };
  });
}

export function eraseAll(): void {
  update((d) => ({
    ...d,
    teachers: [],
    subjects: [],
    classes: [],
    tasks: [],
    attendance: [],
    grades: [],
    exams: [],
    plans: [],
    payments: [],
    events: [],
    imports: [],
    lastBackupAt: null,
  }));
}

/** Выход из профиля: удаляет все записи и профиль с этого устройства и возвращает к первому запуску. Тема оформления сохраняется. */
export function signOut(): void {
  replaceAll({ ...emptyData(), settings: { ...DEFAULT_SETTINGS, theme: getData().settings.theme, installHintDismissed: getData().settings.installHintDismissed } });
}

export function isEmpty(data: AppData): boolean {
  return (
    data.subjects.length +
      data.classes.length +
      data.tasks.length +
      data.grades.length +
      data.exams.length +
      data.plans.length +
      data.events.length ===
    0
  );
}
