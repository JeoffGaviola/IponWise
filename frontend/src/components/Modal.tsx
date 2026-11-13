import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, TriangleAlert, X } from 'lucide-react';
import { Button, IconButton } from './ui.tsx';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps a value mounted for `ms` after it becomes null so exit animations can play. Returns [value, isExiting]. */
export function useExitTransition(value, ms = 180) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (value) { setShown(value); return undefined; }
    const timer = setTimeout(() => setShown(null), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return [value || shown, !value && Boolean(shown)];
}

/**
 * Accessible dialog: portal, focus trap, Escape to close, focus restored to the opener, body scroll lock.
 * Pass `busy` to block dismissal while a request is in flight.
 */
export function Modal({ title, description, onClose, children, closing = false, busy = false, role = 'dialog', size = 'md' }: { title: string; description?: string; onClose?: () => void; children: ReactNode; closing?: boolean; busy?: boolean; role?: 'dialog' | 'alertdialog'; size?: 'sm' | 'md' | 'lg' }) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef(null);
  const opener = useRef(typeof document === 'undefined' ? null : document.activeElement);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const panel = panelRef.current;
    const first = panel?.querySelector('[data-autofocus]') || panel?.querySelector('input:not([type="hidden"]), select, textarea') || panel?.querySelector(FOCUSABLE);
    (first || panel)?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => {
      if (event.key === 'Escape' && !busyRef.current) { event.stopPropagation(); closeRef.current?.(); return; }
      if (event.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) { event.preventDefault(); return; }
      const [head, tail] = [items[0], items[items.length - 1]];
      if (event.shiftKey && document.activeElement === head) { event.preventDefault(); tail.focus(); }
      else if (!event.shiftKey && document.activeElement === tail) { event.preventDefault(); head.focus(); }
      else if (!panel.contains(document.activeElement)) { event.preventDefault(); head.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      const target = opener.current;
      if (target && document.contains(target)) (target as HTMLElement).focus?.();
    };
  }, []);

  return createPortal(
    <div className={`modal-backdrop ${closing ? 'is-closing' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose?.(); }}>
      <div ref={panelRef} className={`modal modal-${size}`} role={role} aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descId : undefined} tabIndex={-1}>
        <header className="modal-header">
          <div><h2 id={titleId}>{title}</h2>{description && <p id={descId}>{description}</p>}</div>
          <IconButton label="Close dialog" icon={X} onClick={onClose} disabled={busy} />
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Confirmation for destructive actions: names the record, defaults focus to Cancel, blocks double-submit. */
export function ConfirmDialog({ title, message, details, confirmLabel = 'Delete', tone = 'danger', busy = false, closing = false, onConfirm, onCancel }: { title: string; message: string; details?: string; confirmLabel?: string; tone?: 'danger' | 'warning'; busy?: boolean; closing?: boolean; onConfirm: () => void | Promise<void>; onCancel: () => void }) {
  return <Modal title={title} onClose={onCancel} busy={busy} closing={closing} role="alertdialog" size="sm">
    <div className="confirm-body">
      <span className={`confirm-icon confirm-icon-${tone}`}>{tone === 'danger' ? <Trash2 size={22} aria-hidden="true" /> : <TriangleAlert size={22} aria-hidden="true" />}</span>
      <p>{message}</p>
      {details && <p className="confirm-details">{details}</p>}
    </div>
    <div className="modal-actions">
      <Button variant="secondary" onClick={onCancel} disabled={busy} data-autofocus>Cancel</Button>
      <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
    </div>
  </Modal>;
}
