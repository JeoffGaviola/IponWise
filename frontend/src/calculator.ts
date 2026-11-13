/** Use integer cents and round contributions up so the calculated plan reaches its target. */
const toCents = (value) => Math.round(Number(value) * 100);
const fromCents = (cents) => cents / 100;
const PERIODS_PER_YEAR = { daily: 365, weekly: 52, monthly: 12 };

export function calculateContribution({ target, saved = 0, targetDate, frequency = 'monthly', today = new Date() }: { target: number | string; saved?: number | string; targetDate?: string; frequency?: string; today?: Date | string } ) {
  const targetAmount = Number(target);
  const savedAmount = Number(saved);
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) throw new Error('Target amount must be greater than zero.');
  if (!Number.isFinite(savedAmount) || savedAmount < 0) throw new Error('Current savings cannot be negative.');
  if (!['daily', 'weekly', 'monthly'].includes(frequency)) throw new Error('Choose daily, weekly, or monthly contributions.');

  const remainingCents = Math.max(0, toCents(targetAmount) - toCents(savedAmount));
  const percent = Math.min(100, Math.floor((toCents(savedAmount) / toCents(targetAmount)) * 100));
  if (remainingCents === 0) return { remaining: 0, contribution: 0, periods: 0, frequency, completed: true, percent: 100 };

  if (!targetDate) throw new Error('Choose a target date.');
  const end = new Date(`${targetDate}T12:00:00`);
  if (Number.isNaN(end.getTime())) throw new Error('Choose a valid target date.');
  const start = new Date(today);
  start.setHours(12, 0, 0, 0);
  const days = Math.ceil((end.getTime() - start.getTime()) / 86400000);
  if (days <= 0) throw new Error('Target date must be in the future.');

  const periods = frequency === 'monthly'
    ? Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + (end.getDate() <= start.getDate() ? 0 : 1))
    : Math.max(1, Math.ceil(days / (frequency === 'daily' ? 1 : 7)));

  return {
    remaining: fromCents(remainingCents),
    contribution: fromCents(Math.ceil(remainingCents / periods)),
    periods,
    frequency,
    completed: false,
    percent,
    annualizedPeriods: PERIODS_PER_YEAR[frequency],
  };
}

export function suggestEmergencyTarget({ monthlyExpenses, months }: { monthlyExpenses: number | string; months: number | string }) {
  const expenses = Number(monthlyExpenses);
  const coverage = Number(months);
  if (!Number.isFinite(expenses) || expenses <= 0) throw new Error('Enter your monthly essential expenses.');
  if (!Number.isFinite(coverage) || coverage < 1 || coverage > 36) throw new Error('Choose between 1 and 36 months of coverage.');
  return fromCents(Math.round(toCents(expenses) * coverage));
}

const asCents = (v: unknown) => Math.round(Number(v) * 100);

export function purchaseTarget({ price, downPaymentPercent = 100, extras = 0 }: { price: number | string; downPaymentPercent?: number | string; extras?: number | string }) {
  const priceCents = asCents(price);
  const percent = Number(downPaymentPercent);
  const extraCents = asCents(extras || 0);
  if (!Number.isFinite(priceCents) || priceCents <= 0) throw new Error('Enter the item’s price.');
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) throw new Error('Down payment must be between 1% and 100%.');
  if (!Number.isFinite(extraCents) || extraCents < 0) throw new Error('Extra costs can’t be negative.');
  const downCents = Math.round((priceCents * percent) / 100);
  return { downPayment: downCents / 100, extras: extraCents / 100, target: (downCents + extraCents) / 100, financed: (priceCents - downCents) / 100 };
}

export function installmentTarget({ amount, count }: { amount: number | string; count: number | string }) {
  const cents = asCents(amount);
  const n = Number(count);
  if (!Number.isFinite(cents) || cents <= 0) throw new Error('Enter the amount per payment.');
  if (!Number.isInteger(n) || n < 1 || n > 600) throw new Error('Enter a whole number of payments (1–600).');
  return (cents * n) / 100;
}
