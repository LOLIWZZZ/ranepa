import type { Assignment, AttendanceRecord, ClassSession, Grade, TuitionPlan } from '../../src/shared/domain/models';

let counter = 0;
const id = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

export const subject = { id: id(), name: 'Экономика организации', short_name: 'Экономика', color: '#001B71' };
export const subject2 = { id: id(), name: 'Административное право', short_name: null, color: null };

export function session(overrides: Partial<ClassSession> = {}): ClassSession {
  return {
    id: id(),
    group_id: null,
    owner_id: 'owner',
    subject_id: subject.id,
    teacher_id: null,
    teacher_note: 'Иванов И. И.',
    classroom_id: null,
    location_note: null,
    class_type: 'seminar',
    format: 'offline',
    online_url: null,
    starts_at: '2026-10-26T07:00:00.000Z',
    ends_at: '2026-10-26T08:30:00.000Z',
    status: 'scheduled',
    original_starts_at: null,
    status_note: null,
    series_id: null,
    notes: null,
    source: 'manual',
    version: 1,
    subject,
    teacher: null,
    classroom: { id: id(), name: '305', building: { id: id(), name: 'Корпус 1', address: null } },
    group: null,
    ...overrides,
  };
}

export function assignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: id(),
    group_id: null,
    owner_id: 'owner',
    subject_id: subject.id,
    teacher_id: null,
    teacher_note: null,
    class_session_id: null,
    title: 'Задание',
    description: null,
    issued_at: '2026-10-20T07:00:00.000Z',
    due_at: '2026-10-27T20:59:00.000Z',
    priority: 'medium',
    source: 'manual',
    version: 1,
    created_by: 'owner',
    subject,
    teacher: null,
    progress: null,
    ...overrides,
  };
}

export function attendance(overrides: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: id(),
    user_id: 'owner',
    class_session_id: null,
    subject_id: subject.id,
    occurred_on: '2026-10-26',
    status: 'present',
    minutes_late: null,
    reason: null,
    note: null,
    source: 'manual',
    version: 1,
    subject,
    ...overrides,
  };
}

export function grade(overrides: Partial<Grade> = {}): Grade {
  return {
    id: id(),
    user_id: 'owner',
    subject_id: subject.id,
    kind: 'test',
    title: 'Тест',
    score: null,
    max_score: null,
    mark: null,
    weight: 1,
    graded_on: '2026-10-20',
    note: null,
    source: 'manual',
    version: 1,
    subject,
    ...overrides,
  };
}

export function plan(overrides: Partial<TuitionPlan> = {}): TuitionPlan {
  return {
    id: id(),
    user_id: 'owner',
    title: 'Весенний семестр',
    period_start: null,
    period_end: null,
    amount_due: 150000,
    currency: 'RUB',
    due_date: '2026-11-05',
    payment_url: null,
    note: null,
    source: 'manual',
    version: 1,
    payments: [],
    ...overrides,
  };
}
