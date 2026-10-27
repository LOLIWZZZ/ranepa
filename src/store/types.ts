/**
 * Формат локальных данных приложения. Всё хранится на устройстве (localStorage),
 * сервер не нужен. Структура близка к таблицам серверной версии, чтобы данные можно было
 * перенести при подключении синхронизации.
 */
import type {
  AssignmentStatus,
  AttendanceStatus,
  ClassFormat,
  ClassStatus,
  ClassType,
  DataSource,
  ExamKind,
  GradeKind,
  PriorityLevel,
  ThemePreference,
} from '../shared/domain/models';
import type { DateKey } from '../shared/domain/time';

export interface Teacher {
  id: string;
  /** ФИО преподавателя */
  name: string;
  notes: string | null;
  source: DataSource;
  created_at: string;
}

/** У дисциплины 1–2 преподавателя (лектор и семинарист). */
export const MAX_SUBJECT_TEACHERS = 2;

export interface Subject {
  id: string;
  name: string;
  short_name: string | null;
  color: string;
  teacher_ids: string[];
  notes: string | null;
  source: DataSource;
  created_at: string;
}

export interface ClassItem {
  id: string;
  subject_id: string;
  class_type: ClassType;
  format: ClassFormat;
  starts_at: string;
  ends_at: string;
  status: ClassStatus;
  original_starts_at: string | null;
  status_note: string | null;
  series_id: string | null;
  /** Преподаватель из справочника; если не задан — первый преподаватель дисциплины */
  teacher_id: string | null;
  /** ФИО из импортированного файла, если его нет в справочнике */
  teacher: string | null;
  building: string | null;
  room: string | null;
  location: string | null;
  online_url: string | null;
  notes: string | null;
  source: DataSource;
  external_id: string | null;
  import_id: string | null;
  updated_at: string;
}

export interface Task {
  id: string;
  subject_id: string | null;
  title: string;
  description: string | null;
  due_at: string | null;
  priority: PriorityLevel;
  status: AssignmentStatus;
  completed_at: string | null;
  url: string | null;
  source: DataSource;
  created_at: string;
  updated_at: string;
}

export interface Attendance {
  id: string;
  class_id: string | null;
  subject_id: string | null;
  occurred_on: DateKey;
  status: AttendanceStatus;
  note: string | null;
  source: DataSource;
  updated_at: string;
}

export interface GradeItem {
  id: string;
  subject_id: string | null;
  kind: GradeKind;
  title: string;
  score: number | null;
  max_score: number | null;
  mark: string | null;
  weight: number;
  graded_on: DateKey;
  note: string | null;
  source: DataSource;
}

export interface ExamItem {
  id: string;
  subject_id: string;
  kind: ExamKind;
  starts_at: string;
  ends_at: string | null;
  building: string | null;
  room: string | null;
  location: string | null;
  format: ClassFormat;
  online_url: string | null;
  teacher: string | null;
  notes: string | null;
  source: DataSource;
}

export interface Plan {
  id: string;
  title: string;
  /** Сумма в рублях */
  amount_due: number;
  due_date: DateKey;
  payment_url: string | null;
  note: string | null;
  source: DataSource;
}

export interface PaymentItem {
  id: string;
  plan_id: string;
  /** Сумма в рублях */
  amount: number;
  paid_on: DateKey;
  note: string | null;
  source: DataSource;
}

export interface EventItem {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  url: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  source: DataSource;
}

export interface ImportRecord {
  id: string;
  file_name: string;
  format: 'ics' | 'csv';
  created_at: string;
  created: number;
  updated: number;
  skipped: number;
}

export interface Settings {
  name: string;
  group: string;
  institution: string;
  timeZone: string;
  theme: ThemePreference;
  /** Первый день семестра — для номера учебной недели */
  semesterStart: DateKey | null;
  /** Длительность одной пары, минут */
  pairMinutes: number;
  /** Напоминание о паре в экспортируемом календаре, минут до начала (0 — без напоминания) */
  classReminderMinutes: number;
  /** Напоминания о дедлайнах, минут до срока */
  deadlineReminderMinutes: number[];
  examReminderDays: number;
  paymentReminderDays: number;
  /** Час напоминаний о сроках оплаты */
  reminderHour: number;
  badge: boolean;
  onboarded: boolean;
  installHintDismissed: boolean;
}

export interface AppData {
  version: 1;
  settings: Settings;
  teachers: Teacher[];
  subjects: Subject[];
  classes: ClassItem[];
  tasks: Task[];
  attendance: Attendance[];
  grades: GradeItem[];
  exams: ExamItem[];
  plans: Plan[];
  payments: PaymentItem[];
  events: EventItem[];
  imports: ImportRecord[];
  lastBackupAt: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  group: '',
  institution: '',
  timeZone: 'Europe/Moscow',
  theme: 'system',
  semesterStart: null,
  pairMinutes: 80,
  classReminderMinutes: 15,
  deadlineReminderMinutes: [1440, 60],
  examReminderDays: 3,
  paymentReminderDays: 7,
  reminderHour: 10,
  badge: false,
  onboarded: false,
  installHintDismissed: false,
};

export function emptyData(): AppData {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
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
  };
}

export const SUBJECT_COLORS = [
  '#3B5BDB',
  '#BE003E',
  '#0B7A75',
  '#E8590C',
  '#7048E8',
  '#2F9E44',
  '#C2255C',
  '#1971C2',
  '#B07400',
  '#5C677D',
] as const;
