import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { crc16 } from '../lib/qr.ts';
import { money } from '../lib/format.ts';
import GetStarted from './GetStarted.tsx';
import GoalIdeas from './GoalIdeas.tsx';
import SessionSplash from './SessionSplash.tsx';
import { BalanceModal, CardModal, HistoryModal, ScanWalletModal } from './walletForms.tsx';
import { GoalModal } from './forms.tsx';
import Wallets, { FundingCheck } from '../pages/Wallets.tsx';
import { passwordStrength } from '../pages/AuthPage.tsx';
import { getStartedSteps } from '../lib/onboarding.ts';
import { ideaToPrefill, GOAL_IDEAS } from '../lib/goalIdeas.ts';

afterEach(() => vi.restoreAllMocks());

const tlv = (t: string, v: string) => `${t}${String(v.length).padStart(2, '0')}${v}`;
const qrText = (bic = 'GXCHPHM2XXX') => { const body = tlv('00', '01') + tlv('01', '11') + tlv('26', tlv('00', 'com.p2pqrpay') + tlv('01', bic) + tlv('03', '09171234567')) + tlv('53', '608') + tlv('59', 'MARIA S') + '6304'; return body + crc16(body); };

describe('money formatting', () => {
  it('shows whole amounts cleanly and always two digits when there are centavos', () => {
    expect(money(12000)).toBe('₱12,000');
    expect(money(12500.5)).toBe('₱12,500.50');
    expect(money(3300.05)).toBe('₱3,300.05');
    expect(money('abc')).toBe('₱0');
  });
});

describe('Get started guide', () => {
  const steps = (over = {}) => getStartedSteps({ goals: [], wallets: [], reminders: [], dashboard: { transaction_count: 0 }, ...over });
  it('shows progress, a labelled action per step and the next best action', async () => {
    const onAction = vi.fn(); const onDismiss = vi.fn(); const user = userEvent.setup();
    render(<GetStarted steps={steps()} onAction={onAction} onDismiss={onDismiss} />);
    expect(screen.getByRole('heading', { name: 'Get started with IponWise' })).toBeInTheDocument();
    expect(screen.getByText('0 of 6')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    await user.click(screen.getByRole('button', { name: 'Add an account: Track where your money is kept' }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'account', target: 'wallets' }));
    await user.click(screen.getByRole('button', { name: 'Hide guide' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
  it('marks finished steps Done (no button) and celebrates when everything is complete', () => {
    const all = steps({ avatarUrl: 'x', goals: [{ name: 'Emergency fund', category: 'Emergency fund' }], wallets: [{}], reminders: [{}], dashboard: { transaction_count: 1 } });
    render(<GetStarted steps={all} onAction={() => {}} onDismiss={() => {}} />);
    expect(screen.getByRole('heading', { name: 'You’re all set up' })).toBeInTheDocument();
    expect(screen.getAllByText(/^Done/)).toHaveLength(6);
    expect(screen.queryByRole('button', { name: /Add an account/ })).not.toBeInTheDocument();
  });
});

describe('Goal ideas', () => {
  it('offers ideas for different life situations and filters them by theme', async () => {
    const user = userEvent.setup();
    render(<GoalIdeas onUse={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Big purchases' }));
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(expect.arrayContaining(['New laptop', 'Motorcycle', 'Car down payment']));
    await user.click(screen.getByRole('button', { name: 'School & tuition' }));
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toContain('Tuition fees');
    await user.click(screen.getByRole('button', { name: 'Emergencies & health' }));
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(expect.arrayContaining(['Emergency fund', 'Hospital bill fund']));
    expect(screen.getByRole('button', { name: 'Bills & loans' })).toHaveAttribute('aria-pressed', 'false');
  });
  it('Shuffle shows a different set; using an idea hands the form a ready-made goal', async () => {
    const onUse = vi.fn(); const user = userEvent.setup();
    render(<GoalIdeas onUse={onUse} />);
    const shown = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    const first = shown();
    await user.click(screen.getByRole('button', { name: 'Shuffle ideas' }));
    expect(shown()).not.toEqual(first);
    expect(shown().every((t) => !first.includes(t))).toBe(true);
    await user.click(screen.getAllByRole('button', { name: /^Use this idea/ })[0]);
    const arg = onUse.mock.calls[0][0];
    expect(arg).toMatchObject({ name: expect.any(String), category: expect.any(String), target: expect.any(Number) });
    expect(arg.deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('"Surprise me" picks one at random', async () => {
    const onUse = vi.fn();
    render(<GoalIdeas onUse={onUse} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Surprise me' }));
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(GOAL_IDEAS.some((i) => i.title === onUse.mock.calls[0][0].name)).toBe(true);
  });
});

describe('GoalModal planners for real-world goals', () => {
  it('a laptop idea opens with the purchase planner: down payment + extras become the target', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true }); const user = userEvent.setup();
    render(<GoalModal prefill={{ ...ideaToPrefill(GOAL_IDEAS.find((i) => i.id === 'laptop')!), target: undefined }} onSubmit={onSubmit} onClose={() => {}} />);
    expect(screen.getByLabelText('Goal name')).toHaveValue('New laptop');
    await user.type(screen.getByLabelText('Item price'), '60000');
    await user.selectOptions(screen.getByLabelText('How will you pay?'), '20');
    await user.type(screen.getByLabelText(/Extra one-off costs/), '2500');
    expect(screen.getByText(/₱12,000 \+ ₱2,500 extras/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use as target' }));
    expect(screen.getByLabelText('Target amount')).toHaveValue(14500);
  });
  it('a tuition goal sums fees per semester', async () => {
    const user = userEvent.setup();
    render(<GoalModal prefill={{ ...ideaToPrefill(GOAL_IDEAS.find((i) => i.id === 'tuition')!), target: undefined }} onSubmit={vi.fn()} onClose={() => {}} />);
    await user.type(screen.getByLabelText('Amount per payment'), '25000');
    await user.type(screen.getByLabelText('Number of payments'), '2');
    await user.click(screen.getByRole('button', { name: 'Use as target' }));
    expect(screen.getByLabelText('Target amount')).toHaveValue(50000);
  });
});

describe('ATM / debit card (privacy by design)', () => {
  const fillCard = async (user: any, number: string) => {
    await user.type(screen.getByLabelText(/Card number or last 4 digits/), number);
    await user.type(screen.getByLabelText('Card name'), 'Payroll ATM');
    await user.type(screen.getByLabelText('Bank or issuer'), 'BDO');
    await user.type(screen.getByLabelText(/Balance/), '12500.50');
  };
  it('sends only the last 4 digits and the network — never the full number', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true }); const user = userEvent.setup();
    render(<CardModal onSubmit={onSubmit} onClose={() => {}} />);
    await fillCard(user, '4242424242424242');
    expect(screen.getByText('Visa •••• 4242')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add card' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).toMatchObject({ source: 'card', kind: 'atm', cardLast4: '4242', cardNetwork: 'visa', provider: 'BDO', name: 'Payroll ATM' });
    expect(JSON.stringify(payload)).not.toMatch(/4242\s?4242/);
    expect(Object.keys(payload).some((k) => /cvv|pin|expiry|number|otp/i.test(k))).toBe(false);
  });
  it('accepts just the last 4 digits for local ATM cards', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true }); const user = userEvent.setup();
    render(<CardModal onSubmit={onSubmit} onClose={() => {}} />);
    await fillCard(user, '9876');
    await user.click(screen.getByRole('button', { name: 'Add card' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ cardLast4: '9876', cardNetwork: 'other' });
  });
  it('rejects a mistyped number and puts the card number nowhere in the name', async () => {
    const onSubmit = vi.fn(); const user = userEvent.setup();
    render(<CardModal onSubmit={onSubmit} onClose={() => {}} />);
    await fillCard(user, '4242424242424241');
    await user.click(screen.getByRole('button', { name: 'Add card' }));
    expect(await screen.findByText(/doesn’t look valid/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('Card name')); await user.type(screen.getByLabelText('Card name'), '4242 4242 4242 4242');
    await user.click(screen.getByRole('button', { name: 'Add card' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('disables browser autofill and states what is not collected', () => {
    render(<CardModal onSubmit={vi.fn()} onClose={() => {}} />);
    expect(screen.getByLabelText(/Card number or last 4 digits/)).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByText(/never asks for your PIN, CVV, password or one-time codes/)).toBeInTheDocument();
  });
});

describe('Scan an e-wallet QR', () => {
  const pasteAndRead = async (user: any, text: string) => {
    await user.click(screen.getByText('Trouble scanning? Paste the QR text'));
    fireEvent.change(screen.getByLabelText('QR code text'), { target: { value: text } });
    await user.click(screen.getByRole('button', { name: 'Read this text' }));
  };
  it('turns a payment QR into a pre-filled account; the balance is typed by the person', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true }); const user = userEvent.setup();
    render(<ScanWalletModal onSubmit={onSubmit} onClose={() => {}} />);
    expect(screen.getByText(/A QR code only identifies an account/)).toBeInTheDocument();
    await pasteAndRead(user, qrText());
    expect(await screen.findByText(/looks like GCash/)).toBeInTheDocument();
    expect(screen.getByLabelText('Provider')).toHaveValue('GCash');
    expect(screen.getByLabelText(/Reference ending/)).toHaveValue('4567');
    await user.type(screen.getByLabelText('Balance in GCash'), '3200');
    await user.click(screen.getByRole('button', { name: 'Add account' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ source: 'qr', provider: 'GCash', kind: 'ewallet', balance: '3200', accountTail: '4567' });
  });
  it('requires a balance and explains a QR that is not a payment code', async () => {
    const onSubmit = vi.fn(); const user = userEvent.setup();
    render(<ScanWalletModal onSubmit={onSubmit} onClose={() => {}} />);
    await pasteAndRead(user, 'https://example.com');
    expect(await screen.findByText(/doesn’t look like an e-wallet or bank payment QR/)).toBeInTheDocument();
    await pasteAndRead(user, qrText('ZZZZPHM2XXX'));
    expect(await screen.findByText(/choose it yourself/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add account' }));
    expect(await screen.findByText(/Choose or type the provider/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('Balance updates and history', () => {
  const wallet = { id: 'w1', name: 'GCash wallet', balance: 3200, currencyCode: 'PHP', lastCheckedAt: new Date().toISOString() };
  it('saves a new balance, or confirms the same one as a check-in', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true }); const user = userEvent.setup();
    render(<BalanceModal wallet={wallet} onSubmit={onSubmit} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Save new balance' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'It’s still correct' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(wallet, 3200, true));
  });
  it('records a changed balance as an update', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true }); const user = userEvent.setup();
    render(<BalanceModal wallet={wallet} onSubmit={onSubmit} onClose={() => {}} />);
    await user.clear(screen.getByLabelText('Current balance')); await user.type(screen.getByLabelText('Current balance'), '2800');
    expect(screen.getByRole('button', { name: 'It’s still correct' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Save new balance' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(wallet, 2800, false));
  });
  it('history lists changes newest first, and reports a load failure with a retry', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([
      { balance: 2800, reason: 'update', recordedAt: '2026-10-20T10:00:00Z' }, { balance: 3200, reason: 'created', recordedAt: '2026-10-01T10:00:00Z' }]);
    const user = userEvent.setup();
    render(<HistoryModal wallet={wallet} load={load} onClose={() => {}} />);
    expect(await screen.findByText('offline')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Try again|Retry/i }));
    const rows = await screen.findAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('₱2,800'); expect(rows[0]).toHaveTextContent('−₱400');
    expect(rows[1]).toHaveTextContent('Added');
  });
});

describe('Wallets page', () => {
  const base = { error: null, onRetry: () => {}, onAdd: vi.fn(), onScan: vi.fn(), onAddCard: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onUpdateBalance: vi.fn(), onHistory: vi.fn() };
  const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString();
  it('offers three clear ways to add an account, and an empty state that explains tracking', async () => {
    const props = { ...base, onScan: vi.fn(), onAddCard: vi.fn(), onAdd: vi.fn() };
    render(<Wallets wallets={[]} {...props} />);
    expect(screen.getByText('No accounts added yet')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: 'Scan e-wallet QR' })[0]);
    await user.click(screen.getAllByRole('button', { name: 'Add ATM card' })[0]);
    await user.click(screen.getAllByRole('button', { name: 'Add manually' })[0]);
    expect(props.onScan).toHaveBeenCalled(); expect(props.onAddCard).toHaveBeenCalled(); expect(props.onAdd).toHaveBeenCalled();
    expect(screen.getByText(/can’t see, move or spend your money/)).toBeInTheDocument();
  });
  it('shows masked identifiers, source, freshness nudges, and never a full number', () => {
    const wallets = [
      { id: '1', name: 'Payroll ATM', provider: 'BDO', kind: 'atm', balance: 12500.5, currencyCode: 'PHP', note: '', source: 'card', cardLast4: '4242', cardNetwork: 'visa', accountTail: null, lastCheckedAt: iso(0), trend: [10000, 12500.5] },
      { id: '2', name: 'GCash wallet', provider: 'GCash', kind: 'ewallet', balance: 300, currencyCode: 'PHP', note: '', source: 'qr', cardLast4: null, cardNetwork: null, accountTail: '4567', lastCheckedAt: iso(20), trend: [] },
    ];
    render(<Wallets wallets={wallets} goalsSaved={5000} currency="PHP" {...base} />);
    expect(screen.getByText('Visa •••• 4242')).toBeInTheDocument();
    expect(screen.getByText('Ref •••• 4567')).toBeInTheDocument();
    expect(screen.getByText('Scanned from QR')).toBeInTheDocument();
    expect(screen.getByText('Checked today')).toBeInTheDocument();
    expect(screen.getByText('Not checked for 20 days')).toBeInTheDocument();
    expect(screen.getByText('1 to refresh')).toBeInTheDocument();
    expect(screen.getByText('₱12,500.50')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update balance: GCash wallet' })).toBeInTheDocument();
  });
  it('never adds balances of different currencies together', () => {
    const w = (id: string, balance: number, currencyCode: string) => ({ id, name: id, provider: 'X', kind: 'bank', balance, currencyCode, note: '', source: 'manual', lastCheckedAt: iso(0), trend: [] });
    render(<Wallets wallets={[w('a', 100, 'PHP'), w('b', 50, 'USD')]} {...base} />);
    expect(screen.getByText('Total in PHP')).toBeInTheDocument(); expect(screen.getByText('Total in USD')).toBeInTheDocument();
  });
  it('funding check says whether goal savings are backed by tracked accounts', () => {
    const w = [{ balance: 4000, currencyCode: 'PHP' }];
    const { rerender } = render(<FundingCheck wallets={w} goalsSaved={3000} currency="PHP" />);
    expect(screen.getByText('Your goal savings are backed by your accounts')).toBeInTheDocument();
    rerender(<FundingCheck wallets={w} goalsSaved={9000} currency="PHP" />);
    expect(screen.getByText('Some goal savings aren’t in a tracked account yet')).toBeInTheDocument();
    expect(screen.getByText(/₱5,000/)).toBeInTheDocument();
    rerender(<FundingCheck wallets={[]} goalsSaved={9000} currency="PHP" />);
    expect(screen.queryByLabelText('Funding check')).not.toBeInTheDocument();
  });
});

describe('Session transition and password guidance', () => {
  it('announces what is happening for each phase to screen readers', () => {
    const { rerender } = render(<SessionSplash mode="enter" />);
    expect(screen.getByRole('status', { name: 'Signing you in' })).toBeInTheDocument();
    rerender(<SessionSplash mode="leave" />);
    expect(screen.getByRole('status', { name: 'Signing you out' })).toBeInTheDocument();
    rerender(<SessionSplash mode="open" />);
    expect(screen.getByRole('status', { name: 'Opening IponWise' })).toBeInTheDocument();
  });
  it('rates password strength from length and variety', () => {
    expect(passwordStrength('').score).toBe(0);
    expect(passwordStrength('abc').label).toBe('Too weak');
    expect(passwordStrength('abcdefgh').score).toBeLessThan(3);
    expect(passwordStrength('Ipon-2026!ok').label).toBe('Strong');
  });
});
