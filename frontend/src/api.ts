import { ApiError, NETWORK_MESSAGE, SESSION_EXPIRED_MESSAGE, parseDetail } from './lib/errors.ts';

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.PROD ? '' : 'http://localhost:8000')
).replace(/\/$/, '');
const DEFAULT_TIMEOUT_MS = 15000;
const UPLOAD_TIMEOUT_MS = 45000;

type RequestOptions = {
  token?: string | null;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  formData?: FormData | Blob | URLSearchParams | string | ArrayBuffer | null;
  timeout?: number;
  signal?: AbortSignal;
};

/** Authenticated API client. Requests are never retried automatically to prevent duplicate financial mutations. */
export async function request(path: string, { token, method = 'GET', body, headers = {}, formData, timeout = DEFAULT_TIMEOUT_MS, signal }: RequestOptions = {}): Promise<any> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
  } catch (error) {
    if (error?.name === 'AbortError' && !timedOut) throw error; // caller cancelled on purpose
    throw new ApiError(NETWORK_MESSAGE, { kind: timedOut ? 'timeout' : 'network', retryable: true });
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return null;

  const text = await response.text().catch(() => '');
  let payload = null;
  if (text) { try { payload = JSON.parse(text); } catch { payload = null; } }

  if (!response.ok) throw toApiError(response.status, payload);
  return payload ?? {};
}

function toApiError(status, payload) {
  const { message, fieldErrors } = parseDetail(payload?.detail);
  if (status === 401) return new ApiError(SESSION_EXPIRED_MESSAGE, { status, kind: 'auth' });
  if (status === 403) return new ApiError(message || 'You do not have permission to do that.', { status, kind: 'auth' });
  if (status === 404) return new ApiError(message || 'That record could not be found. It may have been deleted.', { status, kind: 'not-found' });
  if (status === 409) return new ApiError(message || 'This conflicts with an existing record.', { status, kind: 'conflict' });
  if (status === 422) return new ApiError(message || 'Some fields need correction.', { status, kind: 'validation', fieldErrors });
  if (status === 429) return new ApiError('Too many requests. Please wait a moment and try again.', { status, kind: 'client', retryable: true });
  if (status === 503) return new ApiError(message || 'IponWise is temporarily unavailable. Please try again shortly.', { status, kind: 'server', retryable: true });
  if (status >= 500) return new ApiError(message || 'Something went wrong on our side. Please try again.', { status, kind: 'server', retryable: true });
  // Ledger business-rule rejections are safe to show to the user.
  return new ApiError(message || 'The request could not be completed.', { status, kind: 'client' });
}

const opts = (token?: string | null, extra: Partial<RequestOptions> = {}): RequestOptions => ({ token, ...extra });
const enc = encodeURIComponent;

export const api = {
  health: () => request('/api/health', { timeout: 8000 }),
  dashboard: (token, today?: string) => request(`/api/dashboard${today ? `?today=${encodeURIComponent(today)}` : ''}`, opts(token)),
  reports: (token, today?: string) => request(`/api/reports${today ? `?today=${encodeURIComponent(today)}` : ''}`, opts(token)),
  assistant: (token, body, today?: string) => request(`/api/assistant${today ? `?today=${encodeURIComponent(today)}` : ''}`, opts(token, { method: 'POST', body, timeout: 30000 })),
  profile: (token) => request('/api/profile', opts(token)),
  adminUsers: (token) => request('/api/admin/users', opts(token)),
  removeAdminUser: (token, userId) => request(`/api/admin/users/${encodeURIComponent(userId)}`, opts(token, { method: 'DELETE' })),
  restoreAdminUser: (token, userId) => request(`/api/admin/users/${encodeURIComponent(userId)}/restore`, opts(token, { method: 'POST' })),
  updateProfile: (token, body) => request('/api/profile', opts(token, { method: 'PATCH', body })),
  avatar: (token) => request('/api/profile/avatar', opts(token)),
  uploadAvatar: (token, file) => {
    const form = new FormData();
    form.append('file', file);
    return request('/api/profile/avatar', opts(token, { method: 'PUT', formData: form, timeout: UPLOAD_TIMEOUT_MS }));
  },
  deleteAvatar: (token) => request('/api/profile/avatar', opts(token, { method: 'DELETE' })),
  transactions: (token, params: Record<string, string | number | boolean | null | undefined> = {}, extra: Partial<RequestOptions> = {}) => {
    const query = new URLSearchParams(
      Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => [key, String(value)]),
    ).toString();
    return request(`/api/transactions${query ? `?${query}` : ''}`, opts(token, extra));
  },
  createTransaction: (token, body) => request('/api/transactions', opts(token, { method: 'POST', body })),
  updateTransaction: (token, id, body) => request(`/api/transactions/${enc(id)}`, opts(token, { method: 'PUT', body })),
  deleteTransaction: (token, id) => request(`/api/transactions/${enc(id)}`, opts(token, { method: 'DELETE' })),
  goals: (token) => request('/api/goals', opts(token)),
  createGoal: (token, body) => request('/api/goals', opts(token, { method: 'POST', body })),
  updateGoal: (token, id, body) => request(`/api/goals/${enc(id)}`, opts(token, { method: 'PATCH', body })),
  deleteGoal: (token, id) => request(`/api/goals/${enc(id)}`, opts(token, { method: 'DELETE' })),
  wallets: (token) => request('/api/wallets', opts(token)),
  createWallet: (token, body) => request('/api/wallets', opts(token, { method: 'POST', body })),
  updateWallet: (token, id, body) => request(`/api/wallets/${enc(id)}`, opts(token, { method: 'PATCH', body })),
  walletHistory: (token, id) => request(`/api/wallets/${enc(id)}/history`, opts(token)),
  deleteWallet: (token, id) => request(`/api/wallets/${enc(id)}`, opts(token, { method: 'DELETE' })),
  reminders: (token) => request('/api/reminders', opts(token)),
  createReminder: (token, body) => request('/api/reminders', opts(token, { method: 'POST', body })),
  updateReminder: (token, id, body) => request(`/api/reminders/${enc(id)}`, opts(token, { method: 'PATCH', body })),
  deleteReminder: (token, id) => request(`/api/reminders/${enc(id)}`, opts(token, { method: 'DELETE' })),
};
