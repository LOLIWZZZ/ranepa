/**
 * Преобразование локальных записей в модели доменной логики (те же, что в серверной версии),
 * чтобы переиспользовать проверенные функции расчёта статусов, статистики и календаря.
 */
import { useMemo } from 'react';

import type {
  Assignment,
  AttendanceRecord,
  CalendarEvent,
  ClassSession,
  ClassroomRef,
  Exam,
  Grade,
  SubjectRef,
  TuitionPlan,
} from '../shared/domain/models';
import { useData } from './store';
import type { AppData, ClassItem, ExamItem, Subject, Teacher } from './types';

const ME = 'local-user';

export function subjectRef(s: Subject | undefined): SubjectRef | null {
  return s ? { id: s.id, name: s.name, short_name: s.short_name, color: s.color } : null;
}

function classroomOf(id: string, building: string | null, room: string | null): ClassroomRef | null {
  if (!room) return null;
  return { id: `${id}:room`, name: room, building: building ? { id: `${id}:building`, name: building, address: null } : null };
}

function locationNote(building: string | null, room: string | null, location: string | null): string | null {
  if (room) return location;
  const parts = [building, location].filter((x): x is string => !!x && x.trim() !== '');
  return parts.length > 0 ? parts.join(', ') : null;
}

/** ФИО преподавателя занятия: выбранный преподаватель → ФИО из файла → первый преподаватель дисциплины. */
export function resolveTeacher(teacherId: string | null, teacherText: string | null, subject: Subject | undefined, teachers: Map<string, Teacher>): string | null {
  if (teacherId && teachers.has(teacherId)) return teachers.get(teacherId)?.name ?? null;
  if (teacherText) return teacherText;
  const first = subject?.teacher_ids[0];
  return first ? (teachers.get(first)?.name ?? null) : null;
}

export function subjectTeacherNames(subject: Subject | undefined, teachers: Map<string, Teacher>): string[] {
  return (subject?.teacher_ids ?? []).map((id) => teachers.get(id)?.name).filter((x): x is string => !!x);
}

export function toSession(c: ClassItem, subjects: Map<string, Subject>, teachers: Map<string, Teacher> = new Map()): ClassSession {
  const subject = subjects.get(c.subject_id);
  return {
    id: c.id,
    group_id: null,
    owner_id: ME,
    subject_id: c.subject_id,
    teacher_id: null,
    teacher_note: resolveTeacher(c.teacher_id, c.teacher, subject, teachers),
    classroom_id: null,
    location_note: locationNote(c.building, c.room, c.location),
    class_type: c.class_type,
    format: c.format,
    online_url: c.online_url,
    starts_at: c.starts_at,
    ends_at: c.ends_at,
    status: c.status,
    original_starts_at: c.original_starts_at,
    status_note: c.status_note,
    series_id: c.series_id,
    notes: c.notes,
    source: c.source,
    version: 1,
    subject: subjectRef(subject),
    teacher: null,
    classroom: classroomOf(c.id, c.building, c.room),
    group: null,
  };
}

export function toExam(e: ExamItem, subjects: Map<string, Subject>, teachers: Map<string, Teacher> = new Map()): Exam {
  const subject = subjects.get(e.subject_id);
  return {
    id: e.id,
    group_id: null,
    owner_id: ME,
    subject_id: e.subject_id,
    kind: e.kind,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    teacher_id: null,
    teacher_note: resolveTeacher(null, e.teacher, subject, teachers),
    classroom_id: null,
    location_note: locationNote(e.building, e.room, e.location),
    format: e.format,
    online_url: e.online_url,
    notes: e.notes,
    source: e.source,
    version: 1,
    subject: subjectRef(subject),
    teacher: null,
    classroom: classroomOf(e.id, e.building, e.room),
  };
}

export interface Model {
  data: AppData;
  subjects: Map<string, Subject>;
  teachers: Map<string, Teacher>;
  sessions: ClassSession[];
  assignments: Assignment[];
  attendance: AttendanceRecord[];
  grades: Grade[];
  exams: Exam[];
  plans: TuitionPlan[];
  events: CalendarEvent[];
  /** Отметки посещаемости по id занятия */
  attendanceByClass: Map<string, AttendanceRecord>;
}

export function buildModel(data: AppData): Model {
  const subjects = new Map(data.subjects.map((s) => [s.id, s]));
  const teachers = new Map(data.teachers.map((t) => [t.id, t]));
  const sessions = data.classes.map((c) => toSession(c, subjects, teachers)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const assignments: Assignment[] = data.tasks.map((t) => ({
    id: t.id,
    group_id: null,
    owner_id: ME,
    subject_id: t.subject_id,
    teacher_id: null,
    teacher_note: null,
    class_session_id: null,
    title: t.title,
    description: t.description,
    issued_at: t.created_at,
    due_at: t.due_at,
    priority: t.priority,
    source: t.source,
    version: 1,
    created_by: ME,
    subject: t.subject_id ? subjectRef(subjects.get(t.subject_id)) : null,
    teacher: null,
    progress: {
      assignment_id: t.id,
      user_id: ME,
      status: t.status,
      completed_at: t.completed_at,
      submitted_at: null,
      note: null,
      reminder_minutes: null,
      version: 1,
    },
  }));
  const attendance: AttendanceRecord[] = data.attendance.map((a) => ({
    id: a.id,
    user_id: ME,
    class_session_id: a.class_id,
    subject_id: a.subject_id,
    occurred_on: a.occurred_on,
    status: a.status,
    minutes_late: null,
    reason: null,
    note: a.note,
    source: a.source,
    version: 1,
    subject: a.subject_id ? subjectRef(subjects.get(a.subject_id)) : null,
  }));
  const grades: Grade[] = data.grades.map((g) => ({
    ...g,
    user_id: ME,
    version: 1,
    subject: g.subject_id ? subjectRef(subjects.get(g.subject_id)) : null,
  }));
  const exams = data.exams.map((e) => toExam(e, subjects, teachers)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const plans: TuitionPlan[] = data.plans
    .map((p) => ({
      id: p.id,
      user_id: ME,
      title: p.title,
      period_start: null,
      period_end: null,
      amount_due: p.amount_due,
      currency: 'RUB',
      due_date: p.due_date,
      payment_url: p.payment_url,
      note: p.note,
      source: p.source,
      version: 1,
      payments: data.payments
        .filter((x) => x.plan_id === p.id)
        .sort((a, b) => b.paid_on.localeCompare(a.paid_on))
        .map((x) => ({ id: x.id, user_id: ME, plan_id: x.plan_id, amount: x.amount, paid_on: x.paid_on, reference: null, note: x.note, source: x.source, version: 1 })),
    }))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const events: CalendarEvent[] = data.events.map((e) => ({
    id: e.id,
    kind: 'personal',
    owner_id: ME,
    group_id: null,
    institution_id: null,
    title: e.title,
    description: e.description,
    location: e.location,
    url: e.url,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    all_day: e.all_day,
    remind_minutes_before: null,
    source: e.source,
    version: 1,
  }));
  const attendanceByClass = new Map<string, AttendanceRecord>();
  for (const a of attendance) if (a.class_session_id) attendanceByClass.set(a.class_session_id, a);
  return { data, subjects, teachers, sessions, assignments, attendance, grades, exams, plans, events, attendanceByClass };
}

export function useModel(): Model {
  const data = useData();
  return useMemo(() => buildModel(data), [data]);
}
