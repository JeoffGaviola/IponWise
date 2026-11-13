import { isEmergencyGoal } from './goals.ts';

export type StepId = 'profile' | 'goal' | 'account' | 'deposit' | 'reminder' | 'safety';
export type StartStep = { id: StepId; title: string; description: string; cta: string; done: boolean; target: 'settings' | 'goals' | 'wallets' | 'deposit' | 'reminders' | 'emergency' };

type Input = { avatarUrl?: string; goals?: any[]; wallets?: any[]; reminders?: any[]; dashboard?: { transaction_count?: number } | null };

export function getStartedSteps({ avatarUrl, goals = [], wallets = [], reminders = [], dashboard }: Input): StartStep[] {
  return [
    { id: 'goal', title: 'Pick what you’re saving for', description: 'A laptop, tuition, hospital bills or a rainy-day fund — choose a goal and a target date.', cta: 'Browse goal ideas', done: goals.length > 0, target: 'goals' },
    { id: 'deposit', title: 'Record your first deposit', description: 'Add money you’ve set aside and link it to a goal to watch progress grow.', cta: 'Add a deposit', done: (dashboard?.transaction_count || 0) > 0, target: 'deposit' },
    { id: 'account', title: 'Track where your money is kept', description: 'Scan an e-wallet QR or add an ATM card (last 4 digits only) to keep an eye on balances. Read-only.', cta: 'Add an account', done: wallets.length > 0, target: 'wallets' },
    { id: 'safety', title: 'Build a safety net', description: 'Size an emergency fund from your own monthly expenses.', cta: 'Plan an emergency fund', done: goals.some(isEmergencyGoal), target: 'emergency' },
    { id: 'reminder', title: 'Set a saving reminder', description: 'Little nudges make a habit — for example “Every Friday after payday”.', cta: 'Create a reminder', done: reminders.length > 0, target: 'reminders' },
    { id: 'profile', title: 'Personalise your profile', description: 'Add a profile photo and choose how IponWise shows your money.', cta: 'Open profile', done: Boolean(avatarUrl), target: 'settings' },
  ];
}

export const progressOf = (steps: StartStep[]) => {
  const done = steps.filter((s) => s.done).length;
  return { done, total: steps.length, percent: steps.length ? Math.round((done / steps.length) * 100) : 0, complete: done === steps.length };
};
