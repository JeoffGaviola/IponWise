/** Normalised error thrown by the API client. UI code only ever needs `message`, `status`, `kind`, `fieldErrors`. */
export type ApiErrorKind = 'network' | 'timeout' | 'auth' | 'validation' | 'conflict' | 'not-found' | 'server' | 'client' | 'unknown';
type ApiErrorOptions = { status?: number; kind?: ApiErrorKind; fieldErrors?: Record<string, string>; retryable?: boolean };

export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  readonly fieldErrors: Record<string, string>;
  readonly retryable: boolean;

  constructor(message: string, { status = 0, kind = 'unknown', fieldErrors = {}, retryable = false }: ApiErrorOptions = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    /** 'network' | 'timeout' | 'auth' | 'validation' | 'conflict' | 'not-found' | 'server' | 'client' | 'unknown' */
    this.kind = kind;
    this.fieldErrors = fieldErrors;
    this.retryable = retryable;
  }
}

/** Convert a FastAPI `detail` (string | validation array) into { message, fieldErrors }. */
export function parseDetail(detail) {
  if (typeof detail === 'string') return { message: detail, fieldErrors: {} };
  if (Array.isArray(detail)) {
    const fieldErrors = {};
    const parts = [];
    for (const item of detail) {
      const field = Array.isArray(item?.loc) ? item.loc.filter((part) => part !== 'body' && part !== 'query').join('.') : '';
      const msg = String(item?.msg || 'Invalid value.').replace(/^Value error, /, '');
      if (field && !fieldErrors[field]) fieldErrors[field] = msg;
      parts.push(field ? `${field}: ${msg}` : msg);
    }
    return { message: parts.join(' ') || 'Some fields need correction.', fieldErrors };
  }
  return { message: '', fieldErrors: {} };
}

export const isAuthError = (error) => error instanceof ApiError && error.kind === 'auth';
export const isNetworkError = (error) => error instanceof ApiError && (error.kind === 'network' || error.kind === 'timeout');

export const NETWORK_MESSAGE = 'Unable to connect to IponWise. Check your connection and try again.';
export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';
