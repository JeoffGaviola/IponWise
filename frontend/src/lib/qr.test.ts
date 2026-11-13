import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { crc16, crcMatches, decodeQrPixels, parseTlv, parseWalletQr } from './qr.ts';

const tlv = (tag: string, value: string) => `${tag}${String(value.length).padStart(2, '0')}${value}`;
/** Builds a structurally valid EMVCo payload with a correct CRC, like a QR Ph "receive money" code. */
function payload({ bic = 'GXCHPHM2XXX', ref = '09171234567', name = 'MARIA S', corrupt = false } = {}) {
  const merchant = tlv('00', 'com.p2pqrpay') + tlv('01', bic) + tlv('02', 'P2P') + tlv('03', ref);
  const body = tlv('00', '01') + tlv('01', '11') + tlv('26', merchant) + tlv('52', '6016') + tlv('53', '608') + tlv('58', 'PH') + tlv('59', name) + tlv('60', 'BUTUAN') + '6304';
  const text = body + crc16(body);
  return corrupt ? text.slice(0, -1) + (text.endsWith('0') ? '1' : '0') : text;
}

describe('wallet QR parsing', () => {
  it('CRC-16/CCITT-FALSE matches the published check value', () => {
    expect(crc16('123456789')).toBe('29B1');
  });
  it('reads provider suggestion, name, currency and a masked account tail from a valid QR Ph payload', () => {
    const r = parseWalletQr(payload());
    expect(r).toMatchObject({ valid: true, crcOk: true, provider: 'GCash', kind: 'ewallet', displayName: 'MARIA S', accountTail: '4567', currency: 'PHP', issuerCode: 'GXCHPHM2XXX' });
    expect(r.notes).toEqual([]);
  });
  it('suggests banks for bank issuer codes', () => {
    expect(parseWalletQr(payload({ bic: 'BNORPHMMXXX' }))).toMatchObject({ provider: 'BDO', kind: 'bank' });
  });
  it('never claims a provider it cannot identify and says so', () => {
    const r = parseWalletQr(payload({ bic: 'ZZZZPHM2XXX', name: 'SOMEONE' }));
    expect(r.provider).toBe('');
    expect(r.notes.join(' ')).toMatch(/choose it yourself/);
  });
  it('warns when the checksum is wrong instead of trusting a misread', () => {
    const r = parseWalletQr(payload({ corrupt: true }));
    expect(r.valid).toBe(true);
    expect(r.crcOk).toBe(false);
    expect(r.notes.join(' ')).toMatch(/checksum/);
  });
  it('rejects things that are not payment QR codes, without throwing', () => {
    for (const junk of ['https://example.com', '', 'hello', '000201zz', '0002010199']) expect(parseWalletQr(junk).valid).toBe(false);
    expect(parseTlv('0002')).toBeNull();
    expect(crcMatches('000201')).toBe(false);
  });
  it('contains no balance: a QR identifies an account only', () => {
    expect(Object.keys(parseWalletQr(payload())).some((k) => /balance|amount|pin|cvv/i.test(k))).toBe(false);
  });
});

describe('QR image decoding (real QR image → text → parsed)', () => {
  it('decodes a rendered QR code back to the exact payload', () => {
    const text = payload();
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const size = qr.modules.size, scale = 6, quiet = 4, dim = (size + quiet * 2) * scale;
    const px = new Uint8ClampedArray(dim * dim * 4).fill(255);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (!qr.modules.get(x, y)) continue;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        const i = (((y + quiet) * scale + dy) * dim + (x + quiet) * scale + dx) * 4;
        px[i] = px[i + 1] = px[i + 2] = 0;
      }
    }
    const decoded = decodeQrPixels(px, dim, dim);
    expect(decoded).toBe(text);
    expect(parseWalletQr(decoded!).provider).toBe('GCash');
    expect(decodeQrPixels(new Uint8ClampedArray(100 * 100 * 4).fill(255), 100, 100)).toBeNull();
  });
});
