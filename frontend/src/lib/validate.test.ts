import { describe, expect, it } from 'vitest';
import { amountError, mapFieldErrors, validateGoal, validateGoalMovement, validateReminder, validateTransaction, validateWallet } from './validate.ts';

describe('amountError', () => {
  it.each([['', 'Enter'], ['abc', 'number'], ['0', 'greater than zero'], ['-5', 'greater than zero'], ['10.999', '2 decimal']])('rejects %j', (value, text) => {
    expect(amountError(value)).toContain(text);
  });
  it('accepts valid amounts, and zero only when allowed', () => {
    expect(amountError('100')).toBe(''); expect(amountError('0.5')).toBe(''); expect(amountError('1234.56')).toBe('');
    expect(amountError('0', { allowZero: true })).toBe('');
  });
});

describe('validateTransaction', () => {
  const goals = [{ id: 'g1', name: 'Emergency fund', target: 1000, saved: 900 }];
  const base = { type: 'deposit', category: 'Allowance', amount: '50', date: '2026-10-21', note: '', goalId: '' };
  it('accepts a valid deposit', () => expect(validateTransaction(base, { goals })).toEqual({}));
  it('requires amount, category and date', () => {
    expect(Object.keys(validateTransaction({ ...base, amount: '', category: '', date: '' }, { goals })).sort()).toEqual(['amount', 'category', 'date']);
  });
  it('stops a contribution larger than the goal’s remaining amount', () => {
    expect(validateTransaction({ ...base, amount: '200', goalId: 'g1' }, { goals }).amount).toMatch(/Only .*100.* is left/);
  });
  it('stops a goal withdrawal larger than what the goal holds', () => {
    expect(validateTransaction({ ...base, type: 'withdrawal', amount: '950', goalId: 'g1' }, { goals }).amount).toMatch(/only holds/);
  });
  it('lets an edited contribution reuse its own previous amount', () => {
    const editing = { id: 't', goalId: 'g1', type: 'deposit', amount: 100 };
    expect(validateTransaction({ ...base, amount: '200', goalId: 'g1' }, { goals, editing })).toEqual({});
  });
});

describe('validateGoal', () => {
  const ok = { name: 'Rent buffer', target: '5000', saved: '', deadline: '', description: '' };
  it('accepts the minimum a user must provide: a name and a target', () => expect(validateGoal(ok, { today: '2026-10-21' })).toEqual({}));
  it('rejects short names, bad targets and past deadlines', () => {
    const errors = validateGoal({ ...ok, name: 'a', target: '0', deadline: '2026-01-01' }, { today: '2026-10-21' });
    expect(Object.keys(errors).sort()).toEqual(['deadline', 'name', 'target']);
  });
  it('rejects starting savings above the target', () => expect(validateGoal({ ...ok, saved: '6000' }, { today: '' }).saved).toMatch(/more than the target/));
  it('does not let an edit push the target below what is already saved', () => {
    expect(validateGoal({ ...ok, target: '300' }, { editing: { saved: 400 }, today: '' }).target).toMatch(/lower than/);
  });
  it('allows keeping an already-passed deadline when editing', () => {
    expect(validateGoal({ ...ok, deadline: '2026-01-01' }, { editing: { saved: 0, deadline: '2026-01-01' }, today: '2026-10-21' })).toEqual({});
  });
});

describe('validateGoalMovement', () => {
  const goal = { target: 1000, saved: 400 };
  const form = { amount: '100', date: '2026-10-21', category: 'Medical' };
  it('accepts amounts within limits', () => { expect(validateGoalMovement(goal, form, 'contribute')).toEqual({}); expect(validateGoalMovement(goal, form, 'withdraw')).toEqual({}); });
  it('explains target and balance constraints in plain language', () => {
    expect(validateGoalMovement(goal, { ...form, amount: '700' }, 'contribute').amount).toMatch(/left to reach/);
    expect(validateGoalMovement(goal, { ...form, amount: '500' }, 'withdraw').amount).toMatch(/only holds/);
  });
});

describe('reminder and wallet validation', () => {
  it('requires a title and schedule', () => expect(Object.keys(validateReminder({ title: '', time: '' })).sort()).toEqual(['time', 'title']));
  it('requires wallet name, provider and a non-negative balance', () => {
    expect(Object.keys(validateWallet({ name: '', provider: '', balance: '' })).sort()).toEqual(['balance', 'name', 'provider']);
    expect(validateWallet({ name: 'Daily', provider: 'GCash', balance: '0' })).toEqual({});
  });
});

it('maps FastAPI snake_case field names to form names', () => expect(mapFieldErrors({ goal_id: 'x', amount: 'y' })).toEqual({ goalId: 'x', amount: 'y' }));
