/**
 * Демо-данные для знакомства с приложением. Все записи помечены source = 'demo' и
 * удаляются одной кнопкой. Это вымышленные примеры, а не расписание РАНХиГС.
 */
import { addDaysToKey, combineDateKeyAndTime, startOfWeekKey, toDateKey, type DateKey } from '../shared/domain/time';
import { getData, newId, update } from './store';
import { addMinutesToTime, DEFAULT_PAIR_MINUTES } from './rules';
import type { Attendance, ClassItem, ExamItem, GradeItem, PaymentItem, Plan, Subject, Task, EventItem, Teacher } from './types';

interface DemoSubject {
  name: string;
  short: string | null;
  color: string;
  type: ClassItem['class_type'];
  weekday: number;
  start: string;
  /** Сколько преподавателей у дисциплины (лектор и семинарист) */
  teachers: 1 | 2;
  room: string | null;
  format: ClassItem['format'];
}

const DEMO_SUBJECTS: DemoSubject[] = [
  { name: 'Экономическая теория', short: 'Экономтеория', color: '#3B5BDB', type: 'lecture', weekday: 1, start: '09:00', teachers: 2, room: '301', format: 'offline' },
  { name: 'Государственное управление', short: 'Госуправление', color: '#BE003E', type: 'seminar', weekday: 1, start: '10:30', teachers: 2, room: '214', format: 'offline' },
  { name: 'Иностранный язык', short: 'Ин. язык', color: '#0B7A75', type: 'practice', weekday: 2, start: '12:20', teachers: 1, room: null, format: 'online' },
  { name: 'Математический анализ', short: 'Матанализ', color: '#7048E8', type: 'lecture', weekday: 3, start: '09:00', teachers: 2, room: '105', format: 'offline' },
  { name: 'Право', short: null, color: '#E8590C', type: 'seminar', weekday: 4, start: '13:50', teachers: 1, room: '402', format: 'offline' },
  { name: 'Информатика', short: null, color: '#2F9E44', type: 'lab', weekday: 5, start: '10:30', teachers: 1, room: '118', format: 'offline' },
];

export function seedDemo(timeZone: string): void {
  const now = new Date();
  const today = toDateKey(now, timeZone);
  const monday = startOfWeekKey(today);
  const stamp = now.toISOString();

  const teachers: Teacher[] = [];
  const subjects: Subject[] = DEMO_SUBJECTS.map((s, i) => {
    const ids: string[] = [];
    for (let k = 1; k <= s.teachers; k += 1) {
      const t: Teacher = { id: newId(), name: `Преподаватель ${i + 1}.${k} (демо)`, notes: null, source: 'demo', created_at: stamp };
      teachers.push(t);
      ids.push(t.id);
    }
    return { id: newId(), name: s.name, short_name: s.short, color: s.color, teacher_ids: ids, notes: null, source: 'demo', created_at: stamp };
  });

  const classes: ClassItem[] = [];
  for (let week = -1; week <= 2; week += 1) {
    DEMO_SUBJECTS.forEach((s, i) => {
      const subject = subjects[i];
      if (!subject) return;
      const day: DateKey = addDaysToKey(monday, week * 7 + s.weekday - 1);
      classes.push({
        id: newId(),
        subject_id: subject.id,
        class_type: s.type,
        format: s.format,
        starts_at: combineDateKeyAndTime(day, s.start, timeZone).toISOString(),
        ends_at: combineDateKeyAndTime(day, addMinutesToTime(s.start, DEFAULT_PAIR_MINUTES) ?? s.start, timeZone).toISOString(),
        status: 'scheduled',
        original_starts_at: null,
        status_note: null,
        series_id: `demo-${i}`,
        teacher_id: null,
        teacher: null,
        building: s.room ? 'Корпус 1 (демо)' : null,
        room: s.room,
        location: null,
        online_url: s.format === 'online' ? 'https://example.com/demo-room' : null,
        notes: null,
        source: 'demo',
        external_id: null,
        import_id: null,
        updated_at: stamp,
      });
    });
  }
  // Пример отмены на следующей неделе
  const cancelled = classes.find((c) => c.starts_at > combineDateKeyAndTime(addDaysToKey(monday, 7), '00:00', timeZone).toISOString());
  if (cancelled) {
    cancelled.status = 'cancelled';
    cancelled.status_note = 'Пример отмены (демо)';
  }

  const attendance: Attendance[] = classes
    .filter((c) => Date.parse(c.ends_at) < now.getTime() && c.status !== 'cancelled')
    .map((c, i) => ({
      id: newId(),
      class_id: c.id,
      subject_id: c.subject_id,
      occurred_on: toDateKey(new Date(c.starts_at), timeZone),
      status: i % 7 === 3 ? 'absent' : i % 5 === 2 ? 'late' : 'present',
      note: null,
      source: 'demo',
      updated_at: stamp,
    }));

  const at = (days: number, time: string) => combineDateKeyAndTime(addDaysToKey(today, days), time, timeZone).toISOString();
  const sid = (i: number) => subjects[i]?.id ?? null;
  const task = (i: number, title: string, due: string | null, status: Task['status'], priority: Task['priority']): Task => ({
    id: newId(),
    subject_id: sid(i),
    title,
    description: 'Пример задания (демо)',
    due_at: due,
    priority,
    status,
    completed_at: status === 'done' ? stamp : null,
    url: null,
    source: 'demo',
    created_at: stamp,
    updated_at: stamp,
  });
  const tasks: Task[] = [
    task(1, 'Эссе о реформах управления', at(1, '23:59'), 'in_progress', 'high'),
    task(3, 'Решить задачи 1–10', at(0, '20:00'), 'not_started', 'medium'),
    task(2, 'Выучить лексику по теме 4', at(4, '12:00'), 'not_started', 'low'),
    task(0, 'Конспект лекции', at(-1, '18:00'), 'not_started', 'medium'),
    task(5, 'Лабораторная работа № 2', at(-3, '23:59'), 'done', 'medium'),
  ];

  const points = (i: number, title: string, value: number, days: number, kind: GradeItem['kind'] = 'assignment'): GradeItem => ({
    id: newId(),
    subject_id: sid(i),
    kind,
    title,
    score: value,
    max_score: null,
    mark: null,
    weight: 1,
    graded_on: addDaysToKey(today, -days),
    note: null,
    source: 'demo',
  });
  const grades: GradeItem[] = [
    points(0, 'Доклад', 10, 20),
    points(0, 'Работа на семинарах', 12, 9),
    points(1, 'Эссе', 15, 14),
    points(1, 'Посещение', 8, 3),
    points(3, 'Контрольная работа № 1', 18, 6, 'control'),
    points(4, 'Тест', 9, 10, 'test'),
    points(5, 'Лабораторная работа № 1', 20, 4),
  ];

  const exams: ExamItem[] = [
    {
      id: newId(),
      subject_id: subjects[3]?.id ?? '',
      kind: 'exam',
      starts_at: at(24, '10:00'),
      ends_at: at(24, '13:00'),
      building: 'Корпус 1 (демо)',
      room: '105',
      location: null,
      format: 'offline',
      online_url: null,
      teacher: null,
      notes: null,
      source: 'demo',
    },
    {
      id: newId(),
      subject_id: subjects[4]?.id ?? '',
      kind: 'credit',
      starts_at: at(19, '14:20'),
      ends_at: null,
      building: null,
      room: '402',
      location: null,
      format: 'offline',
      online_url: null,
      teacher: null,
      notes: null,
      source: 'demo',
    },
  ];

  const planId = newId();
  const plans: Plan[] = [
    { id: planId, title: 'Оплата семестра (демо)', amount_due: 150000, due_date: addDaysToKey(today, 5), payment_url: null, note: null, source: 'demo' },
  ];
  const payments: PaymentItem[] = [
    { id: newId(), plan_id: planId, amount: 50000, paid_on: addDaysToKey(today, -20), note: 'Первая часть', source: 'demo' },
  ];

  const events: EventItem[] = [
    { id: newId(), title: 'Встреча студсовета (демо)', description: null, location: 'Ауд. 210', url: null, starts_at: at(2, '17:00'), ends_at: at(2, '18:00'), all_day: false, source: 'demo' },
  ];

  if (getData().subjects.some((s) => s.source === 'demo')) return;
  update((d) => ({
    ...d,
    teachers: [...d.teachers, ...teachers],
    subjects: [...d.subjects, ...subjects],
    classes: [...d.classes, ...classes],
    attendance: [...d.attendance, ...attendance],
    tasks: [...d.tasks, ...tasks],
    grades: [...d.grades, ...grades],
    exams: [...d.exams, ...exams.filter((e) => e.subject_id)],
    plans: [...d.plans, ...plans],
    payments: [...d.payments, ...payments],
    events: [...d.events, ...events],
  }));
}
