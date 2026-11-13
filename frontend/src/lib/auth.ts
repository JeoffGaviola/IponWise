import { NETWORK_MESSAGE } from './errors.ts';

/** Turn raw Supabase Auth errors into clear, actionable copy. Never reveals whether an account exists. */
export function friendlyAuthError(error, context = 'signin') {
  const raw = String(error?.message || '').toLowerCase();
  const status = error?.status;
  if (/failed to fetch|network|fetch failed|load failed/.test(raw) || error?.name === 'AuthRetryableFetchError') return NETWORK_MESSAGE;
  if (/email not confirmed/.test(raw)) return 'Your email address isn’t verified yet. Check your inbox for the confirmation link, then sign in.';
  if (/invalid login credentials|invalid credentials/.test(raw)) return 'We couldn’t sign you in. Check your credentials and try again.';
  if (/rate limit|too many|over_email_send_rate_limit/.test(raw) || status === 429) return 'Too many attempts. Please wait a few minutes before trying again.';
  if (/already registered|already been registered/.test(raw)) return 'An account with this email already exists. Try signing in or resetting your password.';
  if (/password/.test(raw) && /(weak|short|least|characters)/.test(raw)) return 'Choose a stronger password with at least 8 characters.';
  if (context === 'signup') return error?.message || 'We couldn’t create your account. Please try again.';
  if (context === 'reset') return error?.message || 'We couldn’t request a password reset. Please try again.';
  return error?.message || 'We couldn’t sign you in. Check your credentials and try again.';
}

const PROVIDER_NAMES = { google: 'Google', facebook: 'Facebook' };
export const providerName = (provider) => PROVIDER_NAMES[provider] || 'Social';

/** Parse an OAuth error returned in the callback URL (query string or hash). Returns null when there is none. */
export function readOAuthError(search, hash, lastProvider) {
  const params = new URLSearchParams(`${search.replace(/^\?/, '')}&${hash.replace(/^#/, '')}`);
  const code = params.get('error_code');
  const description = params.get('error_description');
  if (!params.get('error') && !code && !description) return null;
  const provider = providerName(params.get('provider') || lastProvider);
  const text = (description || '').replace(/\+/g, ' ');
  if (/provider is not enabled|unsupported provider/i.test(text) || (code === 'validation_failed' && /not enabled/i.test(text))) {
    return `${provider} sign-in isn’t enabled for this IponWise project yet. Use email sign-in, or enable the ${provider} provider in Supabase → Authentication → Providers.`;
  }
  if (/access_denied/i.test(params.get('error') || '') || /denied|cancel/i.test(text)) {
    return `${provider} sign-in was cancelled. You can try again or use your email and password.`;
  }
  return `${provider} sign-in didn’t complete: ${text || 'the provider returned an error'}. Please try again or use your email and password.`;
}
