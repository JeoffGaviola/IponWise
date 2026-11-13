import { describe, expect, it } from 'vitest';
import { calculateContribution, suggestEmergencyTarget } from './calculator.ts';

describe('calculateContribution', () => {
  it('calculates a deterministic monthly contribution', () => {
    const result = calculateContribution({
      target: 12000,
      saved: 2000,
      targetDate: '2027-01-01',
      frequency: 'monthly',
      today: new Date('2026-07-01T12:00:00'),
    });
    expect(result.remaining).toBe(10000);
    expect(result.periods).toBe(6);
    expect(result.contribution).toBeCloseTo(1666.67, 1);
  });

  it('reports completed goals without requiring a future date', () => {
    expect(calculateContribution({
      target: 1000,
      saved: 1000,
      targetDate: '2020-01-01',
      frequency: 'weekly',
      today: new Date('2026-07-01T12:00:00'),
    })).toMatchObject({ completed: true, contribution: 0, remaining: 0 });
  });

  it('rejects past dates for incomplete goals', () => {
    expect(() => calculateContribution({
      target: 1000,
      saved: 0,
      targetDate: '2020-01-01',
      frequency: 'daily',
      today: new Date('2026-07-01T12:00:00'),
    })).toThrow('future');
  });

  it('models a realistic weekly savings journey', () => {
    const result = calculateContribution({
      target: 15000,
      saved: 7500,
      targetDate: '2026-10-29',
      frequency: 'weekly',
      today: new Date('2026-10-01T12:00:00'),
    });
    expect(result.remaining).toBe(7500);
    expect(result.periods).toBe(4);
    expect(result.contribution).toBe(1875);
  });

  it('does not require contributions after a goal is fully funded', () => {
    const result = calculateContribution({
      target: 15000,
      saved: 16000,
      targetDate: '2026-10-29',
      frequency: 'monthly',
      today: new Date('2026-10-01T12:00:00'),
    });
    expect(result).toMatchObject({ completed: true, remaining: 0, contribution: 0 });
  });

  it('matches the example from the product spec: ₱30,000 target, ₱5,000 saved', () => {
    const result = calculateContribution({ target: 30000, saved: 5000, targetDate: '2027-01-01', frequency: 'monthly', today: new Date('2026-07-01T12:00:00') });
    expect(result).toMatchObject({ remaining: 25000, periods: 6, percent: 16 });
    expect(result.contribution).toBeCloseTo(4166.67, 2);
  });

  it('rounds contributions UP to the next cent so the plan always reaches the target', () => {
    const result = calculateContribution({ target: 100, saved: 0, targetDate: '2026-10-04', frequency: 'daily', today: new Date('2026-10-01T12:00:00') });
    expect(result.periods).toBe(3);
    expect(result.contribution).toBe(33.34);
    expect(result.contribution * result.periods).toBeGreaterThanOrEqual(100);
  });

  it('uses exact cent arithmetic (no floating-point drift)', () => {
    const result = calculateContribution({ target: 0.3, saved: 0.1, targetDate: '2026-10-02', frequency: 'daily', today: new Date('2026-10-01T12:00:00') });
    expect(result.remaining).toBe(0.2);
  });

  it('handles daily schedules and month-end boundaries', () => {
    expect(calculateContribution({ target: 700, saved: 0, targetDate: '2026-10-08', frequency: 'daily', today: new Date('2026-10-01T12:00:00') }).contribution).toBe(100);
    expect(calculateContribution({ target: 1000, saved: 0, targetDate: '2026-10-31', frequency: 'monthly', today: new Date('2026-10-21T12:00:00') }).periods).toBe(1);
  });

  it.each([[0, 'greater than zero'], [-5, 'greater than zero'], ['abc', 'greater than zero']])('rejects invalid target %s', (target, message) => {
    expect(() => calculateContribution({ target, saved: 0, targetDate: '2027-01-01' })).toThrow(message);
  });

  it('rejects negative savings, unknown frequencies and a missing date', () => {
    expect(() => calculateContribution({ target: 100, saved: -1, targetDate: '2027-01-01' })).toThrow('negative');
    expect(() => calculateContribution({ target: 100, saved: 0, targetDate: '2027-01-01', frequency: 'yearly' })).toThrow('daily, weekly, or monthly');
    expect(() => calculateContribution({ target: 100, saved: 0 })).toThrow('target date');
  });
});

describe('suggestEmergencyTarget', () => {
  it('multiplies the person’s own monthly essentials by their chosen coverage', () => {
    expect(suggestEmergencyTarget({ monthlyExpenses: 12500, months: 3 })).toBe(37500);
    expect(suggestEmergencyTarget({ monthlyExpenses: '10000.50', months: '6' })).toBe(60003);
  });
  it('requires real inputs rather than guessing', () => {
    expect(() => suggestEmergencyTarget({ monthlyExpenses: '', months: 3 })).toThrow('monthly essential expenses');
    expect(() => suggestEmergencyTarget({ monthlyExpenses: 100, months: 0 })).toThrow('1 and 36');
  });
});
