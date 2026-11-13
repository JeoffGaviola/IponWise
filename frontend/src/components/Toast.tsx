import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';
type ToastAction = { label: string; onClick?: () => void };
type ToastOptions = { key?: string; title?: string; action?: ToastAction; duration?: number };
type ToastRecord = { id: number; key: string; type: ToastType; message: string; title?: string; action?: ToastAction; duration: number; bump: number; leaving: boolean };
type ToastApi = {
  notify: (type: ToastType, message: string, options?: ToastOptions) => void;
  dismiss: (id: number) => void;
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  warning: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
};
const ToastContext = createContext<ToastApi | null>(null);
const ICONS = { success: CheckCircle2, error: AlertCircle, warning: AlertTriangle, info: Info };
const DURATIONS = { success: 4000, info: 5000, warning: 7000, error: 0 }; // 0 = stays until dismissed
const MAX_VISIBLE = 4;
const EXIT_MS = 200;
const LABELS = { success: 'Success', error: 'Error', warning: 'Warning', info: 'Information' };

/** Operation feedback: duplicates refresh, errors remain visible, and hover or focus pauses dismissal. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const notify = useCallback((type: ToastType, message: string, options: ToastOptions = {}) => {
    const key = options.key || `${type}:${options.title || ''}:${message}`;
    setToasts((current) => {
      const existing = current.find((t) => t.key === key && !t.leaving);
      if (existing) return current.map((t) => (t.id === existing.id ? { ...t, bump: t.bump + 1 } : t));
      const next = { id: nextId.current++, key, type, message, title: options.title, action: options.action, duration: options.duration ?? DURATIONS[type], bump: 0, leaving: false };
      const list = [...current, next];
      return list.length > MAX_VISIBLE ? list.slice(list.length - MAX_VISIBLE) : list;
    });
  }, []);

  const api = useMemo(() => ({
    notify,
    dismiss,
    success: (message, options) => notify('success', message, options),
    error: (message, options) => notify('error', message, options),
    warning: (message, options) => notify('warning', message, options),
    info: (message, options) => notify('info', message, options),
  }), [notify, dismiss]);

  return <ToastContext.Provider value={api}>
    {children}
    <div className="toast-region" role="region" aria-label="Notifications" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />)}
    </div>
  </ToastContext.Provider>;
}

export function ToastItem({ toast, onDismiss }: { toast: ToastRecord; onDismiss: (id: number) => void }) {
  const { id, type, title, message, action, duration, bump, leaving } = toast;
  const [paused, setPaused] = useState(false);
  const Icon = ICONS[type] || Info;

  useEffect(() => {
    if (!duration || paused || leaving) return undefined;
    const timer = setTimeout(() => onDismiss(id), duration);
    return () => clearTimeout(timer);
  }, [duration, paused, leaving, bump, id, onDismiss]);

  return <div
    className={`toast toast-${type} ${leaving ? 'toast-leaving' : ''}`}
    role={type === 'error' ? 'alert' : 'status'}
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
  >
    <span className="toast-icon"><Icon size={20} aria-hidden="true" /></span>
    <div className="toast-body">
      <strong>{title || LABELS[type]}</strong>
      <span>{message}</span>
      {action && <button type="button" className="toast-action" onClick={() => { action.onClick?.(); onDismiss(id); }}>{action.label}</button>}
    </div>
    <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => onDismiss(id)}><X size={16} aria-hidden="true" /></button>
  </div>;
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>.');
  return context;
}
