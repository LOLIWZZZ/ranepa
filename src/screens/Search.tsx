import { useMemo, useState } from 'react';

import { useToday } from '../hooks';
import { useNav } from '../nav';
import { EXAM_KIND_LABELS } from '../shared/domain/calendar';
import { CLASS_TYPE_SHORT, normalizeSearch, sessionLocation, sessionTeacherName } from '../shared/domain/schedule';
import { formatDateTimeShort } from '../shared/domain/time';
import { subjectTeacherNames, useModel } from '../store/model';
import { TextInput } from '../ui/form';
import { Empty, List, Row, Section } from '../ui/kit';
import { Page } from '../ui/layout';

export function SearchScreen() {
  const nav = useNav();
  const model = useModel();
  const { now, timeZone } = useToday();
  const [query, setQuery] = useState('');
  const q = normalizeSearch(query);

  const results = useMemo(() => {
    if (q.length < 2) return null;
    const has = (...parts: (string | null | undefined)[]) => normalizeSearch(parts.filter(Boolean).join(' ')).includes(q);
    const horizon = now.getTime() + 60 * 86_400_000;
    return {
      subjects: model.data.subjects.filter((s) => has(s.name, s.short_name, ...subjectTeacherNames(s, model.teachers), s.notes)).slice(0, 10),
      teachers: model.data.teachers.filter((t) => has(t.name, t.notes)).slice(0, 10),
      classes: model.sessions
        .filter((s) => Date.parse(s.ends_at) >= now.getTime() && Date.parse(s.starts_at) <= horizon)
        .filter((s) => has(s.subject?.name, s.subject?.short_name, sessionTeacherName(s), sessionLocation(s), s.notes))
        .slice(0, 10),
      tasks: model.assignments.filter((a) => has(a.title, a.description, a.subject?.name)).slice(0, 10),
      exams: model.exams.filter((e) => has(e.subject?.name, EXAM_KIND_LABELS[e.kind], e.notes, sessionLocation(e))).slice(0, 10),
      events: model.data.events.filter((e) => has(e.title, e.description, e.location)).slice(0, 10),
    };
  }, [q, model, now]);

  const total = results ? Object.values(results).reduce((n, list) => n + list.length, 0) : 0;

  return (
    <Page title="Поиск">
      <TextInput label="Что найти" type="search" inputMode="search" value={query} onChange={setQuery} placeholder="Дисциплина, преподаватель, аудитория, задание" autoFocus />
      {!results ? (
        <p className="footnote">Введите хотя бы две буквы. Поиск идёт по дисциплинам, преподавателям, аудиториям, ближайшим занятиям (60 дней), заданиям, экзаменам и событиям.</p>
      ) : total === 0 ? (
        <Empty icon="search" title="Ничего не найдено" text="Попробуйте другое слово." />
      ) : (
        <>
          {results.subjects.length ? (
            <Section title="Дисциплины">
              <List>
                {results.subjects.map((s) => (
                  <Row key={s.id} title={s.name} subtitle={subjectTeacherNames(s, model.teachers).join(', ') || undefined} onClick={() => nav.push({ name: 'subject', id: s.id })} />
                ))}
              </List>
            </Section>
          ) : null}
          {results.teachers.length ? (
            <Section title="Преподаватели">
              <List>
                {results.teachers.map((t) => (
                  <Row
                    key={t.id}
                    icon="user"
                    title={t.name}
                    subtitle={model.data.subjects.filter((s) => s.teacher_ids.includes(t.id)).map((s) => s.name).join(', ') || undefined}
                    onClick={() => nav.push({ name: 'teacherForm', id: t.id })}
                  />
                ))}
              </List>
            </Section>
          ) : null}
          {results.classes.length ? (
            <Section title="Занятия">
              <List>
                {results.classes.map((s) => (
                  <Row
                    key={s.id}
                    title={s.subject?.name ?? 'Занятие'}
                    subtitle={[formatDateTimeShort(new Date(s.starts_at), timeZone, now), CLASS_TYPE_SHORT[s.class_type], sessionLocation(s), sessionTeacherName(s)].filter(Boolean).join(' · ')}
                    onClick={() => nav.push({ name: 'class', id: s.id })}
                  />
                ))}
              </List>
            </Section>
          ) : null}
          {results.tasks.length ? (
            <Section title="Задания">
              <List>
                {results.tasks.map((a) => (
                  <Row key={a.id} title={a.title} subtitle={a.due_at ? `Срок: ${formatDateTimeShort(new Date(a.due_at), timeZone, now)}` : 'Без срока'} onClick={() => nav.push({ name: 'task', id: a.id })} />
                ))}
              </List>
            </Section>
          ) : null}
          {results.exams.length ? (
            <Section title="Сессия">
              <List>
                {results.exams.map((e) => (
                  <Row key={e.id} title={`${EXAM_KIND_LABELS[e.kind]}: ${e.subject?.name ?? ''}`} subtitle={formatDateTimeShort(new Date(e.starts_at), timeZone, now)} onClick={() => nav.push({ name: 'examForm', id: e.id })} />
                ))}
              </List>
            </Section>
          ) : null}
          {results.events.length ? (
            <Section title="События">
              <List>
                {results.events.map((e) => (
                  <Row key={e.id} title={e.title} subtitle={formatDateTimeShort(new Date(e.starts_at), timeZone, now)} onClick={() => nav.push({ name: 'event', id: e.id })} />
                ))}
              </List>
            </Section>
          ) : null}
        </>
      )}
    </Page>
  );
}
