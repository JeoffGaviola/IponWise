import { describe, expect, it } from 'vitest';
import { friendlyAuthError, readOAuthError } from './auth.ts';
import { NETWORK_MESSAGE } from './errors.ts';
import { toCsv } from './csv.ts';

describe('friendlyAuthError', () => {
  it('maps credential failures to the required message without revealing whether the account exists', () => {
    expect(friendlyAuthError({ message: 'Invalid login credentials' })).toBe('We couldn’t sign you in. Check your credentials and try again.');
  });
  it('explains unverified email, rate limits and network failures', () => {
    expect(friendlyAuthError({ message: 'Email not confirmed' })).toMatch(/isn’t verified/);
    expect(friendlyAuthError({ message: 'x', status: 429 })).toMatch(/Too many attempts/);
    expect(friendlyAuthError({ message: 'Failed to fetch' })).toBe(NETWORK_MESSAGE);
  });
});

describe('readOAuthError', () => {
  it('returns null for a normal page load', () => expect(readOAuthError('', '', '')).toBeNull());
  it('explains a provider that is not enabled in Supabase and names the provider', () => {
    const msg = readOAuthError('?error=server_error&error_code=validation_failed&error_description=Unsupported+provider%3A+provider+is+not+enabled', '', 'google');
    expect(msg).toMatch(/Google sign-in isn’t enabled/);
  });
  it('explains cancellation and generic failures, reading from the URL hash too', () => {
    expect(readOAuthError('', '#error=access_denied&error_description=User+denied+access', 'facebook')).toMatch(/Facebook sign-in was cancelled/);
    expect(readOAuthError('?error=server_error&error_description=boom', '', 'google')).toMatch(/Google sign-in didn’t complete: boom/);
  });
});

describe('toCsv', () => {
  it('quotes cells and neutralises spreadsheet formulas', () => {
    expect(toCsv([['a', 'b"c'], ['=SUM(A1)', '+1', '@x', '-2']])).toBe('"a","b""c"\r\n"\'=SUM(A1)","\'+1","\'@x","\'-2"');
  });
});
