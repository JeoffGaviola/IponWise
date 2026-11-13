// @vitest-environment node
/**
 * Opt-in contract test against a running API. Set LIVE_API=1; provide LIVE_TOKEN_A and LIVE_TOKEN_B for real Supabase.
 * Run: LIVE_API=1 VITE_API_BASE_URL=http://127.0.0.1:8000 npx vitest run src/contract.live.test.ts
 */
import { describe, expect, it } from 'vitest';
import { api } from './api.ts';

declare const process: { env: Record<string, string | undefined> };

const A = process.env.LIVE_TOKEN_A || 'token-a';
const B = process.env.LIVE_TOKEN_B || 'token-b';
const live = process.env.LIVE_API === '1' ? describe : describe.skip;
const today = new Date().toISOString().slice(0, 10);

live('frontend api.ts ⇄ FastAPI ⇄ PostgreSQL', () => {
  it('rejects missing/invalid tokens as auth errors (session expiry path)', async () => {
    await expect(api.goals('not-a-real-token')).rejects.toMatchObject({ kind: 'auth', status: 401 });
    await expect(api.dashboard('')).rejects.toMatchObject({ kind: 'auth', status: 401 });
  });

  it('goal lifecycle with planning fields, exactly as the UI sends them', async () => {
    const created = await api.createGoal(A, { name: 'Emergency fund', category: 'Emergency fund', target: 30000, saved: 5000, deadline: '2030-01-01', color: 'blue', priority: 'essential', description: '3 months of essentials', contributionFrequency: 'weekly' });
    expect(created).toMatchObject({ name: 'Emergency fund', target: 30000, saved: 5000, priority: 'essential', contributionFrequency: 'weekly', description: '3 months of essentials' });
    expect(created.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
    const updated = await api.updateGoal(A, created.id, { name: 'Emergency fund', category: 'Emergency fund', target: 36000, deadline: '2030-06-01', priority: 'high', description: '', contributionFrequency: 'monthly' });
    expect(updated).toMatchObject({ target: 36000, priority: 'high', contributionFrequency: 'monthly', saved: 5000 });
    expect((await api.goals(A)).map((g) => g.id)).toContain(created.id);
    expect((await api.goals(B)).map((g) => g.id)).not.toContain(created.id);          // isolation
    await expect(api.updateGoal(B, created.id, { name: 'hijack' })).rejects.toMatchObject({ kind: 'not-found' });
    await expect(api.updateGoal(A, created.id, { target: 100 })).rejects.toMatchObject({ kind: 'client', message: expect.stringMatching(/lower than the amount already saved/) });
    await api.deleteGoal(A, created.id);
    expect((await api.goals(A)).map((g) => g.id)).not.toContain(created.id);
  });

  it('ledger: contribution, over-target rejection, goal-linked withdrawal, balance floor, dashboard truth', async () => {
    const goal = await api.createGoal(A, { name: 'Tuition', category: 'Tuition & education', target: 1000, saved: 0, deadline: null, color: 'blue', priority: 'normal', description: '', contributionFrequency: 'monthly' });
    const before = (await api.dashboard(A)).balance;
    const dep = await api.createTransaction(A, { type: 'deposit', category: 'Goal contribution', note: 'Contribution', amount: 600, date: today, goalId: goal.id });
    expect(dep).toMatchObject({ type: 'deposit', amount: 600, goalId: goal.id });
    await expect(api.createTransaction(A, { type: 'deposit', category: 'x', note: '', amount: 500, date: today, goalId: goal.id })).rejects.toMatchObject({ kind: 'client', message: expect.stringMatching(/exceed/) });
    expect((await api.goals(A)).find((g) => g.id === goal.id).saved).toBe(600);
    const wd = await api.createTransaction(A, { type: 'withdrawal', category: 'Medical', note: 'Used from Tuition', amount: 100, date: today, goalId: goal.id });
    expect((await api.goals(A)).find((g) => g.id === goal.id).saved).toBe(500);
    const dash = await api.dashboard(A);
    expect(dash.balance).toBe(before + 500);
    expect(dash).toMatchObject({ goal_count: expect.any(Number), goals_saved: expect.any(Number), transaction_count: expect.any(Number) });
    await api.updateTransaction(A, wd.id, { type: 'withdrawal', category: 'Medical', note: 'edited', amount: 50, date: today, goalId: goal.id });
    expect((await api.goals(A)).find((g) => g.id === goal.id).saved).toBe(550);
    await api.deleteTransaction(A, wd.id);
    expect((await api.goals(A)).find((g) => g.id === goal.id).saved).toBe(600);
    expect((await api.transactions(B, { limit: 500 })).map((t) => t.id)).not.toContain(dep.id);
    await api.deleteTransaction(A, dep.id);
    await api.deleteGoal(A, goal.id);
  });

  it('maps server validation errors to per-field errors the forms can display', async () => {
    const error = await api.createTransaction(A, { type: 'deposit', category: 'x', note: '', amount: 0, date: today, goalId: null }).catch((e) => e);
    expect(error).toMatchObject({ kind: 'validation', status: 422 });
    expect(Object.keys(error.fieldErrors)).toContain('amount');
  });

  it('reminders, wallets, profile and reports round-trip with the field names the UI uses', async () => {
    const r = await api.createReminder(A, { title: 'Friday deposit', detail: '', time: 'Every Friday', kind: 'deposit', due_date: today, active: true });
    expect(r).toMatchObject({ title: 'Friday deposit', dueDate: today, active: true, completed: false });
    expect(await api.updateReminder(A, r.id, { active: false })).toMatchObject({ active: false });
    expect(await api.updateReminder(A, r.id, { completed: true })).toMatchObject({ completed: true });
    await api.deleteReminder(A, r.id);

    const w = await api.createWallet(A, { name: 'Daily funds', provider: 'GCash', kind: 'ewallet', balance: 1500.5, currency_code: 'PHP', note: '' });
    expect(w).toMatchObject({ balance: 1500.5, currencyCode: 'PHP' });
    expect(await api.updateWallet(A, w.id, { balance: 99 })).toMatchObject({ balance: 99 });
    await expect(api.updateWallet(B, w.id, { balance: 1 })).rejects.toMatchObject({ kind: 'not-found' });
    await api.deleteWallet(A, w.id);

    const p = await api.updateProfile(A, { display_name: 'Alice Contract', theme: 'dark', currency_code: 'USD' });
    expect(p).toMatchObject({ display_name: 'Alice Contract', theme: 'dark', currency_code: 'USD' });
    expect(await api.profile(A)).toMatchObject({ theme: 'dark', currency_code: 'USD' });         // persisted
    await api.updateProfile(A, { theme: 'system', currency_code: 'PHP' });

    expect(await api.reports(A)).toMatchObject({ monthly: expect.any(Array), withdrawal_categories: expect.any(Array) });
  });

  it('account tracking: last-4-only cards, QR reference, balance history, trend, privacy and isolation', async () => {
    // Card payloads contain only the last four digits and network.
    const card = await api.createWallet(A, { name: 'Payroll ATM', provider: 'BDO', kind: 'atm', balance: 12500.5, currency_code: 'PHP', note: '', source: 'card', card_last4: '4242', card_network: 'visa' });
    expect(card).toMatchObject({ source: 'card', cardLast4: '4242', cardNetwork: 'visa', balance: 12500.5, trend: [12500.5] });
    const qr = await api.createWallet(A, { name: 'GCash wallet', provider: 'GCash', kind: 'ewallet', balance: 3200, currency_code: 'PHP', source: 'qr', account_tail: '4567' });
    expect(qr).toMatchObject({ source: 'qr', accountTail: '4567', cardLast4: null });

    // Full card-like numbers are rejected in every free-text field.
    for (const field of ['name', 'provider', 'note']) {
      await expect(api.createWallet(A, { name: 'Wallet', provider: 'Bank', kind: 'bank', balance: 1, [field]: 'mine 4242 4242 4242 4242' })).rejects.toMatchObject({ message: expect.stringMatching(/card number/i) });
    }
    await expect(api.createWallet(A, { name: 'Bad card', provider: 'BDO', kind: 'atm', balance: 1, source: 'card', card_last4: '4242424242424242' })).rejects.toBeTruthy();

    // Balance updates are recorded; a rename does not create a history entry.
    await api.updateWallet(A, qr.id, { balance: 2800 });
    await api.updateWallet(A, qr.id, { balance: 2800 });
    const renamed = await api.updateWallet(A, qr.id, { name: 'GCash for daily use' });
    expect(renamed.trend).toEqual([3200, 2800, 2800]);
    const history = await api.walletHistory(A, qr.id);
    expect(history.map((h) => h.reason)).toEqual(['check-in', 'update', 'created']);
    expect(history.map((h) => h.balance)).toEqual([2800, 2800, 3200]);
    expect((await api.wallets(A)).find((w) => w.id === qr.id).trend).toEqual([3200, 2800, 2800]);

    // Account tracking is isolated from the savings ledger and other users.
    expect((await api.dashboard(A)).balance).not.toBe(15300.5);
    expect(await api.wallets(B)).toEqual([]);
    await expect(api.walletHistory(B, qr.id)).rejects.toMatchObject({ kind: 'not-found' });
    await api.deleteWallet(A, card.id); await api.deleteWallet(A, qr.id);
    expect(await api.wallets(A)).toEqual([]);
  });

  it('first-run guide flag round-trips on the profile', async () => {
    expect((await api.profile(A)).onboarding_dismissed).toBe(false);
    expect(await api.updateProfile(A, { onboarding_dismissed: true })).toMatchObject({ onboarding_dismissed: true });
    expect((await api.profile(A)).onboarding_dismissed).toBe(true);
    expect((await api.profile(B)).onboarding_dismissed).toBe(false);
    await api.updateProfile(A, { onboarding_dismissed: false });
  });

  it('transaction listing honours the filters and pagination the Transactions page sends', async () => {
    const made = [];
    for (const [category, amount] of [['Gift', 10], ['Salary', 20], ['Allowance', 30]]) made.push(await api.createTransaction(A, { type: 'deposit', category, note: `live-${category}`, amount, date: today, goalId: null }));
    expect((await api.transactions(A, { search: 'live-Salary', limit: 26, offset: 0 })).length).toBe(1);
    expect((await api.transactions(A, { search: 'live-', sort_by: 'amount', sort_order: 'asc', limit: 2, offset: 0 })).map((t) => t.amount)).toEqual([10, 20]);
    expect((await api.transactions(A, { search: 'live-', sort_by: 'amount', sort_order: 'asc', limit: 2, offset: 2 })).map((t) => t.amount)).toEqual([30]);
    for (const t of made) await api.deleteTransaction(A, t.id);
  });
});
