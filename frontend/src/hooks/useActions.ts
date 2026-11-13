import { useCallback, useMemo, useRef } from 'react';
import { api } from '../api.ts';
import { isAuthError, isNetworkError } from '../lib/errors.ts';
import { getActiveCurrency, money } from '../lib/format.ts';
import { toCsv } from '../lib/csv.ts';

const INLINE_KINDS = new Set(['validation', 'client', 'conflict']);

type ActionRunOptions = {
  success?: string | ((result: any) => string);
  errorTitle?: string;
  inline?: boolean;
  ledger?: boolean;
  reload?: string;
  mutation?: boolean;
};

/** Runs mutations once, refreshes server data after success, and returns field errors to forms. */
export function useActions({ getToken, toast, data, onAuthError }) {
  const inflight = useRef(new Set());
  const dataRef = useRef(data);
  dataRef.current = data;

  const run = useCallback(async (key, fn, { success, errorTitle, inline = false, ledger = false, reload, mutation = true }: ActionRunOptions = {}) => {
    if (inflight.current.has(key)) return { ok: false, duplicate: true };
    inflight.current.add(key);
    try {
      const result = await fn(getToken());
      let refreshed = { ok: true };
      if (ledger) refreshed = (await dataRef.current.refreshLedger()) || { ok: true };
      if (reload) await dataRef.current.reloadSection(reload);
      if (success) toast.success(typeof success === 'function' ? success(result) : success);
      if (!refreshed.ok) toast.warning('Your change was saved, but the latest totals could not be refreshed. Reload the page to see them.', { key: 'refresh-failed' });
      return { ok: true, result };
    } catch (error) {
      if (isAuthError(error) && error.status === 401) { onAuthError?.(error); return { ok: false, error, handled: true }; }
      if (inline && INLINE_KINDS.has(error.kind)) return { ok: false, error, inline: true };
      if (error.kind === 'not-found') {
        toast.warning(error.message, { title: errorTitle, key: `nf:${key}` });
        if (ledger) dataRef.current.refreshLedger();
        if (reload) dataRef.current.reloadSection(reload);
        return { ok: false, error, handled: true };
      }
      // A timed-out financial mutation may have succeeded; never retry it automatically.
      const ambiguous = mutation && isNetworkError(error) && ledger;
      toast.error(ambiguous ? `${error.message} Check your recent transactions before trying again, in case it was saved.` : error.message, { title: errorTitle, key: `err:${key}` });
      return { ok: false, error, handled: true };
    } finally {
      inflight.current.delete(key);
    }
  }, [getToken, toast, onAuthError]);

  return useMemo(() => {
    const txPayload = (form) => ({ type: form.type, category: form.category, note: form.note || form.category, amount: Number(form.amount), date: form.date, goalId: form.goalId || null });
    const goalPayload = (form) => ({
      name: form.name.trim(), category: form.category, target: Number(form.target), deadline: form.deadline || null,
      priority: form.priority, description: (form.description || '').trim(), contributionFrequency: form.contributionFrequency,
    });
    const goalName = (id) => dataRef.current.goals.find((g) => g.id === id)?.name;

    return {
      run,
      createTransaction: (form) => run('tx:create', (t) => api.createTransaction(t, txPayload(form)), {
        ledger: true, inline: true, errorTitle: 'Couldn’t record transaction',
        success: () => (form.type === 'deposit'
          ? (form.goalId ? `Added ${money(form.amount)} to “${goalName(form.goalId) || 'your goal'}”.` : 'Your deposit has been recorded.')
          : 'Your withdrawal has been recorded.'),
      }),
      updateTransaction: (id, form) => run(`tx:update:${id}`, (t) => api.updateTransaction(t, id, txPayload(form)), {
        ledger: true, inline: true, errorTitle: 'Couldn’t update transaction', success: 'Transaction updated successfully.',
      }),
      deleteTransaction: (tx) => run(`tx:delete:${tx.id}`, (t) => api.deleteTransaction(t, tx.id), {
        ledger: true, errorTitle: 'Couldn’t delete transaction', success: 'Transaction deleted successfully.',
      }),
      createGoal: (form) => run('goal:create', (t) => api.createGoal(t, { ...goalPayload(form), saved: Number(form.saved || 0), color: 'blue' }), {
        ledger: true, inline: true, errorTitle: 'Couldn’t create goal', success: 'Savings goal created successfully.',
      }),
      updateGoal: (id, form) => run(`goal:update:${id}`, (t) => api.updateGoal(t, id, goalPayload(form)), {
        ledger: true, inline: true, errorTitle: 'Couldn’t update goal', success: 'Your savings goal has been updated.',
      }),
      deleteGoal: (goal) => run(`goal:delete:${goal.id}`, (t) => api.deleteGoal(t, goal.id), {
        ledger: true, errorTitle: 'Couldn’t delete goal', success: 'Savings goal deleted successfully.',
      }),
      contribute: (goal, form) => run('tx:create', (t) => api.createTransaction(t, {
        type: 'deposit', category: 'Goal contribution', note: form.note || `Contribution to ${goal.name}`, amount: Number(form.amount), date: form.date, goalId: goal.id,
      }), { ledger: true, inline: true, errorTitle: 'Couldn’t add contribution', success: `Added ${money(form.amount)} to “${goal.name}”.` }),
      useGoalFunds: (goal, form) => run('tx:create', (t) => api.createTransaction(t, {
        type: 'withdrawal', category: form.category, note: form.note || `Used from ${goal.name}`, amount: Number(form.amount), date: form.date, goalId: goal.id,
      }), { ledger: true, inline: true, errorTitle: 'Couldn’t record withdrawal', success: `Your withdrawal of ${money(form.amount)} from “${goal.name}” has been recorded.` }),

      saveReminder: (form, id) => run(`reminder:save:${id || 'new'}`, (t) => (id ? api.updateReminder(t, id, form) : api.createReminder(t, { ...form, active: true })), {
        reload: 'reminders', inline: true, errorTitle: 'Couldn’t save reminder', success: id ? 'Reminder updated successfully.' : 'Reminder created successfully.',
      }),
      setReminderActive: (reminder, active) => run(`reminder:active:${reminder.id}`, (t) => api.updateReminder(t, reminder.id, { active }), {
        reload: 'reminders', errorTitle: 'Couldn’t update reminder', success: `Reminder ${active ? 'activated' : 'paused'}.`,
      }),
      setReminderCompleted: (reminder, completed) => run(`reminder:done:${reminder.id}`, (t) => api.updateReminder(t, reminder.id, { completed }), {
        reload: 'reminders', errorTitle: 'Couldn’t update reminder', success: completed ? 'Reminder marked as complete.' : 'Reminder reopened.',
      }),
      deleteReminder: (reminder) => run(`reminder:delete:${reminder.id}`, (t) => api.deleteReminder(t, reminder.id), {
        reload: 'reminders', errorTitle: 'Couldn’t delete reminder', success: 'Reminder deleted successfully.',
      }),

      saveWallet: (form) => run(`wallet:save:${form.id || 'new'}`, (tok) => {
        const body: Record<string, unknown> = { name: form.name, provider: form.provider, kind: form.kind, currency_code: form.currencyCode, note: form.note || '' };
        // Avoid recording a balance-history entry for a rename.
        if (!form.id || form.originalBalance === undefined || Number(form.balance) !== Number(form.originalBalance)) body.balance = Number(form.balance);
        // Send only privacy-safe card or QR identifiers.
        if (!form.id) {
          if (form.source) body.source = form.source;
          if (form.cardLast4) body.card_last4 = form.cardLast4;
          if (form.cardNetwork) body.card_network = form.cardNetwork;
          if (form.accountTail) body.account_tail = form.accountTail;
        }
        return form.id ? api.updateWallet(tok, form.id, body) : api.createWallet(tok, body);
      }, { reload: 'wallets', inline: true, errorTitle: 'Couldn’t save account', success: form.id ? 'Account details updated successfully.' : form.source === 'card' ? 'Card added. Only its last 4 digits were saved.' : 'Account added successfully.' }),
      updateWalletBalance: (wallet, balance, checkIn = false) => run(`wallet:balance:${wallet.id}`, (tok) => api.updateWallet(tok, wallet.id, { balance: Number(balance) }), {
        reload: 'wallets', inline: true, errorTitle: 'Couldn’t update balance', success: checkIn ? `Thanks — ${wallet.name} is confirmed as up to date.` : `${wallet.name} balance updated.`,
      }),
      loadWalletHistory: async (wallet) => { try { return await api.walletHistory(getToken(), wallet.id); } catch (error) { if (isAuthError(error) && error.status === 401) onAuthError?.(error); throw error; } },
      deleteWallet: (wallet) => run(`wallet:delete:${wallet.id}`, (t) => api.deleteWallet(t, wallet.id), {
        reload: 'wallets', errorTitle: 'Couldn’t remove account', success: 'Account removed successfully.',
      }),

      saveProfile: (patch, message = 'Profile updated successfully.') => run('profile:save', async (t) => {
        const profile = await api.updateProfile(t, patch);
        dataRef.current.patch({ profile });
        return profile;
      }, { inline: true, errorTitle: 'Couldn’t save', success: message }),
      uploadAvatar: (file) => run('avatar:upload', async (t) => {
        const result = await api.uploadAvatar(t, file);
        dataRef.current.patch({ avatarUrl: result.avatar_url || '' });
      }, { inline: true, errorTitle: 'Couldn’t upload picture', success: 'Profile picture updated.', mutation: false }),
      deleteAvatar: () => run('avatar:delete', async (t) => { await api.deleteAvatar(t); dataRef.current.patch({ avatarUrl: '' }); },
        { errorTitle: 'Couldn’t remove picture', success: 'Profile picture removed.' }),

      exportCsv: () => run('export:csv', async (t) => {
        const rows = [];
        for (let offset = 0; ; offset += 500) {
          const page = await api.transactions(t, { limit: 500, offset, sort_by: 'date', sort_order: 'desc' });
          rows.push(...page);
          if (page.length < 500) break;
        }
        const currency = getActiveCurrency();
        const csv = toCsv([['Date', 'Type', 'Category', 'Note', `Amount (${currency})`], ...rows.map((tx) => [tx.date, tx.type, tx.category, tx.note, tx.amount])]);
        const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }));
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = 'iponwise-transactions.csv';
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return rows.length;
      }, { errorTitle: 'Export failed', success: (count) => (count ? 'Your transaction report has been exported.' : 'Export finished, but you have no transactions yet.'), mutation: false }),
    };
  }, [run]);
}
