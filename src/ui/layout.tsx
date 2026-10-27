import type { ReactNode } from 'react';

import { useNav } from '../nav';
import { Icon } from './Icon';

/** Экран вкладки: крупный заголовок и действия справа. */
export function TabScreen({ title, subtitle, actions, children, overline }: { title: string; subtitle?: ReactNode; overline?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <main className="screen">
      <header className="large-header">
        <div className="large-header-text">
          {overline ? <p className="overline">{overline}</p> : null}
          <h1 className="large-title">{title}</h1>
          {subtitle ? <p className="large-subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="header-actions">{actions}</div> : null}
      </header>
      <div className="screen-body">{children}</div>
    </main>
  );
}

/** Экран поверх вкладок: панель с кнопкой «Назад», заголовком и действием справа. */
export function Page({ title, right, children, footer, backLabel = 'Назад' }: { title: string; right?: ReactNode; children: ReactNode; footer?: ReactNode; backLabel?: string }) {
  const nav = useNav();
  return (
    <div className="page">
      <header className="nav-bar">
        <button type="button" className="nav-back" onClick={nav.back}>
          <Icon name="back" size={22} />
          <span>{backLabel}</span>
        </button>
        <h1 className="nav-title">{title}</h1>
        <div className="nav-right">{right}</div>
      </header>
      <div className="page-body">{children}</div>
      {footer ? <div className="page-footer">{footer}</div> : null}
    </div>
  );
}

export function NavAction({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="nav-action" onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}
