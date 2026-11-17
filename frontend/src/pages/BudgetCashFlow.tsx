import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarRange, CircleDollarSign, Plus, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { Button, Field } from '../components/ui.tsx';
import { useToast } from '../components/Toast.tsx';
import { api } from '../api.ts';
import { money } from '../lib/format.ts';

const monthValue = () => new Date().toISOString().slice(0, 7);
const emptyBudget = { category: '', limitAmount: '' };
const emptyRule = { name: '', type: 'withdrawal', category: '', amount: '', frequency: 'monthly', startDate: new Date().toISOString().slice(0, 10), endDate: '', description: '' };

export default function BudgetCashFlow({ getToken }: { getToken: () => string }) {
  const toast = useToast();
  const [month, setMonth] = useState(monthValue());
  const [budgets, setBudgets] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [forecast, setForecast] = useState<any>(null);
  const [budget, setBudget] = useState(emptyBudget);
  const [rule, setRule] = useState(emptyRule);
  const [days, setDays] = useState(30);
  const [scenario, setScenario] = useState({ purchaseAmount: '', additionalDeposit: '' });
  const [simulation, setSimulation] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const token = getToken();
    const [budgetResult, ruleResult, forecastResult] = await Promise.all([api.budgets(token, month), api.recurringRules(token), api.cashflowForecast(token, days)]);
    setBudgets(budgetResult.budgets || []);
    setRules(ruleResult || []);
    setForecast(forecastResult);
  };
  useEffect(() => { load().catch((error) => toast.error(error.message, { title: 'Couldn’t load budget data' })); }, [month, days]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalLimit = useMemo(() => budgets.reduce((sum, item) => sum + Number(item.limitAmount), 0), [budgets]);
  const totalActual = useMemo(() => budgets.reduce((sum, item) => sum + Number(item.actualAmount), 0), [budgets]);
  const saveBudget = async (event: FormEvent) => {
    event.preventDefault();
    if (!budget.category || Number(budget.limitAmount) <= 0) return;
    setBusy(true);
    try { await api.createBudget(getToken(), { ...budget, month, limitAmount: Number(budget.limitAmount) }); setBudget(emptyBudget); await load(); toast.success('Budget category added.'); } catch (error) { toast.error(error.message, { title: 'Couldn’t save budget' }); } finally { setBusy(false); }
  };
  const saveRule = async (event: FormEvent) => {
    event.preventDefault();
    if (!rule.name || !rule.category || Number(rule.amount) <= 0) return;
    setBusy(true);
    try { await api.createRecurringRule(getToken(), { ...rule, amount: Number(rule.amount), endDate: rule.endDate || null }); setRule(emptyRule); await load(); toast.success('Recurring activity added.'); } catch (error) { toast.error(error.message, { title: 'Couldn’t save recurring activity' }); } finally { setBusy(false); }
  };
  const removeBudget = async (id: string) => { try { await api.deleteBudget(getToken(), id); await load(); } catch (error) { toast.error(error.message, { title: 'Couldn’t remove budget' }); } };
  const toggleRule = async (item: any) => { try { await api.updateRecurringRule(getToken(), item.id, { active: !item.active }); await load(); } catch (error) { toast.error(error.message, { title: 'Couldn’t update schedule' }); } };
  const runSimulation = async (event: FormEvent) => {
    event.preventDefault();
    try { setSimulation(await api.simulateCashflow(getToken(), { purchaseAmount: Number(scenario.purchaseAmount || 0), additionalDeposit: Number(scenario.additionalDeposit || 0) })); } catch (error) { toast.error(error.message, { title: 'Couldn’t run simulation' }); }
  };
  const setOccurrence = async (item: any, action: 'post' | 'skip') => {
    try { await (action === 'post' ? api.postRecurringOccurrence(getToken(), item.ruleId, item.dueDate) : api.skipRecurringOccurrence(getToken(), item.ruleId, item.dueDate)); await load(); toast.success(action === 'post' ? 'Occurrence marked as posted.' : 'Occurrence skipped.'); } catch (error) { toast.error(error.message, { title: 'Couldn’t update occurrence' }); }
  };

  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Plan and protect your cash flow</p><h1>Budget & cash flow</h1><p className="muted">Actual balances come from your recorded transactions. Forecasts use only pending recurring activities.</p></div><CalendarRange size={28} aria-hidden="true" /></header>
    <section className="stats-grid grid-4">
      <article className="stat"><span className="stat-label">Monthly budget</span><strong>{money(totalLimit)}</strong><small>{month}</small></article>
      <article className="stat"><span className="stat-label">Actual withdrawals</span><strong>{money(totalActual)}</strong><small>Confirmed transactions</small></article>
      <article className="stat"><span className="stat-label">Expected deposits</span><strong>{money(forecast?.expectedDeposits || 0)}</strong><TrendingUp size={18} aria-hidden="true" /></article>
      <article className="stat"><span className="stat-label">Projected balance</span><strong>{money(forecast?.projectedBalance || 0)}</strong><small>{days}-day estimate</small></article>
    </section>

    <section className="panel stack">
      <div className="section-heading"><div><h2>Monthly budget</h2><p className="muted">Actual spending is calculated from withdrawal transactions.</p></div><input className="control" type="month" value={month} onChange={(event) => setMonth(event.target.value)} aria-label="Budget month" /></div>
      <form className="form-grid" onSubmit={saveBudget}>
        <Field label="Category"><input className="control" value={budget.category} onChange={(event) => setBudget({ ...budget, category: event.target.value })} placeholder="Food and groceries" /></Field>
        <Field label="Limit"><input className="control" type="number" min="0.01" step="0.01" value={budget.limitAmount} onChange={(event) => setBudget({ ...budget, limitAmount: event.target.value })} placeholder="0.00" /></Field>
        <Button type="submit" icon={Plus} loading={busy}>Add budget</Button>
      </form>
      <div className="data-list">{budgets.map((item) => <div className="list-row" key={item.id}><div><strong>{item.category}</strong><p className="muted">{money(item.actualAmount)} of {money(item.limitAmount)} spent · {Math.round(Number(item.usagePercent))}%</p></div><strong>{money(item.remainingAmount)}</strong><button className="icon-btn icon-btn-danger" type="button" aria-label={`Remove ${item.category} budget`} onClick={() => removeBudget(item.id)}><Trash2 size={16} /></button></div>)}</div>
    </section>

    <section className="panel stack">
      <div className="section-heading"><div><h2>Recurring activities</h2><p className="muted">Schedules are planning rules; they never create transactions automatically.</p></div></div>
      <form className="form-grid" onSubmit={saveRule}>
        <Field label="Activity name"><input className="control" value={rule.name} onChange={(event) => setRule({ ...rule, name: event.target.value })} placeholder="Electricity bill" /></Field>
        <Field label="Type"><select className="control" value={rule.type} onChange={(event) => setRule({ ...rule, type: event.target.value })}><option value="withdrawal">Withdrawal</option><option value="deposit">Deposit</option></select></Field>
        <Field label="Category"><input className="control" value={rule.category} onChange={(event) => setRule({ ...rule, category: event.target.value })} placeholder="Utilities" /></Field>
        <Field label="Amount"><input className="control" type="number" min="0.01" step="0.01" value={rule.amount} onChange={(event) => setRule({ ...rule, amount: event.target.value })} placeholder="0.00" /></Field>
        <Field label="Frequency"><select className="control" value={rule.frequency} onChange={(event) => setRule({ ...rule, frequency: event.target.value })}><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></Field>
        <Field label="Start date"><input className="control" type="date" value={rule.startDate} onChange={(event) => setRule({ ...rule, startDate: event.target.value })} /></Field>
        <Button type="submit" icon={Plus} loading={busy}>Add activity</Button>
      </form>
      <div className="data-list">{rules.map((item) => <div className="list-row" key={item.id}><div><strong>{item.name}</strong><p className="muted">{item.type === 'deposit' ? '+' : '−'}{money(item.amount)} · {item.frequency} · {item.active ? 'Active' : 'Paused'}</p></div><button className="btn btn-sm btn-secondary" type="button" onClick={() => toggleRule(item)}>{item.active ? 'Pause' : 'Resume'}</button></div>)}</div>
    </section>

    <section className="panel stack"><div className="section-heading"><div><h2>Cash-flow forecast</h2><p className="muted">Projected balance is not your actual bank balance.</p></div><select className="control" value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label="Forecast period"><option value="30">Next 30 days</option><option value="60">Next 60 days</option><option value="90">Next 90 days</option></select></div><div className="forecast-summary"><div><TrendingDown size={18} aria-hidden="true" /><span>Expected withdrawals</span><strong>{money(forecast?.expectedWithdrawals || 0)}</strong></div><div><CircleDollarSign size={18} aria-hidden="true" /><span>Net cash flow</span><strong>{money(forecast?.netCashFlow || 0)}</strong></div></div><div className="data-list">{(forecast?.occurrences || []).slice(0, 8).map((item) => <div className="list-row" key={`${item.ruleId}-${item.dueDate}`}><div><strong>{item.name}</strong><p className="muted">{item.dueDate} · {item.type === 'deposit' ? '+' : '−'}{money(item.amount)} · {item.status}</p></div>{item.status === 'pending' && <span className="row-actions"><button className="btn btn-sm btn-secondary" type="button" onClick={() => setOccurrence(item, 'post')}>Post</button><button className="btn btn-sm btn-ghost" type="button" onClick={() => setOccurrence(item, 'skip')}>Skip</button></span>}</div>)}</div></section>
    <section className="panel stack"><div className="section-heading"><div><h2>What-if simulator</h2><p className="muted">Test a purchase or extra deposit without changing your actual records.</p></div></div><form className="form-grid" onSubmit={runSimulation}><Field label="Purchase amount"><input className="control" type="number" min="0" step="0.01" value={scenario.purchaseAmount} onChange={(event) => setScenario({ ...scenario, purchaseAmount: event.target.value })} placeholder="0.00" /></Field><Field label="Additional deposit"><input className="control" type="number" min="0" step="0.01" value={scenario.additionalDeposit} onChange={(event) => setScenario({ ...scenario, additionalDeposit: event.target.value })} placeholder="0.00" /></Field><Button type="submit">Run simulation</Button></form>{simulation && <div className="forecast-summary"><div><span>Original projected balance</span><strong>{money(simulation.originalProjectedBalance)}</strong></div><div><span>Simulated projected balance</span><strong>{money(simulation.simulatedProjectedBalance)}</strong><small>{simulation.warning || 'This scenario keeps the projected balance non-negative.'}</small></div></div>}</section>
  </div>;
}
