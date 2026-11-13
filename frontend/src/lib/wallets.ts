import { NETWORK_LABELS, maskedCard, type CardNetwork } from './card.ts';

export const WALLET_KINDS: Array<[string, string]> = [['ewallet', 'E-wallet'], ['bank', 'Bank account'], ['atm', 'ATM / debit card'], ['cash', 'Cash on hand'], ['investment', 'Investment']];
export const PROVIDER_SUGGESTIONS = ['GCash', 'Maya', 'ShopeePay', 'GrabPay', 'Coins.ph', 'BDO', 'BPI', 'Metrobank', 'UnionBank', 'Landbank', 'Security Bank', 'RCBC', 'PNB', 'China Bank', 'EastWest', 'GoTyme', 'SeaBank', 'CIMB'];
export const SOURCE_LABELS: Record<string, string> = { manual: 'Added manually', qr: 'Scanned from QR', card: 'Card' };

const DAY = 86400000;
export const daysSince = (iso: string | null | undefined, now = new Date()): number | null => {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  return Number.isNaN(then) ? null : Math.max(0, Math.floor((now.getTime() - then) / DAY));
};

/** A balance is only a snapshot, so we nudge the person when it has gone stale. */
export function freshness(wallet: { lastCheckedAt?: string | null }, now = new Date()) {
  const days = daysSince(wallet.lastCheckedAt, now);
  if (days === null) return { key: 'unknown' as const, tone: 'neutral', label: 'Not checked yet', days };
  if (days === 0) return { key: 'fresh' as const, tone: 'success', label: 'Checked today', days };
  if (days < 7) return { key: 'fresh' as const, tone: 'success', label: `Checked ${days} day${days === 1 ? '' : 's'} ago`, days };
  if (days < 14) return { key: 'aging' as const, tone: 'warning', label: `Checked ${days} days ago`, days };
  return { key: 'stale' as const, tone: 'warning', label: `Not checked for ${days} days`, days };
}

/** "Visa •••• 4242", "Ref •••• 5678" or '' — never anything that could identify the full account. */
export function identifier(wallet: { source?: string; cardLast4?: string | null; cardNetwork?: string | null; accountTail?: string | null }): string {
  if (wallet.cardLast4) return `${NETWORK_LABELS[(wallet.cardNetwork as CardNetwork) || 'other']?.split(' ')[0] || 'Card'} ${maskedCard(wallet.cardLast4)}`;
  if (wallet.accountTail) return `Ref •••• ${wallet.accountTail}`;
  return '';
}

/**
 * Is the money you've set aside for goals actually sitting in accounts you track?
 * Compared in one currency only; goals are always in the display currency.
 */
export function fundingCheck(wallets: Array<{ balance: number; currencyCode: string }>, goalsSaved: number, currency: string) {
  const tracked = Math.round(wallets.filter((w) => w.currencyCode === currency).reduce((sum, w) => sum + Number(w.balance), 0) * 100) / 100;
  const reserved = Math.round(Number(goalsSaved || 0) * 100) / 100;
  const difference = Math.round((tracked - reserved) * 100) / 100;
  const percent = reserved > 0 ? Math.min(100, Math.floor((tracked / reserved) * 100)) : 100;
  return { tracked, reserved, difference, percent, covered: tracked >= reserved, hasAccounts: wallets.some((w) => w.currencyCode === currency) };
}
