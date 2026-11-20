import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';

// ── Meldungen ─────────────────────────────────────────────────────────
interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'bad';
  action?: { label: string; run: () => void };
  ms: number;
}
const ToastCtx = createContext<{ show: (t: Omit<Toast, 'id' | 'ms' | 'kind'> & { kind?: 'ok' | 'bad'; ms?: number }) => void }>({ show: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const show = useCallback((t: Omit<Toast, 'id' | 'ms' | 'kind'> & { kind?: 'ok' | 'bad'; ms?: number }) => {
    const id = Date.now() + Math.random();
    const item: Toast = { id, kind: t.kind ?? 'ok', ms: t.ms ?? 4000, text: t.text, action: t.action };
    setItems((x) => [...x.slice(-2), item]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), item.ms);
  }, []);
  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'bad' ? 'bad' : ''}`}>
            <span className="grow">{t.text}</span>
            {t.action && (
              <button
                className="btn sm"
                onClick={() => {
                  t.action!.run();
                  setItems((x) => x.filter((i) => i.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx).show;

// ── Dialog ────────────────────────────────────────────────────────────
export function Dialog({ title, children, onClose, wide, footer }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])');
    (first ?? ref.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')];
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f.at(-1)!.focus();
        } else if (!e.shiftKey && document.activeElement === f.at(-1)) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} ref={ref} tabIndex={-1}>
        <h2 id={id}>{title}</h2>
        {children}
        {footer && <div className="foot">{footer}</div>}
      </div>
    </div>
  );
}

// ── Felder ────────────────────────────────────────────────────────────
export function Field({ label, hint, error, children, id }: { label: string; hint?: ReactNode; error?: string | null; children: (id: string) => ReactNode; id?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="field">
      <label htmlFor={fid}>{label}</label>
      {children(fid)}
      {hint && !error && <div className="hint">{hint}</div>}
      {error && (
        <div className="err" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

export function Spinner({ label = 'Lädt …' }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function Loading({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-busy="true" aria-label="Lädt" style={{ display: 'grid', gap: 10 }}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: i === 0 ? 28 : 64 }} />
      ))}
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="callout bad" role="alert">
      <span className="grow">{(error as Error)?.message ?? 'Unbekannter Fehler'}</span>
      {retry && (
        <button className="btn sm" onClick={retry}>
          Erneut versuchen
        </button>
      )}
    </div>
  );
}

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(new Date(iso)) : '–';
export const fmtRel = (iso: string | null | undefined) => {
  if (!iso) return '–';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `vor ${Math.round(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} Std.`;
  return fmtDate(iso);
};

// ── Bestätigung (statt Browser-Dialog) ───────────────────────────────
export function useConfirm() {
  const [state, setState] = useState<null | { title: string; text: ReactNode; label: string; danger?: boolean; run: () => void }>(null);
  const ask = (o: { title: string; text: ReactNode; label: string; danger?: boolean }, run: () => void) => setState({ ...o, run });
  const node = state ? (
    <Dialog
      title={state.title}
      onClose={() => setState(null)}
      footer={
        <>
          <button className="btn" data-close onClick={() => setState(null)}>
            Abbrechen
          </button>
          <button
            className={`btn ${state.danger ? 'danger' : 'primary'}`}
            onClick={() => {
              state.run();
              setState(null);
            }}
          >
            {state.label}
          </button>
        </>
      }
    >
      <div style={{ marginTop: 0 }}>{state.text}</div>
    </Dialog>
  ) : null;
  return { ask, node };
}
