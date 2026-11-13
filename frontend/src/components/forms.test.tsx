import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './Modal.tsx';
import { GoalModal, GoalMoneyModal, TransactionModal } from './forms.tsx';
import { ApiError } from '../lib/errors.ts';

const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const goals = [{ id: 'g1', name: 'Emergency fund', category: 'Emergency fund', target: 1000, saved: 900, priority: 'essential' }];

describe('GoalModal', () => {
  it('explains that already-saved money becomes an opening deposit', () => {
    render(<GoalModal onSubmit={vi.fn()} onClose={() => {}} />);
    expect(screen.getByText('Recorded as an opening deposit linked to this goal.')).toBeInTheDocument();
  });

  it('rejects an invalid goal, shows field errors, and never calls the API', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<GoalModal onSubmit={onSubmit} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Create goal' }));
    expect(await screen.findByText(/Give your goal a name/)).toBeInTheDocument();
    expect(screen.getByText(/Enter target amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Goal name')).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('only needs a name and a target for a basic goal, and submits the planning fields', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<GoalModal onSubmit={onSubmit} onClose={() => {}} />);
    await user.type(screen.getByLabelText('Goal name'), 'School fees');
    await user.type(screen.getByLabelText('Target amount'), '15000');
    await user.selectOptions(screen.getByLabelText('Priority'), 'essential');
    await user.click(screen.getByRole('button', { name: 'Create goal' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: 'School fees', target: '15000', priority: 'essential', contributionFrequency: 'monthly', deadline: '' });
  });

  it('prevents double submission while the request is in flight and keeps the button size stable', async () => {
    const gate = deferred();
    const onSubmit = vi.fn().mockReturnValue(gate.promise);
    const user = userEvent.setup();
    render(<GoalModal onSubmit={onSubmit} onClose={() => {}} />);
    await user.type(screen.getByLabelText('Goal name'), 'Laptop');
    await user.type(screen.getByLabelText('Target amount'), '50000');
    const submit = screen.getByRole('button', { name: 'Create goal' });
    await user.click(submit);
    await user.click(submit);
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-busy', 'true');
    expect(submit.querySelector('.btn-content')).toBeInTheDocument(); // label stays in the DOM, so width doesn't change
    gate.resolve({ ok: true });
  });

  it('keeps the entered values and shows the server’s reason inline when the request is rejected', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, inline: true, error: new ApiError('The target cannot be lower than the amount already saved.', { kind: 'client', status: 400 }) });
    const user = userEvent.setup();
    render(<GoalModal onSubmit={onSubmit} onClose={() => {}} />);
    await user.type(screen.getByLabelText('Goal name'), 'Laptop');
    await user.type(screen.getByLabelText('Target amount'), '50000');
    await user.click(screen.getByRole('button', { name: 'Create goal' }));
    expect(await screen.findByText('The target cannot be lower than the amount already saved.')).toBeInTheDocument();
    expect(screen.getByLabelText('Goal name')).toHaveValue('Laptop');
    expect(screen.getByRole('button', { name: 'Create goal' })).toBeEnabled();
  });

  it('blocks lowering the target under the amount already saved when editing', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<GoalModal goal={{ id: 'x', name: 'Phone', category: 'Personal', target: 1000, saved: 600, priority: 'normal', contributionFrequency: 'monthly', description: '' }} onSubmit={onSubmit} onClose={() => {}} />);
    const target = screen.getByLabelText('Target amount');
    await user.clear(target); await user.type(target, '500');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/can’t be lower than the .*600 already saved/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a transparent savings plan preview from the user’s inputs', async () => {
    const user = userEvent.setup();
    render(<GoalModal onSubmit={vi.fn()} onClose={() => {}} />);
    await user.type(screen.getByLabelText('Target amount'), '6000');
    const date = new Date(); date.setMonth(date.getMonth() + 6);
    await user.type(screen.getByLabelText(/Target date/), `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
    expect(await screen.findByText(/Estimate based on your inputs/)).toBeInTheDocument();
  });

  it('sizes an emergency fund from the user’s own expenses and fills the target', async () => {
    const user = userEvent.setup();
    render(<GoalModal prefill={{ category: 'Emergency fund' }} onSubmit={vi.fn()} onClose={() => {}} />);
    await user.type(screen.getByLabelText('Monthly essential expenses'), '10000');
    expect(await screen.findByText(/3 × .*10,000/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use as target' }));
    expect(screen.getByLabelText('Target amount')).toHaveValue(30000);
  });
});

describe('TransactionModal', () => {
  it('rejects a goal contribution that exceeds the goal’s remaining amount', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<TransactionModal goals={goals} onSubmit={onSubmit} onClose={() => {}} />);
    await user.type(screen.getByLabelText('Amount'), '500');
    await user.selectOptions(screen.getByLabelText(/Add to a savings goal/), 'g1');
    await user.click(screen.getByRole('button', { name: 'Record deposit' }));
    expect(await screen.findByText(/is left to reach “Emergency fund”/, { selector: '.field-error' })).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('describes a withdrawal accurately and lets it come out of a goal (emergency use)', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<TransactionModal goals={goals} onSubmit={onSubmit} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /Withdrawal/ }));
    await user.type(screen.getByLabelText('Amount'), '300');
    await user.selectOptions(screen.getByLabelText(/Take from a savings goal/), 'g1');
    await user.click(screen.getByRole('button', { name: 'Record withdrawal' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ type: 'withdrawal', goalId: 'g1', amount: '300', category: 'Emergency' });
  });
});

describe('GoalMoneyModal', () => {
  it('explains the target constraint in plain language', async () => {
    const user = userEvent.setup();
    render(<GoalMoneyModal goal={goals[0]} mode="contribute" onSubmit={vi.fn()} onClose={() => {}} />);
    await user.type(screen.getByLabelText('Amount'), '400');
    await user.click(screen.getByRole('button', { name: 'Add contribution' }));
    expect(await screen.findByText(/Only .*100.* is left to reach this goal’s target/)).toBeInTheDocument();
  });
});

describe('Modal & ConfirmDialog accessibility', () => {
  it('names the record, focuses Cancel by default, traps Tab, closes on Escape and restores focus', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    function Host() {
      return <><button>opener</button><ConfirmDialog title="Delete this transaction?" message="“Allowance” will be removed." onCancel={onCancel} onConfirm={vi.fn()} /></>;
    }
    const { unmount } = render(<Host />);
    const dialog = screen.getByRole('alertdialog', { name: 'Delete this transaction?' });
    expect(within(dialog).getByText(/“Allowance” will be removed/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.tab(); await user.tab(); await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
    unmount();
  });

  it('shows a loading destructive button and blocks dismissal while deleting', async () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog title="Delete?" message="m" busy onCancel={onCancel} onConfirm={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('btn-danger');
    await userEvent.setup().keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('Field labelling for wrapper-style inputs', () => {
  it('associates labels with the real <input> for password and search fields', async () => {
    const { Field, PasswordInput, SearchInput } = await import('./ui.tsx');
    render(<><Field label="Password" error="Too short"><PasswordInput className="control" /></Field><Field label="Search"><SearchInput className="control" /></Field></>);
    const password = screen.getByLabelText('Password');
    expect(password.tagName).toBe('INPUT');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveAccessibleDescription('Too short');
    expect(screen.getByLabelText('Search').tagName).toBe('INPUT');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
  });
});
