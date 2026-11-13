import { useMemo, useState } from 'react';
import { Lightbulb, Plus, ShieldCheck, Target } from 'lucide-react';
import { Badge, Button, EmptyState, Field, AmountInput, FormAlert, PageHeading, Panel } from '../components/ui.tsx';
import { GoalCard } from '../components/domain.tsx';
import GoalIdeas from '../components/GoalIdeas.tsx';
import { calculateContribution, suggestEmergencyTarget } from '../calculator.ts';
import { currencySymbol, dateLabel, money } from '../lib/format.ts';
import { FREQUENCIES, computeInsights, sortGoals } from '../lib/goals.ts';

function ResultRows({ rows }) {
  return <dl className="result">{rows.map(([label, value, strong]) => <div key={label}><dt>{label}</dt><dd className={strong ? 'result-strong' : undefined}>{value}</dd></div>)}</dl>;
}

function SavingsCalculator({ onCreate }) {
  const [v, setV] = useState({ name: '', target: '', saved: '', date: '', frequency: 'monthly' });
  const set = (name) => (e) => setV((s) => ({ ...s, [name]: e.target.value }));
  const outcome = useMemo(() => {
    if (!v.target && !v.date) return { idle: true };
    try { return { result: calculateContribution({ target: v.target, saved: v.saved || 0, targetDate: v.date, frequency: v.frequency }) }; }
    catch (error) { return { error: v.target ? error.message : '' }; }
  }, [v]);
  const unit = FREQUENCIES.find((f) => f.value === v.frequency).unit;
  const r = outcome.result;
  return <Panel title="Savings calculator" description="See how much to set aside to reach any goal by a date.">
    <div className="stack">
      <Field label="Goal name" optional><input className="control" value={v.name} onChange={set('name')} placeholder="e.g. Emergency fund" /></Field>
      <div className="grid-2">
        <Field label="Target amount"><AmountInput symbol={currencySymbol()} value={v.target} onChange={set('target')} placeholder="0.00" /></Field>
        <Field label="Already saved" optional><AmountInput symbol={currencySymbol()} value={v.saved} onChange={set('saved')} placeholder="0.00" /></Field>
      </div>
      <div className="grid-2">
        <Field label="Target date"><input className="control" type="date" value={v.date} onChange={set('date')} /></Field>
        <Field label="Contribute"><select className="control" value={v.frequency} onChange={set('frequency')}>{FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select></Field>
      </div>
      <FormAlert>{outcome.error}</FormAlert>
      {r && <div className="result-card" role="status" aria-live="polite">
        <ResultRows rows={[['Goal', v.name || 'Untitled goal'], ['Target', money(v.target)], ['Already saved', money(v.saved || 0)], ['Remaining', money(r.remaining)], ['Target date', r.completed ? '—' : dateLabel(v.date)], [`Suggested ${v.frequency} contribution`, r.completed ? 'Goal reached' : `${money(r.contribution)} × ${r.periods} ${unit}${r.periods > 1 ? 's' : ''}`, true], ['Progress', `${r.percent}%`]]} />
        <p className="fine-print">An estimate from the numbers you entered — not financial advice.</p>
        {!r.completed && <Button variant="success" icon={Target} onClick={() => onCreate({ name: v.name, target: v.target })}>Create this goal</Button>}
      </div>}
      {outcome.idle && <p className="field-hint">Enter a target and a date to see your plan.</p>}
    </div>
  </Panel>;
}

function EmergencyPlanner({ onCreate }) {
  const [v, setV] = useState({ expenses: '', months: '3', saved: '', date: '', frequency: 'monthly' });
  const set = (name) => (e) => setV((s) => ({ ...s, [name]: e.target.value }));
  const outcome = useMemo(() => {
    if (!v.expenses) return {};
    try {
      const target = suggestEmergencyTarget({ monthlyExpenses: v.expenses, months: v.months });
      const saved = Number(v.saved || 0);
      const plan = v.date ? calculateContribution({ target, saved: Math.min(saved, target), targetDate: v.date, frequency: v.frequency }) : null;
      return { target, saved, plan, remaining: Math.max(0, target - saved) };
    } catch (error) { return { error: error.message }; }
  }, [v]);
  const unit = FREQUENCIES.find((f) => f.value === v.frequency).unit;
  return <Panel title="Emergency fund planner" description="Size a safety net from your own monthly costs." actions={<Badge tone="info" icon={ShieldCheck}>Essential</Badge>}>
    <div className="stack">
      <div className="grid-2">
        <Field label="Monthly essential expenses" hint="Rent, food, utilities, transport, health."><AmountInput symbol={currencySymbol()} value={v.expenses} onChange={set('expenses')} placeholder="0.00" /></Field>
        <Field label="Months of coverage"><select className="control" value={v.months} onChange={set('months')}>{[1, 2, 3, 4, 6, 9, 12].map((m) => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}</select></Field>
      </div>
      <div className="grid-2">
        <Field label="Already set aside" optional><AmountInput symbol={currencySymbol()} value={v.saved} onChange={set('saved')} placeholder="0.00" /></Field>
        <Field label="Reach it by" optional><input className="control" type="date" value={v.date} onChange={set('date')} /></Field>
      </div>
      <FormAlert>{outcome.error}</FormAlert>
      {outcome.target !== undefined && <div className="result-card" role="status" aria-live="polite">
        <ResultRows rows={[['Suggested target', `${money(v.expenses)} × ${v.months} = ${money(outcome.target)}`, true], ['Already saved', money(outcome.saved)], ['Remaining', money(outcome.remaining)], ...(outcome.plan && !outcome.plan.completed ? [[`Per ${unit}`, money(outcome.plan.contribution), true]] : [])]} />
        <p className="fine-print">You choose the months of coverage — a bigger buffer takes longer to build. This is an estimate, not professional financial advice.</p>
        <Button variant="success" icon={ShieldCheck} onClick={() => onCreate({ name: 'Emergency fund', category: 'Emergency fund', priority: 'essential', target: outcome.target, description: `${v.months} months of essential expenses` })}>Create emergency fund goal</Button>
      </div>}
    </div>
  </Panel>;
}

export default function Goals({ goals, monthlyRate = 0, onCreate, onEdit, onDelete, onContribute, onUseFunds }: { goals: any[]; monthlyRate?: number; onCreate: (prefill?: any) => void; onEdit: (g: any) => void; onDelete: (g: any) => void; onContribute: (g: any) => void; onUseFunds: (g: any) => void }) {
  const sorted = sortGoals(goals);
  const insights = computeInsights(goals);
  return <>
    <PageHeading title="Savings goals" description="Save for what you actually need — emergencies, school, rent, or something to look forward to."
      actions={<Button variant="success" icon={Plus} onClick={() => onCreate()}>New goal</Button>} />
    {insights.length > 0 && <Panel title="Needs attention" description="Calculated from your goals and deadlines">
      <ul className="insights insights-inline">{insights.map((item) => <li key={item.id} className={`insight insight-${item.tone}`}><Lightbulb size={16} aria-hidden="true" /><div><strong>{item.title}</strong><p>{item.detail}</p></div></li>)}</ul>
    </Panel>}
    {sorted.length
      ? <div className="goal-grid">{sorted.map((g) => <GoalCard key={g.id} goal={g} monthlyRate={monthlyRate} onContribute={onContribute} onUseFunds={onUseFunds} onEdit={onEdit} onDelete={onDelete} />)}</div>
      : <Panel><EmptyState icon={Target} title="No savings goals yet" action={<Button variant="success" icon={Plus} onClick={() => onCreate()}>Create your first goal</Button>}>Set a target, a date and what it’s for. IponWise works out how much to save each period.</EmptyState></Panel>}
    <GoalIdeas onUse={(prefill) => onCreate(prefill)} />
    <div className="planner-grid" id="planners">
      <SavingsCalculator onCreate={onCreate} />
      <EmergencyPlanner onCreate={onCreate} />
    </div>
  </>;
}
