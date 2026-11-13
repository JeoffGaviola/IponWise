import { useEffect, useRef, useState } from 'react';
import { Bell, CalendarDays, CheckCircle2, Clock3, Target, Wallet, X } from 'lucide-react';

const ICONS = { goal: Target, reminder: CalendarDays, wallet: Wallet, success: CheckCircle2 };

export type AppNotification = {
  id: string;
  kind: 'goal' | 'reminder' | 'wallet' | 'success';
  title: string;
  detail: string;
  target: string;
};

export function NotificationCenter({ notifications, onNavigate }: { notifications: AppNotification[]; onNavigate: (target: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return <div className="notification-center" ref={ref}>
    <button
      type="button"
      className="icon-btn bell"
      aria-label={notifications.length ? `Open notifications: ${notifications.length} unread` : 'Open notifications'}
      aria-expanded={open}
      title="Notifications"
      onClick={() => setOpen((value) => !value)}
    >
      <Bell size={19} aria-hidden="true" />
      {notifications.length > 0 && <b className="bell-count">{notifications.length > 9 ? '9+' : notifications.length}</b>}
    </button>
    {open && <section className="notification-panel" aria-label="Notifications">
      <header className="notification-panel-header">
        <div><strong>Notifications</strong><span>{notifications.length ? `${notifications.length} need your attention` : 'You’re all caught up'}</span></div>
        <button type="button" className="icon-btn" aria-label="Close notifications" onClick={() => setOpen(false)}><X size={17} aria-hidden="true" /></button>
      </header>
      {notifications.length === 0
        ? <p className="notification-empty"><CheckCircle2 size={20} aria-hidden="true" /> No new savings updates.</p>
        : <div className="notification-list">
          {notifications.map((notification) => {
            const Icon = ICONS[notification.kind] || Clock3;
            return <button type="button" className={`notification-item notification-item-${notification.kind}`} key={notification.id} onClick={() => { setOpen(false); onNavigate(notification.target); }}>
              <span className="notification-icon"><Icon size={17} aria-hidden="true" /></span>
              <span><strong>{notification.title}</strong><small>{notification.detail}</small></span>
            </button>;
          })}
        </div>}
    </section>}
  </div>;
}
