/**
 * Модели данных приложения (строки БД + связанные записи, как их возвращает API).
 * Доменная логика зависит только от этих типов, а не от клиента Supabase.
 */
import type { Enums } from '../enums';

export type DataSource = Enums<'data_source'>;
export type ClassType = Enums<'class_type'>;
export type ClassFormat = Enums<'class_format'>;
export type ClassStatus = Enums<'class_status'>;
export type AssignmentStatus = Enums<'assignment_status'>;
export type PriorityLevel = Enums<'priority_level'>;
export type AttendanceStatus = Enums<'attendance_status'>;
export type GradeKind = Enums<'grade_kind'>;
export type ExamKind = Enums<'exam_kind'>;
export type EventKind = Enums<'event_kind'>;
export type GroupMemberRole = Enums<'group_member_role'>;
export type UserRole = Enums<'user_role'>;
export type StudyForm = Enums<'study_form'>;
export type NotificationKind = Enums<'notification_kind'>;
export type ThemePreference = Enums<'theme_preference'>;
export type ScheduleChangeType = Enums<'schedule_change_type'>;

/** Признак записи, созданной офлайн и ещё не подтверждённой сервером. */
export interface PendingFlag {
  _pending?: boolean;
}

export interface SubjectRef {
  id: string;
  name: string;
  short_name: string | null;
  color: string | null;
}

export interface TeacherRef {
  id: string;
  full_name: string;
  department: string | null;
  email: string | null;
  phone: string | null;
  profile_url: string | null;
  contacts_source: string | null;
}

export interface BuildingRef {
  id: string;
  name: string;
  address: string | null;
}

export interface ClassroomRef {
  id: string;
  name: string;
  building: BuildingRef | null;
}

export interface GroupRef {
  id: string;
  name: string;
}

export interface ClassSession extends PendingFlag {
  id: string;
  group_id: string | null;
  owner_id: string | null;
  subject_id: string;
  teacher_id: string | null;
  teacher_note: string | null;
  classroom_id: string | null;
  location_note: string | null;
  class_type: ClassType;
  format: ClassFormat;
  online_url: string | null;
  starts_at: string;
  ends_at: string;
  status: ClassStatus;
  original_starts_at: string | null;
  status_note: string | null;
  series_id: string | null;
  notes: string | null;
  source: DataSource;
  version: number;
  subject: SubjectRef | null;
  teacher: TeacherRef | null;
  classroom: ClassroomRef | null;
  group: GroupRef | null;
}

export interface AssignmentProgress {
  assignment_id: string;
  user_id: string;
  status: AssignmentStatus;
  completed_at: string | null;
  submitted_at: string | null;
  note: string | null;
  reminder_minutes: number[] | null;
  version: number;
}

export interface Assignment extends PendingFlag {
  id: string;
  group_id: string | null;
  owner_id: string | null;
  subject_id: string | null;
  teacher_id: string | null;
  teacher_note: string | null;
  class_session_id: string | null;
  title: string;
  description: string | null;
  issued_at: string;
  due_at: string | null;
  priority: PriorityLevel;
  source: DataSource;
  version: number;
  created_by: string | null;
  subject: SubjectRef | null;
  teacher: TeacherRef | null;
  progress: AssignmentProgress | null;
}

export interface AttendanceRecord extends PendingFlag {
  id: string;
  user_id: string;
  class_session_id: string | null;
  subject_id: string | null;
  occurred_on: string;
  status: AttendanceStatus;
  minutes_late: number | null;
  reason: string | null;
  note: string | null;
  source: DataSource;
  version: number;
  subject: SubjectRef | null;
}

export interface Grade extends PendingFlag {
  id: string;
  user_id: string;
  subject_id: string | null;
  kind: GradeKind;
  title: string;
  score: number | null;
  max_score: number | null;
  mark: string | null;
  weight: number;
  graded_on: string;
  note: string | null;
  source: DataSource;
  version: number;
  subject: SubjectRef | null;
}

export interface Exam extends PendingFlag {
  id: string;
  group_id: string | null;
  owner_id: string | null;
  subject_id: string;
  kind: ExamKind;
  starts_at: string;
  ends_at: string | null;
  teacher_id: string | null;
  teacher_note: string | null;
  classroom_id: string | null;
  location_note: string | null;
  format: ClassFormat;
  online_url: string | null;
  notes: string | null;
  source: DataSource;
  version: number;
  subject: SubjectRef | null;
  teacher: TeacherRef | null;
  classroom: ClassroomRef | null;
}

export interface Payment extends PendingFlag {
  id: string;
  user_id: string;
  plan_id: string;
  amount: number;
  paid_on: string;
  reference: string | null;
  note: string | null;
  source: DataSource;
  version: number;
}

export interface TuitionPlan extends PendingFlag {
  id: string;
  user_id: string;
  title: string;
  period_start: string | null;
  period_end: string | null;
  amount_due: number;
  currency: string;
  due_date: string;
  payment_url: string | null;
  note: string | null;
  source: DataSource;
  version: number;
  payments: Payment[];
}

export interface CalendarEvent extends PendingFlag {
  id: string;
  kind: EventKind;
  owner_id: string | null;
  group_id: string | null;
  institution_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  url: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  remind_minutes_before: number | null;
  source: DataSource;
  version: number;
}

export interface Announcement {
  id: string;
  group_id: string | null;
  institution_id: string | null;
  author_id: string | null;
  title: string;
  body: string;
  importance: Enums<'announcement_importance'>;
  pinned: boolean;
  published_at: string;
  expires_at: string | null;
  source: DataSource;
  version: number;
  read: boolean;
}

export interface UserPreferences {
  user_id: string;
  theme: ThemePreference;
  language: string;
  notify_class_soon: boolean;
  class_reminder_minutes: number;
  notify_schedule_changes: boolean;
  notify_announcements: boolean;
  notify_assignments: boolean;
  notify_deadlines: boolean;
  deadline_reminder_minutes: number[];
  notify_payments: boolean;
  payment_reminder_days: number;
  notify_exams: boolean;
  exam_reminder_days: number;
  notify_grades: boolean;
  notify_personal_events: boolean;
  reminder_hour: number;
  version: number;
}

export const DEFAULT_PREFERENCES: Omit<UserPreferences, 'user_id'> = {
  theme: 'system',
  language: 'ru',
  notify_class_soon: true,
  class_reminder_minutes: 15,
  notify_schedule_changes: true,
  notify_announcements: true,
  notify_assignments: true,
  notify_deadlines: true,
  deadline_reminder_minutes: [1440, 60],
  notify_payments: true,
  payment_reminder_days: 7,
  notify_exams: true,
  exam_reminder_days: 3,
  notify_grades: true,
  notify_personal_events: true,
  reminder_hour: 10,
  version: 1,
};
