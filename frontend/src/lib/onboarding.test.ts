import { describe, expect, it } from 'vitest';
import { getStartedSteps, progressOf } from './onboarding.ts';

describe('Get started checklist', () => {
  it('starts empty for a brand-new user with six clear, labelled steps', () => {
    const steps = getStartedSteps({});
    expect(steps).toHaveLength(6);
    expect(steps.every((s) => !s.done && s.title && s.description && s.cta)).toBe(true);
    expect(progressOf(steps)).toEqual({ done: 0, total: 6, percent: 0, complete: false });
  });
  it('derives completion from real data', () => {
    const steps = getStartedSteps({ goals: [{ name: 'Laptop', category: 'Gadgets & electronics' }], dashboard: { transaction_count: 2 }, wallets: [{}], reminders: [], avatarUrl: '' });
    const done = Object.fromEntries(steps.map((s) => [s.id, s.done]));
    expect(done).toEqual({ goal: true, deposit: true, account: true, safety: false, reminder: false, profile: false });
    expect(progressOf(steps)).toMatchObject({ done: 3, percent: 50, complete: false });
  });
  it('the safety-net step needs an emergency goal specifically', () => {
    expect(getStartedSteps({ goals: [{ name: 'Emergency fund', category: 'Emergency fund' }] }).find((s) => s.id === 'safety')!.done).toBe(true);
  });
  it('reaches complete only when everything is done', () => {
    const steps = getStartedSteps({ avatarUrl: 'x', goals: [{ name: 'Emergency fund', category: 'Emergency fund' }], wallets: [{}], reminders: [{}], dashboard: { transaction_count: 1 } });
    expect(progressOf(steps)).toEqual({ done: 6, total: 6, percent: 100, complete: true });
  });
});
