import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './lib/errors.ts';

const auth = vi.hoisted(() => ({
  session: null, listeners: [],
  getSession: vi.fn(), signOut: vi.fn(), signInWithPassword: vi.fn(), signUp: vi.fn(), signInWithOAuth: vi.fn(), resetPasswordForEmail: vi.fn(),
}));
vi.mock('./supabase.ts', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: {
    getSession: (...a) => auth.getSession(...a), signOut: (...a) => auth.signOut(...a), signInWithPassword: (...a) => auth.signInWithPassword(...a),
    signUp: (...a) => auth.signUp(...a), signInWithOAuth: (...a) => auth.signInWithOAuth(...a), resetPasswordForEmail: (...a) => auth.resetPasswordForEmail(...a),
    onAuthStateChange: (cb) => { auth.listeners.push(cb); return { data: { subscription: { unsubscribe: () => { auth.listeners = auth.listeners.filter((l) => l !== cb); } } } }; },
  } },
}));
const api = vi.hoisted(() => Object.fromEntries(['dashboard', 'reports', 'assistant', 'profile', 'updateProfile', 'avatar', 'uploadAvatar', 'deleteAvatar', 'transactions', 'createTransaction', 'updateTransaction', 'deleteTransaction', 'goals', 'createGoal', 'updateGoal', 'deleteGoal', 'wallets', 'createWallet', 'updateWallet', 'deleteWallet', 'reminders', 'createReminder', 'updateReminder', 'deleteReminder'].map((k) => [k, vi.fn()])));
vi.mock('./api.ts', () => ({ api }));

import App from './App.tsx';

const USER = { id: 'u1', email: 'maria@example.com', user_metadata: { full_name: 'Maria Santos' } };
const SESSION = { access_token: 'tok', user: USER };
const dashboard = { balance: 12500, month_deposits: 3000, month_withdrawals: 500, goals_saved: 900, goals_target: 1000, goal_count: 1, completed_goals: 0, transaction_count: 2 };
const goal = { id: 'g1', name: 'Emergency fund', category: 'Emergency fund', target: 1000, saved: 900, deadline: null, priority: 'essential', description: '', contributionFrequency: 'monthly', createdAt: '2026-01-01' };
const tx = { id: 't1', type: 'deposit', category: 'Allowance', note: 'Weekly allowance', amount: 500, date: '2026-10-20', goalId: null };
const profile = { display_name: 'Maria Santos', currency_code: 'PHP', theme: 'light', email_summaries_enabled: false, savings_reminders_enabled: true };

function mockHappyApi(over = {}) {
  const defaults = {
    dashboard: dashboard, reports: { monthly: [], withdrawal_categories: [] }, profile, avatar: { avatar_url: '' },
    goals: [goal], reminders: [], wallets: [], transactions: [tx],
  };
  for (const [key, value] of Object.entries({ ...defaults, ...over })) api[key].mockResolvedValue(value);
}
const signedIn = () => { auth.getSession.mockResolvedValue({ data: { session: SESSION } }); };
const signedOut = () => { auth.getSession.mockResolvedValue({ data: { session: null } }); };

beforeEach(() => {
  vi.clearAllMocks();
  auth.listeners = [];
  auth.signOut.mockResolvedValue({ error: null });
  window.history.replaceState({}, '', '/');
  document.documentElement.removeAttribute('data-theme');
});
const toastText = () => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | ');

describe('signed-in app: reading data', () => {
  it('renders real API data on the dashboard (server totals, not client sums)', async () => {
    signedIn(); mockHappyApi();
    render(<App />);
    expect(await screen.findByRole('heading', { name: /Maria/ })).toBeInTheDocument();
    expect(screen.getByText('₱12,500')).toBeInTheDocument();           // dashboard.balance from /api/dashboard
    expect(screen.getAllByText(/900.* of .*1,000/).length).toBeGreaterThan(0); // goals totals from /api/dashboard
    expect(api.dashboard).toHaveBeenCalledWith('tok', expect.any(String));
    expect(api.transactions).toHaveBeenCalledWith('tok', { limit: 6 });
  });

  it('shows a retryable error (not an empty dashboard) when the API is unreachable', async () => {
    signedIn(); mockHappyApi();
    api.dashboard.mockRejectedValueOnce(new ApiError('Unable to connect to IponWise. Check your connection and try again.', { kind: 'network', retryable: true }));
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn’t load your savings/);
    expect(screen.getByText(/Unable to connect to IponWise/)).toBeInTheDocument();
    expect(screen.queryByText('No savings goals yet')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('₱12,500')).toBeInTheDocument();
  });

  it('distinguishes an empty account from a failure', async () => {
    signedIn(); mockHappyApi({ goals: [], transactions: [], dashboard: { ...dashboard, balance: 0, goal_count: 0, goals_saved: 0, goals_target: 0, transaction_count: 0 } });
    render(<App />);
    expect(await screen.findByText('No savings goals yet')).toBeInTheDocument();
    expect(screen.getByText('No transactions yet')).toBeInTheDocument();
    expect(screen.queryByText(/Couldn’t load/)).not.toBeInTheDocument();
  });

  it('keeps the app usable when an optional section (wallets) fails, and offers a retry there', async () => {
    signedIn(); mockHappyApi();
    api.wallets.mockRejectedValue(new ApiError('Something went wrong on our side. Please try again.', { kind: 'server', status: 500 }));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('₱12,500');
    await user.click(screen.getByRole('button', { name: 'Wallets & accounts' }));
    expect(await screen.findByText('Couldn’t load your accounts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('uses the primary navigation without a redundant back button', async () => {
    signedIn(); mockHappyApi();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('₱12,500');
    await user.click(screen.getByRole('button', { name: 'Savings goals' }));
    expect(await screen.findByRole('heading', { name: 'Savings goals' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dashboard' }));
    expect(await screen.findByText('₱12,500')).toBeInTheDocument();
  });

  it('transactions page shows a load error distinctly from “No transactions yet”', async () => {
    signedIn(); mockHappyApi();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('₱12,500');
    api.transactions.mockRejectedValue(new ApiError('Something went wrong on our side. Please try again.', { kind: 'server', status: 500 }));
    await user.click(screen.getByRole('button', { name: 'Transactions' }));
    expect(await screen.findByText('Couldn’t load transactions')).toBeInTheDocument();
    expect(screen.queryByText('No transactions yet')).not.toBeInTheDocument();
  });

  it('transactions page sends filters to the server (not a client-side filter of 100 rows)', async () => {
    signedIn(); mockHappyApi();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('₱12,500');
    await user.click(screen.getByRole('button', { name: 'Transactions' }));
    await screen.findByText('Weekly allowance');
    await user.selectOptions(screen.getByLabelText('Type'), 'withdrawal');
    await waitFor(() => expect(api.transactions).toHaveBeenLastCalledWith('tok', expect.objectContaining({ type: 'withdrawal', limit: 26, offset: 0 })));
  });
});

describe('create / update / delete feedback', () => {
  it('creates a goal: calls the API, shows success only after it resolves, refreshes server data and closes the dialog', async () => {
    signedIn(); mockHappyApi();
    let release; api.createGoal.mockReturnValue(new Promise((r) => { release = r; }));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('₱12,500');
    await user.click(screen.getByRole('button', { name: 'New goal' }));
    await user.type(await screen.findByLabelText('Goal name'), 'School fees');
    await user.type(screen.getByLabelText('Target amount'), '15000');
    await user.click(screen.getByRole('button', { name: 'Create goal' }));
    await waitFor(() => expect(api.createGoal).toHaveBeenCalledOnce());
    expect(api.createGoal.mock.calls[0][1]).toMatchObject({ name: 'School fees', target: 15000, priority: 'normal', contributionFrequency: 'monthly', saved: 0 });
    expect(toastText()).not.toMatch(/created/i);                         // not yet confirmed
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const goalsCallsBefore = api.goals.mock.calls.length;
    release({ id: 'g2' });
    await waitFor(() => expect(toastText()).toMatch(/Savings goal created successfully/));
    expect(api.goals.mock.calls.length).toBeGreaterThan(goalsCallsBefore); // authoritative refresh
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('a rejected goal contribution shows the reason inline, no success toast, and keeps the dialog open', async () => {
    signedIn(); mockHappyApi();
    api.createTransaction.mockRejectedValue(new ApiError('This contribution would exceed the savings goal target.', { kind: 'client', status: 400 }));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('₱12,500');
    await user.click(screen.getByRole('button', { name: 'Add money' }));
    await user.type(await screen.findByLabelText('Amount'), '50');
    await user.click(screen.getByRole('button', { name: 'Add contribution' }));
    expect(await screen.findByText('This contribution would exceed the savings goal target.')).toBeInTheDocument();
    expect(toastText()).not.toMatch(/Added|recorded|success/i);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('a network failure while recording a deposit toasts an error (never success) and warns it may have been saved', async () => {
    signedIn(); mockHappyApi();
    api.createTransaction.mockRejectedValue(new ApiError('Unable to connect to IponWise. Check your connection and try again.', { kind: 'network', retryable: true }));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('₱12,500');
    await user.click(screen.getByRole('button', { name: 'Add transaction' }));
    await user.type(await screen.findByLabelText('Amount'), '100');
    await user.click(screen.getByRole('button', { name: 'Record deposit' }));
    await waitFor(() => expect(document.querySelector('.toast-error')).toBeInTheDocument());
    expect(document.querySelector('.toast-error')).toHaveTextContent(/Unable to connect to IponWise/);
    expect(document.querySelector('.toast-error')).toHaveTextContent(/before trying again, in case it was saved/);
    expect(document.querySelector('.toast-success')).not.toBeInTheDocument();
    expect(api.createTransaction).toHaveBeenCalledTimes(1);                // no automatic retry
  });

  it('records a deposit: success toast names what happened', async () => {
    signedIn(); mockHappyApi();
    api.createTransaction.mockResolvedValue({ id: 't9' });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('₱12,500');
    await user.click(screen.getByRole('button', { name: 'Add transaction' }));
    await user.type(await screen.findByLabelText('Amount'), '250');
    await user.click(screen.getByRole('button', { name: 'Record deposit' }));
    await waitFor(() => expect(toastText()).toMatch(/Your deposit has been recorded/));
    expect(api.createTransaction.mock.calls[0][1]).toMatchObject({ type: 'deposit', amount: 250, goalId: null });
  });

  it('deleting a transaction asks for confirmation naming the record, and only deletes on confirm', async () => {
    signedIn(); mockHappyApi();
    api.deleteTransaction.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('₱12,500');
    await user.click(screen.getByRole('button', { name: 'Transactions' }));
    await user.click(await screen.findByRole('button', { name: 'Delete Weekly allowance' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/Weekly allowance/)).toBeInTheDocument();
    expect(api.deleteTransaction).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.deleteTransaction).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Delete Weekly allowance' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.deleteTransaction).toHaveBeenCalledWith('tok', 't1'));
    await waitFor(() => expect(toastText()).toMatch(/Transaction deleted successfully/));
  });

  it('a failed delete shows an error and never a success message', async () => {
    signedIn(); mockHappyApi();
    api.deleteTransaction.mockRejectedValue(new ApiError('This change would make your recorded balance negative.', { kind: 'client', status: 400 }));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('₱12,500');
    await user.click(screen.getByRole('button', { name: 'Transactions' }));
    await user.click(await screen.findByRole('button', { name: 'Delete Weekly allowance' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(document.querySelector('.toast-error')).toBeInTheDocument());
    expect(document.querySelector('.toast-error')).toHaveTextContent(/negative/);
    expect(toastText()).not.toMatch(/deleted successfully/);
  });

  it('reminders: completing and pausing confirm the new state after the server responds', async () => {
    signedIn();
    const reminder = { id: 'r1', title: 'Friday deposit', detail: '', time: 'Every Friday', active: true, kind: 'deposit', dueDate: null, completed: false };
    mockHappyApi({ reminders: [reminder] });
    api.updateReminder.mockResolvedValue({ ...reminder, active: false });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('₱12,500');
    await user.click(screen.getByRole('button', { name: 'Reminders' }));
    await user.click(await screen.findByRole('switch', { name: 'Pause Friday deposit' }));
    await waitFor(() => expect(toastText()).toMatch(/Reminder paused/));
    expect(api.updateReminder).toHaveBeenCalledWith('tok', 'r1', { active: false });
  });

  it('settings: saving a preference shows the success message only after the profile PATCH resolves', async () => {
    signedIn(); mockHappyApi();
    api.updateProfile.mockResolvedValue({ ...profile, currency_code: 'USD' });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('₱12,500');
    await user.click(screen.getByRole('button', { name: 'Profile & settings' }));
    await user.selectOptions(await screen.findByLabelText('Currency'), 'USD');
    await waitFor(() => expect(toastText()).toMatch(/Your preferences have been saved/));
    expect(api.updateProfile).toHaveBeenCalledWith('tok', { currency_code: 'USD' });
  });
});

describe('session handling', () => {
  it('an expired session (401) signs out locally, tells the user, and returns to the sign-in page', async () => {
    signedIn(); mockHappyApi();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('₱12,500');
    api.createTransaction.mockRejectedValue(new ApiError('Your session has expired. Please sign in again.', { kind: 'auth', status: 401 }));
    auth.signOut.mockImplementation(async () => { auth.listeners.forEach((l) => l('SIGNED_OUT', null)); return { error: null }; });
    await user.click(screen.getByRole('button', { name: 'Add transaction' }));
    await user.type(await screen.findByLabelText('Amount'), '10');
    await user.click(screen.getByRole('button', { name: 'Record deposit' }));
    await waitFor(() => expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' }));
    expect(toastText()).toMatch(/Your session has expired/);
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.queryByText('₱12,500')).not.toBeInTheDocument();       // private data cleared
  });

  it('sign out shows the success message and returns to the auth screen', async () => {
    signedIn(); mockHappyApi();
    auth.signOut.mockImplementation(async () => { auth.listeners.forEach((l) => l('SIGNED_OUT', null)); return { error: null }; });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('₱12,500');
    await user.click(screen.getByRole('button', { name: /Maria Santos/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(toastText()).toMatch(/signed out securely/));
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.queryByText('₱12,500')).not.toBeInTheDocument();
  });

  it('a failed sign-out is reported honestly and the user stays signed in', async () => {
    signedIn(); mockHappyApi();
    auth.signOut.mockResolvedValue({ error: new Error('Failed to fetch') });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('₱12,500');
    await user.click(screen.getByRole('button', { name: /Maria Santos/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(document.querySelector('.toast-error')).toBeInTheDocument());
    expect(document.querySelector('.toast-error')).toHaveTextContent(/couldn’t sign you out/);
    expect(screen.getByText('₱12,500')).toBeInTheDocument();
  });
});

describe('authentication page', () => {
  it('validates fields inline and does not call Supabase when invalid', async () => {
    signedOut();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(/Enter a valid email/)).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('failed login shows the required error toast; successful login shows the welcome toast', async () => {
    signedOut();
    auth.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } }).mockResolvedValueOnce({ error: null });
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('Email'), 'maria@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrongpass');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(toastText()).toMatch(/We couldn’t sign you in\. Check your credentials and try again\./));
    expect(document.querySelector('.toast-success')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(toastText()).toMatch(/Welcome back! You’re signed in\./));
  });

  it('registration explains email verification instead of pretending the user is signed in', async () => {
    signedOut();
    auth.signUp.mockResolvedValue({ data: { user: { identities: [{ id: 'i' }] }, session: null }, error: null });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Create an account' }));
    await user.type(screen.getByLabelText('Full name'), 'Maria Santos');
    await user.type(screen.getByLabelText('Email'), 'maria@example.com');
    await user.type(screen.getByLabelText('Password'), 'longenough1');
    await user.type(screen.getByLabelText('Confirm password'), 'longenough1');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(toastText()).toMatch(/Check your inbox and verify your email/));
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('registering an existing email warns rather than claiming the account was created', async () => {
    signedOut();
    auth.signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Create an account' }));
    await user.type(screen.getByLabelText('Full name'), 'Maria Santos');
    await user.type(screen.getByLabelText('Email'), 'maria@example.com');
    await user.type(screen.getByLabelText('Password'), 'longenough1');
    await user.type(screen.getByLabelText('Confirm password'), 'longenough1');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(document.querySelector('.toast-warning')).toHaveTextContent(/already exists/));
    expect(toastText()).not.toMatch(/has been created/);
  });

  it('password reset shows an accurate message and returns to sign-in', async () => {
    signedOut();
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Forgot password?' }));
    await user.type(screen.getByLabelText('Email'), 'maria@example.com');
    await user.click(screen.getByRole('button', { name: 'Request reset link' }));
    await waitFor(() => expect(toastText()).toMatch(/Password reset instructions have been requested/));
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('shows a clear OAuth error when the provider is not enabled, and cleans the URL', async () => {
    signedOut();
    window.history.replaceState({}, '', '/?error=server_error&error_code=validation_failed&error_description=Unsupported+provider%3A+provider+is+not+enabled');
    sessionStorage.setItem('iponwise-oauth-provider', 'facebook');
    render(<App />);
    await waitFor(() => expect(document.querySelector('.toast-error')).toHaveTextContent(/Facebook sign-in isn’t enabled/));
    expect(window.location.search).toBe('');
  });

  it('a Google sign-in request failure is explained, not silently ignored', async () => {
    signedOut();
    auth.signInWithOAuth.mockResolvedValue({ error: { message: 'Failed to fetch' } });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Google/ }));
    await waitFor(() => expect(document.querySelector('.toast-error')).toBeInTheDocument());
    expect(auth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google' }));
    expect(document.querySelector('.toast-success')).not.toBeInTheDocument();
  });
});
