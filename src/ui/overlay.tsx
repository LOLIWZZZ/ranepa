/** Всплывающие элементы: уведомления-тосты, подтверждения, меню действий и нижние панели. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Icon } from './Icon';
import { EXIT_MS, usePresence } from './motion';
import { Button, cx } from './kit';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface ChoiceOption<T> {
  label: string;
  value: T;
  danger?: boolean;
}

interface OverlayApi {
  toast: (message: string, tone?: 'default' | 'error') => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  choose: <T>(title: string, options: ChoiceOption<T>[], message?: string) => Promise<T | null>;
}

const OverlayContext = createContext<OverlayApi | null>(null);

interface DialogState {
  title: string;
  message?: string;
  options: ChoiceOption<unknown>[];
  resolve: (value: unknown) => void;
  kind: 'confirm' | 'choice';
}

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: 'default' | 'error'; leaving?: boolean }[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogClosing, setDialogClosing] = useState(false);
  const counter = useRef(0);

  const toast = useCallback((message: string, tone: 'default' | 'error' = 'default') => {
    counter.current += 1;
    const id = counter.current;
    setToasts((t) => [...t.slice(-2), { id, message, tone }]);
    const life = tone === 'error' ? 5000 : 2800;
    setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x))), life - EXIT_MS);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), life);
  }, []);

  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setDialog({
          kind: 'confirm',
          title: o.title,
          message: o.message,
          options: [{ label: o.confirmLabel ?? 'Подтвердить', value: true, danger: o.danger }],
          resolve: (v) => resolve(v === true),
        });
      }),
    [],
  );

  const choose = useCallback(
    <T,>(title: string, options: ChoiceOption<T>[], message?: string) =>
      new Promise<T | null>((resolve) => {
        setDialog({ kind: 'choice', title, message, options: options as ChoiceOption<unknown>[], resolve: (v) => resolve((v ?? null) as T | null) });
      }),
    [],
  );

  const close = (value: unknown) => {
    if (!dialog || dialogClosing) return;
    dialog.resolve(value);
    setDialogClosing(true);
    setTimeout(() => {
      setDialog(null);
      setDialogClosing(false);
    }, EXIT_MS);
  };

  const api = useMemo(() => ({ toast, confirm, choose }), [toast, confirm, choose]);

  return (
    <OverlayContext.Provider value={api}>
      {children}
      {createPortal(
        <>
          <div className="toasts" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className={cx('toast', t.tone === 'error' && 'toast-error', t.leaving && 'is-leaving')} role={t.tone === 'error' ? 'alert' : 'status'}>
                {t.message}
              </div>
            ))}
          </div>
          {dialog ? (
            <Backdrop onClose={() => close(null)} closing={dialogClosing}>
              <div className="action-sheet" role="dialog" aria-modal="true" aria-label={dialog.title}>
                <div className="action-group">
                  <div className="action-head">
                    <p className="action-title">{dialog.title}</p>
                    {dialog.message ? <p className="action-message">{dialog.message}</p> : null}
                  </div>
                  {dialog.options.map((o, i) => (
                    <button key={i} type="button" className={cx('action-btn', o.danger && 'is-danger')} onClick={() => close(o.value)} autoFocus={i === 0}>
                      {o.label}
                    </button>
                  ))}
                </div>
                <button type="button" className="action-btn action-cancel" onClick={() => close(null)}>
                  Отмена
                </button>
              </div>
            </Backdrop>
          ) : null}
        </>,
        document.body,
      )}
    </OverlayContext.Provider>
  );
}

export function useOverlay(): OverlayApi {
  const ctx = useContext(OverlayContext);
  if (!ctx) throw new Error('OverlayProvider отсутствует');
  return ctx;
}

function Backdrop({ children, onClose, closing }: { children: ReactNode; onClose: () => void; closing?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={cx('backdrop', closing && 'is-closing')} onClick={(e) => e.target === e.currentTarget && onClose()}>
      {children}
    </div>
  );
}

/** Нижняя панель с произвольным содержимым (фильтры, быстрые формы). */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const { mounted, closing } = usePresence(open);
  if (!mounted) return null;
  return createPortal(
    <Backdrop onClose={onClose} closing={closing}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2 className="sheet-title">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <Icon name="x" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </Backdrop>,
    document.body,
  );
}

export function SheetDone({ onClick }: { onClick: () => void }) {
  return (
    <Button full onClick={onClick}>
      Готово
    </Button>
  );
}
