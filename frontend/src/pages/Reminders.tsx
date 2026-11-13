import { Bell, CalendarDays, Check, Clock3, Pencil, PiggyBank, RotateCcw, Target, Trash2 } from 'lucide-react';
import { Badge, EmptyState, FormAlert, IconButton, PageHeading, Panel, Toggle } from '../components/ui.tsx';
import { dateLabel, localDate } from '../lib/format.ts';
import type { AppNotification } from '../components/NotificationCenter.tsx';

const KIND_ICON = { deposit: PiggyBank, review: CalendarDays, goal: Target };

function ReminderCard({ reminder, onEdit, onToggle, onComplete, onDelete }: { reminder: any; onEdit: (r: any) => void; onToggle: (r: any, active: boolean) => void; onComplete: (r: any, completed: boolean) => void; onDelete: (r: any) => void }) {
  const Icon = KIND_ICON[reminder.kind] || Bell;
  const overdue = !reminder.completed && reminder.active && reminder.dueDate && reminder.dueDate < localDate();
  const state = reminder.completed ? <Badge tone="success">Completed</Badge> : !reminder.active ? <Badge tone="neutral" icon={false}>Paused</Badge> : overdue ? <Badge tone="warning">Overdue</Badge> : <Badge tone="info" icon={Bell}>Active</Badge>;
  return <article className={`reminder ${!reminder.active || reminder.completed ? 'reminder-muted' : ''}`}>
    <span className={`reminder-icon reminder-icon-${reminder.kind}`}><Icon size={20} aria-hidden="true" /></span>
    <div className="reminder-main">
      <div className="reminder-title"><h3>{reminder.title}</h3>{state}</div>
      {reminder.detail && <p className="muted">{reminder.detail}</p>}
      <span className="muted reminder-time"><Clock3 size={14} aria-hidden="true" /> {reminder.time}{reminder.dueDate && <> · Due {dateLabel(reminder.dueDate)}</>}</span>
    </div>
    <div className="reminder-actions">
      <IconButton label={`${reminder.completed ? 'Reopen' : 'Mark complete:'} ${reminder.title}`} icon={reminder.completed ? RotateCcw : Check} onClick={() => onComplete(reminder, !reminder.completed)} />
      <Toggle checked={reminder.active} disabled={reminder.completed} label={`${reminder.active ? 'Pause' : 'Activate'} ${reminder.title}`} onChange={(next) => onToggle(reminder, next)} />
      <IconButton label={`Edit ${reminder.title}`} icon={Pencil} tone="warning" onClick={() => onEdit(reminder)} />
      <IconButton label={`Delete ${reminder.title}`} icon={Trash2} tone="danger" onClick={() => onDelete(reminder)} />
    </div>
  </article>;
}

export default function Reminders({ reminders, notifications, onNotificationNavigate, ...handlers }: { reminders: any[]; notifications: AppNotification[]; onNotificationNavigate: (target: string) => void; onEdit: (r: any) => void; onToggle: (r: any, active: boolean) => void; onComplete: (r: any, completed: boolean) => void; onDelete: (r: any) => void }) {
  const open = reminders.filter((r) => !r.completed);
  const done = reminders.filter((r) => r.completed);
  return <>
    <PageHeading title="Notifications" description="IponWise watches your savings activity and highlights what needs attention." />
    <FormAlert tone="info">Notifications appear in the bell menu when a goal is nearly complete, a reminder is overdue, or an account needs attention. Email and push delivery aren’t enabled.</FormAlert>
    {notifications.length > 0 && <Panel title="Automatic notifications" description="Generated from your current savings activity.">
      <div className="notification-list">
        {notifications.map((notification) => <button type="button" className={`notification-item notification-item-${notification.kind}`} key={notification.id} onClick={() => onNotificationNavigate(notification.target)}>
          <span className="notification-icon"><Bell size={17} aria-hidden="true" /></span>
          <span><strong>{notification.title}</strong><small>{notification.detail}</small></span>
        </button>)}
      </div>
    </Panel>}
    {reminders.length === 0
      ? <Panel><EmptyState icon={Bell} title="No saved reminders" >Automatic notifications will appear here as you create goals, approach targets, miss due dates, or need to check an account.</EmptyState></Panel>
      : <>
        <Panel title={`To do (${open.length})`}>{open.length ? <div className="reminder-list">{open.map((r) => <ReminderCard key={r.id} reminder={r} {...handlers} />)}</div> : <EmptyState compact icon={Check} title="You’re all caught up" />}</Panel>
        {done.length > 0 && <Panel title={`Completed (${done.length})`}><div className="reminder-list">{done.map((r) => <ReminderCard key={r.id} reminder={r} {...handlers} />)}</div></Panel>}
      </>}
  </>;
}
