import { Children, cloneElement, isValidElement, useId, useState, type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Eye, EyeOff, Info, LoaderCircle, RefreshCw, Search, type LucideIcon } from 'lucide-react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  return <LoaderCircle className="spin" size={size} aria-hidden={label ? undefined : 'true'} aria-label={label} />;
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'info' | 'warning' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: LucideIcon;
};

/** Create=success, read=info, update=warning, delete=danger. Loading preserves the button footprint. */
export function Button({ variant = 'primary', size = 'md', loading = false, icon: Icon, children, className, disabled, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={cx('btn', `btn-${variant}`, `btn-${size}`, loading && 'btn-loading', className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
    <span className="btn-content">{Icon && <Icon size={size === 'sm' ? 15 : 17} aria-hidden="true" />}{children}</span>
    {loading && <span className="btn-spinner"><Spinner size={size === 'sm' ? 15 : 18} /></span>}
  </button>;
}

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  label: string;
  icon: LucideIcon;
  tone?: 'danger' | 'warning' | 'info' | 'success';
  size?: number;
};

export function IconButton({ label, icon: Icon, tone, size = 17, className, ...rest }: IconButtonProps) {
  return <button type="button" className={cx('icon-btn', tone && `icon-btn-${tone}`, className)} aria-label={label} title={label} {...rest}><Icon size={size} aria-hidden="true" /></button>;
}

/** Wraps a single control with its label, hint and error, and wires up id / aria-describedby / aria-invalid. */
export function Field({ label, hint, error, optional, children, className }: { label: string; hint?: string; error?: string; optional?: boolean; children: ReactNode; className?: string }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  const child = Children.only(children) as ReactElement<any>;
  const control = isValidElement(child)
    ? cloneElement(child, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, className: cx((child.props as any).className || 'control', error && 'control-error') } as any)
    : child;
  return <div className={cx('field', error && 'field-has-error', className)}>
    <label htmlFor={id} className="field-label">{label}{optional && <span className="field-optional">Optional</span>}</label>
    {control}
    {hint && !error && <p className="field-hint" id={hintId}>{hint}</p>}
    <p className="field-error" id={errorId} role={error ? 'alert' : undefined}>{error && <><AlertCircle size={14} aria-hidden="true" />{error}</>}</p>
  </div>;
}

export function AmountInput({ symbol = '₱', ...rest }: { symbol?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <div className="amount-wrap"><span aria-hidden="true">{symbol}</span><input inputMode="decimal" type="number" min="0" step="0.01" className="control" {...rest} /></div>;
}

/* Wrapper-style inputs must forward id / aria-* to the real <input> so Field can label them correctly. */
export function PasswordInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return <div className="password-wrap">
    <input className={className} type={show ? 'text' : 'password'} {...rest} />
    <button type="button" className="password-toggle" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow((v) => !v)}>{show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
  </div>;
}

export function SearchInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <div className="search-wrap"><Search size={16} aria-hidden="true" /><input type="search" className={className} {...rest} /></div>;
}

/** Inline, form-level message (server rejection reasons, etc.). */
export function FormAlert({ children, tone = 'error' }: { children?: ReactNode; tone?: 'error' | 'warning' | 'info' }) {
  if (!children) return null;
  const Icon = tone === 'error' ? AlertCircle : tone === 'warning' ? AlertTriangle : Info;
  return <div className={cx('alert', `alert-${tone}`)} role={tone === 'error' ? 'alert' : 'status'}><Icon size={17} aria-hidden="true" /><span>{children}</span></div>;
}

const BADGE_ICONS = { success: CheckCircle2, error: AlertCircle, warning: AlertTriangle, info: Info };
/** Status is never colour-only: every tone carries an icon and a text label. */
export function Badge({ tone = 'neutral', icon, children, className }: { tone?: string; icon?: LucideIcon | false; children?: ReactNode; className?: string }) {
  const Icon = icon === false ? null : icon || BADGE_ICONS[tone];
  return <span className={cx('badge', `badge-${tone}`, className)}>{Icon && <Icon size={13} aria-hidden="true" />}{children}</span>;
}

export function ProgressBar({ value, tone = 'info', label, className }: { value: number; tone?: string; label: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return <div className={cx('progress', `progress-${tone}`, className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}><div className="progress-fill" style={{ width: `${pct}%` }} /></div>;
}

export const Skeleton = ({ height = 16, width = '100%', radius, className }: { height?: number | string; width?: number | string; radius?: number | string; className?: string }) => <span className={cx('skeleton', className)} style={{ height, width, borderRadius: radius } as CSSProperties} aria-hidden="true" />;

export function LoadingBlock({ label = 'Loading…', rows = 3 }: { label?: string; rows?: number }) {
  return <div className="loading-block" role="status" aria-live="polite" aria-label={label}>
    {Array.from({ length: rows }, (_, i) => <Skeleton key={i} height={i === 0 ? 22 : 56} width={i === 0 ? '38%' : '100%'} radius={12} />)}
    <span className="sr-only">{label}</span>
  </div>;
}

export function EmptyState({ icon: Icon, title, children, action, compact }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return <div className={cx('empty-state', compact && 'empty-state-compact')}>{Icon && <span className="empty-icon"><Icon size={22} aria-hidden="true" /></span>}<strong>{title}</strong>{children && <p>{children}</p>}{action}</div>;
}

/** Distinct from EmptyState: something went wrong, so the person is told and offered a retry. */
export function ErrorState({ title = 'Something went wrong', message, onRetry, retrying = false }: { title?: string; message?: ReactNode; onRetry?: () => void; retrying?: boolean }) {
  return <div className="error-state" role="alert"><span className="empty-icon empty-icon-error"><AlertCircle size={22} aria-hidden="true" /></span><strong>{title}</strong>{message && <p>{message}</p>}{onRetry && <Button variant="secondary" icon={RefreshCw} loading={retrying} onClick={onRetry}>Try again</Button>}</div>;
}

export function PageHeading({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

export function Panel({ title, description, actions, children, className }: { title?: string; description?: string; actions?: ReactNode; children?: ReactNode; className?: string }) {
  return <section className={cx('panel', className)}>{(title || actions) && <header className="panel-header"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{actions}</header>}{children}</section>;
}

export function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={cx('switch', checked && 'switch-on')} onClick={() => onChange(!checked)}><i /></button>;
}

export { cx };
