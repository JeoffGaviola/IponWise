import { describe, expect, it } from 'vitest';
import { GOAL_IDEAS, IDEA_GROUPS, dateAfterMonths, ideaToPrefill, pickRandomIdeas, shuffle } from './goalIdeas.ts';
import { validateGoal } from './validate.ts';
import { GOAL_CATEGORIES } from './goals.ts';
import { installmentTarget, purchaseTarget } from '../calculator.ts';
import { averageMonthlyDeposits, goalPace } from './goals.ts';

const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

describe('goal ideas catalogue', () => {
  it('covers the real-world goals users asked for and every group', () => {
    const titles = GOAL_IDEAS.map((i) => i.title.toLowerCase()).join(' | ');
    for (const word of ['laptop', 'car', 'motorcycle', 'hospital', 'tuition', 'loan', 'emergency', 'rent', 'wedding', 'business']) expect(titles).toContain(word);
    for (const g of IDEA_GROUPS.filter((g) => g.id !== 'all')) expect(GOAL_IDEAS.some((i) => i.group === g.id)).toBe(true);
    expect(new Set(GOAL_IDEAS.map((i) => i.id)).size).toBe(GOAL_IDEAS.length);
  });
  it('every idea produces a goal the real form validation accepts', () => {
    for (const idea of GOAL_IDEAS) {
      const p = ideaToPrefill(idea, new Date('2026-10-27T10:00:00'));
      const errors = validateGoal({ name: p.name, target: String(p.target), saved: '', deadline: p.deadline, description: p.description }, { today: '2026-10-27' });
      expect(errors, idea.id).toEqual({});
      expect(GOAL_CATEGORIES).toContain(idea.category.replace('Tuition & education', 'Tuition & education'));
    }
  });
  it('shuffle is a permutation, non-mutating, and random picks are varied and exclude what is shown', () => {
    const arr = [1, 2, 3, 4, 5, 6];
    const out = shuffle(arr, seeded(7));
    expect([...out].sort()).toEqual(arr); expect(arr).toEqual([1, 2, 3, 4, 5, 6]);
    const picks = pickRandomIdeas(6, seeded(3));
    expect(picks).toHaveLength(6);
    expect(new Set(picks.map((p) => p.group)).size).toBe(6);              // one from each group first
    const next = pickRandomIdeas(6, seeded(9), GOAL_IDEAS, picks.map((p) => p.id));
    expect(next.every((n) => !picks.some((p) => p.id === n.id))).toBe(true);
    expect(pickRandomIdeas(6, seeded(3)).map((p) => p.id)).toEqual(picks.map((p) => p.id)); // deterministic with a seed
  });
  it('adds months to a date safely', () => {
    expect(dateAfterMonths(6, new Date('2026-10-27T10:00:00'))).toBe('2027-04-27');
    expect(dateAfterMonths(12, new Date('2026-01-31T10:00:00'))).toMatch(/^2027-0[12]-/);
  });
});

describe('purchase & instalment planners (laptop, car, tuition, loan)', () => {
  it('laptop paid in full: target is the price plus extras', () => {
    expect(purchaseTarget({ price: 45000, extras: 1500 })).toMatchObject({ downPayment: 45000, target: 46500, financed: 0 });
  });
  it('car with a 20% down payment and registration/insurance extras', () => {
    expect(purchaseTarget({ price: 850000, downPaymentPercent: 20, extras: 35000 })).toEqual({ downPayment: 170000, extras: 35000, target: 205000, financed: 680000 });
  });
  it('is exact to the centavo', () => { expect(purchaseTarget({ price: 0.1, downPaymentPercent: 30, extras: 0.2 }).target).toBe(0.23); });
  it('rejects nonsense', () => {
    expect(() => purchaseTarget({ price: 0 })).toThrow(/price/);
    expect(() => purchaseTarget({ price: 100, downPaymentPercent: 0 })).toThrow(/between 1% and 100%/);
    expect(() => purchaseTarget({ price: 100, downPaymentPercent: 101 })).toThrow();
    expect(() => purchaseTarget({ price: 100, extras: -5 })).toThrow(/negative/);
  });
  it('tuition = fee × semesters, loan = amortization × months', () => {
    expect(installmentTarget({ amount: 25000, count: 2 })).toBe(50000);
    expect(installmentTarget({ amount: 3150.5, count: 12 })).toBe(37806);
    expect(() => installmentTarget({ amount: 0, count: 3 })).toThrow();
    expect(() => installmentTarget({ amount: 100, count: 1.5 })).toThrow(/whole number/);
  });
});

describe('pace insight', () => {
  const goal = { target: 12000, saved: 3000, deadline: '2027-04-27' };
  const today = new Date('2026-10-27T12:00:00');
  it('averages the last complete months, counting empty months as zero', () => {
    const monthly = [{ month: '2026-07', deposits: 3000 }, { month: '2026-09', deposits: 6000 }, { month: '2026-10', deposits: 99999 }];
    expect(averageMonthlyDeposits(monthly, 3, today)).toBe(3000);       // (Jul 3000 + Aug 0 + Sep 6000) / 3
    expect(averageMonthlyDeposits([], 3, today)).toBe(0);
  });
  it('says how long it takes and whether that beats the deadline', () => {
    expect(goalPace(goal, 1500, today)).toMatchObject({ monthsNeeded: 6, onPace: true });
    expect(goalPace(goal, 500, today)).toMatchObject({ monthsNeeded: 18, onPace: false });
    expect(goalPace({ ...goal, deadline: null }, 1500, today)).toMatchObject({ onPace: null });
    expect(goalPace(goal, 0, today)).toBeNull();
    expect(goalPace({ target: 100, saved: 100 }, 50, today)).toBeNull();
  });
});
