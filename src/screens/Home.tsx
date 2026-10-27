import { useMemo } from 'react';

import { ClassCard, TaskCard } from '../components/cards';
import type { ClassSession } from '../shared/domain/models';
import { useNow, useToday } from '../hooks';
import { IS_PREVIEW } from '../lib/env';
import { isIos, isStandalone } from '../lib/platform';
import { useNav } from '../nav';
import { storedStatus, toggledStatus, upcomingDeadlines } from '../shared/domain/assignments';
import { attendanceTone, computeAttendanceStats } from '../shared/domain/attendance';
import { EXAM_KIND_LABELS } from '../shared/domain/calendar';
import { formatCountdown, formatMoneyKopecks, formatPercent, formatTimer, greetingByHour, greetingName, plural } from '../shared/domain/format';
import { nextUnpaidPlan, planNeedsAttention } from '../shared/domain/payments';
import { CLASS_TYPE_LABELS, findCurrentAndNext, sessionLocation } from '../shared/domain/schedule';
import { diffDaysBetweenKeys, formatDateTimeShort, formatRelativeDay, formatTime, formatWeekdayDayMonth, getZonedParts, toDateKey } from '../shared/domain/time';
import { clearDemo, hasDemo, isEmpty, setTaskStatus } from '../store/actions';
import { useModel } from '../store/model';
import { Icon, type IconName } from '../ui/Icon';
import { Card, cx, Empty, IconButton, Notice, ProgressBar, Ring, Section } from '../ui/kit';
import { useOverlay } from '../ui/overlay';
import { academicWeekLabel } from './weeks';

export function HomeScreen() {
  const nav = useNav();
  const model = useModel();
  const { data } = model;
  const { now, today, timeZone } = useToday();
  const overlay = useOverlay();

  const name = greetingName(data.settings.name);
  const hour = getZonedParts(now, timeZone).hour;
  const { current, next } = useMemo(() => findCurrentAndNext(model.sessions, now), [model.sessions, now]);
  const todays = useMemo(() => model.sessions.filter((s) => toDateKey(new Date(s.starts_at), timeZone) === today), [model.sessions, timeZone, today]);
  const deadlines = useMemo(() => upcomingDeadlines(model.assignments, now, 3), [model.assignments, now]);
  const stats = useMemo(() => computeAttendanceStats(model.attendance), [model.attendance]);
  const nextExam = model.exams.find((e) => Date.parse(e.starts_at) > now.getTime()) ?? null;
  const payment = nextUnpaidPlan(model.plans, today);
  const showPayment = payment && planNeedsAttention(payment.summary, data.settings.paymentReminderDays);
  const demo = hasDemo(data);
  const empty = isEmpty(data);
  const week = academicWeekLabel(data.settings.semesterStart, today);
  const showInstall = !IS_PREVIEW && !isStandalone() && !data.settings.installHintDismissed;
  const backupDue = !empty && !demo && (!data.lastBackupAt || Date.now() - Date.parse(data.lastBackupAt) > 30 * 86_400_000);

  return (
    <main className="screen home">
      <header className="hero">
        <div className="hero-top">
          <p className="hero-date">
            {formatWeekdayDayMonth(today)}
            {week ? <span className="hero-week"> · {week}</span> : null}
          </p>
          <IconButton icon="search" label="Поиск" onClick={() => nav.push({ name: 'search' })} />
        </div>
        <h1 className="hero-title">{name ? `${greetingByHour(hour)}, ${name}` : greetingByHour(hour)}</h1>
        {current || next ? (
          <NextClass current={current} next={next} timeZone={timeZone} today={today} onOpen={(id) => nav.push({ name: 'class', id })} />
        ) : (
          <div className="hero-card is-empty">
            <p className="hero-card-label">Ближайших пар нет</p>
            <div className="hero-actions">
              <button type="button" className="hero-btn" onClick={() => nav.push({ name: 'classForm', date: today })}>
                <Icon name="plus" size={18} /> Занятие
              </button>
              <button type="button" className="hero-btn" onClick={() => nav.push({ name: 'import' })}>
                <Icon name="upload" size={18} /> Импорт
              </button>
            </div>
          </div>
        )}
      </header>

      <div className="screen-body">
        {IS_PREVIEW ? <Notice icon="info" title="Предпросмотр приложения" /> : null}
        {showInstall && isIos() ? <Notice icon="phone" title="Добавьте на экран «Домой»" action={{ label: 'Как', onClick: () => nav.push({ name: 'install' }) }} /> : null}
        {demo ? (
          <Notice
            tone="warning"
            icon="info"
            title="Демо-данные"
            action={{
              label: 'Удалить',
              onClick: async () => {
                if (await overlay.confirm({ title: 'Удалить демо-данные?', message: 'Ваши записи останутся.', confirmLabel: 'Удалить', danger: true })) {
                  clearDemo();
                  overlay.toast('Демо-данные удалены');
                }
              },
            }}
          />
        ) : null}
        {backupDue ? <Notice icon="data" title="Сохраните копию данных" action={{ label: 'Сохранить', onClick: () => nav.push({ name: 'export' }) }} /> : null}

        <QuickActions />

        <Section title="Сегодня" action={{ label: 'Все', onClick: () => nav.setTab('schedule') }}>
          {todays.length === 0 ? (
            <p className="muted-text small">Пар нет</p>
          ) : (
            todays.map((s) => (
              <ClassCard key={s.id} session={s} now={now} timeZone={timeZone} attendance={model.attendanceByClass.get(s.id)} compact onClick={() => nav.push({ name: 'class', id: s.id })} />
            ))
          )}
        </Section>

        <Section title="Дедлайны" action={{ label: 'Все', onClick: () => nav.setTab('tasks') }}>
          {deadlines.length === 0 ? (
            <p className="muted-text small">Ближайших дедлайнов нет</p>
          ) : (
            deadlines.map((a) => (
              <TaskCard key={a.id} task={a} now={now} onClick={() => nav.push({ name: 'task', id: a.id })} onToggle={() => setTaskStatus(a.id, toggledStatus(storedStatus(a)))} />
            ))
          )}
        </Section>

        {nextExam ? (
          <Card onClick={() => nav.push({ name: 'exams' })} label="Ближайший экзамен">
            <div className="kpi">
              <span className="kpi-text">
                <span className="kpi-label">{EXAM_KIND_LABELS[nextExam.kind]}</span>
                <span className="kpi-title">{nextExam.subject?.name}</span>
                <span className="kpi-meta">{formatDateTimeShort(new Date(nextExam.starts_at), timeZone, now)}</span>
              </span>
              <DaysLeft days={Math.max(0, diffDaysBetweenKeys(today, toDateKey(new Date(nextExam.starts_at), timeZone)))} />
            </div>
          </Card>
        ) : null}

        {payment && showPayment ? (
          <Card onClick={() => nav.push({ name: 'payments' })} label="Оплата обучения">
            <div className="kpi">
              <span className="kpi-text">
                <span className="kpi-label">{payment.summary.status === 'overdue' ? 'Оплата просрочена' : 'Оплата'}</span>
                <span className="kpi-title">{formatMoneyKopecks(payment.summary.remainingKopecks)}</span>
                <span className="kpi-meta">до {formatRelativeDay(payment.plan.due_date, today).toLowerCase()}</span>
              </span>
            </div>
            <ProgressBar value={payment.summary.progress} tone={payment.summary.status === 'overdue' ? 'danger' : 'primary'} label="Оплачено" />
          </Card>
        ) : null}

        {stats.total > 0 ? (
          <Card onClick={() => nav.push({ name: 'attendance' })} label="Посещаемость">
            <div className="kpi">
              <span className="kpi-text">
                <span className="kpi-label">Посещаемость</span>
                <span className="kpi-title">
                  {stats.attended} из {stats.total}
                </span>
              </span>
              <Ring value={stats.rate === null ? null : stats.rate / 100} tone={toneForRate(attendanceTone(stats.rate))} size={52}>
                {stats.rate === null ? '—' : formatPercent(stats.rate)}
              </Ring>
            </div>
          </Card>
        ) : null}

        {empty ? (
          <Empty
            icon="book"
            title="Начните с расписания"
            text="Добавьте пары или загрузите файл."
            action={{ label: 'Добавить пару', onClick: () => nav.push({ name: 'classForm', date: today }) }}
            secondary={{ label: 'Демо', onClick: () => nav.push({ name: 'data' }) }}
          />
        ) : null}
      </div>
    </main>
  );
}

function toneForRate(t: ReturnType<typeof attendanceTone>) {
  return t === 'neutral' ? 'primary' : t;
}

export function DaysLeft({ days }: { days: number }) {
  return (
    <span className="kpi-value">
      <span className="kpi-number">{days}</span>
      <span className="kpi-unit">{days === 0 ? 'сегодня' : plural(days, ['день', 'дня', 'дней'])}</span>
    </span>
  );
}

function NextClass({
  current,
  next,
  timeZone,
  today,
  onOpen,
}: {
  current: ClassSession | null;
  next: ClassSession | null;
  timeZone: string;
  today: string;
  onOpen: (id: string) => void;
}) {
  // Таймер обновляется каждую секунду только в этой карточке, а не на всём экране.
  const now = useNow(1000);
  const s = current ?? next;
  if (!s) return null;
  const start = new Date(s.starts_at);
  const end = new Date(s.ends_at);
  const isCurrent = !!current;
  const day = toDateKey(start, timeZone);
  const location = sessionLocation(s);
  const target = isCurrent ? end : start;
  const underHour = target.getTime() - now.getTime() < 3600_000;
  return (
    <button type="button" className="hero-card" onClick={() => onOpen(s.id)}>
      <span className="hero-card-label">
        {isCurrent ? 'Идёт сейчас' : day === today ? 'Следующая пара' : `Следующая пара · ${formatRelativeDay(day, today).toLowerCase()}`}
      </span>
      <span className="hero-card-title">{s.subject?.name ?? 'Занятие'}</span>
      <span className="hero-card-meta">
        {formatTime(start, timeZone)}–{formatTime(end, timeZone)} · {CLASS_TYPE_LABELS[s.class_type]}
        {location ? ` · ${location}` : ''}
      </span>
      <span className="hero-countdown">
        <span className={cx('hero-timer', isCurrent && 'is-current')}>
          {underHour ? formatTimer(target, now).replace(/^00:/, '') : formatCountdown(target, now).replace(/^через /, '')}
        </span>
        <span className="hero-timer-label">{isCurrent ? 'до конца пары' : 'до начала'}</span>
      </span>
      {isCurrent && next ? (
        <span className="hero-card-next">
          Дальше: {next.subject?.name} в {formatTime(new Date(next.starts_at), timeZone)}
        </span>
      ) : null}
    </button>
  );
}

const QUICK: { label: string; icon: IconName; route: 'schedule' | 'tasks' | 'grades' | 'attendance' }[] = [
  { label: 'Расписание', icon: 'schedule', route: 'schedule' },
  { label: 'Задания', icon: 'tasks', route: 'tasks' },
  { label: 'Баллы', icon: 'chart', route: 'grades' },
  { label: 'Посещаемость', icon: 'users', route: 'attendance' },
];

function QuickActions() {
  const nav = useNav();
  return (
    <nav className="quick" aria-label="Быстрые действия">
      {QUICK.map((q) => (
        <button
          key={q.route}
          type="button"
          className="quick-btn"
          onClick={() => (q.route === 'schedule' || q.route === 'tasks' ? nav.setTab(q.route) : nav.push({ name: q.route }))}
        >
          <span className="quick-icon" aria-hidden="true">
            <Icon name={q.icon} />
          </span>
          <span className="quick-label">{q.label}</span>
        </button>
      ))}
    </nav>
  );
}

