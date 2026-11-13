import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, CreditCard, Lightbulb, PiggyBank, Plus, QrCode, Sparkles, Target, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Badge, Button, EmptyState, PageHeading, Panel, ProgressBar } from '../components/ui.tsx';
import { StatCard, TransactionItem } from '../components/domain.tsx';
import { MonthlyChart, Sparkline, lastMonths } from '../components/charts.tsx';
import GetStarted from '../components/GetStarted.tsx';
import { FundingCheck } from './Wallets.tsx';
import { getStartedSteps } from '../lib/onboarding.ts';
import { freshness, identifier } from '../lib/wallets.ts';
import { greeting, money } from '../lib/format.ts';
import { computeInsights, goalPace, goalPercent, goalStatus, isCompleted, sortGoals } from '../lib/goals.ts';

type OverviewProps = { data: any; name: string; monthlyRate?: number; currency?: string; guideBusy?: boolean; onNavigate: (page: string) => void; onAddTransaction: (type: string) => void; onAddGoal: () => void; onContribute: (goal: any) => void; onPlanEmergency: () => void; onGuideAction: (step: any) => void; onDismissGuide: () => void; onScanWallet: () => void; onAddCard: () => void; onBrowseIdeas: () => void };

export default function Overview({ data, name, monthlyRate = 0, currency = 'PHP', guideBusy = false, onNavigate, onAddTransaction, onAddGoal, onContribute, onPlanEmergency, onGuideAction, onDismissGuide, onScanWallet, onAddCard, onBrowseIdeas }: OverviewProps) {
  const { dashboard, goals, recent, report, wallets = [] } = data;
  const steps = getStartedSteps({ avatarUrl: data.avatarUrl, goals, wallets, reminders: data.reminders, dashboard });
  const showGuide = !data.profile?.onboarding_dismissed;
  const first = (name || '').split(' ')[0];
  const insights = computeInsights(goals);
  const activeGoals = sortGoals(goals.filter((g) => !isCompleted(g))).slice(0, 3);
  const pct = dashboard.goals_target > 0 ? Math.min(100, Math.floor((dashboard.goals_saved / dashboard.goals_target) * 100)) : 0;
  const goalName = (id) => goals.find((g) => g.id === id)?.name;

  return <>
    <PageHeading title={`${greeting()}${first ? `, ${first}` : ''}`} description="Here’s where your savings stand, based on the records you’ve entered."
      actions={<><Button variant="success" icon={Plus} onClick={onAddGoal}>New goal</Button><Button variant="success" icon={Plus} onClick={() => onAddTransaction('deposit')}>Add transaction</Button></>} />

    {showGuide && <GetStarted steps={steps} onAction={onGuideAction} onDismiss={onDismissGuide} dismissing={guideBusy} />}

    <div className="stat-grid">
      <StatCard icon={Wallet} label="Recorded balance" value={money(dashboard.balance)} caption="Deposits minus withdrawals" />
      <StatCard icon={TrendingUp} tone="success" label="Deposits this month" value={money(dashboard.month_deposits)} />
      <StatCard icon={TrendingDown} tone="neutral" label="Withdrawals this month" value={money(dashboard.month_withdrawals)} />
      <StatCard icon={Target} tone="info" label="Goal progress" value={dashboard.goal_count ? `${pct}%` : '—'} caption={dashboard.goal_count ? `${money(dashboard.goals_saved)} of ${money(dashboard.goals_target)} · ${dashboard.completed_goals}/${dashboard.goal_count} complete` : 'No goals yet'} />
    </div>

    <div className="dash-grid">
      <Panel title="Savings activity" description="Deposits and withdrawals, last 6 months" className="span-2" actions={<Button variant="ghost" size="sm" onClick={() => onNavigate('reports')}>Reports <ArrowRight size={14} aria-hidden="true" /></Button>}>
        <MonthlyChart months={lastMonths(report?.monthly)} />
      </Panel>

      <Panel title="Insights" description="Calculated from your goals">
        {insights.length ? <ul className="insights">{insights.map((item) => <li key={item.id} className={`insight insight-${item.tone}`}>
          <Lightbulb size={16} aria-hidden="true" />
          <div><strong>{item.title}</strong><p>{item.detail}</p>{item.action === 'plan-emergency' && <Button size="sm" variant="ghost" onClick={onPlanEmergency}>Plan an emergency fund</Button>}</div>
        </li>)}</ul>
          : <EmptyState compact icon={Lightbulb} title="Insights appear with your goals">Create a goal with a target date and we’ll point out what needs attention.</EmptyState>}
      </Panel>

      <Panel title="Goals in progress" className="span-2" actions={<Button variant="ghost" size="sm" onClick={() => onNavigate('goals')}>All goals <ArrowRight size={14} aria-hidden="true" /></Button>}>
        {activeGoals.length ? <ul className="mini-goals">{activeGoals.map((goal) => {
          const status = goalStatus(goal);
          const pace = goalPace(goal, monthlyRate);
          return <li key={goal.id}>
            <div className="mini-goal-head"><strong>{goal.name}</strong><Badge tone={status.tone}>{status.label}</Badge></div>
            <ProgressBar value={goalPercent(goal)} tone={status.tone === 'neutral' ? 'info' : status.tone} label={`${goal.name} progress`} />
            {pace && <p className={`goal-pace ${pace.onPace === false ? 'goal-pace-late' : ''}`}><TrendingUp size={14} aria-hidden="true" /> At your recent pace: about {pace.monthsNeeded} month{pace.monthsNeeded === 1 ? '' : 's'}{pace.onPace === true && ' — on track'}{pace.onPace === false && ' — later than planned'}</p>}
            <div className="mini-goal-foot"><span className="muted">{money(goal.saved)} of {money(goal.target)} · {goalPercent(goal)}%</span><Button size="sm" variant="secondary" icon={PiggyBank} onClick={() => onContribute(goal)}>Add money</Button></div>
          </li>;
        })}</ul>
          : <EmptyState compact icon={Target} title={goals.length ? 'All your goals are complete 🎉' : 'No savings goals yet'} action={!goals.length && <Button variant="success" icon={Plus} onClick={onAddGoal}>Create your first goal</Button>}>{!goals.length && 'Start with an emergency fund or whatever you’re saving for.'}</EmptyState>}
      </Panel>

      <Panel title="Recent transactions" actions={<Button variant="info" size="sm" onClick={() => onNavigate('transactions')}>View all <ArrowRight size={14} aria-hidden="true" /></Button>}>
        {recent.length ? <ul className="tx-list tx-list-compact">{recent.slice(0, 5).map((tx) => <TransactionItem key={tx.id} tx={tx} goalName={goalName(tx.goalId)} />)}</ul>
          : <EmptyState compact icon={BarChart3} title="No transactions yet" action={<Button variant="success" icon={Plus} onClick={() => onAddTransaction('deposit')}>Record a deposit</Button>}>Your deposits and withdrawals will show up here.</EmptyState>}
      </Panel>

      <Panel title="Where your money is kept" description="Balances you track — view only" className="span-2" actions={<Button variant="ghost" size="sm" onClick={() => onNavigate('wallets')}>All accounts <ArrowRight size={14} aria-hidden="true" /></Button>}>
        {wallets.length ? <>
          <ul className="acct-list">{wallets.slice(0, 4).map((w) => {
            const fresh = freshness(w);
            return <li key={w.id}><div className="acct-name"><strong>{w.name}</strong><span className="muted">{w.provider}{identifier(w) ? ` · ${identifier(w)}` : ''}</span></div>
              <Sparkline points={w.trend || []} width={84} height={28} /><div className="acct-bal"><strong>{money(w.balance, w.currencyCode)}</strong><span className={`acct-fresh acct-fresh-${fresh.tone}`}>{fresh.tone === 'success' ? <CheckCircle2 size={13} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />} {fresh.label}</span></div></li>;
          })}</ul>
          <FundingCheck wallets={wallets} goalsSaved={dashboard.goals_saved} currency={currency} />
        </> : <EmptyState compact icon={Wallet} title="No accounts tracked yet" action={<div className="empty-actions"><Button variant="info" icon={QrCode} onClick={onScanWallet}>Scan e-wallet QR</Button><Button variant="success" icon={CreditCard} onClick={onAddCard}>Add ATM card</Button></div>}>See your GCash, Maya or bank balances next to your goals. IponWise only tracks — it never touches your money.</EmptyState>}
      </Panel>

      <Panel title="Quick actions" description="Common next steps">
        <div className="quick-actions">
          <Button variant="success" icon={Plus} onClick={() => onAddTransaction('deposit')}>Record a deposit</Button>
          <Button variant="secondary" icon={Sparkles} onClick={onBrowseIdeas}>Browse goal ideas</Button>
          <Button variant="info" icon={QrCode} onClick={onScanWallet}>Scan e-wallet QR</Button>
          <Button variant="secondary" icon={CreditCard} onClick={onAddCard}>Add ATM card</Button>
        </div>
      </Panel>
    </div>
  </>;
}
