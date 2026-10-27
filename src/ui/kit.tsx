import type { CSSProperties, ReactNode } from 'react';

import type { DataSource } from '../shared/domain/models';
import { Icon, type IconName } from './Icon';

export type Tone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  onClick,
  disabled,
  full,
  type = 'button',
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
  size?: 'md' | 'sm';
  icon?: IconName;
  onClick?: () => void;
  disabled?: boolean;
  full?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button type={type} className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', full && 'btn-full')} onClick={onClick} disabled={disabled}>
      {icon ? <Icon name={icon} size={size === 'sm' ? 18 : 20} /> : null}
      <span>{children}</span>
    </button>
  );
}

export function IconButton({ icon, label, onClick, active, badge }: { icon: IconName; label: string; onClick: () => void; active?: boolean; badge?: boolean }) {
  return (
    <button type="button" className={cx('icon-btn', active && 'is-active')} onClick={onClick} aria-label={label} title={label}>
      <Icon name={icon} />
      {badge ? <span className="icon-btn-dot" aria-hidden="true" /> : null}
    </button>
  );
}

export function Chip({ label, selected, onClick, color, icon }: { label: string; selected?: boolean; onClick: () => void; color?: string | null; icon?: IconName }) {
  return (
    <button type="button" className={cx('chip', selected && 'is-selected')} onClick={onClick} aria-pressed={!!selected}>
      {color ? <span className="dot" style={{ background: color }} aria-hidden="true" /> : null}
      {icon ? <Icon name={icon} size={16} /> : null}
      <span>{label}</span>
    </button>
  );
}

export function ChipRow({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="chip-row" role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label} style={{ '--count': options.length, '--index': Math.max(0, options.findIndex((o) => o.value === value)) } as CSSProperties}>
      <span className="segmented-thumb" aria-hidden="true" />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={cx('segment', o.value === value && 'is-selected')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({ children, tone = 'neutral', icon }: { children: ReactNode; tone?: Tone; icon?: IconName }) {
  return (
    <span className={cx('badge', `badge-${tone}`)}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </span>
  );
}

const SOURCE_BADGE: Record<DataSource, { label: string; tone: Tone }> = {
  official: { label: 'Официально', tone: 'success' },
  imported: { label: 'Импорт', tone: 'primary' },
  manual: { label: 'Вручную', tone: 'neutral' },
  demo: { label: 'Демо', tone: 'warning' },
};

export function SourceBadge({ source, hideManual = true }: { source: DataSource; hideManual?: boolean }) {
  if (hideManual && source === 'manual') return null;
  const b = SOURCE_BADGE[source];
  return <Badge tone={b.tone}>{b.label}</Badge>;
}

export function Card({
  children,
  onClick,
  tone,
  className,
  style,
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: 'muted' | 'primary' | 'accent' | 'warning';
  className?: string;
  style?: CSSProperties;
  label?: string;
}) {
  const cls = cx('card', tone && `card-${tone}`, onClick && 'is-pressable', className);
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} style={style} aria-label={label}>
        {children}
      </button>
    );
  }
  return (
    <div className={cls} style={style}>
      {children}
    </div>
  );
}

export function Section({
  title,
  action,
  children,
  footnote,
}: {
  title?: string;
  action?: { label: string; onClick: () => void };
  children: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    <section className="section">
      {title || action ? (
        <div className="section-head">
          {title ? <h2 className="section-title">{title}</h2> : <span />}
          {action ? (
            <button type="button" className="link-btn" onClick={action.onClick}>
              {action.label}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="section-body">{children}</div>
      {footnote ? <p className="footnote">{footnote}</p> : null}
    </section>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <div className="list">{children}</div>;
}

export function Row({
  icon,
  iconColor,
  title,
  subtitle,
  value,
  onClick,
  right,
  danger,
  chevron = true,
}: {
  icon?: IconName;
  iconColor?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  onClick?: () => void;
  right?: ReactNode;
  danger?: boolean;
  chevron?: boolean;
}) {
  const content = (
    <>
      {icon ? (
        <span className="row-icon" style={iconColor ? { background: iconColor } : undefined} aria-hidden="true">
          <Icon name={icon} size={18} />
        </span>
      ) : null}
      <span className="row-text">
        <span className={cx('row-title', danger && 'is-danger')}>{title}</span>
        {subtitle ? <span className="row-subtitle">{subtitle}</span> : null}
      </span>
      {value !== undefined && value !== null ? <span className="row-value">{value}</span> : null}
      {right}
      {onClick && chevron ? <Icon name="forward" size={18} className="row-chevron" /> : null}
    </>
  );
  return onClick ? (
    <button type="button" className="row is-pressable" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="row">{content}</div>
  );
}

export function Empty({
  icon,
  title,
  text,
  action,
  secondary,
}: {
  icon: IconName;
  title: string;
  text?: ReactNode;
  action?: { label: string; onClick: () => void; icon?: IconName };
  secondary?: { label: string; onClick: () => void };
}) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden="true">
        <Icon name={icon} size={28} />
      </span>
      <p className="empty-title">{title}</p>
      {text ? <p className="empty-text">{text}</p> : null}
      {action || secondary ? (
        <div className="empty-actions">
          {action ? (
            <Button icon={action.icon ?? 'plus'} onClick={action.onClick} size="sm">
              {action.label}
            </Button>
          ) : null}
          {secondary ? (
            <Button variant="ghost" onClick={secondary.onClick} size="sm">
              {secondary.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ProgressBar({ value, tone = 'primary', label }: { value: number; tone?: Tone; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={cx('progress', `progress-${tone}`)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Ring({ value, size = 64, tone = 'primary', children }: { value: number | null; size?: number; tone?: Tone; children?: ReactNode }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <span className={cx('ring', `ring-${tone}`)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="ring-track" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className="ring-value"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="ring-label">{children}</span>
    </span>
  );
}

export function Dot({ color }: { color: string | null | undefined }) {
  return <span className="dot" style={{ background: color ?? 'var(--text-3)' }} aria-hidden="true" />;
}

export function Notice({ tone = 'primary', icon = 'info', title, children, action }: { tone?: Tone; icon?: IconName; title?: string; children?: ReactNode; action?: { label: string; onClick: () => void } }) {
  return (
    <div className={cx('notice', `notice-${tone}`, !children && 'notice-compact')}>
      <Icon name={icon} size={20} className="notice-icon" />
      <div className="notice-body">
        {title ? <p className="notice-title">{title}</p> : null}
        {children ? <div className="notice-text">{children}</div> : null}
        {action ? (
          <button type="button" className="link-btn" onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
