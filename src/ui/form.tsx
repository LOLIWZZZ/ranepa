import { useId, type ReactNode } from 'react';

import { cx } from './kit';

function FieldShell({ id, label, optional, error, hint, children }: { id: string; label: string; optional?: boolean; error?: string | null; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className={cx('field', error && 'has-error')}>
      <label className="field-label" htmlFor={id}>
        {label}
        {optional ? <span className="field-optional"> · необязательно</span> : null}
      </label>
      {children}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  error,
  hint,
  optional,
  type = 'text',
  inputMode,
  autoFocus,
  autoComplete = 'off',
  maxLength = 200,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string | null;
  hint?: ReactNode;
  optional?: boolean;
  type?: 'text' | 'url' | 'search' | 'email';
  inputMode?: 'text' | 'decimal' | 'numeric' | 'url' | 'search';
  autoFocus?: boolean;
  autoComplete?: string;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} optional={optional} error={error} hint={hint}>
      <input
        id={id}
        className="input"
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
      />
    </FieldShell>
  );
}

export function TextArea({ label, value, onChange, placeholder, optional, error, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; optional?: boolean; error?: string | null; rows?: number }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} optional={optional} error={error}>
      <textarea id={id} className="input textarea" rows={rows} value={value} placeholder={placeholder} maxLength={4000} onChange={(e) => onChange(e.target.value)} />
    </FieldShell>
  );
}

export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  error,
  optional,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  error?: string | null;
  optional?: boolean;
}) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} optional={optional}>
      <div className="select-wrap">
        <select id={id} className="input select" value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </FieldShell>
  );
}

export function DateInput({ label, value, onChange, error, min, max }: { label: string; value: string; onChange: (v: string) => void; error?: string | null; min?: string; max?: string }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error}>
      <input id={id} className="input" type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} required />
    </FieldShell>
  );
}

export function TimeInput({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string | null }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error}>
      <input id={id} className="input" type="time" value={value} step={300} onChange={(e) => onChange(e.target.value)} required />
    </FieldShell>
  );
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="toggle-row">
      <label htmlFor={id} className="toggle-text">
        <span className="toggle-label">{label}</span>
        {hint ? <span className="toggle-hint">{hint}</span> : null}
      </label>
      <input id={id} type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

export function FormRow({ children }: { children: ReactNode }) {
  return <div className="form-row">{children}</div>;
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="form-error" role="alert">
      {message}
    </p>
  );
}
