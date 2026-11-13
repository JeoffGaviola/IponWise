import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, request } from './api.ts';
import { ApiError } from './lib/errors.ts';

const reply = (status, body?, raw?) => Promise.resolve(new Response(status === 204 ? null : raw ?? (body === undefined ? '' : JSON.stringify(body)), { status }));
let fetchMock;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('request', () => {
  it('attaches the bearer token, JSON headers and the configured base URL', async () => {
    fetchMock.mockReturnValue(reply(200, { ok: true }));
    await api.createGoal('tok-1', { name: 'A', target: 5 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/goals');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok-1');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ name: 'A', target: 5 });
  });

  it('returns null for 204 responses (deletes)', async () => {
    fetchMock.mockReturnValue(reply(204));
    expect(await api.deleteGoal('t', 'id-1')).toBeNull();
  });

  it('builds transaction query strings and skips empty filters', async () => {
    fetchMock.mockReturnValue(reply(200, []));
    await api.transactions('t', { search: 'rent', type: '', month: '2026-10', limit: 26, offset: 0 });
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8000/api/transactions?search=rent&month=2026-10&limit=26&offset=0');
  });

  it('sends assistant questions only to the authenticated backend endpoint', async () => {
    fetchMock.mockReturnValue(reply(200, { reply: 'Your emergency fund is on track.' }));
    await expect(api.assistant('tok-1', { message: 'How is my emergency fund?', history: [] })).resolves.toEqual({ reply: 'Your emergency fund is on track.' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/assistant');
    expect(init).toMatchObject({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer tok-1' }) });
    expect(JSON.parse(init.body)).toEqual({ message: 'How is my emergency fund?', history: [] });
  });

  it('turns a 401 into an auth error with the session-expired message', async () => {
    fetchMock.mockReturnValue(reply(401, { detail: 'Invalid token' }));
    await expect(api.goals('t')).rejects.toMatchObject({ kind: 'auth', status: 401, message: 'Your session has expired. Please sign in again.' });
  });

  it('parses FastAPI validation arrays into a message and per-field errors', async () => {
    fetchMock.mockReturnValue(reply(422, { detail: [{ loc: ['body', 'target'], msg: 'Input should be greater than 0' }, { loc: ['body', 'goal_id'], msg: 'Value error, bad id' }] }));
    const error = await api.createGoal('t', {}).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.kind).toBe('validation');
    expect(error.fieldErrors).toEqual({ target: 'Input should be greater than 0', goal_id: 'bad id' });
  });

  it('surfaces readable ledger rejections from `detail` as client errors', async () => {
    fetchMock.mockReturnValue(reply(400, { detail: 'This contribution would exceed the savings goal target.' }));
    await expect(api.createTransaction('t', {})).rejects.toMatchObject({ kind: 'client', message: 'This contribution would exceed the savings goal target.' });
  });

  it.each([[404, 'not-found'], [409, 'conflict'], [500, 'server'], [503, 'server']])('classifies HTTP %i as %s', async (status, kind) => {
    fetchMock.mockReturnValue(reply(status, { detail: 'x' }));
    await expect(api.goals('t')).rejects.toMatchObject({ kind, status });
  });

  it('handles non-JSON error bodies without crashing', async () => {
    fetchMock.mockReturnValue(reply(502, undefined, '<html>Bad gateway</html>'));
    await expect(api.goals('t')).rejects.toMatchObject({ kind: 'server', status: 502, retryable: true });
  });

  it('reports an unreachable server as a network error, distinct from an empty result', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.goals('t')).rejects.toMatchObject({ kind: 'network', message: 'Unable to connect to IponWise. Check your connection and try again.' });
    fetchMock.mockReturnValue(reply(200, []));
    expect(await api.goals('t')).toEqual([]);
  });

  it('times out slow requests', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
    const pending = request('/api/goals', { token: 't', timeout: 1000 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await pending).toMatchObject({ kind: 'timeout' });
  });

  it('never retries a failed financial mutation automatically', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await api.createTransaction('t', {}).catch(() => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
