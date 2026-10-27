import { useId } from 'react';

import { ensureTeacher } from '../store/actions';
import { useData } from '../store/store';

export type TeacherNames = [string, string];

/** Сохраняет ФИО в справочник преподавателей и возвращает их id (1–2, без повторов). */
export function teacherIdsFromNames(names: TeacherNames): string[] {
  const ids: string[] = [];
  for (const n of names) {
    if (!n.trim()) continue;
    const id = ensureTeacher(n).id;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function validateTeacherNames(names: TeacherNames): string | null {
  const [first, second] = names.map((n) => n.trim());
  if (!first && !second) return 'Укажите хотя бы одного преподавателя';
  if ((first && first.length < 3) || (second && second.length < 3)) return 'Введите ФИО преподавателя полностью';
  if (first && second && first.toLocaleLowerCase('ru-RU') === second.toLocaleLowerCase('ru-RU')) return 'Преподаватели совпадают — оставьте одного';
  return null;
}

/** Два поля ФИО с подсказками из справочника: первый обязателен, второй — по желанию. */
export function TeacherInputs({ value, onChange, error }: { value: TeacherNames; onChange: (v: TeacherNames) => void; error?: string | null }) {
  const data = useData();
  const listId = useId();
  const firstId = useId();
  const secondId = useId();
  const names = [...data.teachers].map((t) => t.name).sort((a, b) => a.localeCompare(b, 'ru'));
  return (
    <div className="field">
      <label className="field-label" htmlFor={firstId}>
        Преподаватель
      </label>
      <input
        id={firstId}
        className="input"
        list={listId}
        value={value[0]}
        placeholder="ФИО"
        autoComplete="off"
        maxLength={120}
        aria-invalid={!!error}
        onChange={(e) => onChange([e.target.value, value[1]])}
      />
      <label className="field-label" htmlFor={secondId}>
        Второй преподаватель<span className="field-optional"> · необязательно</span>
      </label>
      <input
        id={secondId}
        className="input"
        list={listId}
        value={value[1]}
        placeholder="ФИО"
        autoComplete="off"
        maxLength={120}
        onChange={(e) => onChange([value[0], e.target.value])}
      />
      <datalist id={listId}>
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
