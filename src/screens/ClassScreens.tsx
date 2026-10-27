import { useMemo, useState } from 'react';

import { useToday } from '../hooks';
import { isHttpsUrl, openExternal } from '../lib/platform';
import { useNav } from '../nav';
import { formatDurationMinutes, pluralize } from '../shared/domain/format';
import type { AttendanceStatus, ClassFormat, ClassType } from '../shared/domain/models';
import {
  CLASS_FORMAT_LABELS,
  CLASS_TYPE_LABELS,
  generateOccurrences,
  isRescheduled,
  RecurrenceError,
  sessionLocation,
  sessionPhase,
  sessionTeacherName,
} from '../shared/domain/schedule';
import { addDaysToKey, combineDateKeyAndTime, formatDateTimeShort, formatTime, formatWeekdayDayMonth, isoWeekdayOfKey, minutesBetween, toDateKey, WEEKDAYS_SHORT, type DateKey } from '../shared/domain/time';
import {
  cancelClass,
  createSeries,
  deleteClass,
  deleteSeriesFrom,
  markAttendance,
  rescheduleClass,
  restoreClass,
  saveClass,
  updateSeriesFrom,
  ensureTeacher,
  saveSubject,
  ScheduleConflictError,
  type ClassFields,
} from '../store/actions';
import { useModel } from '../store/model';
import { initialPairTime, PairTime, pairTimeErrors, type PairTimeValue } from '../components/PairTime';
import { SubjectPicker } from '../components/SubjectPicker';
import { addMinutesToTime, DEFAULT_PAIR_MINUTES, findConflicts, type Interval } from '../store/rules';
import { MAX_SUBJECT_TEACHERS } from '../store/types';
import { DateInput, FormError, FormRow, Select, TextArea, TextInput, Toggle } from '../ui/form';
import { Icon } from '../ui/Icon';
import { Badge, Button, Card, cx, Empty, List, Notice, Row, Section, Segmented, SourceBadge } from '../ui/kit';
import { NavAction, Page } from '../ui/layout';
import { Sheet, useOverlay } from '../ui/overlay';

const ATTENDANCE_OPTIONS: { value: AttendanceStatus; label: string; tone: string }[] = [
  { value: 'present', label: 'Был', tone: 'success' },
  { value: 'late', label: 'Опоздал', tone: 'warning' },
  { value: 'absent', label: 'Пропуск', tone: 'danger' },
  { value: 'excused', label: 'Уважит.', tone: 'neutral' },
];

export function ClassDetailScreen({ id }: { id: string }) {
  const nav = useNav();
  const model = useModel();
  const overlay = useOverlay();
  const { now, timeZone } = useToday();
  const item = model.data.classes.find((c) => c.id === id);
  const session = model.sessions.find((s) => s.id === id);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (!item || !session) {
    return (
      <Page title="Занятие">
        <Empty icon="schedule" title="Занятие не найдено" text="Возможно, его удалили." />
      </Page>
    );
  }

  const start = new Date(session.starts_at);
  const end = new Date(session.ends_at);
  const phase = sessionPhase(session, now);
  const location = sessionLocation(session);
  const teacher = sessionTeacherName(session);
  const attendance = model.attendanceByClass.get(id) ?? null;
  const seriesCount = item.series_id ? model.data.classes.filter((c) => c.series_id === item.series_id).length : 0;
  const tasks = model.assignments.filter((a) => a.subject_id === item.subject_id && a.due_at && Date.parse(a.due_at) >= start.getTime() - 7 * 86_400_000).slice(0, 3);

  const edit = async () => {
    if (item.series_id && seriesCount > 1) {
      const scope = await overlay.choose('Изменить повторяющееся занятие', [
        { label: 'Только это занятие', value: 'one' as const },
        { label: 'Это и следующие', value: 'series' as const },
      ]);
      if (!scope) return;
      nav.push({ name: 'classForm', id, scope });
    } else nav.push({ name: 'classForm', id, scope: 'one' });
  };

  const remove = async () => {
    if (item.series_id && seriesCount > 1) {
      const scope = await overlay.choose(
        'Удалить занятие?',
        [
          { label: 'Только это занятие', value: 'one' as const, danger: true },
          { label: 'Это и следующие', value: 'series' as const, danger: true },
        ],
        'Отметки посещаемости удалённых занятий тоже будут удалены.',
      );
      if (!scope) return;
      const n = scope === 'one' ? (deleteClass(id), 1) : deleteSeriesFrom(id);
      overlay.toast(`Удалено занятий: ${n}`);
      nav.back();
    } else if (await overlay.confirm({ title: 'Удалить занятие?', message: 'Отметка посещаемости тоже будет удалена.', confirmLabel: 'Удалить', danger: true })) {
      deleteClass(id);
      overlay.toast('Занятие удалено');
      nav.back();
    }
  };

  return (
    <Page title="Занятие" right={<NavAction label="Изменить" onClick={edit} />}>
      <div className="detail-head" style={{ borderColor: session.subject?.color ?? 'var(--primary)' }}>
        <div className="badge-row">
          <Badge tone="primary">{CLASS_TYPE_LABELS[session.class_type]}</Badge>
          {phase === 'ongoing' ? <Badge tone="primary">Идёт сейчас</Badge> : null}
          {phase === 'cancelled' ? <Badge tone="danger">Отменено</Badge> : null}
          {isRescheduled(session) && phase !== 'cancelled' ? <Badge tone="warning" icon="swap">Перенесено</Badge> : null}
          <SourceBadge source={session.source} />
        </div>
        <button type="button" className="detail-title-btn" onClick={() => nav.push({ name: 'subject', id: item.subject_id })}>
          <h2 className={cx('detail-title', phase === 'cancelled' && 'is-struck')}>{session.subject?.name ?? 'Занятие'}</h2>
        </button>
        <p className="detail-sub">
          {formatWeekdayDayMonth(toDateKey(start, timeZone))}, {formatTime(start, timeZone)}–{formatTime(end, timeZone)} · {formatDurationMinutes(minutesBetween(start, end))}
        </p>
        {session.status_note ? <p className="detail-note">{session.status_note}</p> : null}
        {isRescheduled(session) && session.original_starts_at ? (
          <p className="detail-note">Перенесено с {formatDateTimeShort(new Date(session.original_starts_at), timeZone, now)}</p>
        ) : null}
      </div>

      <List>
        <Row icon={session.format === 'online' ? 'video' : 'pin'} title={location ?? 'Место не указано'} subtitle={CLASS_FORMAT_LABELS[session.format]} />
        {teacher ? <Row icon="user" title={teacher} subtitle="Преподаватель" /> : null}
        {session.online_url ? (
          <Row icon="link" title="Подключиться" subtitle={session.online_url} onClick={() => session.online_url && openExternal(session.online_url)} />
        ) : null}
        {seriesCount > 1 ? <Row icon="repeat" title="Повторяющееся занятие" subtitle={`В серии ${pluralize(seriesCount, ['занятие', 'занятия', 'занятий'])}`} /> : null}
        {session.notes ? <Row icon="file" title={session.notes} subtitle="Заметки" /> : null}
      </List>

      {session.status !== 'cancelled' ? (
        <Section title="Посещаемость">
          <div className="attendance-picker" role="radiogroup" aria-label="Отметка посещения">
            {ATTENDANCE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={attendance?.status === o.value}
                className={cx('att-btn', `att-${o.tone}`, attendance?.status === o.value && 'is-selected')}
                onClick={() => markAttendance(item, attendance?.status === o.value ? null : o.value, timeZone)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Задания по дисциплине" action={{ label: 'Добавить', onClick: () => nav.push({ name: 'taskForm', subjectId: item.subject_id, date: addDaysToKey(toDateKey(start, timeZone), 7) }) }}>
        {tasks.length === 0 ? (
          <Card tone="muted">
            <p className="muted-text">Нет ближайших заданий по этой дисциплине.</p>
          </Card>
        ) : (
          <List>
            {tasks.map((t) => (
              <Row key={t.id} icon="tasks" title={t.title} subtitle={t.due_at ? `Срок: ${formatDateTimeShort(new Date(t.due_at), timeZone, now)}` : undefined} onClick={() => nav.push({ name: 'task', id: t.id })} />
            ))}
          </List>
        )}
      </Section>

      <Section title="Действия">
        <List>
          <Row icon="swap" title="Перенести" onClick={() => setRescheduleOpen(true)} />
          {session.status === 'cancelled' ? (
            <Row
              icon="refresh"
              title="Вернуть занятие"
              onClick={() => {
                try {
                  restoreClass(id, timeZone);
                  overlay.toast('Занятие восстановлено');
                } catch (err) {
                  overlay.toast(err instanceof ScheduleConflictError ? err.message : 'Не удалось вернуть занятие', 'error');
                }
              }}
            />
          ) : (
            <Row icon="ban" title="Отметить как отменённое" onClick={() => setCancelOpen(true)} />
          )}
          <Row icon="trash" title="Удалить" danger onClick={remove} chevron={false} />
        </List>
      </Section>

      <RescheduleSheet
        key={`${item.starts_at}-${rescheduleOpen}`}
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        initialDate={toDateKey(start, timeZone)}
        initialStart={formatTime(start, timeZone)}
        initialEnd={formatTime(end, timeZone)}
        pairMinutes={model.data.settings.pairMinutes || DEFAULT_PAIR_MINUTES}
        onSave={(date, s, e, note) => {
          try {
            rescheduleClass(id, combineDateKeyAndTime(date, s, timeZone).toISOString(), combineDateKeyAndTime(date, e, timeZone).toISOString(), note, timeZone);
          } catch (err) {
            return err instanceof ScheduleConflictError ? err.message : 'Не удалось перенести занятие';
          }
          setRescheduleOpen(false);
          overlay.toast('Занятие перенесено');
          return null;
        }}
      />
      <CancelSheet
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onSave={(note) => {
          cancelClass(id, note);
          setCancelOpen(false);
          overlay.toast('Занятие отмечено как отменённое');
        }}
      />
    </Page>
  );
}

function RescheduleSheet({
  open,
  onClose,
  initialDate,
  initialStart,
  initialEnd,
  pairMinutes,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initialDate: DateKey;
  initialStart: string;
  initialEnd: string;
  pairMinutes: number;
  onSave: (date: DateKey, start: string, end: string, note: string | null) => string | null;
}) {
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState<PairTimeValue>(() => initialPairTime(initialStart, initialEnd, pairMinutes));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const timeErrors = pairTimeErrors(time);
  const save = () => {
    if (!date) return setError('Укажите дату');
    if (timeErrors.start || timeErrors.end) return setError(timeErrors.start ?? timeErrors.end ?? null);
    setError(onSave(date, time.start, time.end, note.trim() || null));
  };
  return (
    <Sheet open={open} onClose={onClose} title="Перенести занятие" footer={<Button full onClick={save}>Перенести</Button>}>
      <DateInput label="Новая дата" value={date} onChange={setDate} />
      <PairTime value={time} onChange={setTime} pairMinutes={pairMinutes} />
      <TextInput label="Комментарий" optional value={note} onChange={setNote} placeholder="Например: по решению кафедры" />
      <FormError message={error} />
    </Sheet>
  );
}

function CancelSheet({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (note: string | null) => void }) {
  const [note, setNote] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title="Отменить занятие" footer={<Button full variant="danger" onClick={() => onSave(note.trim() || null)}>Отметить как отменённое</Button>}>
      <p className="muted-text">Занятие останется в расписании с пометкой «Отменено». Вернуть его можно в любой момент.</p>
      <TextInput label="Причина" optional value={note} onChange={setNote} placeholder="Например: преподаватель болеет" />
    </Sheet>
  );
}

// ─── Форма занятия ──────────────────────────────────────────────────────────

const TYPE_OPTIONS = (Object.keys(CLASS_TYPE_LABELS) as ClassType[]).map((t) => ({ value: t, label: CLASS_TYPE_LABELS[t] }));
const FORMAT_OPTIONS = (['offline', 'online', 'hybrid'] as ClassFormat[]).map((f) => ({ value: f, label: f === 'offline' ? 'Очно' : f === 'online' ? 'Онлайн' : 'Смешанный' }));
const OTHER_TEACHER = '__other__';

/** Преподаватель по умолчанию: на лекции — первый преподаватель дисциплины, на остальных занятиях — второй (если есть). */
export function defaultTeacherId(teacherIds: readonly string[], type: ClassType): string | null {
  if (teacherIds.length === 0) return null;
  if (type === 'lecture' || teacherIds.length === 1) return teacherIds[0] ?? null;
  return teacherIds[1] ?? teacherIds[0] ?? null;
}

export function ClassFormScreen({ id, date, subjectId, scope = 'one' }: { id?: string; date?: DateKey; subjectId?: string; scope?: 'one' | 'series' }) {
  const nav = useNav();
  const model = useModel();
  const overlay = useOverlay();
  const { today, timeZone } = useToday();
  const pairMinutes = model.data.settings.pairMinutes || DEFAULT_PAIR_MINUTES;
  const existing = id ? model.data.classes.find((c) => c.id === id) : undefined;
  const editing = !!existing;
  const initialDate = existing ? toDateKey(new Date(existing.starts_at), timeZone) : (date ?? today);
  const initialSubject = existing?.subject_id ?? subjectId ?? null;
  const initialType: ClassType = existing?.class_type ?? 'lecture';

  const [subject, setSubject] = useState<string | null>(initialSubject);
  const [type, setType] = useState<ClassType>(initialType);
  const [format, setFormat] = useState<ClassFormat>(existing?.format ?? 'offline');
  const [day, setDay] = useState<DateKey>(initialDate);
  const [time, setTime] = useState<PairTimeValue>(() =>
    existing
      ? initialPairTime(formatTime(new Date(existing.starts_at), timeZone), formatTime(new Date(existing.ends_at), timeZone), pairMinutes)
      : { start: '09:00', end: addMinutesToTime('09:00', pairMinutes) ?? '10:20', custom: false },
  );
  const [teacherId, setTeacherId] = useState<string | null>(() =>
    existing ? existing.teacher_id : defaultTeacherId(initialSubject ? (model.subjects.get(initialSubject)?.teacher_ids ?? []) : [], initialType),
  );
  /** Преподаватель выбран вручную — тогда смена типа занятия его не меняет */
  const [teacherTouched, setTeacherTouched] = useState(!!existing);
  const [otherTeacher, setOtherTeacher] = useState('');
  const [building, setBuilding] = useState(existing?.building ?? '');
  const [room, setRoom] = useState(existing?.room ?? '');
  const [location, setLocation] = useState(existing?.location ?? '');
  const [url, setUrl] = useState(existing?.online_url ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [repeat, setRepeat] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([isoWeekdayOfKey(initialDate)]);
  const [until, setUntil] = useState<DateKey>(addDaysToKey(initialDate, 7 * 15));
  const [interval, setIntervalWeeks] = useState<'1' | '2'>('1');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const subjectItem = subject ? model.subjects.get(subject) : undefined;
  const subjectTeacherIds = subjectItem?.teacher_ids ?? [];
  const teacherOptions = useMemo(() => {
    const own = subjectTeacherIds.map((tid) => model.teachers.get(tid)).filter((t): t is NonNullable<typeof t> => !!t);
    const others = [...model.data.teachers].filter((t) => !subjectTeacherIds.includes(t.id)).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return { own, others };
  }, [subjectTeacherIds, model.teachers, model.data.teachers]);

  const changeSubject = (next: string | null) => {
    setSubject(next);
    const ids = next ? (model.subjects.get(next)?.teacher_ids ?? []) : [];
    setTeacherId(defaultTeacherId(ids, type));
    setTeacherTouched(false);
  };
  const changeType = (next: ClassType) => {
    setType(next);
    if (!teacherTouched) setTeacherId(defaultTeacherId(subjectTeacherIds, next));
  };

  // Интервалы будущих занятий и пересечения с уже стоящими парами — показываем до сохранения.
  const plan = useMemo(() => {
    const tErr = pairTimeErrors(time);
    if (!day || tErr.start || tErr.end) return { intervals: [] as Interval[], error: null as string | null, count: 0 };
    if (!editing && repeat) {
      try {
        const intervals = generateOccurrences({ startDate: day, endDate: until, weekdays, intervalWeeks: interval === '2' ? 2 : 1, startTime: time.start, endTime: time.end, timeZone });
        return { intervals, error: null, count: intervals.length };
      } catch (e) {
        return { intervals: [], error: e instanceof RecurrenceError ? e.message : 'Проверьте параметры повторения', count: 0 };
      }
    }
    if (editing && existing && scope === 'series' && existing.series_id) {
      const shift = Date.parse(combineDateKeyAndTime(day, time.start, timeZone).toISOString()) - Date.parse(existing.starts_at);
      const duration = Date.parse(combineDateKeyAndTime(day, time.end, timeZone).toISOString()) - Date.parse(combineDateKeyAndTime(day, time.start, timeZone).toISOString());
      const intervals = model.data.classes
        .filter((c) => c.series_id === existing.series_id && c.starts_at >= existing.starts_at && c.status !== 'cancelled')
        .map((c) => {
          const startMs = Date.parse(c.starts_at) + shift;
          return { starts_at: new Date(startMs).toISOString(), ends_at: new Date(startMs + duration).toISOString() };
        });
      return { intervals, error: null, count: intervals.length };
    }
    return {
      intervals: [{ starts_at: combineDateKeyAndTime(day, time.start, timeZone).toISOString(), ends_at: combineDateKeyAndTime(day, time.end, timeZone).toISOString() }],
      error: null,
      count: 1,
    };
  }, [time, day, editing, repeat, until, weekdays, interval, timeZone, existing, scope, model.data.classes]);

  const ignore = useMemo(() => {
    if (!existing) return new Set<string>();
    if (scope === 'series' && existing.series_id) return new Set(model.data.classes.filter((c) => c.series_id === existing.series_id && c.starts_at >= existing.starts_at).map((c) => c.id));
    return new Set([existing.id]);
  }, [existing, scope, model.data.classes]);
  const conflicts = useMemo(
    () => (existing?.status === 'cancelled' ? [] : findConflicts(model.data.classes, plan.intervals, ignore)),
    [model.data.classes, plan.intervals, ignore, existing?.status],
  );

  const save = () => {
    const next: Record<string, string> = {};
    if (!subject) next.subject = 'Выберите или добавьте дисциплину';
    const tErr = pairTimeErrors(time);
    if (tErr.start) next.start = tErr.start;
    if (tErr.end) next.end = tErr.end;
    if (!day) next.day = 'Укажите дату';
    if (url.trim() && !isHttpsUrl(url.trim())) next.url = 'Нужна ссылка, начинающаяся с https://';
    if (plan.error) next.repeat = plan.error;
    if (teacherId === OTHER_TEACHER && otherTeacher.trim().length < 3) next.teacher = 'Введите ФИО преподавателя';
    setErrors(next);
    if (Object.keys(next).length > 0 || !subject) return;
    if (conflicts.length > 0) {
      overlay.toast('В это время уже есть пара — выберите другое время', 'error');
      return;
    }

    let finalTeacherId = teacherId === OTHER_TEACHER ? null : teacherId;
    if (teacherId === OTHER_TEACHER) {
      const t = ensureTeacher(otherTeacher);
      finalTeacherId = t.id;
      // дисциплине без преподавателей (или с одним) он добавляется автоматически
      if (subjectItem && subjectItem.teacher_ids.length < MAX_SUBJECT_TEACHERS && !subjectItem.teacher_ids.includes(t.id)) {
        saveSubject({ ...subjectItem, teacher_ids: [...subjectItem.teacher_ids, t.id] });
      }
    }

    const fields: ClassFields = {
      subject_id: subject,
      class_type: type,
      format,
      teacher_id: finalTeacherId,
      teacher: finalTeacherId ? null : (existing?.teacher ?? null),
      building: building.trim() || null,
      room: room.trim() || null,
      location: location.trim() || null,
      online_url: url.trim() || null,
      notes: notes.trim() || null,
    };
    const startsAt = combineDateKeyAndTime(day, time.start, timeZone).toISOString();
    const endsAt = combineDateKeyAndTime(day, time.end, timeZone).toISOString();
    try {
      if (editing && existing) {
        if (scope === 'series') {
          const n = updateSeriesFrom(existing.id, fields, startsAt, endsAt, timeZone);
          overlay.toast(`Изменено занятий: ${n}`);
        } else {
          saveClass(existing.id, fields, startsAt, endsAt, timeZone);
          overlay.toast('Занятие сохранено');
        }
      } else if (repeat) {
        const n = createSeries(fields, { startDate: day, endDate: until, weekdays, intervalWeeks: interval === '2' ? 2 : 1, startTime: time.start, endTime: time.end, timeZone });
        overlay.toast(`Добавлено занятий: ${n}`);
      } else {
        saveClass(null, fields, startsAt, endsAt, timeZone);
        overlay.toast('Занятие добавлено');
      }
    } catch (err) {
      if (err instanceof ScheduleConflictError) {
        setErrors({ conflict: err.message });
        overlay.toast('В это время уже есть пара', 'error');
        return;
      }
      setErrors({ repeat: err instanceof RecurrenceError ? err.message : 'Не удалось сохранить занятие' });
      return;
    }
    nav.back();
  };

  const conflictText =
    conflicts.length > 0
      ? (() => {
          const c = conflicts[0];
          if (!c) return null;
          const subj = model.subjects.get(c.subject_id)?.name ?? 'Занятие';
          const st = new Date(c.starts_at);
          return `${conflicts.length > 1 ? `Пересечение с ${pluralize(conflicts.length, ['парой', 'парами', 'парами'])}, первая: ` : 'В это время уже стоит пара: '}${formatWeekdayDayMonth(toDateKey(st, timeZone))}, ${formatTime(st, timeZone)}–${formatTime(new Date(c.ends_at), timeZone)}, ${subj}. В одно время может быть только одна пара — измените время или дату.`;
        })()
      : null;

  return (
    <Page title={editing ? (scope === 'series' ? 'Это и следующие' : 'Изменить занятие') : 'Новое занятие'} backLabel="Отмена" right={<NavAction label="Сохранить" onClick={save} />}>
      <div className="form">
        <SubjectPicker value={subject} onChange={changeSubject} error={errors.subject} />
        <FormRow>
          <Select label="Тип" value={type} onChange={changeType} options={TYPE_OPTIONS} />
          <Select label="Формат" value={format} onChange={setFormat} options={FORMAT_OPTIONS} />
        </FormRow>
        {subject ? (
          teacherOptions.own.length > 0 || teacherOptions.others.length > 0 ? (
            <>
              <Select
                label="Преподаватель"
                value={teacherId ?? ''}
                onChange={(v) => {
                  setTeacherId(v || null);
                  setTeacherTouched(true);
                }}
                options={[
                  ...teacherOptions.own.map((t) => ({ value: t.id, label: t.name })),
                  ...(teacherOptions.own.length === 0 ? [{ value: '', label: 'Не указан' }] : []),
                  ...teacherOptions.others.map((t) => ({ value: t.id, label: `${t.name} (другая дисциплина)` })),
                  { value: OTHER_TEACHER, label: '＋ Другой преподаватель…' },
                ]}
                error={errors.teacher}
              />
              {teacherId === OTHER_TEACHER ? <TextInput label="ФИО преподавателя" value={otherTeacher} onChange={setOtherTeacher} placeholder="Например: Иванова Мария Петровна" error={errors.teacher} /> : null}
            </>
          ) : (
            <TextInput
              label="Преподаватель"
              value={otherTeacher}
              onChange={(v) => {
                setOtherTeacher(v);
                setTeacherId(v.trim() ? OTHER_TEACHER : null);
              }}
              placeholder="ФИО — запомнится для этой дисциплины"
              error={errors.teacher}
            />
          )
        ) : null}

        <DateInput label={repeat ? 'Первое занятие' : 'Дата'} value={day} onChange={(v) => setDay(v)} error={errors.day} />
        <PairTime value={time} onChange={setTime} pairMinutes={pairMinutes} errors={{ start: errors.start, end: errors.end }} />

        {!editing ? (
          <Card>
            <Toggle label="Повторять каждую неделю" checked={repeat} onChange={setRepeat} />
            {repeat ? (
              <div className="stack">
                <p className="field-label">Дни недели</p>
                <div className="weekday-picker" role="group" aria-label="Дни недели">
                  {WEEKDAYS_SHORT.map((w, i) => {
                    const n = i + 1;
                    const on = weekdays.includes(n);
                    return (
                      <button
                        key={w}
                        type="button"
                        aria-pressed={on}
                        className={cx('weekday-btn', on && 'is-selected')}
                        onClick={() => setWeekdays((list) => (on ? list.filter((x) => x !== n) : [...list, n].sort()))}
                      >
                        {w}
                      </button>
                    );
                  })}
                </div>
                <Segmented
                  label="Периодичность"
                  value={interval}
                  onChange={setIntervalWeeks}
                  options={[
                    { value: '1', label: 'Каждую неделю' },
                    { value: '2', label: 'Через неделю' },
                  ]}
                />
                <DateInput label="Повторять до" value={until} onChange={setUntil} min={day} />
                {plan.error ? <FormError message={errors.repeat ?? plan.error} /> : <p className="footnote">Будет создано {pluralize(plan.count, ['занятие', 'занятия', 'занятий'])}.</p>}
              </div>
            ) : null}
          </Card>
        ) : scope === 'series' ? (
          <p className="footnote">
            <Icon name="repeat" size={14} /> Изменятся это и все следующие занятия.
          </p>
        ) : null}

        {conflictText || errors.conflict ? (
          <Notice tone="danger" icon="alert" title="Время занято">
            {errors.conflict ?? conflictText}
          </Notice>
        ) : null}

        <FormRow>
          <TextInput label="Корпус" optional value={building} onChange={setBuilding} placeholder="Корпус 1" />
          <TextInput label="Аудитория" optional value={room} onChange={setRoom} placeholder="305" />
        </FormRow>
        <TextInput label="Место или адрес" optional value={location} onChange={setLocation} placeholder="Например: актовый зал" />
        {format !== 'offline' ? <TextInput label="Ссылка на подключение" optional type="url" inputMode="url" value={url} onChange={setUrl} placeholder="https://" error={errors.url} /> : null}
        <TextArea label="Заметки" optional value={notes} onChange={setNotes} />
      </div>
      <div className="form-actions">
        <Button full onClick={save} icon="check" disabled={conflicts.length > 0}>
          {editing ? 'Сохранить' : repeat && !plan.error ? `Добавить ${pluralize(plan.count, ['занятие', 'занятия', 'занятий'])}` : 'Добавить занятие'}
        </Button>
      </div>
    </Page>
  );
}
