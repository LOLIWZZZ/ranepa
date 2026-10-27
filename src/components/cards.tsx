import type { AttendanceRecord, Assignment, ClassSession } from '../shared/domain/models';
import { deadlineInfo, isCompleted, storedStatus } from '../shared/domain/assignments';
import { ATTENDANCE_LABELS } from '../shared/domain/attendance';
import type { CalendarItem, CalendarItemKind } from '../shared/domain/calendar';
import { CLASS_TYPE_SHORT, isRescheduled, sessionLocation, sessionPhase, sessionProgress } from '../shared/domain/schedule';
import { formatTime } from '../shared/domain/time';
import { Icon, type IconName } from '../ui/Icon';
import { Badge, cx, ProgressBar, type Tone } from '../ui/kit';

const ATTENDANCE_TONE: Record<AttendanceRecord['status'], Tone> = {
  present: 'success',
  late: 'warning',
  absent: 'danger',
  excused: 'neutral',
};

export function ClassCard({
  session,
  now,
  timeZone,
  attendance,
  onClick,
  compact,
  conflict,
}: {
  session: ClassSession;
  now: Date;
  timeZone: string;
  attendance?: AttendanceRecord | null;
  onClick: () => void;
  compact?: boolean;
  /** Пересекается по времени с другой парой */
  conflict?: boolean;
}) {
  const phase = sessionPhase(session, now);
  const start = new Date(session.starts_at);
  const end = new Date(session.ends_at);
  const location = sessionLocation(session);
  const color = session.subject?.color ?? 'var(--primary)';
  const status =
    phase === 'cancelled'
      ? { label: 'Отменено', tone: 'danger' as const }
      : conflict
        ? { label: 'Пересечение', tone: 'danger' as const }
        : phase === 'ongoing'
          ? { label: 'Идёт', tone: 'primary' as const }
          : isRescheduled(session)
            ? { label: 'Перенесено', tone: 'warning' as const }
            : null;
  return (
    <button
      type="button"
      className={cx('class-card', `is-${phase}`, compact && 'is-compact')}
      onClick={onClick}
      aria-label={`${session.subject?.name ?? 'Занятие'}, ${formatTime(start, timeZone)}–${formatTime(end, timeZone)}${status ? `, ${status.label.toLowerCase()}` : ''}${attendance ? `, ${ATTENDANCE_LABELS[attendance.status].toLowerCase()}` : ''}`}
    >
      <span className="class-time">
        <span className="class-time-start">{formatTime(start, timeZone)}</span>
        <span className="class-time-end">{formatTime(end, timeZone)}</span>
      </span>
      <span className="class-bar" style={{ background: color }} aria-hidden="true" />
      <span className="class-main">
        <span className="class-subject">{session.subject?.name ?? 'Занятие'}</span>
        <span className="class-meta">{[CLASS_TYPE_SHORT[session.class_type], location].filter(Boolean).join(' · ')}</span>
        {phase === 'ongoing' ? <ProgressBar value={sessionProgress(session, now)} label="Прошло времени занятия" /> : null}
      </span>
      {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
      {attendance && !status ? <span className={cx('att-dot', `tone-${ATTENDANCE_TONE[attendance.status]}`)} title={ATTENDANCE_LABELS[attendance.status]} aria-hidden="true" /> : null}
    </button>
  );
}


export function TaskCard({ task, now, onClick, onToggle }: { task: Assignment; now: Date; onClick: () => void; onToggle: () => void }) {
  const done = isCompleted(storedStatus(task));
  const info = deadlineInfo(task, now);
  return (
    <div className={cx('task-card', done && 'is-done')}>
      <button type="button" className={cx('task-check', done && 'is-checked')} onClick={onToggle} aria-label={done ? `Вернуть в работу: ${task.title}` : `Отметить выполненным: ${task.title}`}>
        <Icon name={done ? 'checkCircle' : 'circle'} size={26} />
      </button>
      <button type="button" className="task-main" onClick={onClick}>
        <span className="task-title">{task.title}</span>
        <span className="task-meta">
          {task.subject ? <span className="task-subject">{task.subject.short_name ?? task.subject.name}</span> : null}
          <span className={cx('task-due', `due-${info.tone}`)}>{info.label}</span>
          {task.priority === 'high' && !done ? <Icon name="flag" size={14} className="task-flag" /> : null}
        </span>
      </button>
    </div>
  );
}

export const KIND_STYLE: Record<CalendarItemKind, { color: string; icon: IconName }> = {
  class: { color: 'var(--primary)', icon: 'schedule' },
  assignment: { color: 'var(--accent)', icon: 'tasks' },
  exam: { color: 'var(--violet)', icon: 'award' },
  credit: { color: 'var(--teal)', icon: 'award' },
  consultation: { color: 'var(--sky)', icon: 'users' },
  payment: { color: 'var(--orange)', icon: 'wallet' },
  personal: { color: 'var(--green)', icon: 'user' },
  group: { color: 'var(--sky)', icon: 'users' },
  university: { color: 'var(--sky)', icon: 'book' },
};

export function CalendarItemRow({ item, onClick }: { item: CalendarItem; onClick: () => void }) {
  const style = KIND_STYLE[item.kind];
  return (
    <button type="button" className={cx('cal-item', item.cancelled && 'is-cancelled', item.completed && 'is-completed')} onClick={onClick}>
      <span className="cal-item-icon" style={{ color: style.color }} aria-hidden="true">
        <Icon name={style.icon} size={18} />
      </span>
      <span className="cal-item-text">
        <span className="cal-item-title">{item.title}</span>
        {item.subtitle ? <span className="cal-item-subtitle">{item.subtitle}</span> : null}
      </span>
      {item.cancelled ? <Badge tone="danger">Отменено</Badge> : item.completed ? <Badge tone="success">Готово</Badge> : null}
    </button>
  );
}
