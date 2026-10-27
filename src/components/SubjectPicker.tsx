import { useState } from 'react';

import { findSubjectByName, nextSubjectColor, saveSubject } from '../store/actions';
import { newId, useData } from '../store/store';
import { SUBJECT_COLORS } from '../store/types';
import { Select, TextInput } from '../ui/form';
import { Button, cx } from '../ui/kit';
import { TeacherInputs, teacherIdsFromNames, validateTeacherNames, type TeacherNames } from './TeacherInputs';

const NEW = '__new__';

export function ColorChips({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="color-chips" role="radiogroup" aria-label="Цвет дисциплины">
      {SUBJECT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === value}
          aria-label={`Цвет ${c}`}
          className={cx('color-chip', c === value && 'is-selected')}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

export function SubjectPicker({ value, onChange, optional, error }: { value: string | null; onChange: (id: string | null) => void; optional?: boolean; error?: string | null }) {
  const data = useData();
  const [creating, setCreating] = useState(data.subjects.length === 0 && !optional);
  const [name, setName] = useState('');
  const [teachers, setTeachers] = useState<TeacherNames>(['', '']);
  const [color, setColor] = useState(() => nextSubjectColor(data));
  const [nameError, setNameError] = useState<string | null>(null);
  const [teacherError, setTeacherError] = useState<string | null>(null);

  const subjects = [...data.subjects].sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const create = () => {
    const trimmed = name.trim();
    const existing = trimmed ? findSubjectByName(trimmed) : undefined;
    if (existing) {
      onChange(existing.id);
      setCreating(false);
      return;
    }
    const nErr = trimmed.length < 2 ? 'Введите название дисциплины' : null;
    const tErr = validateTeacherNames(teachers);
    setNameError(nErr);
    setTeacherError(tErr);
    if (nErr || tErr) return;
    const s = saveSubject({ id: newId(), name: trimmed, short_name: null, color, teacher_ids: teacherIdsFromNames(teachers), notes: null });
    onChange(s.id);
    setCreating(false);
    setName('');
    setTeachers(['', '']);
  };

  if (creating) {
    return (
      <div className="subject-new">
        <TextInput label="Новая дисциплина" value={name} onChange={setName} placeholder="Например: Экономическая теория" error={nameError ?? error} autoFocus />
        <TeacherInputs value={teachers} onChange={setTeachers} error={teacherError} />
        <ColorChips value={color} onChange={setColor} />
        <div className="inline-actions">
          <Button size="sm" onClick={create} icon="check">
            Добавить дисциплину
          </Button>
          {subjects.length > 0 || optional ? (
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Выбрать из списка
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <Select
      label="Дисциплина"
      optional={optional}
      value={value ?? ''}
      error={error}
      onChange={(v) => {
        if (v === NEW) {
          setColor(nextSubjectColor());
          setCreating(true);
        } else onChange(v || null);
      }}
      options={[
        { value: '', label: optional ? 'Без дисциплины' : 'Выберите дисциплину' },
        ...subjects.map((s) => ({ value: s.id, label: s.name })),
        { value: NEW, label: '＋ Новая дисциплина…' },
      ]}
    />
  );
}
