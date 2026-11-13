import { describe, expect, it } from 'vitest';
import { computeInsights, daysUntil, goalPercent, goalPlan, goalRemaining, goalStatus, isCompleted, sortGoals } from './goals.ts';

const today = new Date('2026-10-21T09:00:00');
const goal = (over = {}) => ({ id: 'g', name: 'Laptop', category: 'Personal', target: 1000, saved: 0, deadline: null, priority: 'normal', contributionFrequency: 'monthly', createdAt: null, ...over });

describe('goal progress', () => {
  it('floors percentages so 99.6% never displays as complete', () => {
    expect(goalPercent(goal({ saved: 996 }))).toBe(99);
    expect(goalPercent(goal({ saved: 1000 }))).toBe(100);
    expect(goalPercent(goal({ saved: 2000 }))).toBe(100);
    expect(goalPercent(goal({ target: 0 }))).toBe(0);
  });
  it('computes remaining without floating-point noise', () => {
    expect(goalRemaining(goal({ target: 0.3, saved: 0.1 }))).toBe(0.2);
    expect(goalRemaining(goal({ saved: 1500 }))).toBe(0);
    expect(isCompleted(goal({ saved: 1000 }))).toBe(true);
  });
});

describe('goalStatus', () => {
  it('flags completed, overdue, due soon, on track and no-deadline goals with distinct tones', () => {
    expect(goalStatus(goal({ saved: 1000 }), today)).toMatchObject({ key: 'completed', tone: 'success' });
    expect(goalStatus(goal({ deadline: '2026-10-10' }), today)).toMatchObject({ key: 'overdue', tone: 'error' });
    expect(goalStatus(goal({ deadline: '2026-10-30' }), today)).toMatchObject({ key: 'due-soon', tone: 'warning' });
    expect(goalStatus(goal({ deadline: '2027-06-01' }), today)).toMatchObject({ key: 'on-track', tone: 'info' });
    expect(goalStatus(goal(), today)).toMatchObject({ key: 'no-deadline', tone: 'neutral' });
  });
  it('detects goals behind a straight-line pace', () => {
    const behind = goal({ createdAt: '2026-06-01', deadline: '2026-12-01', saved: 100 });
    expect(goalStatus(behind, today)).toMatchObject({ key: 'at-risk', tone: 'warning' });
    expect(goalStatus({ ...behind, saved: 800 }, today).key).toBe('on-track');
  });
  it('counts days in whole calendar days', () => {
    expect(daysUntil('2026-10-21', today)).toBe(0);
    expect(daysUntil('2026-10-22', today)).toBe(1);
    expect(daysUntil(null, today)).toBeNull();
  });
});

describe('goalPlan', () => {
  it('uses the goal’s own schedule and returns null when there is nothing to plan', () => {
    expect(goalPlan(goal({ deadline: '2027-04-21', saved: 400 }), today)).toMatchObject({ remaining: 600, periods: 6, contribution: 100 });
    expect(goalPlan(goal({ deadline: '2027-04-21', contributionFrequency: 'weekly', target: 520 }), today).contribution).toBe(20); // 182 days = 26 weeks
    expect(goalPlan(goal(), today)).toBeNull();
    expect(goalPlan(goal({ saved: 1000, deadline: '2027-04-21' }), today)).toBeNull();
    expect(goalPlan(goal({ deadline: '2026-01-01' }), today)).toBeNull();
  });
});

describe('computeInsights', () => {
  it('only reports what the data supports and orders by severity', () => {
    const items = computeInsights([
      goal({ id: 'a', name: 'Done', saved: 1000 }),
      goal({ id: 'b', name: 'Late', deadline: '2026-10-01' }),
      goal({ id: 'c', name: 'Almost', saved: 850 }),
    ], today);
    // error first, success last; both info items (almost-done + no emergency fund) sit between them
    expect(items.map((i) => i.tone)).toEqual(['error', 'info', 'info', 'success']);
    expect(items[0].title).toMatch(/Late is past its deadline/);
    expect(items.find((i) => i.id === 'c-close').title).toBe('Almost is 85% funded');
  });
  it('invents nothing when there are no goals', () => {
    expect(computeInsights([], today)).toEqual([]);
  });
  it('suggests an emergency fund only when goals exist and none is an emergency fund', () => {
    expect(computeInsights([goal()], today).some((i) => i.id === 'no-emergency')).toBe(true);
    expect(computeInsights([goal({ category: 'Emergency fund' })], today).some((i) => i.id === 'no-emergency')).toBe(false);
  });
});

describe('sortGoals', () => {
  it('puts active essential goals first and completed goals last', () => {
    const sorted = sortGoals([goal({ id: '1', saved: 1000 }), goal({ id: '2', priority: 'optional' }), goal({ id: '3', priority: 'essential' })], today);
    expect(sorted.map((g) => g.id)).toEqual(['3', '2', '1']);
  });
});
