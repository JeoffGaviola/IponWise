import { ArrowDownLeft, ArrowUpRight, CalendarDays, Pencil, PiggyBank, ShieldCheck, Target, Trash2, TrendingUp, Wallet, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, Button, IconButton, ProgressBar } from './ui.tsx';
import { dateLabel, money } from '../lib/format.ts';
import { FREQUENCIES, goalPace, goalPercent, goalPlan, goalRemaining, goalStatus, isCompleted, isEmergencyGoal, priorityLabel } from '../lib/goals.ts';

export function StatCard({ icon: Icon, label, value, caption, tone = 'primary' }: { icon: LucideIcon; label: string; value: ReactNode; caption?: string; tone?: string }) {
  return <article className={`stat stat-${tone}`}>
    <span className="stat-icon"><Icon size={20} aria-hidden="true" /></span>
    <div><p>{label}</p><strong>{value}</strong>{caption && <small>{caption}</small>}</div>
  </article>;
}

/** Withdrawals are a normal kind of transaction, so they use the neutral "outflow" treatment — never error red. */
export function TransactionItem({ tx, goalName, onEdit, onDelete }: { tx: any; goalName?: string; onEdit?: (tx: any) => void; onDelete?: (tx: any) => void }) {
  const inflow = tx.type === 'deposit';
  const Icon = inflow ? ArrowDownLeft : ArrowUpRight;
  return <li className="tx">
    <span className={`tx-icon tx-icon-${inflow ? 'inflow' : 'outflow'}`}><Icon size={18} aria-hidden="true" /></span>
    <div className="tx-main">
      <strong>{tx.note || tx.category}</strong>
      <span className="muted">{tx.category}{goalName && <> · <Target size={12} aria-hidden="true" /> {goalName}</>}</span>
    </div>
    <span className="tx-date muted"><CalendarDays size={14} aria-hidden="true" /> {dateLabel(tx.date)}</span>
    <span className={`tx-amount tx-amount-${inflow ? 'inflow' : 'outflow'}`}><span className="sr-only">{inflow ? 'Deposit of' : 'Withdrawal of'}</span>{inflow ? '+' : '−'}{money(tx.amount)}</span>
    {(onEdit || onDelete) && <span className="tx-actions">
      {onEdit && <IconButton label={`Edit ${tx.note || tx.category}`} icon={Pencil} tone="warning" onClick={() => onEdit(tx)} />}
      {onDelete && <IconButton label={`Delete ${tx.note || tx.category}`} icon={Trash2} tone="danger" onClick={() => onDelete(tx)} />}
    </span>}
  </li>;
}

const PRIORITY_TONE = { essential: 'info', high: 'warning', normal: 'neutral', optional: 'neutral' };

export function GoalCard({ goal, monthlyRate = 0, onContribute, onUseFunds, onEdit, onDelete }: { goal: any; monthlyRate?: number; onContribute: (goal: any) => void; onUseFunds: (goal: any) => void; onEdit: (goal: any) => void; onDelete: (goal: any) => void }) {
  const percent = goalPercent(goal);
  const status = goalStatus(goal);
  const plan = goalPlan(goal);
  const unit = FREQUENCIES.find((f) => f.value === (goal.contributionFrequency || 'monthly'))?.unit;
  const done = isCompleted(goal);
  const pace = goalPace(goal, monthlyRate);
  const Icon = isEmergencyGoal(goal) ? ShieldCheck : Target;
  return <article className={`goal-card goal-${status.key}`}>
    <header>
      <span className="goal-icon"><Icon size={20} aria-hidden="true" /></span>
      <div className="goal-title"><h3>{goal.name}</h3><span className="muted">{goal.category}</span></div>
      <span className="goal-tools">
        <IconButton label={`Edit ${goal.name}`} icon={Pencil} tone="warning" onClick={() => onEdit(goal)} />
        <IconButton label={`Delete ${goal.name}`} icon={Trash2} tone="danger" onClick={() => onDelete(goal)} />
      </span>
    </header>
    <div className="badge-row">
      <Badge tone={status.tone}>{status.label}</Badge>
      {goal.priority && goal.priority !== 'normal' && <Badge tone={PRIORITY_TONE[goal.priority]} icon={false}>{priorityLabel(goal.priority)}</Badge>}
    </div>
    <div className="goal-amounts"><strong>{money(goal.saved)}</strong><span className="muted">of {money(goal.target)}</span><b>{percent}%</b></div>
    <ProgressBar value={percent} tone={status.tone === 'neutral' ? 'info' : status.tone} label={`${goal.name}: ${percent}% saved`} />
    <p className="goal-note muted">
      {done ? 'Target reached.' : <>{money(goalRemaining(goal))} to go{goal.deadline && <> · by {dateLabel(goal.deadline)}</>}</>}
      {plan && !plan.completed && <><br />About <strong>{money(plan.contribution)}</strong> per {unit} keeps you on pace.</>}
    </p>
    {pace && <p className={`goal-pace ${pace.onPace === false ? 'goal-pace-late' : ''}`}><TrendingUp size={14} aria-hidden="true" /> At your recent pace ({money(pace.monthlyRate)}/month) this takes about <strong>{pace.monthsNeeded} month{pace.monthsNeeded === 1 ? '' : 's'}</strong>{pace.onPace === true && ' — on track'}{pace.onPace === false && ' — later than your target date'}.</p>}
    {goal.description && <p className="goal-desc muted">{goal.description}</p>}
    <footer>
      <Button size="sm" icon={PiggyBank} disabled={done} title={done ? 'This goal has reached its target' : undefined} onClick={() => onContribute(goal)}>Add money</Button>
      <Button size="sm" variant="secondary" icon={Wallet} disabled={Number(goal.saved) <= 0} title={Number(goal.saved) <= 0 ? 'Nothing saved in this goal yet' : undefined} onClick={() => onUseFunds(goal)}>Use funds</Button>
    </footer>
  </article>;
}
