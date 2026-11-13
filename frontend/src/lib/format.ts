export const CURRENCIES = {
  PHP: { label: 'Philippine peso', symbol: '₱', locale: 'en-PH' },
  USD: { label: 'US dollar', symbol: '$', locale: 'en-US' },
  SGD: { label: 'Singapore dollar', symbol: 'S$', locale: 'en-SG' },
  AUD: { label: 'Australian dollar', symbol: 'A$', locale: 'en-AU' },
  EUR: { label: 'Euro', symbol: '€', locale: 'en-IE' },
  GBP: { label: 'British pound', symbol: '£', locale: 'en-GB' },
};

// The display currency is a per-user preference loaded once from the profile (see App.tsx).
let activeCurrency = 'PHP';
export const setActiveCurrency = (code) => { if (CURRENCIES[code]) activeCurrency = code; };
export const getActiveCurrency = () => activeCurrency;
export const currencySymbol = (code = activeCurrency) => CURRENCIES[code]?.symbol || code;

export function money(value, currency = activeCurrency) {
  const info = CURRENCIES[currency] || CURRENCIES.PHP;
  const amount = Number(value);
  const safe = Number.isFinite(amount) ? amount : 0;
  // Whole amounts read cleanly (₱12,000); anything with centavos always shows two digits (₱12,500.50, never ₱12,500.5).
  const hasCents = Math.round(safe * 100) % 100 !== 0;
  return new Intl.NumberFormat(info.locale, {
    style: 'currency', currency: CURRENCIES[currency] ? currency : 'PHP',
    minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2,
  }).format(safe);
}

export const pad = (n) => String(n).padStart(2, '0');
export const formatLocalDate = (value) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
export const localDate = () => formatLocalDate(new Date());

export const dateLabel = (date) => {
  if (!date) return '';
  const value = new Date(`${String(date).slice(0, 10)}T12:00:00`);
  return Number.isNaN(value.getTime()) ? '' : value.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const greeting = (hour = new Date().getHours()) => (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');

/** Parse a user-typed amount; returns NaN for empty/invalid input. */

export const initials = (name) => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'IW';
