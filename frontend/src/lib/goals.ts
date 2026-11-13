import { calculateContribution } from '../calculator.ts';
import { money } from './format.ts';

export const GOAL_CATEGORIES = [
  'Emergency fund', 'Medical & healthcare', 'Tuition & education', 'Rent & housing',
  'Utilities & essential bills', 'Food & daily necessities', 'Transportation', 'Family needs',
  'Debt repayment', 'Gadgets & electronics', 'Vehicle (car or motorcycle)', 'Travel & leisure', 'Business capital', 'Personal',
];

export const PRIORITIES = [
  { value: 'essential', label: 'Essential', hint: 'A need — food, shelter, health, or an emergency buffer.' },
  { value: 'high', label: 'High priority', hint: 'Important and time-sensitive, but not a basic need.' },
  { value: 'normal', label: 'Normal', hint: 'A regular goal you are working toward.' },
  { value: 'optional', label: 'Optional', hint: 'Nice to have — can wait if money is tight.' },
];
export const priorityLabel = (value) => PRIORITIES.find((p) => p.value === value)?.label || 'Normal';
export const FREQUENCIES = [
  { value: 'daily', label: 'Daily', unit: 'day' },
  { value: 'weekly', label: 'Weekly', unit: 'week' },
  { value: 'monthly', label: 'Monthly', unit: 'month' },
];
export const isEmergencyGoal = (goal) => /emergency/i.test(goal?.category || '') || /emergency/i.test(goal?.name || '');

export const goalPercent = (goal) => {
  const target = Number(goal.target);
  if (!(target > 0)) return 0;
  const saved = Number(goal.saved);
  return saved >= target ? 100 : Math.max(0, Math.floor((saved / target) * 100));
};
export const goalRemaining = (goal) => Math.max(0, Math.round((Number(goal.target) - Number(goal.saved)) * 100) / 100);
export const isCompleted = (goal) => Number(goal.saved) >= Number(goal.target);

const DAY = 86400000;
const atNoon = (value) => { const d = new Date(value); d.setHours(12, 0, 0, 0); return d; };
export const daysUntil = (deadline, today = new Date()) => (
  deadline ? Math.round((atNoon(`${deadline}T12:00:00`).getTime() - atNoon(today).getTime()) / DAY) : null
);

/**
 * Status is derived only from the goal's own data:
 * completed | overdue | due-soon (<= 14 days) | at-risk (behind straight-line pace) | on-track | no-deadline
 * `tone` maps to semantic colour tokens (success / error / warning / info / neutral).
 */
export function goalStatus(goal, today = new Date()) {
  if (isCompleted(goal)) return { key: 'completed', label: 'Completed', tone: 'success' };
  const days = daysUntil(goal.deadline, today);
  if (days === null) return { key: 'no-deadline', label: 'No deadline', tone: 'neutral' };
  if (days < 0) return { key: 'overdue', label: `Overdue by ${-days} day${days === -1 ? '' : 's'}`, tone: 'error' };
  if (goal.createdAt) {
    const created = atNoon(goal.createdAt.slice(0, 10) + 'T12:00:00');
    const total = (atNoon(`${goal.deadline}T12:00:00`).getTime() - created.getTime()) / DAY;
    const elapsed = (atNoon(today).getTime() - created.getTime()) / DAY;
    if (total > 14 && elapsed > 0 && goalPercent(goal) < Math.floor((elapsed / total) * 100) - 15) {
      return { key: 'at-risk', label: 'Behind schedule', tone: 'warning' };
    }
  }
  if (days <= 14) return { key: 'due-soon', label: days === 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`, tone: 'warning' };
  return { key: 'on-track', label: 'On track', tone: 'info' };
}

/** Required contribution for a goal's own deadline and preferred frequency; null when not applicable. */
export function goalPlan(goal, today = new Date()) {
  if (isCompleted(goal) || !goal.deadline) return null;
  try {
    return calculateContribution({ target: goal.target, saved: goal.saved, targetDate: goal.deadline, frequency: goal.contributionFrequency || 'monthly', today });
  } catch { return null; }
}

const TONE_ORDER = { error: 0, warning: 1, info: 2, success: 3, neutral: 4 };

export function computeInsights(goals, today = new Date()) {
  const items = [];
  for (const goal of goals) {
    const status = goalStatus(goal, today);
    const plan = goalPlan(goal, today);
    const unit = FREQUENCIES.find((f) => f.value === (goal.contributionFrequency || 'monthly'))?.unit || 'month';
    if (status.key === 'completed') {
      items.push({ id: `${goal.id}-done`, goalId: goal.id, tone: 'success', title: `${goal.name} is fully funded`, detail: `You reached ${money(goal.target)}.` });
    } else if (status.key === 'overdue') {
      items.push({ id: `${goal.id}-overdue`, goalId: goal.id, tone: 'error', title: `${goal.name} is past its deadline`, detail: `${money(goalRemaining(goal))} still to go. Consider moving the target date or adding a contribution.` });
    } else if (status.key === 'at-risk') {
      items.push({ id: `${goal.id}-risk`, goalId: goal.id, tone: 'warning', title: `${goal.name} is behind schedule`, detail: plan ? `Saving about ${money(plan.contribution)} per ${unit} would still reach it by the target date.` : 'Add a contribution to catch up.' });
    } else if (status.key === 'due-soon') {
      items.push({ id: `${goal.id}-soon`, goalId: goal.id, tone: 'warning', title: `${goal.name}: ${status.label.toLowerCase()}`, detail: `${money(goalRemaining(goal))} remaining.` });
    } else if (goalPercent(goal) >= 80) {
      items.push({ id: `${goal.id}-close`, goalId: goal.id, tone: 'info', title: `${goal.name} is ${goalPercent(goal)}% funded`, detail: `Only ${money(goalRemaining(goal))} left to reach your target.` });
    }
  }
  if (goals.length && !goals.some(isEmergencyGoal)) {
    items.push({ id: 'no-emergency', tone: 'info', title: 'No emergency fund goal yet', detail: 'An emergency fund covers unexpected costs. Use the planner to size one from your own monthly expenses.', action: 'plan-emergency' });
  }
  return items.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]).slice(0, 5);
}

export const sortGoals = (goals, today = new Date()) => [...goals].sort((a, b) => {
  const done = Number(isCompleted(a)) - Number(isCompleted(b));
  if (done) return done;
  const order = ['essential', 'high', 'normal', 'optional'];
  const pr = order.indexOf(a.priority || 'normal') - order.indexOf(b.priority || 'normal');
  if (pr) return pr;
  return (daysUntil(a.deadline, today) ?? 99999) - (daysUntil(b.deadline, today) ?? 99999);
});

/** Average recent deposits, treating months without a deposit as zero. */
export function averageMonthlyDeposits(monthly: Array<{ month: string; deposits: number }> | undefined, months = 3, today = new Date()): number {
  if (!monthly?.length) return 0;
  const keys: string[] = [];
  for (let i = 1; i <= months; i++) { // the last N COMPLETE months; the running month would understate the pace
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const total = keys.reduce((sum, key) => sum + (monthly.find((m) => m.month === key)?.deposits || 0), 0);
  return Math.round((total / months) * 100) / 100;
}

export function goalPace(goal, monthlyRate: number, today = new Date()) {
  if (isCompleted(goal) || !(monthlyRate > 0)) return null;
  const remaining = goalRemaining(goal);
  const monthsNeeded = Math.ceil(remaining / monthlyRate);
  const days = daysUntil(goal.deadline, today);
  const monthsLeft = days === null ? null : Math.max(0, Math.ceil(days / 30.4));
  return { monthsNeeded, monthlyRate, onPace: monthsLeft === null ? null : monthsNeeded <= monthsLeft };
}
