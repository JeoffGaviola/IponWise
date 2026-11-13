/**
 * E-wallet QR support. A "QR Ph"/EMVCo payment QR identifies an ACCOUNT (provider, name, reference).
 * It can never reveal a balance, and IponWise never tries to: after scanning, the person types the balance
 * they see in their own wallet app. Decoding and parsing happen entirely in the browser.
 */
import jsQR from 'jsqr';

export type EmvField = { tag: string; value: string };

/** Parse EMVCo TLV (2-digit tag, 2-digit length, value). Returns null if the structure is not valid. */
export function parseTlv(payload: string): EmvField[] | null {
  const fields: EmvField[] = [];
  let i = 0;
  while (i < payload.length) {
    if (i + 4 > payload.length) return null;
    const tag = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(len) || !/^\d{2}$/.test(payload.slice(i + 2, i + 4))) return null;
    if (i + 4 + len > payload.length) return null;
    fields.push({ tag, value: payload.slice(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  return fields;
}

/** CRC-16/CCITT-FALSE over everything up to and including the "6304" prefix, as EMVCo specifies. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function crcMatches(payload: string): boolean {
  const at = payload.lastIndexOf('6304');
  if (at < 0 || payload.length !== at + 8) return false;
  return crc16(payload.slice(0, at + 4)) === payload.slice(at + 4).toUpperCase();
}

/** Issuer codes (BIC) that map to a provider name. Shown only as a *suggestion* the person can change. */
const ISSUERS: Array<[RegExp, string, 'ewallet' | 'bank']> = [
  [/^GXCH/i, 'GCash', 'ewallet'],
  [/^PAPH/i, 'Maya', 'ewallet'],
  [/^BNOR/i, 'BDO', 'bank'],
  [/^BOPI/i, 'BPI', 'bank'],
  [/^MBTC/i, 'Metrobank', 'bank'],
  [/^UBPH/i, 'UnionBank', 'bank'],
];
const NAME_HINTS: Array<[RegExp, string, 'ewallet' | 'bank']> = [
  [/gcash|g-xchange/i, 'GCash', 'ewallet'], [/maya|paymaya/i, 'Maya', 'ewallet'], [/shopee/i, 'ShopeePay', 'ewallet'],
  [/grab/i, 'GrabPay', 'ewallet'], [/coins/i, 'Coins.ph', 'ewallet'], [/bdo/i, 'BDO', 'bank'], [/bpi/i, 'BPI', 'bank'],
];

export type ScannedWallet = {
  valid: boolean;                 // structurally an EMVCo payment QR
  crcOk: boolean;                 // checksum matches (guards against misreads)
  provider: string;               // suggestion; '' when unknown
  kind: 'ewallet' | 'bank';
  displayName: string;            // merchant / account name printed in the QR (tag 59)
  accountTail: string;            // last ≤4 chars of the account reference, if one was present
  currency: string;               // 'PHP' when tag 53 = 608
  issuerCode: string;
  notes: string[];
};

const CURRENCIES: Record<string, string> = { '608': 'PHP', '840': 'USD', '702': 'SGD', '036': 'AUD', '978': 'EUR', '826': 'GBP' };

/** Turns the text inside a payment QR into what IponWise can safely pre-fill. Never throws. */
export function parseWalletQr(raw: string): ScannedWallet {
  const empty: ScannedWallet = { valid: false, crcOk: false, provider: '', kind: 'ewallet', displayName: '', accountTail: '', currency: '', issuerCode: '', notes: [] };
  const payload = String(raw ?? '').trim();
  const fields = payload.startsWith('000201') ? parseTlv(payload) : null;
  if (!fields) return { ...empty, notes: ['This doesn’t look like a payment QR code.'] };

  const get = (tag: string) => fields.find((f) => f.tag === tag)?.value || '';
  const crcOk = crcMatches(payload);
  const merchantInfo = fields.filter((f) => Number(f.tag) >= 26 && Number(f.tag) <= 51);

  let issuerCode = '';
  let accountTail = '';
  let uniqueId = '';
  for (const info of merchantInfo) {
    const subs = parseTlv(info.value) || [];
    const id = subs.find((s) => s.tag === '00')?.value || '';
    if (!uniqueId) uniqueId = id;
    for (const s of subs) {
      if (s.tag === '00') continue;
      if (!issuerCode && /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/i.test(s.value)) issuerCode = s.value.toUpperCase();
      else if (!accountTail && /^\d{6,}$/.test(s.value)) accountTail = s.value.slice(-4);
    }
  }
  const displayName = get('59').trim();
  const issuer = ISSUERS.find(([re]) => re.test(issuerCode)) || NAME_HINTS.find(([re]) => re.test(`${displayName} ${uniqueId}`));
  const notes: string[] = [];
  if (!crcOk) notes.push('The QR’s checksum doesn’t match, so it may have been scanned imperfectly. Please double-check the details below.');
  if (!issuer) notes.push('We couldn’t tell which provider this is — please choose it yourself.');
  return {
    valid: true, crcOk, provider: issuer?.[1] || '', kind: issuer?.[2] || 'ewallet', displayName, accountTail,
    currency: CURRENCIES[get('53')] || '', issuerCode, notes,
  };
}

/** Decode a QR from raw RGBA pixels (used for camera frames and uploaded screenshots). */
export function decodeQrPixels(data: Uint8ClampedArray, width: number, height: number): string | null {
  return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

/** Decode a QR from an image file (e.g. a screenshot of the wallet's "Receive" QR). */
export async function decodeQrFromFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return decodeQrPixels(image.data, image.width, image.height);
}

export const cameraSupported = (): boolean => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
