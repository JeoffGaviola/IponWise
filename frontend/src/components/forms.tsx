import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, Bell, Calculator, Check, Landmark, PiggyBank, Save, Target } from 'lucide-react';
import { PurchaseHelper, InstallmentHelper, helperForCategory } from './goalHelpers.tsx';
import { Modal } from './Modal.tsx';
import { AmountInput, Button, Field, FormAlert, type ButtonVariant } from './ui.tsx';
import { useForm } from '../hooks/useForm.ts';
import { calculateContribution, suggestEmergencyTarget } from '../calculator.ts';
import { CURRENCIES, currencySymbol, localDate, money } from '../lib/format.ts';
import { FREQUENCIES, GOAL_CATEGORIES, PRIORITIES, goalRemaining } from '../lib/goals.ts';
import { validateGoal, validateGoalMovement, validateReminder, validateTransaction, validateWallet } from '../lib/validate.ts';

export const DEPOSIT_CATEGORIES = ['Allowance', 'Salary', 'Gift', 'Side income', 'Refund', 'Other income'];
export const WITHDRAWAL_CATEGORIES = ['Emergency', 'Medical', 'Food', 'Transportation', 'Bills', 'School', 'Rent', 'Family', 'Personal', 'Other'];

function FormShell({ form, children, submitLabel, submitIcon: Icon = Save, submitVariant = 'success', onClose, disabled }: { form: any; children: ReactNode; submitLabel: string; submitIcon?: any; submitVariant?: ButtonVariant; onClose: () => void; disabled?: boolean }) {
  return <>
    <FormAlert>{form.serverError}</FormAlert>
    {children}
    <div className="modal-actions">
      <Button variant="secondary" onClick={onClose} disabled={form.submitting}>Cancel</Button>
      <Button type="submit" variant={submitVariant} icon={Icon} loading={form.submitting} disabled={disabled}>{submitLabel}</Button>
    </div>
  </>;
}

export function TransactionModal({ transaction, goals, onSubmit, onClose, closing = false, defaultType = 'deposit' }: { transaction?: any; goals: any[]; onSubmit: (values: any, original?: any) => unknown; onClose: () => void; closing?: boolean; defaultType?: 'deposit' | 'withdrawal' }) {
  const editing = transaction || null;
  const [values, setValues] = useState(() => ({
    type: editing?.type || defaultType, category: editing?.category || (defaultType === 'deposit' ? 'Allowance' : 'Emergency'),
    amount: editing ? String(editing.amount) : '', date: editing?.date || localDate(), note: editing?.note || '', goalId: editing?.goalId || '',
  }));
  const validate = useMemo(() => (v) => validateTransaction(v, { goals, editing }), [goals, editing]);
  const form = useForm({ validate, onSubmit: (v) => onSubmit(v, editing) });
  const set = (name) => (event) => { setValues((v) => ({ ...v, [name]: event.target.value })); form.clearError(name); };
  const setType = (type) => setValues((v) => ({ ...v, type, category: type === 'deposit' ? 'Allowance' : 'Emergency', goalId: '' }));
  const categories = values.type === 'deposit' ? DEPOSIT_CATEGORIES : WITHDRAWAL_CATEGORIES;
  const availableGoals = goals.filter((g) => values.type === 'withdrawal' ? Number(g.saved) > 0 || g.id === values.goalId : Number(g.saved) < Number(g.target) || g.id === values.goalId);
  const selectedGoal = goals.find((g) => g.id === values.goalId);

  return <Modal title={editing ? 'Edit transaction' : 'Add transaction'} description="Record money you’ve added or taken out. IponWise tracks the amounts you enter." onClose={onClose} closing={closing} busy={form.submitting}>
    <form ref={form.formRef} className="stack" noValidate onSubmit={(e) => form.handleSubmit(e, values)}>
      <div className="segmented" role="group" aria-label="Transaction type">
        <button type="button" aria-pressed={values.type === 'deposit'} className="seg seg-inflow" onClick={() => setType('deposit')}><ArrowDownLeft size={16} aria-hidden="true" /> Deposit</button>
        <button type="button" aria-pressed={values.type === 'withdrawal'} className="seg seg-outflow" onClick={() => setType('withdrawal')}><ArrowUpRight size={16} aria-hidden="true" /> Withdrawal</button>
      </div>
      <FormShell form={form} onClose={onClose} submitLabel={editing ? 'Save changes' : values.type === 'deposit' ? 'Record deposit' : 'Record withdrawal'} submitVariant={editing ? 'warning' : 'success'}>
        <div className="grid-2">
          <Field label="Amount" error={form.errors.amount}><AmountInput symbol={currencySymbol()} value={values.amount} onChange={set('amount')} placeholder="0.00" autoFocus /></Field>
          <Field label="Date" error={form.errors.date}><input className="control" type="date" min="2000-01-01" max={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} value={values.date} onChange={set('date')} /></Field>
        </div>
        <Field label={values.type === 'deposit' ? 'Source' : 'Spent on'} error={form.errors.category}>
          <select className="control" value={values.category} onChange={set('category')}>{[...new Set([...categories, values.category])].map((c) => <option key={c}>{c}</option>)}</select>
        </Field>
        <Field label={values.type === 'deposit' ? 'Add to a savings goal' : 'Take from a savings goal'} optional hint={values.type === 'withdrawal' ? 'Choose a goal if this money was set aside for it — e.g. an emergency fund.' : 'Money added to a goal counts toward its progress.'} error={form.errors.goalId}>
          <select className="control" value={values.goalId} onChange={set('goalId')}>
            <option value="">{values.type === 'deposit' ? 'General savings (no goal)' : 'Not from a goal'}</option>
            {availableGoals.map((g) => <option key={g.id} value={g.id}>{g.name} — {money(g.saved)} of {money(g.target)}</option>)}
          </select>
        </Field>
        {selectedGoal && <p className="field-hint">{values.type === 'deposit' ? `${money(goalRemaining(selectedGoal))} left to reach “${selectedGoal.name}”.` : `“${selectedGoal.name}” currently holds ${money(selectedGoal.saved)}.`}</p>}
        <Field label="Note" optional error={form.errors.note}><input className="control" value={values.note} onChange={set('note')} placeholder="Optional details" maxLength={500} /></Field>
      </FormShell>
    </form>
  </Modal>;
}

/** Contribute to (deposit) or use money from (withdraw) a specific goal. */
export function GoalMoneyModal({ goal, mode, onSubmit, onClose, closing = false }: { goal: any; mode: 'contribute' | 'withdraw'; onSubmit: (goal: any, values: any, mode: 'contribute' | 'withdraw') => unknown; onClose: () => void; closing?: boolean }) {
  const [values, setValues] = useState({ amount: '', date: localDate(), note: '', category: 'Emergency' });
  const validate = useMemo(() => (v) => validateGoalMovement(goal, v, mode), [goal, mode]);
  const form = useForm({ validate, onSubmit: (v) => onSubmit(goal, v, mode) });
  const set = (name) => (event) => { setValues((v) => ({ ...v, [name]: event.target.value })); form.clearError(name); };
  const contribute = mode === 'contribute';
  const limit = contribute ? goalRemaining(goal) : Number(goal.saved);
  return <Modal title={contribute ? `Add to ${goal.name}` : `Use funds from ${goal.name}`} description={contribute ? `${money(goalRemaining(goal))} left to reach your ${money(goal.target)} target.` : `This goal holds ${money(goal.saved)}. Withdrawing lowers its progress and your recorded balance.`} onClose={onClose} closing={closing} busy={form.submitting}>
    <form ref={form.formRef} className="stack" noValidate onSubmit={(e) => form.handleSubmit(e, values)}>
      <FormShell form={form} onClose={onClose} submitIcon={contribute ? PiggyBank : ArrowUpRight} submitLabel={contribute ? 'Add contribution' : 'Record withdrawal'} submitVariant={contribute ? 'success' : 'info'}>
        <div className="grid-2">
          <Field label="Amount" error={form.errors.amount} hint={`Up to ${money(limit)}`}><AmountInput symbol={currencySymbol()} value={values.amount} onChange={set('amount')} placeholder="0.00" autoFocus /></Field>
          <Field label="Date" error={form.errors.date}><input className="control" type="date" value={values.date} onChange={set('date')} /></Field>
        </div>
        {!contribute && <Field label="What was it for?" error={form.errors.category}><select className="control" value={values.category} onChange={set('category')}>{WITHDRAWAL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>}
        <Field label="Note" optional><input className="control" value={values.note} onChange={set('note')} maxLength={500} placeholder={contribute ? 'e.g. Weekly savings' : 'e.g. Hospital bill'} /></Field>
      </FormShell>
    </form>
  </Modal>;
}

export function GoalModal({ goal, prefill, onSubmit, onClose, closing = false }: { goal?: any; prefill?: any; onSubmit: (values: any, original?: any) => unknown; onClose: () => void; closing?: boolean }) {
  const editing = goal || null;
  const [values, setValues] = useState(() => ({
    name: editing?.name || prefill?.name || '', category: editing?.category || prefill?.category || 'Personal', priority: editing?.priority || prefill?.priority || 'normal',
    target: editing ? String(editing.target) : prefill?.target ? String(prefill.target) : '', saved: '', deadline: editing?.deadline || prefill?.deadline || '',
    contributionFrequency: editing?.contributionFrequency || 'monthly', description: editing?.description || prefill?.description || '',
  }));
  const [helper, setHelper] = useState({ expenses: '', months: '3' });
  const [helperChoice, setHelperChoice] = useState<string | null>(prefill?.helper === 'purchase' || prefill?.helper === 'installment' ? prefill.helper : null);
  const today = localDate();
  const validate = useMemo(() => (v) => validateGoal(v, { editing, today }), [editing, today]);
  const form = useForm({ validate, onSubmit: (v) => onSubmit(v, editing) });
  const set = (name) => (event) => { setValues((v) => ({ ...v, [name]: event.target.value })); form.clearError(name); if (name === 'category') setHelperChoice(null); };
  const helperKind = helperChoice || (editing ? null : helperForCategory(values.category));
  const useTarget = (amount: number) => { setValues((v) => ({ ...v, target: String(amount) })); form.clearError('target'); };

  const plan = useMemo(() => {
    if (!values.deadline || !(Number(values.target) > 0)) return null;
    try { return calculateContribution({ target: values.target, saved: editing ? editing.saved : values.saved || 0, targetDate: values.deadline, frequency: values.contributionFrequency }); } catch { return null; }
  }, [values.target, values.saved, values.deadline, values.contributionFrequency, editing]);
  const unit = FREQUENCIES.find((f) => f.value === values.contributionFrequency)?.unit;
  const suggestion = useMemo(() => { try { return suggestEmergencyTarget({ monthlyExpenses: helper.expenses, months: helper.months }); } catch { return null; } }, [helper]);
  const priority = PRIORITIES.find((p) => p.value === values.priority);

  return <Modal title={editing ? 'Edit savings goal' : 'Create a savings goal'} description="Save for what matters to you — an emergency fund, school fees, rent, or something you’re looking forward to." onClose={onClose} closing={closing} busy={form.submitting} size="lg">
    <form ref={form.formRef} className="stack" noValidate onSubmit={(e) => form.handleSubmit(e, values)}>
      <FormShell form={form} onClose={onClose} submitIcon={editing ? Save : Target} submitLabel={editing ? 'Save changes' : 'Create goal'} submitVariant={editing ? 'warning' : 'success'}>
        <Field label="Goal name" error={form.errors.name}><input className="control" value={values.name} onChange={set('name')} placeholder="e.g. Emergency fund" maxLength={100} autoFocus /></Field>
        <div className="grid-2">
          <Field label="Purpose" error={form.errors.category}><select className="control" value={values.category} onChange={set('category')}>{[...new Set([...GOAL_CATEGORIES, values.category])].map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Priority" hint={priority?.hint}><select className="control" value={values.priority} onChange={set('priority')}>{PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></Field>
        </div>
        {/Emergency/i.test(values.category) && <details className="helper" open={!values.target}>
          <summary><Calculator size={16} aria-hidden="true" /> Size my emergency fund</summary>
          <p className="field-hint">Based only on the numbers you enter — an estimate, not financial advice. Many people aim for several months of essential costs; you decide what’s right for you.</p>
          <div className="grid-2">
            <Field label="Monthly essential expenses"><AmountInput symbol={currencySymbol()} value={helper.expenses} onChange={(e) => setHelper((h) => ({ ...h, expenses: e.target.value }))} placeholder="Rent, food, bills…" /></Field>
            <Field label="Months to cover"><select className="control" value={helper.months} onChange={(e) => setHelper((h) => ({ ...h, months: e.target.value }))}>{[1, 2, 3, 4, 6, 9, 12].map((m) => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}</select></Field>
          </div>
          {suggestion && <div className="helper-result"><span>{helper.months} × {money(helper.expenses)} = <strong>{money(suggestion)}</strong></span><Button size="sm" variant="secondary" onClick={() => setValues((v) => ({ ...v, target: String(suggestion) }))}>Use as target</Button></div>}
        </details>}
        {!/Emergency/i.test(values.category) && helperKind === 'purchase' && <PurchaseHelper open={!values.target} onUse={useTarget} />}
        {!/Emergency/i.test(values.category) && helperKind === 'installment' && <InstallmentHelper open={!values.target} onUse={useTarget} />}
        <div className="grid-2">
          <Field label="Target amount" error={form.errors.target}><AmountInput symbol={currencySymbol()} value={values.target} onChange={set('target')} placeholder="0.00" /></Field>
          {editing ? <Field label="Saved so far" hint="Changes through deposits and withdrawals."><input className="control" value={money(editing.saved)} readOnly tabIndex={-1} /></Field>
            : <Field label="Already saved" optional error={form.errors.saved} hint="Recorded as an opening deposit linked to this goal."><AmountInput symbol={currencySymbol()} value={values.saved} onChange={set('saved')} placeholder="0.00" /></Field>}
        </div>
        <div className="grid-2">
          <Field label="Target date" optional error={form.errors.deadline}><input className="control" type="date" min={editing ? undefined : today} value={values.deadline} onChange={set('deadline')} /></Field>
          <Field label="Contribution schedule"><select className="control" value={values.contributionFrequency} onChange={set('contributionFrequency')}>{FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select></Field>
        </div>
        {plan && <div className="plan-preview" role="status">{plan.completed ? <><Check size={16} aria-hidden="true" /> You’ve already reached this target.</> : <><Calculator size={16} aria-hidden="true" /> Save about <strong>{money(plan.contribution)}</strong> per {unit} for {plan.periods} {unit}{plan.periods > 1 ? 's' : ''} to reach {money(values.target)} by your date. <span>Estimate based on your inputs.</span></>}</div>}
        <Field label="Notes" optional error={form.errors.description}><textarea className="control" rows={2} value={values.description} onChange={set('description')} maxLength={500} placeholder="Why this goal matters, or what it covers" /></Field>
      </FormShell>
    </form>
  </Modal>;
}

export function ReminderModal({ reminder, onSubmit, onClose, closing = false }: { reminder?: any; onSubmit: (values: any, original?: any) => unknown; onClose: () => void; closing?: boolean }) {
  const editing = reminder || null;
  const [values, setValues] = useState({ title: editing?.title || '', detail: editing?.detail || '', time: editing?.time || '', kind: editing?.kind || 'deposit', dueDate: editing?.dueDate || '' });
  const form = useForm({ validate: validateReminder, onSubmit: (v) => onSubmit({ title: v.title.trim(), detail: v.detail.trim(), time: v.time.trim(), kind: v.kind, due_date: v.dueDate || null }, editing?.id) });
  const set = (name) => (event) => { setValues((v) => ({ ...v, [name]: event.target.value })); form.clearError(name); };
  return <Modal title={editing ? 'Edit reminder' : 'Create a reminder'} description="Reminders are shown inside IponWise. They don’t send emails or push notifications." onClose={onClose} closing={closing} busy={form.submitting}>
    <form ref={form.formRef} className="stack" noValidate onSubmit={(e) => form.handleSubmit(e, values)}>
      <FormShell form={form} onClose={onClose} submitIcon={editing ? Save : Bell} submitLabel={editing ? 'Save changes' : 'Add reminder'} submitVariant={editing ? 'warning' : 'success'}>
        <Field label="Title" error={form.errors.title}><input className="control" value={values.title} onChange={set('title')} placeholder="e.g. Friday savings deposit" autoFocus /></Field>
        <Field label="Description" optional error={form.errors.detail}><input className="control" value={values.detail} onChange={set('detail')} placeholder="What do you want to remember?" /></Field>
        <div className="grid-2">
          <Field label="Schedule" error={form.errors.time}><input className="control" value={values.time} onChange={set('time')} placeholder="Every Friday, 6:00 PM" /></Field>
          <Field label="Due date" optional error={form.errors.dueDate}><input className="control" type="date" value={values.dueDate} onChange={set('dueDate')} /></Field>
        </div>
        <Field label="Type"><select className="control" value={values.kind} onChange={set('kind')}><option value="deposit">Savings deposit</option><option value="review">Spending review</option><option value="goal">Goal check-in</option></select></Field>
      </FormShell>
    </form>
  </Modal>;
}

export const WALLET_KINDS = [['ewallet', 'E-wallet'], ['bank', 'Bank account'], ['atm', 'ATM card account'], ['cash', 'Cash on hand'], ['investment', 'Investment']];

export function WalletModal({ wallet, onSubmit, onClose, closing = false }: { wallet?: any; onSubmit: (values: any, original?: any) => unknown; onClose: () => void; closing?: boolean }) {
  const editing = wallet || null;
  const [values, setValues] = useState({ id: editing?.id, name: editing?.name || '', provider: editing?.provider || '', kind: editing?.kind || 'ewallet', balance: editing ? String(editing.balance) : '', currencyCode: editing?.currencyCode || 'PHP', originalBalance: editing?.balance, note: editing?.note || '' });
  const form = useForm({ validate: validateWallet, onSubmit });
  const set = (name) => (event) => { setValues((v) => ({ ...v, [name]: event.target.value })); form.clearError(name); };
  return <Modal title={editing ? 'Edit account' : 'Add an account'} description="Enter a balance snapshot yourself. IponWise never connects to your bank." onClose={onClose} closing={closing} busy={form.submitting}>
    <form ref={form.formRef} className="stack" noValidate onSubmit={(e) => form.handleSubmit(e, values)}>
      <FormAlert tone="info">Never enter PINs, card CVVs, passwords or one-time codes here — IponWise never needs them.</FormAlert>
      <FormShell form={form} onClose={onClose} submitIcon={Landmark} submitLabel={editing ? 'Save account' : 'Add account'} submitVariant={editing ? 'warning' : 'success'}>
        <div className="grid-2">
          <Field label="Account name" error={form.errors.name}><input className="control" value={values.name} onChange={set('name')} placeholder="e.g. Daily funds" autoFocus /></Field>
          <Field label="Provider" error={form.errors.provider}><input className="control" value={values.provider} onChange={set('provider')} placeholder="e.g. GCash, BPI" /></Field>
        </div>
        <div className="grid-2">
          <Field label="Account type"><select className="control" value={values.kind} onChange={set('kind')}>{WALLET_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Currency"><select className="control" value={values.currencyCode} onChange={set('currencyCode')}>{Object.entries(CURRENCIES).map(([code, c]) => <option key={code} value={code}>{code} — {c.label}</option>)}</select></Field>
        </div>
        <Field label="Balance (as of today)" error={form.errors.balance} hint="A manual snapshot, not a verified live balance."><AmountInput symbol={currencySymbol(values.currencyCode)} value={values.balance} onChange={set('balance')} placeholder="0.00" /></Field>
        <Field label="Note" optional error={form.errors.note}><input className="control" value={values.note} onChange={set('note')} maxLength={250} /></Field>
      </FormShell>
    </form>
  </Modal>;
}
