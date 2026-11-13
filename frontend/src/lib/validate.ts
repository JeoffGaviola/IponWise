import { money } from './format.ts';

const MAX_AMOUNT = 99999999999.99;
const DECIMALS = /^\d+(\.\d{1,2})?$/;
type FormData = Record<string, any>;
type ValidationErrors = Record<string, string>;
type AmountOptions = { label?: string; max?: number; allowZero?: boolean };


export function amountError(value: unknown, { label = 'Amount', max = MAX_AMOUNT, allowZero = false }: AmountOptions = {}): string {
  const raw = String(value ?? '').trim();
  if (raw === '') return `Enter ${label.toLowerCase()}.`;
  const number = Number(raw);
  if (!Number.isFinite(number)) return `${label} must be a number.`;
  if (number < 0 || (!allowZero && number === 0)) return `${label} must be greater than zero.`;
  if (!DECIMALS.test(raw.replace(/^(\d+)\.$/, '$1'))) return `${label} can have at most 2 decimal places.`;
  if (number > MAX_AMOUNT) return `${label} is too large.`;
  if (number > max) return `${label} can’t be more than ${money(max)}.`;
  return '';
}

export const isValidDate = (value: unknown) => {
  if (typeof value !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
};

export function validateTransaction(form: FormData, { goals = [], editing = null }: { goals?: any[]; editing?: any | null } = {}): ValidationErrors {
  const errors: ValidationErrors = {};
  const goal = form.goalId ? goals.find((g) => g.id === form.goalId) : null;
  let max;
  if (goal) {
    // When editing a transaction already linked to this goal, its own amount is "free" to reuse.
    const reuse = editing && editing.goalId === goal.id && editing.type === form.type ? Number(editing.amount) : 0;
    max = form.type === 'deposit' ? Math.max(0, Number(goal.target) - Number(goal.saved) + reuse) : Number(goal.saved) + reuse;
  }
  const amount = amountError(form.amount);
  if (amount) errors.amount = amount;
  else if (goal && Number(form.amount) > max) {
    errors.amount = form.type === 'deposit' ? `Only ${money(max)} is left to reach “${goal.name}”.` : `“${goal.name}” only holds ${money(max)}.`;
  }
  if (!form.category?.trim()) errors.category = 'Choose a category.';
  if (!isValidDate(form.date)) errors.date = 'Choose a valid date.';
  else {
    const earliest = '2000-01-01';
    const latest = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    if (form.date < earliest || form.date > latest) errors.date = 'Choose a date from 2000 through tomorrow.';
  }
  if ((form.note || '').length > 500) errors.note = 'Notes can be up to 500 characters.';
  return errors;
}

export function validateGoal(form: FormData, { editing = null, today = '' }: { editing?: any | null; today?: string } = {}): ValidationErrors {
  const errors: ValidationErrors = {};
  const name = (form.name || '').trim();
  if (name.length < 2) errors.name = 'Give your goal a name (at least 2 characters).';
  else if (name.length > 100) errors.name = 'Goal names can be up to 100 characters.';
  const target = amountError(form.target, { label: 'Target amount' });
  if (target) errors.target = target;
  else if (editing && Number(form.target) < Number(editing.saved)) errors.target = `The target can’t be lower than the ${money(editing.saved)} already saved.`;
  if (!editing && String(form.saved ?? '').trim() !== '') {
    const saved = amountError(form.saved, { label: 'Amount already saved', allowZero: true });
    if (saved) errors.saved = saved;
    else if (!errors.target && Number(form.saved) > Number(form.target)) errors.saved = 'Amount already saved can’t be more than the target.';
  }
  if (form.deadline) {
    if (!isValidDate(form.deadline)) errors.deadline = 'Choose a valid date.';
    else if ((!editing || editing.deadline !== form.deadline) && today && form.deadline < today) errors.deadline = 'Choose today or a future date.';
  }
  if ((form.description || '').length > 500) errors.description = 'Descriptions can be up to 500 characters.';
  return errors;
}

export function validateGoalMovement(goal: FormData, form: FormData, mode: 'contribute' | 'withdraw' | string): ValidationErrors {
  const errors: ValidationErrors = {};
  const limit = mode === 'contribute' ? Math.max(0, Number(goal.target) - Number(goal.saved)) : Number(goal.saved);
  const label = 'Amount';
  const base = amountError(form.amount, { label });
  if (base) errors.amount = base;
  else if (Number(form.amount) > limit) {
    errors.amount = mode === 'contribute'
      ? `Only ${money(limit)} is left to reach this goal’s target.`
      : `This goal only holds ${money(limit)}.`;
  }
  if (!isValidDate(form.date)) errors.date = 'Choose a valid date.';
  if (mode === 'withdraw' && !form.category?.trim()) errors.category = 'Choose what the money is for.';
  return errors;
}

export function validateReminder(form: FormData): ValidationErrors {
  const errors: ValidationErrors = {};
  const title = (form.title || '').trim();
  if (title.length < 2) errors.title = 'Give your reminder a title (at least 2 characters).';
  else if (title.length > 120) errors.title = 'Titles can be up to 120 characters.';
  if (!(form.time || '').trim()) errors.time = 'Describe when, e.g. “Every Friday”.';
  else if (form.time.length > 120) errors.time = 'Schedules can be up to 120 characters.';
  if ((form.detail || '').length > 500) errors.detail = 'Descriptions can be up to 500 characters.';
  if (form.dueDate && !isValidDate(form.dueDate)) errors.dueDate = 'Choose a valid date.';
  return errors;
}

export function validateWallet(form: FormData): ValidationErrors {
  const errors: ValidationErrors = {};
  if ((form.name || '').trim().length < 2) errors.name = 'Enter an account name (at least 2 characters).';
  if ((form.provider || '').trim().length < 2) errors.provider = 'Enter the bank or wallet provider.';
  const balance = amountError(form.balance, { label: 'Balance', allowZero: true });
  if (balance) errors.balance = balance;
  if ((form.note || '').length > 250) errors.note = 'Notes can be up to 250 characters.';
  return errors;
}

/** Map FastAPI snake_case field names back to the form's camelCase names. */
const FIELD_MAP = { goal_id: 'goalId', due_date: 'dueDate', currency_code: 'currencyCode', contribution_frequency: 'contributionFrequency' };
export const mapFieldErrors = (fieldErrors: Record<string, string> = {}): Record<string, string> => Object.fromEntries(Object.entries(fieldErrors).map(([key, value]) => [FIELD_MAP[key] || key, value]));
