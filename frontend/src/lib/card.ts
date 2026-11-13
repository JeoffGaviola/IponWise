/**
 * Card helpers. Everything here runs in the browser: a typed card number is checked and then reduced to
 * { last4, network }. The full number is never sent to the API, stored, logged or kept in state after use.
 */
export type CardNetwork = 'visa' | 'mastercard' | 'amex' | 'jcb' | 'unionpay' | 'discover' | 'other';

export const NETWORK_LABELS: Record<CardNetwork, string> = {
  visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', jcb: 'JCB', unionpay: 'UnionPay', discover: 'Discover', other: 'Other / local ATM card',
};

export const digitsOnly = (value: unknown): string => String(value ?? '').replace(/\D/g, '');

export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let flip = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (flip) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    flip = !flip;
  }
  return sum % 10 === 0;
}

/** Best-effort network from the card prefix (IIN ranges). Unknown prefixes are 'other'. */
export function detectNetwork(input: string): CardNetwork {
  const d = digitsOnly(input);
  const p2 = Number(d.slice(0, 2));
  const p3 = Number(d.slice(0, 3));
  const p4 = Number(d.slice(0, 4));
  if (d.startsWith('4')) return 'visa';
  if ((p2 >= 51 && p2 <= 55) || (p4 >= 2221 && p4 <= 2720)) return 'mastercard';
  if (p2 === 34 || p2 === 37) return 'amex';
  if (p4 >= 3528 && p4 <= 3589) return 'jcb';
  if (d.startsWith('62')) return 'unionpay';
  if (d.startsWith('6011') || (p3 >= 644 && p3 <= 649) || d.startsWith('65')) return 'discover';
  return 'other';
}

/** Groups digits in 4s for display while typing: "4242424242424242" → "4242 4242 4242 4242". */
export const formatCardInput = (value: string): string => digitsOnly(value).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');

export const maskedCard = (last4: string | null | undefined): string => (last4 ? `•••• ${last4}` : '••••');

export type CardCheck =
  | { ok: true; last4: string; network: CardNetwork; mode: 'full' | 'last4' }
  | { ok: false; error: string };

/**
 * Accepts either a full number (13–19 digits, must pass the Luhn check) or just the last 4 digits —
 * the latter is for local ATM cards that are not Luhn-valid or when the person simply prefers it.
 */
export function checkCardEntry(raw: string, networkOverride?: CardNetwork | ''): CardCheck {
  const d = digitsOnly(raw);
  if (d.length === 0) return { ok: false, error: 'Enter your card number, or just its last 4 digits.' };
  if (d.length < 4) return { ok: false, error: 'Enter at least the last 4 digits.' };
  if (d.length === 4) return { ok: true, last4: d, network: networkOverride || 'other', mode: 'last4' };
  if (d.length < 13) return { ok: false, error: 'That’s too short for a full card number. Enter all digits, or only the last 4.' };
  if (d.length > 19) return { ok: false, error: 'Card numbers have at most 19 digits.' };
  if (!luhnValid(d)) return { ok: false, error: 'This number doesn’t look valid. Check for a typo, or enter only the last 4 digits.' };
  return { ok: true, last4: d.slice(-4), network: networkOverride || detectNetwork(d), mode: 'full' };
}

/** True when free text contains something shaped like a full card number (mirrors the server-side guard). */
export function containsCardNumber(text: string): boolean {
  const matches = String(text ?? '').match(/(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g) || [];
  return matches.some((m) => { const d = digitsOnly(m); return d.length >= 13 && d.length <= 19 && luhnValid(d); });
}
