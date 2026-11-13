import { describe, expect, it } from 'vitest';
import { checkCardEntry, containsCardNumber, detectNetwork, formatCardInput, luhnValid, maskedCard } from './card.ts';

describe('card helpers (browser-side only)', () => {
  it('Luhn accepts real-format test numbers and rejects typos', () => {
    for (const n of ['4242424242424242', '5555555555554444', '378282246310005', '3530111333300000']) expect(luhnValid(n)).toBe(true);
    expect(luhnValid('4242424242424241')).toBe(false);
    expect(luhnValid('42x2')).toBe(false);
  });
  it('detects networks from the prefix', () => {
    expect(detectNetwork('4242 4242')).toBe('visa');
    expect(detectNetwork('5555')).toBe('mastercard');
    expect(detectNetwork('2223')).toBe('mastercard');
    expect(detectNetwork('3782')).toBe('amex');
    expect(detectNetwork('3530')).toBe('jcb');
    expect(detectNetwork('6200')).toBe('unionpay');
    expect(detectNetwork('6011')).toBe('discover');
    expect(detectNetwork('9999')).toBe('other');
  });
  it('reduces a full number to last4 + network and nothing else', () => {
    const r = checkCardEntry('4242 4242 4242 4242');
    expect(r).toEqual({ ok: true, last4: '4242', network: 'visa', mode: 'full' });
    expect(JSON.stringify(r)).not.toContain('4242424242424242');
  });
  it('accepts only the last 4 digits for local ATM cards, and honours a chosen network', () => {
    expect(checkCardEntry('9876')).toEqual({ ok: true, last4: '9876', network: 'other', mode: 'last4' });
    expect(checkCardEntry('9876', 'mastercard')).toMatchObject({ network: 'mastercard' });
  });
  it('explains each kind of bad entry', () => {
    expect(checkCardEntry('')).toMatchObject({ ok: false, error: expect.stringMatching(/Enter your card number/) });
    expect(checkCardEntry('12')).toMatchObject({ ok: false, error: expect.stringMatching(/at least the last 4/) });
    expect(checkCardEntry('123456')).toMatchObject({ ok: false, error: expect.stringMatching(/too short/) });
    expect(checkCardEntry('4242424242424241')).toMatchObject({ ok: false, error: expect.stringMatching(/doesn’t look valid/) });
    expect(checkCardEntry('1'.repeat(20))).toMatchObject({ ok: false, error: expect.stringMatching(/at most 19/) });
  });
  it('formats and masks for display', () => {
    expect(formatCardInput('4242424242424242')).toBe('4242 4242 4242 4242');
    expect(formatCardInput('42-42 ab')).toBe('4242');
    expect(maskedCard('0042')).toBe('•••• 0042');
  });
  it('flags text that holds a full card number but not ordinary numbers (mirrors the server)', () => {
    expect(containsCardNumber('card 4242 4242 4242 4242')).toBe(true);
    expect(containsCardNumber('Mobile 09171234567, ref 20261025')).toBe(false);
  });
});
