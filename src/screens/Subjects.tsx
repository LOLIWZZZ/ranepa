import { useMemo, useState } from 'react';

import { ClassCard } from '../components/cards';
import { ColorChips } from '../components/SubjectPicker';
import { TeacherInputs, teacherIdsFromNames, validateTeacherNames, type TeacherNames } from '../components/TeacherInputs';
import { useToday } from '../hooks';
import { formatPoints, pointsForSubject, POINTS_MAX } from '../lib/points';
import { useNav } from '../nav';
import { computeAttendanceStats } from '../shared/domain/attendance';
import { formatPercent, pluralize } from '../shared/domain/format';
import { deleteSubject, deleteTeacher, findSubjectByName, findTeacherByName, nextSubjectColor, saveSubject, saveTeacher } from '../store/actions';
import { subjectTeacherNames, useModel } from '../store/model';
import { newId } from '../store/store';
import { FormError, TextArea, TextInput } from '../ui/form';
import { Badge, Button, Card, Empty, List, Notice, Row, Section, Segmented, SourceBadge } from '../ui/kit';
import { NavAction, Page } from '../ui/layout';
import { useOverlay } from '../ui/overlay';

export function SubjectsScreen({ tab: initialTab = 'subjects' }: { tab?: 'subjects' | 'teachers' }) {
  const nav = useNav();
  const model = useModel();
  const [tab, setTab] = useState<'subjects' | 'teachers'>(initialTab);
  const subjects = [...model.data.subjects].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const teachers = [...model.data.teachers].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of model.data.classes) map.set(c.subject_id, (map.get(c.subject_id) ?? 0) + 1);
    return map;
  }, [model.data.classes]);
  const withoutTeacher = subjects.filter((s) => s.teacher_ids.length === 0).length;

  return (
    <Page
      title={tab === 'subjects' ? 'Дисциплины' : 'Преподаватели'}
      right={<NavAction label="Добавить" onClick={() => nav.push(tab === 'subjects' ? { name: 'subjectForm' } : { name: 'teacherForm' })} />}
    >
      <Segmented
        label="Раздел"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'subjects', label: `Дисциплины · ${subjects.length}` },
          { value: 'teachers', label: `Преподаватели · ${teachers.length}` },
        ]}
      />
      {tab === 'subjects' ? (
        subjects.length === 0 ? (
          <Empty icon="layers" title="Дисциплин пока нет" text="Добавьте дисциплину и её преподавателей — потом преподаватель будет подставляться в занятия сам." action={{ label: 'Добавить дисциплину', onClick: () => nav.push({ name: 'subjectForm' }) }} />
        ) : (
          <>
            {withoutTeacher > 0 ? (
              <Notice tone="warning" icon="alert">
                Без преподавателя: {pluralize(withoutTeacher, ['дисциплина', 'дисциплины', 'дисциплин'])}. Откройте её и укажите 1–2 преподавателей.
              </Notice>
            ) : null}
            <List>
              {subjects.map((s) => {
                const names = subjectTeacherNames(s, model.teachers);
                return (
                  <Row
                    key={s.id}
                    title={
                      <>
                        <span className="dot" style={{ background: s.color }} aria-hidden="true" /> {s.name}
                      </>
                    }
                    subtitle={[names.length ? names.join(', ') : 'Преподаватель не указан', pluralize(counts.get(s.id) ?? 0, ['занятие', 'занятия', 'занятий'])].join(' · ')}
                    right={names.length === 0 ? <Badge tone="warning">Нет преподавателя</Badge> : <SourceBadge source={s.source} />}
                    onClick={() => nav.push({ name: 'subject', id: s.id })}
                  />
                );
              })}
            </List>
          </>
        )
      ) : teachers.length === 0 ? (
        <Empty icon="users" title="Преподавателей пока нет" text="Они добавляются вместе с дисциплинами или здесь." action={{ label: 'Добавить преподавателя', onClick: () => nav.push({ name: 'teacherForm' }) }} />
      ) : (
        <List>
          {teachers.map((t) => {
            const taught = subjects.filter((s) => s.teacher_ids.includes(t.id)).map((s) => s.short_name ?? s.name);
            return (
              <Row
                key={t.id}
                icon="user"
                title={t.name}
                subtitle={taught.length ? taught.join(', ') : 'Нет дисциплин'}
                right={<SourceBadge source={t.source} />}
                onClick={() => nav.push({ name: 'teacherForm', id: t.id })}
              />
            );
          })}
        </List>
      )}
    </Page>
  );
}

export function SubjectDetailScreen({ id }: { id: string }) {
  const nav = useNav();
  const model = useModel();
  const { now, timeZone } = useToday();
  const subject = model.subjects.get(id);
  if (!subject) {
    return (
      <Page title="Дисциплина">
        <Empty icon="layers" title="Дисциплина не найдена" />
      </Page>
    );
  }
  const upcoming = model.sessions.filter((s) => s.subject_id === id && Date.parse(s.ends_at) > now.getTime()).slice(0, 5);
  const attendance = computeAttendanceStats(model.attendance.filter((a) => a.subject_id === id));
  const points = pointsForSubject(subject, model.data.grades);
  const tasks = model.assignments.filter((a) => a.subject_id === id && a.progress?.status !== 'done' && a.progress?.status !== 'submitted');
  const teachers = subject.teacher_ids.map((tid) => model.teachers.get(tid)).filter((t): t is NonNullable<typeof t> => !!t);

  return (
    <Page title="Дисциплина" right={<NavAction label="Изменить" onClick={() => nav.push({ name: 'subjectForm', id })} />}>
      <div className="detail-head" style={{ borderColor: subject.color }}>
        <h2 className="detail-title">{subject.name}</h2>
        {subject.notes ? <p className="detail-note pre-wrap">{subject.notes}</p> : null}
      </div>
      <List>
        {teachers.length === 0 ? (
          <Row icon="alert" title="Преподаватель не указан" subtitle="Нажмите, чтобы добавить" onClick={() => nav.push({ name: 'subjectForm', id })} />
        ) : (
          teachers.map((t, i) => <Row key={t.id} icon="user" title={t.name} subtitle={teachers.length > 1 ? (i === 0 ? 'Преподаватель 1' : 'Преподаватель 2') : 'Преподаватель'} onClick={() => nav.push({ name: 'teacherForm', id: t.id })} />)
        )}
      </List>
      <Card onClick={() => nav.push({ name: 'gradeSubject', subjectId: id })} label="Баллы по дисциплине">
        <div className="summary-row">
          <div className="summary-cell">
            <span className="summary-number">
              {formatPoints(points.total)}
              <small className="of">/{POINTS_MAX}</small>
            </span>
            <span className="summary-label">Баллы</span>
          </div>
          <div className="summary-cell">
            <span className="summary-number">{attendance.rate === null ? '—' : formatPercent(attendance.rate)}</span>
            <span className="summary-label">Посещаемость</span>
          </div>
          <div className="summary-cell">
            <span className="summary-number">{tasks.length}</span>
            <span className="summary-label">Открытых заданий</span>
          </div>
        </div>
      </Card>
      <Section title="Ближайшие занятия" action={{ label: 'Добавить', onClick: () => nav.push({ name: 'classForm', subjectId: id }) }}>
        {upcoming.length === 0 ? (
          <p className="muted-text">Занятий в расписании нет.</p>
        ) : (
          upcoming.map((s) => <ClassCard key={s.id} session={s} now={now} timeZone={timeZone} compact onClick={() => nav.push({ name: 'class', id: s.id })} />)
        )}
      </Section>
      <Section title="Задания" action={{ label: 'Добавить', onClick: () => nav.push({ name: 'taskForm', subjectId: id }) }}>
        {tasks.length === 0 ? (
          <p className="muted-text">Открытых заданий нет.</p>
        ) : (
          <List>
            {tasks.map((t) => (
              <Row key={t.id} icon="tasks" title={t.title} onClick={() => nav.push({ name: 'task', id: t.id })} />
            ))}
          </List>
        )}
      </Section>
    </Page>
  );
}

export function SubjectFormScreen({ id }: { id?: string }) {
  const nav = useNav();
  const model = useModel();
  const overlay = useOverlay();
  const existing = id ? model.subjects.get(id) : undefined;
  const initialTeachers = (existing?.teacher_ids ?? []).map((tid) => model.teachers.get(tid)?.name ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [short, setShort] = useState(existing?.short_name ?? '');
  const [color, setColor] = useState(existing?.color ?? nextSubjectColor(model.data));
  const [teachers, setTeachers] = useState<TeacherNames>([initialTeachers[0] ?? '', initialTeachers[1] ?? '']);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [teacherError, setTeacherError] = useState<string | null>(null);

  const save = () => {
    const trimmed = name.trim();
    const tErr = validateTeacherNames(teachers);
    setTeacherError(tErr);
    if (trimmed.length < 2) return setError('Введите название дисциплины');
    const duplicate = findSubjectByName(trimmed);
    if (duplicate && duplicate.id !== existing?.id) return setError('Такая дисциплина уже есть');
    if (tErr) return setError(null);
    saveSubject({ id: existing?.id ?? newId(), name: trimmed, short_name: short.trim() || null, color, teacher_ids: teacherIdsFromNames(teachers), notes: notes.trim() || null });
    overlay.toast('Сохранено');
    nav.back();
  };

  const classCount = existing ? model.data.classes.filter((c) => c.subject_id === existing.id).length : 0;

  return (
    <Page title={existing ? 'Изменить дисциплину' : 'Новая дисциплина'} backLabel="Отмена" right={<NavAction label="Сохранить" onClick={save} />}>
      <div className="form">
        <TextInput label="Название" value={name} onChange={setName} placeholder="Например: Экономическая теория" />
        <TeacherInputs value={teachers} onChange={setTeachers} error={teacherError} />
        <TextInput label="Короткое название" optional value={short} onChange={setShort} placeholder="Экономтеория" hint="Показывается в фильтрах и карточках." />
        <p className="field-label">Цвет</p>
        <ColorChips value={color} onChange={setColor} />
        <TextArea label="Заметки" optional value={notes} onChange={setNotes} placeholder="Требования к зачёту, контакты кафедры, ссылки на материалы" />
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
              if (
                await overlay.confirm({
                  title: 'Удалить дисциплину?',
                  message: classCount > 0 ? `Будут удалены ${pluralize(classCount, ['занятие', 'занятия', 'занятий'])}, экзамены и баллы по ней. Задания останутся без дисциплины.` : 'Баллы по ней тоже удалятся. Задания останутся без дисциплины.',
                  confirmLabel: 'Удалить',
                  danger: true,
                })
              ) {
                deleteSubject(existing.id);
                overlay.toast('Дисциплина удалена');
                nav.reset();
              }
            }}
          >
            Удалить дисциплину
          </Button>
        ) : null}
      </div>
    </Page>
  );
}

export function TeacherFormScreen({ id }: { id?: string }) {
  const nav = useNav();
  const model = useModel();
  const overlay = useOverlay();
  const existing = id ? model.teachers.get(id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const subjects = existing ? model.data.subjects.filter((s) => s.teacher_ids.includes(existing.id)) : [];
  const classCount = existing ? model.data.classes.filter((c) => c.teacher_id === existing.id).length : 0;

  const save = () => {
    const trimmed = name.trim().replace(/\s+/g, ' ');
    if (trimmed.length < 3) return setError('Введите ФИО преподавателя');
    const duplicate = findTeacherByName(trimmed);
    if (duplicate && duplicate.id !== existing?.id) return setError('Такой преподаватель уже есть в списке');
    saveTeacher({ id: existing?.id ?? newId(), name: trimmed, notes: notes.trim() || null });
    overlay.toast('Сохранено');
    nav.back();
  };

  return (
    <Page title={existing ? 'Преподаватель' : 'Новый преподаватель'} backLabel="Отмена" right={<NavAction label="Сохранить" onClick={save} />}>
      <div className="form">
        <TextInput label="ФИО" value={name} onChange={setName} placeholder="Например: Иванова Мария Петровна" autoFocus={!existing} />
        <TextArea label="Заметки" optional value={notes} onChange={setNotes} placeholder="Кафедра, часы консультаций, как связаться (из официальных источников)" rows={3} />
        <FormError message={error} />
      </div>
      {subjects.length ? (
        <Section title="Ведёт дисциплины">
          <List>
            {subjects.map((s) => (
              <Row key={s.id} title={s.name} onClick={() => nav.push({ name: 'subject', id: s.id })} />
            ))}
          </List>
        </Section>
      ) : existing ? (
        <p className="footnote">Чтобы закрепить преподавателя за дисциплиной, откройте дисциплину и укажите его там.</p>
      ) : null}
      <div className="form-actions">
        <Button full icon="check" onClick={save}>
          Сохранить
        </Button>
        {existing ? (
          <Button
            full
            variant="ghost"
            onClick={async () => {
              if (
                await overlay.confirm({
                  title: 'Удалить преподавателя?',
                  message: `Он пропадёт из ${pluralize(subjects.length, ['дисциплины', 'дисциплин', 'дисциплин'])}${classCount ? ` и ${pluralize(classCount, ['занятия', 'занятий', 'занятий'])}` : ''}.`,
                  confirmLabel: 'Удалить',
                  danger: true,
                })
              ) {
                deleteTeacher(existing.id);
                overlay.toast('Преподаватель удалён');
                nav.back();
              }
            }}
          >
            Удалить преподавателя
          </Button>
        ) : null}
      </div>
    </Page>
  );
}
