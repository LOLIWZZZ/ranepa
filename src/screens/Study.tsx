/** Посещаемость, успеваемость, сессия. */
import { useMemo, useState } from 'react';

import { useToday } from '../hooks';
import { isHttpsUrl } from '../lib/platform';
import { useNav } from '../nav';
import { ATTENDANCE_FORMULA, ATTENDANCE_LABELS, attendanceBySubject, attendanceTone, computeAttendanceStats, historyByDate, weeklyTrend } from '../shared/domain/attendance';
import { EXAM_KIND_LABELS } from '../shared/domain/calendar';
import { formatPercent, pluralize } from '../shared/domain/format';
import { GRADE_KIND_LABELS } from '../shared/domain/grades';
import { formatPoints, parsePoints, pointsBySubject, pointsForSubject, POINTS_MAX, signedPoints, validateAddition } from '../lib/points';
import { Icon } from '../ui/Icon';
import type { AttendanceStatus, ClassFormat, ExamKind, GradeKind } from '../shared/domain/models';
import { sessionLocation } from '../shared/domain/schedule';
import { combineDateKeyAndTime, diffDaysBetweenKeys, formatDateTimeShort, formatDayMonth, formatShortDate, formatTime, toDateKey, type DateKey } from '../shared/domain/time';
import { deleteAttendance, deleteExam, deleteGrade, saveAttendance, saveExam, saveGrade } from '../store/actions';
import { useModel } from '../store/model';
import { newId } from '../store/store';
import { SubjectPicker } from '../components/SubjectPicker';
import { DateInput, FormError, FormRow, Select, TextArea, TextInput, TimeInput, Toggle } from '../ui/form';
import { Badge, Button, Card, cx, Empty, List, ProgressBar, Ring, Row, Section, Segmented, SourceBadge, type Tone } from '../ui/kit';
import { NavAction, Page } from '../ui/layout';
import { Sheet, useOverlay } from '../ui/overlay';
import { DaysLeft } from './Home';

const rateTone = (rate: number | null): Tone => {
  const t = attendanceTone(rate);
  return t === 'neutral' ? 'primary' : t;
};

// ─── Посещаемость ───────────────────────────────────────────────────────────

export function AttendanceScreen() {
  const nav = useNav();
  const model = useModel();
  const { today } = useToday();
  const stats = useMemo(() => computeAttendanceStats(model.attendance), [model.attendance]);
  const bySubject = useMemo(() => attendanceBySubject(model.attendance), [model.attendance]);
  const trend = useMemo(() => weeklyTrend(model.attendance, today, 8), [model.attendance, today]);
  const history = useMemo(() => historyByDate(model.attendance).slice(0, 30), [model.attendance]);

  return (
    <Page title="Посещаемость" right={<NavAction label="Добавить" onClick={() => nav.push({ name: 'attendanceForm' })} />}>
      {model.attendance.length === 0 ? (
        <Empty
          icon="users"
          title="Отметок пока нет"
          text="Отмечайте посещение в карточке пары."
          action={{ label: 'Добавить отметку', onClick: () => nav.push({ name: 'attendanceForm' }) }}
        />
      ) : (
        <>
          <Card>
            <div className="kpi">
              <Ring value={stats.rate === null ? null : stats.rate / 100} size={84} tone={rateTone(stats.rate)}>
                <span className="ring-big">{stats.rate === null ? '—' : formatPercent(stats.rate)}</span>
              </Ring>
              <div className="stat-grid">
                <Stat label="Присутствие" value={stats.present} tone="success" />
                <Stat label="Опоздания" value={stats.late} tone="warning" />
                <Stat label="Пропуски" value={stats.absent} tone="danger" />
                <Stat label="Уважительные" value={stats.excused} tone="neutral" />
              </div>
            </div>
            <details className="formula">
              <summary>Как считается</summary>
              <p>{ATTENDANCE_FORMULA}</p>
            </details>
          </Card>

          <Section title="По неделям">
            <div className="bars" role="img" aria-label="Посещаемость по неделям">
              {trend.map((p) => (
                <div key={p.weekStart} className="bar-col">
                  <span className="bar-value">{p.rate === null ? '' : Math.round(p.rate)}</span>
                  <span className="bar-track">
                    <span className={cx('bar-fill', `tone-${rateTone(p.rate)}`)} style={{ height: `${p.rate ?? 0}%` }} />
                  </span>
                  <span className="bar-label">{formatShortDate(p.weekStart).slice(0, 5)}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="По дисциплинам">
            <List>
              {bySubject.map((s) => (
                <div key={s.subjectId ?? 'none'} className="row">
                  <span className="row-text">
                    <span className="row-title">
                      <span className="dot" style={{ background: s.subject?.color ?? 'var(--text-3)' }} aria-hidden="true" /> {s.subject?.name ?? 'Без дисциплины'}
                    </span>
                    <span className="row-subtitle">
                      Посещено {s.stats.attended} из {s.stats.total}
                      {s.stats.absent ? ` · пропусков ${s.stats.absent}` : ''}
                    </span>
                    <ProgressBar value={(s.stats.rate ?? 0) / 100} tone={rateTone(s.stats.rate)} />
                  </span>
                  <span className="row-value">{s.stats.rate === null ? '—' : formatPercent(s.stats.rate)}</span>
                </div>
              ))}
            </List>
          </Section>

          <Section title="История">
            {history.map(([day, list]) => (
              <div key={day} className="history-day">
                <p className="history-date">{formatDayMonth(day)}</p>
                <List>
                  {list.map((r) => (
                    <Row
                      key={r.id}
                      title={r.subject?.name ?? 'Без дисциплины'}
                      subtitle={r.note ?? undefined}
                      right={<Badge tone={r.status === 'present' ? 'success' : r.status === 'late' ? 'warning' : r.status === 'absent' ? 'danger' : 'neutral'}>{ATTENDANCE_LABELS[r.status]}</Badge>}
                      onClick={() => (r.class_session_id ? nav.push({ name: 'class', id: r.class_session_id }) : nav.push({ name: 'attendanceForm', id: r.id }))}
                    />
                  ))}
                </List>
              </div>
            ))}
          </Section>
        </>
      )}
    </Page>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div className={cx('stat', `tone-${tone}`)}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

const ATTENDANCE_STATUS_OPTIONS = (Object.keys(ATTENDANCE_LABELS) as AttendanceStatus[]).map((s) => ({ value: s, label: ATTENDANCE_LABELS[s] }));

export function AttendanceFormScreen({ id }: { id?: string }) {
  const nav = useNav();
  const model = useModel();
  const overlay = useOverlay();
  const { today } = useToday();
  const existing = id ? model.data.attendance.find((a) => a.id === id) : undefined;
  const [subject, setSubject] = useState<string | null>(existing?.subject_id ?? null);
  const [day, setDay] = useState<DateKey>(existing?.occurred_on ?? today);
  const [status, setStatus] = useState<AttendanceStatus>(existing?.status ?? 'present');
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (!subject) return setError('Выберите дисциплину');
    saveAttendance({ id: existing?.id ?? newId(), class_id: existing?.class_id ?? null, subject_id: subject, occurred_on: day, status, note: note.trim() || null });
    overlay.toast('Отметка сохранена');
    nav.back();
  };

  return (
    <Page title={existing ? 'Отметка' : 'Новая отметка'} backLabel="Отмена" right={<NavAction label="Сохранить" onClick={save} />}>
      <div className="form">
        <SubjectPicker value={subject} onChange={setSubject} />
        <DateInput label="Дата" value={day} onChange={setDay} max={today} />
        <Select label="Отметка" value={status} onChange={setStatus} options={ATTENDANCE_STATUS_OPTIONS} />
        <TextInput label="Комментарий" optional value={note} onChange={setNote} placeholder="Например: справка от врача" />
        <FormError message={error} />
      </div>
      <div className="form-actions">
        <Button full icon="check" onClick={save}>
          Сохранить
        </Button>
        {existing ? (
          <Button
            full
            variant="ghost"
            onClick={() => {
              deleteAttendance(existing.id);
              overlay.toast('Отметка удалена');
              nav.back();
            }}
          >
            Удалить отметку
          </Button>
        ) : null}
      </div>
    </Page>
  );
}

// ─── Успеваемость: 100-балльная система ─────────────────────────────────────

export function GradesScreen() {
  const nav = useNav();
  const model = useModel();
  const [adding, setAdding] = useState<string | null>(null);
  const all = useMemo(() => pointsBySubject(model.data.subjects, model.data.grades), [model.data.subjects, model.data.grades]);
  const withPoints = all.filter((p) => p.entries.length > 0);
  const average = withPoints.length ? withPoints.reduce((sum, p) => sum + p.total, 0) / withPoints.length : null;
  const target = adding ? all.find((p) => p.subject.id === adding) : undefined;

  return (
    <Page title="Моя успеваемость">
      {all.length === 0 ? (
        <Empty
          icon="chart"
          title="Сначала добавьте дисциплины"
          text="До 100 баллов по каждой дисциплине."
          action={{ label: 'Добавить дисциплину', onClick: () => nav.push({ name: 'subjectForm' }) }}
        />
      ) : (
        <>
          <Card>
            <div className="summary-row">
              <div className="summary-cell">
                <span className="summary-number">{average === null ? '—' : formatPoints(Math.round(average * 10) / 10)}</span>
                <span className="summary-label">Средний балл</span>
              </div>
              <div className="summary-cell">
                <span className="summary-number">{withPoints.length}<small className="of">/{all.length}</small></span>
                <span className="summary-label">С баллами</span>
              </div>
              <div className="summary-cell">
                <span className="summary-number">{all.filter((p) => p.total >= POINTS_MAX).length}</span>
                <span className="summary-label">Набрано 100</span>
              </div>
            </div>

          </Card>
          <div className="stack">
            {all.map((p) => (
              <div key={p.subject.id} className="points-card">
                <button type="button" className="points-main" onClick={() => nav.push({ name: 'gradeSubject', subjectId: p.subject.id })}>
                  <span className="points-head">
                    <span className="points-name">
                      <span className="dot" style={{ background: p.subject.color }} aria-hidden="true" /> {p.subject.name}
                    </span>
                    <span className="points-total">
                      {formatPoints(p.total)}
                      <small>/{POINTS_MAX}</small>
                    </span>
                  </span>
                  <ProgressBar value={p.total / POINTS_MAX} tone={p.total >= 85 ? 'success' : 'primary'} label={`Баллы: ${formatPoints(p.total)} из ${POINTS_MAX}`} />
                  <span className="points-meta">
                    {p.entries.length === 0
                      ? 'Баллов пока нет'
                      : `${pluralize(p.entries.length, ['запись', 'записи', 'записей'])} · последняя ${formatDayMonth(p.lastAt ?? '')} · до 100 осталось ${formatPoints(Math.max(0, POINTS_MAX - p.total))}`}
                  </span>
                </button>
                <button type="button" className="points-add" onClick={() => setAdding(p.subject.id)} aria-label={`Добавить баллы: ${p.subject.name}`} disabled={p.total >= POINTS_MAX}>
                  <Icon name="plus" size={22} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      {target ? <AddPointsSheet key={target.subject.id} subjectName={target.subject.name} subjectId={target.subject.id} total={target.total} onClose={() => setAdding(null)} /> : null}
    </Page>
  );
}

const POINT_KINDS: { value: GradeKind; label: string }[] = [
  { value: 'assignment', label: 'Работа на занятии' },
  { value: 'test', label: 'Тест' },
  { value: 'control', label: 'Контрольная' },
  { value: 'colloquium', label: 'Коллоквиум' },
  { value: 'coursework', label: 'Курсовая' },
  { value: 'credit', label: 'Зачёт' },
  { value: 'exam', label: 'Экзамен' },
  { value: 'other', label: 'Другое' },
];

/** Панель «Добавить баллы»: введённое значение прибавляется к сумме по дисциплине. */
function AddPointsSheet({ subjectId, subjectName, total, onClose }: { subjectId: string; subjectName: string; total: number; onClose: () => void }) {
  const overlay = useOverlay();
  const { today } = useToday();
  const [value, setValue] = useState('');
  const [kind, setKind] = useState<GradeKind>('assignment');
  const [comment, setComment] = useState('');
  const [day, setDay] = useState<DateKey>(today);
  const [error, setError] = useState<string | null>(null);
  const delta = parsePoints(value);
  const preview = delta !== null ? Math.round((total + delta) * 100) / 100 : null;

  const save = () => {
    if (delta === null) return setError('Введите число, например 5 или 7,5');
    const problem = validateAddition(total, delta);
    if (problem) return setError(problem);
    saveGrade({
      id: newId(),
      subject_id: subjectId,
      kind,
      title: comment.trim() || POINT_KINDS.find((k) => k.value === kind)?.label || 'Баллы',
      score: delta,
      max_score: null,
      mark: null,
      weight: 1,
      graded_on: day,
      note: null,
      source: 'manual',
    });
    overlay.toast(`${signedPoints(delta)} — теперь ${formatPoints(total + delta)} из ${POINTS_MAX}`);
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title="Добавить баллы" footer={<Button full icon="plus" onClick={save}>Прибавить к сумме</Button>}>
      <p className="muted-text">
        {subjectName}: сейчас <b>{formatPoints(total)}</b> из {POINTS_MAX}
      </p>
      <TextInput label="Сколько баллов получили" inputMode="decimal" value={value} onChange={(v) => { setValue(v); setError(null); }} placeholder="Например: 5" autoFocus />
      {preview !== null && !error ? (
        <p className="points-preview">
          {formatPoints(total)} {delta !== null && delta < 0 ? '−' : '+'} {formatPoints(Math.abs(delta ?? 0))} = <b>{formatPoints(preview)}</b> из {POINTS_MAX}
        </p>
      ) : null}
      <FormRow>
        <Select label="За что" value={kind} onChange={setKind} options={POINT_KINDS} />
        <DateInput label="Дата" value={day} onChange={setDay} max={today} />
      </FormRow>
      <TextInput label="Комментарий" optional value={comment} onChange={setComment} placeholder="Например: доклад по теме 3" />
      <FormError message={error} />
    </Sheet>
  );
}

export function SubjectPointsScreen({ subjectId }: { subjectId: string }) {
  const nav = useNav();
  const model = useModel();
  const overlay = useOverlay();
  const [adding, setAdding] = useState(false);
  const subject = model.subjects.get(subjectId);
  if (!subject) {
    return (
      <Page title="Баллы">
        <Empty icon="chart" title="Дисциплина не найдена" />
      </Page>
    );
  }
  const p = pointsForSubject(subject, model.data.grades);

  return (
    <Page title="Баллы" right={<NavAction label="Добавить" onClick={() => setAdding(true)} disabled={p.total >= POINTS_MAX} />}>
      <div className="detail-head" style={{ borderColor: subject.color }}>
        <button type="button" className="detail-title-btn" onClick={() => nav.push({ name: 'subject', id: subject.id })}>
          <h2 className="detail-title">{subject.name}</h2>
        </button>
      </div>
      <Card>
        <div className="points-hero">
          <Ring value={p.total / POINTS_MAX} size={96} tone={p.total >= 85 ? 'success' : 'primary'}>
            <span className="ring-big">{formatPoints(p.total)}</span>
          </Ring>
          <div className="kpi-text">
            <span className="kpi-title">
              {formatPoints(p.total)} из {POINTS_MAX} баллов
            </span>
            <span className="kpi-meta">{p.total >= POINTS_MAX ? 'Набран максимум' : `До ${POINTS_MAX} осталось ${formatPoints(POINTS_MAX - p.total)}`}</span>
          </div>
        </div>
        <Button full icon="plus" onClick={() => setAdding(true)} disabled={p.total >= POINTS_MAX}>
          Добавить баллы
        </Button>
      </Card>
      <Section title="История">
        {p.entries.length === 0 ? (
          <p className="muted-text">Баллов пока нет. Нажмите «Добавить баллы», когда получите первые.</p>
        ) : (
          <List>
            {p.entries.map((e) => (
              <Row
                key={e.id}
                title={e.title}
                subtitle={`${formatDayMonth(e.graded_on)} · ${GRADE_KIND_LABELS[e.kind]} · сумма ${formatPoints(e.runningTotal)}`}
                right={
                  <span className="grade-right">
                    <SourceBadge source={e.source} />
                    <Badge tone={(e.score ?? 0) >= 0 ? 'success' : 'danger'}>{signedPoints(e.score ?? 0)}</Badge>
                  </span>
                }
                onClick={async () => {
                  const remaining = p.total - (e.score ?? 0);
                  if (remaining < 0 || remaining > POINTS_MAX) return;
                  if (await overlay.confirm({ title: 'Удалить запись?', message: `${signedPoints(e.score ?? 0)} — «${e.title}». Сумма станет ${formatPoints(remaining)}.`, confirmLabel: 'Удалить', danger: true })) {
                    deleteGrade(e.id);
                    overlay.toast('Запись удалена');
                  }
                }}
                chevron={false}
              />
            ))}
          </List>
        )}
      </Section>
      {p.legacy.length ? (
        <Section title="Старые отметки" footnote="Записи из прежней версии без баллов. В сумму не входят — их можно удалить.">
          <List>
            {p.legacy.map((g) => (
              <Row
                key={g.id}
                title={g.title}
                subtitle={formatDayMonth(g.graded_on)}
                right={<Badge>{g.mark ?? '—'}</Badge>}
                chevron={false}
                onClick={async () => {
                  if (await overlay.confirm({ title: 'Удалить старую отметку?', confirmLabel: 'Удалить', danger: true })) deleteGrade(g.id);
                }}
              />
            ))}
          </List>
        </Section>
      ) : null}
      {adding ? <AddPointsSheet subjectId={subject.id} subjectName={subject.name} total={p.total} onClose={() => setAdding(false)} /> : null}
    </Page>
  );
}

// ─── Сессия ─────────────────────────────────────────────────────────────────

export function ExamsScreen() {
  const nav = useNav();
  const model = useModel();
  const { now, today, timeZone } = useToday();
  const upcoming = model.exams.filter((e) => Date.parse(e.ends_at ?? e.starts_at) >= now.getTime() - 3 * 3600_000);
  const past = model.exams.filter((e) => !upcoming.includes(e)).reverse();

  const card = (e: (typeof model.exams)[number], muted: boolean) => {
    const day = toDateKey(new Date(e.starts_at), timeZone);
    const days = diffDaysBetweenKeys(today, day);
    return (
      <Card key={e.id} onClick={() => nav.push({ name: 'examForm', id: e.id })} tone={muted ? 'muted' : undefined} label={`${EXAM_KIND_LABELS[e.kind]}: ${e.subject?.name ?? ''}`}>
        <div className="kpi">
          <span className="kpi-icon tone-violet" aria-hidden="true">
            {e.subject ? <span className="dot big" style={{ background: e.subject.color ?? undefined }} /> : null}
          </span>
          <span className="kpi-text">
            <span className="kpi-label">
              {EXAM_KIND_LABELS[e.kind]} <SourceBadge source={e.source} />
            </span>
            <span className="kpi-title">{e.subject?.name}</span>
            <span className="kpi-meta">
              {formatDateTimeShort(new Date(e.starts_at), timeZone, now)}
              {sessionLocation(e) ? ` · ${sessionLocation(e)}` : ''}
            </span>
            {e.notes ? <span className="kpi-meta">{e.notes}</span> : null}
          </span>
          {!muted && days >= 0 ? <DaysLeft days={days} /> : null}
        </div>
      </Card>
    );
  };

  return (
    <Page title="Сессия и экзамены" right={<NavAction label="Добавить" onClick={() => nav.push({ name: 'examForm' })} />}>
      {model.exams.length === 0 ? (
        <Empty
          icon="award"
          title="Экзаменов пока нет"
          text="Добавьте экзамены и зачёты."
          action={{ label: 'Добавить экзамен', onClick: () => nav.push({ name: 'examForm' }) }}
        />
      ) : (
        <>
          <Section title={`Предстоит · ${upcoming.length}`}>{upcoming.length ? upcoming.map((e) => card(e, false)) : <p className="muted-text">Ближайших экзаменов нет.</p>}</Section>
          {past.length ? <Section title="Прошедшие">{past.map((e) => card(e, true))}</Section> : null}
        </>
      )}
    </Page>
  );
}

const EXAM_KIND_OPTIONS = (Object.keys(EXAM_KIND_LABELS) as ExamKind[]).map((k) => ({ value: k, label: EXAM_KIND_LABELS[k] }));

export function ExamFormScreen({ id }: { id?: string }) {
  const nav = useNav();
  const model = useModel();
  const overlay = useOverlay();
  const { today, timeZone } = useToday();
  const existing = id ? model.data.exams.find((e) => e.id === id) : undefined;
  const [subject, setSubject] = useState<string | null>(existing?.subject_id ?? null);
  const [kind, setKind] = useState<ExamKind>(existing?.kind ?? 'exam');
  const [day, setDay] = useState<DateKey>(existing ? toDateKey(new Date(existing.starts_at), timeZone) : today);
  const [start, setStart] = useState(existing ? formatTime(new Date(existing.starts_at), timeZone) : '10:00');
  const [hasEnd, setHasEnd] = useState(!!existing?.ends_at);
  const [end, setEnd] = useState(existing?.ends_at ? formatTime(new Date(existing.ends_at), timeZone) : '13:00');
  const [format, setFormat] = useState<ClassFormat>(existing?.format ?? 'offline');
  const [building, setBuilding] = useState(existing?.building ?? '');
  const [room, setRoom] = useState(existing?.room ?? '');
  const [teacher, setTeacher] = useState(existing?.teacher ?? '');
  const [url, setUrl] = useState(existing?.online_url ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (!subject) return setError('Выберите дисциплину');
    if (hasEnd && end <= start) return setError('Окончание должно быть позже начала');
    if (url.trim() && !isHttpsUrl(url.trim())) return setError('Ссылка должна начинаться с https://');
    saveExam({
      id: existing?.id ?? newId(),
      subject_id: subject,
      kind,
      starts_at: combineDateKeyAndTime(day, start, timeZone).toISOString(),
      ends_at: hasEnd ? combineDateKeyAndTime(day, end, timeZone).toISOString() : null,
      building: building.trim() || null,
      room: room.trim() || null,
      location: null,
      format,
      online_url: url.trim() || null,
      teacher: teacher.trim() || null,
      notes: notes.trim() || null,
      source: existing?.source === 'demo' ? 'manual' : (existing?.source ?? 'manual'),
    });
    overlay.toast('Сохранено');
    nav.back();
  };

  return (
    <Page title={existing ? EXAM_KIND_LABELS[existing.kind] : 'Новый экзамен'} backLabel="Отмена" right={<NavAction label="Сохранить" onClick={save} />}>
      <div className="form">
        <SubjectPicker value={subject} onChange={setSubject} />
        <Select label="Вид" value={kind} onChange={setKind} options={EXAM_KIND_OPTIONS} />
        <FormRow>
          <DateInput label="Дата" value={day} onChange={setDay} />
          <TimeInput label="Начало" value={start} onChange={setStart} />
        </FormRow>
        <Toggle label="Указать время окончания" checked={hasEnd} onChange={setHasEnd} />
        {hasEnd ? <TimeInput label="Окончание" value={end} onChange={setEnd} /> : null}
        <Segmented
          label="Формат"
          value={format}
          onChange={setFormat}
          options={[
            { value: 'offline', label: 'Очно' },
            { value: 'online', label: 'Онлайн' },
            { value: 'hybrid', label: 'Смешанный' },
          ]}
        />
        <FormRow>
          <TextInput label="Корпус" optional value={building} onChange={setBuilding} />
          <TextInput label="Аудитория" optional value={room} onChange={setRoom} />
        </FormRow>
        <TextInput label="Преподаватель" optional value={teacher} onChange={setTeacher} />
        {format !== 'offline' ? <TextInput label="Ссылка на подключение" optional type="url" inputMode="url" value={url} onChange={setUrl} placeholder="https://" /> : null}
        <TextArea label="Заметки к подготовке" optional value={notes} onChange={setNotes} placeholder="Билеты, темы, что взять с собой" />
        <FormError message={error} />
      </div>
      <div className="form-actions">
        <Button full icon="check" onClick={save}>
          Сохранить
        </Button>
        {existing ? (
          <Button
            full
            variant="ghost"
            onClick={async () => {
              if (await overlay.confirm({ title: 'Удалить запись?', confirmLabel: 'Удалить', danger: true })) {
                deleteExam(existing.id);
                overlay.toast('Удалено');
                nav.back();
              }
            }}
          >
            Удалить
          </Button>
        ) : null}
      </div>
    </Page>
  );
}
