import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.ts';
import { isAuthError } from '../lib/errors.ts';
import { localDate } from '../lib/format.ts';

const EMPTY = { dashboard: null, goals: [], reminders: [], wallets: [], profile: null, report: null, recent: [], avatarUrl: '', sectionErrors: {} as Record<string, any> };
const settle = (promise) => promise.then((value) => ({ ok: true, value }), (error) => ({ ok: false, error }));

/** Loads shell data; optional sections fail independently and stale user responses are discarded. */
export function useAppData({ userId, getToken, onAuthError }) {
  const [state, setState] = useState<any>({ status: 'idle', error: null, ...EMPTY });
  const [ledgerVersion, setLedgerVersion] = useState(0);
  const generation = useRef(0);
  const authErrorRef = useRef(onAuthError);
  authErrorRef.current = onAuthError;

  const guard = useCallback((gen, error) => {
    if (gen !== generation.current) return false;
    if (isAuthError(error)) { authErrorRef.current?.(error); return false; }
    return true;
  }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    const token = getToken();
    if (!userId || !token) return;
    const gen = ++generation.current;
    if (!silent) setState((s) => ({ ...s, status: 'loading', error: null }));
    const [dashboard, goals, reminders, profile, recent, wallets, report, avatar] = await Promise.all([
      settle(api.dashboard(token, localDate())), settle(api.goals(token)), settle(api.reminders(token)), settle(api.profile(token)),
      settle(api.transactions(token, { limit: 6 })), settle(api.wallets(token)), settle(api.reports(token, localDate())), settle(api.avatar(token)),
    ]);
    if (gen !== generation.current) return;
    const failedCore = [dashboard, goals, reminders, profile, recent].find((r) => !r.ok);
    if (failedCore) {
      if (!guard(gen, failedCore.error)) return;
      setState({ status: 'error', error: failedCore.error, ...EMPTY, sectionErrors: {} });
      return;
    }
    const authFailure = [wallets, report, avatar].find((r) => !r.ok && isAuthError(r.error));
    if (authFailure) { guard(gen, authFailure.error); return; }
    setState({
      status: 'ready', error: null,
      dashboard: dashboard.value, goals: goals.value, reminders: reminders.value, profile: profile.value, recent: recent.value,
      wallets: wallets.ok ? wallets.value : [], report: report.ok ? report.value : null, avatarUrl: avatar.ok ? avatar.value.avatar_url || '' : '',
      sectionErrors: { wallets: wallets.ok ? null : wallets.error, report: report.ok ? null : report.error },
    });
    setLedgerVersion((v) => v + 1);
  }, [userId, getToken, guard]);

  useEffect(() => {
    generation.current += 1;
    if (!userId) { setState({ status: 'idle', error: null, ...EMPTY, sectionErrors: {} }); return; }
    setState({ status: 'loading', error: null, ...EMPTY, sectionErrors: {} });
    load();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshLedger = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const gen = generation.current;
    const [dashboard, goals, recent, report] = await Promise.all([
      settle(api.dashboard(token, localDate())), settle(api.goals(token)), settle(api.transactions(token, { limit: 6 })), settle(api.reports(token, localDate())),
    ]);
    if (gen !== generation.current) return;
    const failed = [dashboard, goals, recent].find((r) => !r.ok);
    if (failed) { guard(gen, failed.error); return { ok: false, error: failed.error }; }
    setState((s) => ({ ...s, dashboard: dashboard.value, goals: goals.value, recent: recent.value, report: report.ok ? report.value : s.report }));
    setLedgerVersion((v) => v + 1);
    return { ok: true };
  }, [getToken, guard]);

  const patch = useCallback((changes) => setState((s) => ({ ...s, ...(typeof changes === 'function' ? changes(s) : changes) })), []);
  const reloadSection = useCallback(async (name) => {
    const token = getToken();
    const fetchers = { wallets: () => api.wallets(token), reminders: () => api.reminders(token), report: () => api.reports(token) };
    const result = await settle(fetchers[name]());
    if (!result.ok) { guard(generation.current, result.error); setState((s) => ({ ...s, sectionErrors: { ...s.sectionErrors, [name]: result.error } })); return result; }
    setState((s) => ({ ...s, [name]: result.value, sectionErrors: { ...s.sectionErrors, [name]: null } }));
    return result;
  }, [getToken, guard]);

  return { ...state, ledgerVersion, reload: load, refreshLedger, reloadSection, patch };
}
