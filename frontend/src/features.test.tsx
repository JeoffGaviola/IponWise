import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './lib/errors.ts';

const auth = vi.hoisted(() => ({ listeners: [] as any[], getSession: vi.fn(), signOut: vi.fn(), signInWithPassword: vi.fn(), signUp: vi.fn(), signInWithOAuth: vi.fn(), resetPasswordForEmail: vi.fn() }));
vi.mock('./supabase.ts', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: {
    getSession: (...a) => auth.getSession(...a), signOut: (...a) => auth.signOut(...a), signInWithPassword: (...a) => auth.signInWithPassword(...a),
    signUp: (...a) => auth.signUp(...a), signInWithOAuth: (...a) => auth.signInWithOAuth(...a), resetPasswordForEmail: (...a) => auth.resetPasswordForEmail(...a),
    onAuthStateChange: (cb) => { auth.listeners.push(cb); return { data: { subscription: { unsubscribe: () => { auth.listeners = auth.listeners.filter((l) => l !== cb); } } } }; },
  } },
}));
// Make the full-screen transitions long enough to observe in tests.
vi.mock('./lib/splash.ts', () => ({ SPLASH_MS: { enter: 400, leave: 400, maxWait: 8000 } }));
const api = vi.hoisted(() => Object.fromEntries(['dashboard', 'reports', 'profile', 'updateProfile', 'avatar', 'uploadAvatar', 'deleteAvatar', 'transactions', 'createTransaction', 'updateTransaction', 'deleteTransaction', 'goals', 'createGoal', 'updateGoal', 'deleteGoal', 'wallets', 'createWallet', 'updateWallet', 'walletHistory', 'deleteWallet', 'reminders', 'createReminder', 'updateReminder', 'deleteReminder'].map((k) => [k, vi.fn()])));
vi.mock('./api.ts', () => ({ api }));

import App from './App.tsx';
import { passwordStrength } from './pages/AuthPage.tsx';

const USER = { id: 'u1', email: 'maria@example.com', user_metadata: { full_name: 'Maria Santos' } };
const SESSION = { access_token: 'tok', user: USER };
const emptyDash = { balance: 0, month_deposits: 0, month_withdrawals: 0, goals_saved: 0, goals_target: 0, goal_count: 0, completed_goals: 0, transaction_count: 0 };
const profile = { display_name: 'Maria Santos', currency_code: 'PHP', theme: 'light', email_summaries_enabled: false, savings_reminders_enabled: true, onboarding_dismissed: false };
const nowIso = () => new Date().toISOString();
const wallet = (over = {}) => ({ id: 'w1', name: 'GCash wallet', provider: 'GCash', kind: 'ewallet', balance: 3000, currencyCode: 'PHP', note: '', source: 'qr', cardLast4: null, cardNetwork: null, accountTail: '4567', lastCheckedAt: nowIso(), updatedAt: nowIso(), trend: [3200, 3000], ...over });

function mockApi(over: Record<string, any> = {}) {
  const defaults = { dashboard: emptyDash, reports: { monthly: [], withdrawal_categories: [] }, profile, avatar: { avatar_url: '' }, goals: [], reminders: [], wallets: [], transactions: [] };
  for (const [k, v] of Object.entries({ ...defaults, ...over })) api[k].mockResolvedValue(v);
  api.updateProfile.mockImplementation(async (_t, body) => ({ ...profile, ...(over.profile || {}), ...body }));
}
const signedIn = () => auth.getSession.mockResolvedValue({ data: { session: SESSION } });
const signedOut = () => auth.getSession.mockResolvedValue({ data: { session: null } });
beforeEach(() => { vi.clearAllMocks(); auth.listeners = []; auth.signOut.mockResolvedValue({ error: null }); window.history.replaceState({}, '', '/'); document.documentElement.removeAttribute('data-theme'); });
const toasts = () => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | ');
async function goto(user, name: string | RegExp) { await user.click(await screen.findByRole('button', { name: /Menu|navigation/i }).catch(() => null) as any).catch(() => {}); await user.click(await screen.findByRole('button', { name })); }

describe('sign-in screen', () => {
  it('lists Google first, Facebook second, then the manual email form', async () => {
    signedOut(); render(<App />);
    await screen.findByRole('heading', { name: 'Welcome back' });
    const panel = document.querySelector('.auth-panel-inner')!;
    const labels = [...panel.querySelectorAll('button, input')].map((e) => (e.textContent || '').trim() || e.getAttribute('type')).filter(Boolean);
    expect(labels.slice(0, 2)).toEqual(['Continue with Google', 'Continue with Facebook']);
    expect(within(panel as HTMLElement).getByText('or sign in with your email')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('starts the real provider redirects', async () => {
    signedOut(); auth.signInWithOAuth.mockResolvedValue({ error: null });
    const user = userEvent.setup(); render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Continue with Google' }));
    await user.click(await screen.findByRole('button', { name: 'Continue with Facebook' }).catch(() => screen.getByRole('button', { name: /Facebook/ })));
    expect(auth.signInWithOAuth.mock.calls.map((c) => c[0].provider)).toContain('google');
  });

  it('manual registration asks to confirm the password and shows its strength', async () => {
    signedOut(); const user = userEvent.setup(); render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Create an account' }));
    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Password'), 'abc');
    expect(screen.getByText(/Password strength/)).toHaveTextContent('Too weak');
    await user.clear(screen.getByLabelText('Password')); await user.type(screen.getByLabelText('Password'), 'Ipon-2026!ok');
    expect(screen.getByText(/Password strength/)).toHaveTextContent('Strong');
    await user.type(screen.getByLabelText('Full name'), 'Maria'); await user.type(screen.getByLabelText('Email'), 'm@example.com');
    await user.type(screen.getByLabelText('Confirm password'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('The passwords don’t match.')).toBeInTheDocument();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('scores password strength sensibly', () => {
    expect(passwordStrength('').score).toBe(0); expect(passwordStrength('short').score).toBeLessThanOrEqual(1);
    expect(passwordStrength('longenough').score).toBeLessThan(passwordStrength('Longer-Passw0rd!').score);
    expect(passwordStrength('Longer-Passw0rd!').label).toBe('Strong');
  });
});

describe('sign-in and sign-out transitions', () => {
  it('shows a full-screen "Signing you in" step after login, then the app', async () => {
    signedOut(); mockApi(); render(<App />);
    await screen.findByRole('heading', { name: 'Welcome back' });
    await act(async () => { auth.listeners.forEach((cb) => cb('SIGNED_IN', SESSION)); });
    expect(await screen.findByRole('status', { name: 'Signing you in' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Signing you in' })).not.toBeInTheDocument(), { timeout: 3000 });
    expect(await screen.findByRole('heading', { name: /Maria/ })).toBeInTheDocument();
  });

  it('shows "Signing you out" and holds it before returning to the sign-in screen', async () => {
    signedIn(); mockApi(); const user = userEvent.setup(); render(<App />);
    await screen.findByRole('heading', { name: /Maria/ });
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Opening IponWise' })).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Maria Santos/ }));
    await act(async () => { auth.signOut.mockImplementation(async () => { auth.listeners.forEach((cb) => cb('SIGNED_OUT', null)); return { error: null }; }); });
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByRole('status', { name: 'Signing you out' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Welcome back' }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Signing you out' })).not.toBeInTheDocument();
  });

  it('a failed sign-out removes the transition and keeps the user signed in', async () => {
    signedIn(); mockApi(); auth.signOut.mockResolvedValue({ error: { message: 'network down' } });
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole('heading', { name: /Maria/ });
    await user.click(screen.getByRole('button', { name: /Maria Santos/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(toasts()).toMatch(/still signed in/));
    expect(screen.queryByRole('status', { name: 'Signing you out' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Maria/ })).toBeInTheDocument();
  });
});

describe('Get started guide on the dashboard', () => {
  it('shows 0 of 6 for a new user with a labelled action on every step', async () => {
    signedIn(); mockApi(); render(<App />);
    expect(await screen.findByRole('heading', { name: 'Get started with IponWise' })).toBeInTheDocument();
    expect(screen.getByText('0 of 6')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Setup steps' });
    for (const label of ['Browse goal ideas', 'Add a deposit', 'Add an account', 'Plan an emergency fund', 'Create a reminder', 'Open profile']) expect(within(list).getByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
  });

  it('derives progress from real data', async () => {
    signedIn();
    mockApi({ goals: [{ id: 'g1', name: 'Emergency fund', category: 'Emergency fund', target: 1000, saved: 100, deadline: null, priority: 'essential', description: '', contributionFrequency: 'monthly', createdAt: '2026-01-01' }], wallets: [wallet()], dashboard: { ...emptyDash, transaction_count: 1, goal_count: 1, goals_target: 1000, goals_saved: 100 } });
    render(<App />);
    expect(await screen.findByText('4 of 6')).toBeInTheDocument();
    expect(screen.getAllByText(/^Done/).length).toBe(4);
  });

  it('can be hidden for good (saved on the server) and stays hidden', async () => {
    signedIn(); mockApi(); const user = userEvent.setup(); render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Hide guide' }));
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith('tok', { onboarding_dismissed: true }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Get started with IponWise' })).not.toBeInTheDocument());
  });

  it('is not shown when already dismissed', async () => {
    signedIn(); mockApi({ profile: { ...profile, onboarding_dismissed: true } }); render(<App />);
    await screen.findByRole('heading', { name: /Maria/ });
    expect(screen.queryByRole('heading', { name: 'Get started with IponWise' })).not.toBeInTheDocument();
  });

  it('the first step opens the goal ideas', async () => {
    signedIn(); mockApi(); const user = userEvent.setup(); render(<App />);
    await user.click(await screen.findByRole('button', { name: /Browse goal ideas: Pick what/ }));
    expect(await screen.findByRole('heading', { name: 'Goal ideas' })).toBeInTheDocument();
  });
});

describe('goal ideas and planners', () => {
  async function openIdeas() {
    signedIn(); mockApi(); const user = userEvent.setup(); render(<App />);
    await user.click(await screen.findByRole('button', { name: /Browse goal ideas: Pick what/ }));
    await screen.findByRole('heading', { name: 'Goal ideas' });
    return user;
  }
  it('offers different kinds of goals, filterable by theme', async () => {
    const user = await openIdeas();
    await user.click(screen.getByRole('button', { name: 'Emergencies & health' }));
    expect(screen.getByRole('heading', { name: 'Hospital bill fund' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'School & tuition' }));
    expect(screen.getByRole('heading', { name: 'Tuition fees' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Bills & loans' }));
    expect(screen.getByRole('heading', { name: 'Loan payments' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Big purchases' }));
    for (const t of ['New laptop', 'Motorcycle', 'Car down payment']) expect(screen.getByRole('heading', { name: t })).toBeInTheDocument();
  });
  it('"Shuffle ideas" shows a different selection', async () => {
    const user = await openIdeas();
    const titles = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent).filter((t) => !/^(Goal|Emergency|Savings)/.test(t || ''));
    const first = titles().join('|'); let changed = false;
    for (let i = 0; i < 5 && !changed; i++) { await user.click(screen.getByRole('button', { name: 'Shuffle ideas' })); changed = titles().join('|') !== first; }
    expect(changed).toBe(true);
  });
  it('a laptop idea opens a pre-filled form with the purchase planner, and saves through the API', async () => {
    const user = await openIdeas(); api.createGoal.mockResolvedValue({ id: 'g9' });
    await user.click(screen.getByRole('button', { name: 'Big purchases' }));
    await user.click(screen.getByRole('button', { name: /Use this idea: New laptop/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Goal name')).toHaveValue('New laptop');
    expect(Number((within(dialog).getByLabelText('Target amount') as HTMLInputElement).value)).toBe(45000);
    expect((within(dialog).getByLabelText(/Target date/) as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // planner: 20% down on a ₱60,000 laptop + ₱1,500 extras → ₱13,500
    await user.click(within(dialog).getByText(/Plan the purchase/));
    await user.type(within(dialog).getByLabelText('Item price'), '60000');
    await user.selectOptions(within(dialog).getByLabelText('How will you pay?'), '20');
    await user.type(within(dialog).getByLabelText(/Extra one-off costs/), '1500');
    expect(within(dialog).getByText(/₱13,500/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Use as target' }));
    expect(Number((within(dialog).getByLabelText('Target amount') as HTMLInputElement).value)).toBe(13500);
    await user.click(within(dialog).getByRole('button', { name: 'Create goal' }));
    await waitFor(() => expect(api.createGoal).toHaveBeenCalled());
    expect(api.createGoal.mock.calls[0][1]).toMatchObject({ name: 'New laptop', target: 13500, category: 'Gadgets & electronics' });
  });
  it('tuition and loan ideas get the instalment planner (amount × payments)', async () => {
    const user = await openIdeas();
    await user.click(screen.getByRole('button', { name: 'School & tuition' }));
    await user.click(screen.getByRole('button', { name: /Use this idea: Tuition fees/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByText(/Add up fees or payments/));
    await user.type(within(dialog).getByLabelText('Amount per payment'), '25000');
    await user.type(within(dialog).getByLabelText('Number of payments'), '2');
    expect(within(dialog).getByText(/₱50,000/)).toBeInTheDocument();
  });
  it('"Surprise me" opens a pre-filled goal', async () => {
    const user = await openIdeas();
    await user.click(screen.getByRole('button', { name: 'Surprise me' }));
    const dialog = await screen.findByRole('dialog');
    expect((within(dialog).getByLabelText('Goal name') as HTMLInputElement).value.length).toBeGreaterThan(2);
  });
});

describe('wallets: cards, QR and balances (tracking only)', () => {
  async function openWallets(list: any[] = []) {
    signedIn(); mockApi({ wallets: list }); const user = userEvent.setup(); render(<App />);
    await screen.findByRole('heading', { name: /Maria/ });
    const menu = screen.queryByRole('button', { name: /open (menu|navigation)/i }); if (menu) await user.click(menu);
    await user.click(screen.getAllByRole('button', { name: /Wallets & accounts/ })[0]);
    await screen.findByRole('heading', { name: 'Wallets & accounts' });
    return user;
  }
  it('explains that it only tracks and offers scan, card and manual entry', async () => {
    await openWallets();
    expect(screen.getByText(/Tracking only/)).toBeInTheDocument();
    for (const n of ['Scan e-wallet QR', 'Add ATM card', 'Add manually']) expect(screen.getAllByRole('button', { name: n }).length).toBeGreaterThan(0);
  });
  it('a typed card number is checked on the device and only its last 4 digits + network reach the API', async () => {
    const user = await openWallets(); api.createWallet.mockResolvedValue(wallet({ id: 'w2', kind: 'atm', source: 'card', cardLast4: '4242', cardNetwork: 'visa', name: 'Payroll ATM', provider: 'BDO' }));
    await user.click(screen.getAllByRole('button', { name: 'Add ATM card' })[0]);
    const dialog = await screen.findByRole('dialog');
    const number = within(dialog).getByLabelText('Card number or last 4 digits');
    await user.type(number, '4242424242424241');
    await user.type(within(dialog).getByLabelText('Card name'), 'Payroll ATM'); await user.type(within(dialog).getByLabelText('Bank or issuer'), 'BDO'); await user.type(within(dialog).getByLabelText(/Balance/), '12500');
    await user.click(within(dialog).getByRole('button', { name: 'Add card' }));
    expect(await within(dialog).findByText(/doesn’t look valid/)).toBeInTheDocument();
    expect(api.createWallet).not.toHaveBeenCalled();
    await user.clear(number); await user.type(number, '4242424242424242');
    expect(within(dialog).getByText(/Visa •••• 4242/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Add card' }));
    await waitFor(() => expect(api.createWallet).toHaveBeenCalledTimes(1));
    const body = api.createWallet.mock.calls[0][1];
    expect(body).toMatchObject({ kind: 'atm', source: 'card', card_last4: '4242', card_network: 'visa', balance: 12500 });
    expect(JSON.stringify(body)).not.toMatch(/4242424242424242|4242 4242/);
    expect(Object.keys(body).some((k) => /cvv|pin|expiry|number/i.test(k))).toBe(false);
  });
  it('lets people enter only the last 4 digits (local ATM cards)', async () => {
    const user = await openWallets(); api.createWallet.mockResolvedValue(wallet({ id: 'w3' }));
    await user.click(screen.getAllByRole('button', { name: 'Add ATM card' })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Card number or last 4 digits'), '9876');
    await user.type(within(dialog).getByLabelText('Card name'), 'Landbank card'); await user.type(within(dialog).getByLabelText('Bank or issuer'), 'Landbank'); await user.type(within(dialog).getByLabelText(/Balance/), '800');
    await user.click(within(dialog).getByRole('button', { name: 'Add card' }));
    await waitFor(() => expect(api.createWallet).toHaveBeenCalled());
    expect(api.createWallet.mock.calls[0][1]).toMatchObject({ card_last4: '9876', card_network: 'other' });
  });
  it('QR text from a wallet app pre-fills the provider; the balance is typed by the user', async () => {
    const tlv = (t, v) => `${t}${String(v.length).padStart(2, '0')}${v}`;
    const { crc16 } = await import('./lib/qr.ts');
    const body = tlv('00', '01') + tlv('01', '11') + tlv('26', tlv('00', 'com.p2pqrpay') + tlv('01', 'GXCHPHM2XXX') + tlv('03', '09171234567')) + tlv('53', '608') + tlv('58', 'PH') + tlv('59', 'MARIA S') + '6304';
    const qr = body + crc16(body);
    const user = await openWallets(); api.createWallet.mockResolvedValue(wallet());
    await user.click(screen.getAllByRole('button', { name: 'Scan e-wallet QR' })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByText(/Paste the QR text/));
    await user.click(within(dialog).getByLabelText('QR code text')); await user.paste(qr);
    await user.click(within(dialog).getByRole('button', { name: 'Read this text' }));
    expect(await within(dialog).findByText(/looks like GCash/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Provider')).toHaveValue('GCash');
    await user.type(within(dialog).getByLabelText(/Balance in GCash/), '3200');
    await user.click(within(dialog).getByRole('button', { name: 'Add account' }));
    await waitFor(() => expect(api.createWallet).toHaveBeenCalled());
    expect(api.createWallet.mock.calls[0][1]).toMatchObject({ provider: 'GCash', source: 'qr', account_tail: '4567', balance: 3200, kind: 'ewallet' });
  });
  it('rejects a QR that is not a payment code', async () => {
    const user = await openWallets();
    await user.click(screen.getAllByRole('button', { name: 'Scan e-wallet QR' })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByText(/Paste the QR text/)); await user.click(within(dialog).getByLabelText('QR code text')); await user.paste('https://example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Read this text' }));
    expect(await within(dialog).findByText(/doesn’t look like an e-wallet or bank payment QR/)).toBeInTheDocument();
  });
  it('shows source, masked identifier, freshness and a funding check on each account', async () => {
    const old = new Date(Date.now() - 20 * 86400000).toISOString();
    await openWallets([wallet(), wallet({ id: 'w2', name: 'Payroll ATM', provider: 'BDO', kind: 'atm', source: 'card', cardLast4: '4242', cardNetwork: 'visa', accountTail: null, lastCheckedAt: old, balance: 500 })]);
    expect(screen.getByText('Scanned from QR')).toBeInTheDocument();
    expect(screen.getByText('Ref •••• 4567')).toBeInTheDocument();
    expect(screen.getByText('Visa •••• 4242')).toBeInTheDocument();
    expect(screen.getByText('Not checked for 20 days')).toBeInTheDocument();
    expect(screen.getByText('1 to refresh')).toBeInTheDocument();
  });
  it('updating a balance, or confirming it is still correct, is saved and recorded', async () => {
    const user = await openWallets([wallet()]); api.updateWallet.mockResolvedValue(wallet({ balance: 2500 }));
    await user.click(screen.getByRole('button', { name: /Update balance: GCash wallet/ }));
    const dialog = await screen.findByRole('dialog');
    // Unchanged balance: only "still correct" makes sense. Changed balance: only "Save new balance".
    expect(within(dialog).getByRole('button', { name: 'It’s still correct' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Save new balance' })).toBeDisabled();
    const input = within(dialog).getByLabelText('Current balance'); await user.clear(input); await user.type(input, '2500');
    expect(within(dialog).getByRole('button', { name: 'It’s still correct' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Save new balance' }));
    await waitFor(() => expect(api.updateWallet).toHaveBeenCalledWith('tok', 'w1', { balance: 2500 }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Update balance: GCash wallet/ }));
    const again = await screen.findByRole('dialog');
    await user.click(within(again).getByRole('button', { name: 'It’s still correct' }));
    await waitFor(() => expect(api.updateWallet).toHaveBeenCalledTimes(2));
    expect(api.updateWallet.mock.calls[1][2]).toEqual({ balance: 3000 });
  });
  it('shows balance history from the API and a retryable error when it fails', async () => {
    const user = await openWallets([wallet()]);
    api.walletHistory.mockRejectedValueOnce(new ApiError('Could not load balance history.', { kind: 'server', retryable: true }));
    await user.click(screen.getByRole('button', { name: /History: GCash wallet/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Could not load balance history/)).toBeInTheDocument();
    api.walletHistory.mockResolvedValue([{ balance: 3000, reason: 'update', recordedAt: '2026-10-28T10:00:00Z' }, { balance: 3200, reason: 'created', recordedAt: '2026-10-20T10:00:00Z' }]);
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }));
    expect(await within(dialog).findByText('₱3,200')).toBeInTheDocument();
    expect(within(dialog).getByText('−₱200')).toBeInTheDocument();
  });
});

describe('profile & settings', () => {
  it('can bring the Get started guide back', async () => {
    signedIn(); mockApi({ profile: { ...profile, onboarding_dismissed: true } }); const user = userEvent.setup(); render(<App />);
    await screen.findByRole('heading', { name: /Maria/ });
    const menu = screen.queryByRole('button', { name: /open (menu|navigation)/i }); if (menu) await user.click(menu);
    await user.click(screen.getAllByRole('button', { name: /Profile & settings/ })[0]);
    await user.click(await screen.findByRole('switch', { name: 'Show the Get started guide' }));
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith('tok', { onboarding_dismissed: false }));
  });
});
