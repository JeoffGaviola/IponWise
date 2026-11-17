import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, BarChart3, Bell, ChevronDown, LayoutDashboard, LogOut, Menu, MessageCircle, Search, Settings as SettingsIcon, ShieldCheck, Target, Wallet, X, CalendarRange } from 'lucide-react';
import { ToastProvider, useToast } from './components/Toast.tsx';
import { ConfirmDialog, useExitTransition } from './components/Modal.tsx';
import { GoalModal, GoalMoneyModal, ReminderModal, TransactionModal, WalletModal } from './components/forms.tsx';
import { BalanceModal, CardModal, HistoryModal, ScanWalletModal } from './components/walletForms.tsx';
import { Button, ErrorState, LoadingBlock, Spinner } from './components/ui.tsx';
import Brand from './components/Brand.tsx';
import SessionSplash, { type SplashMode } from './components/SessionSplash.tsx';
import AssistantDialog from './components/Assistant.tsx';
import { NotificationCenter, type AppNotification } from './components/NotificationCenter.tsx';
import { SPLASH_MS } from './lib/splash.ts';
import { Avatar } from './AvatarManager.tsx';
import LegalPage from './LegalPage.tsx';
import AuthPage, { PasswordRecoveryPage } from './pages/AuthPage.tsx';
import Overview from './pages/Overview.tsx';
import Goals from './pages/Goals.tsx';
import Transactions from './pages/Transactions.tsx';
import Reminders from './pages/Reminders.tsx';
import Reports from './pages/Reports.tsx';
import Wallets from './pages/Wallets.tsx';
import Settings from './pages/Settings.tsx';
import SuperadminPortal from './pages/SuperadminPortal.tsx';
import BudgetCashFlow from './pages/BudgetCashFlow.tsx';
import { useAppData } from './hooks/useAppData.ts';
import { useActions } from './hooks/useActions.ts';
import { SESSION_EXPIRED_MESSAGE } from './lib/errors.ts';
import { averageMonthlyDeposits } from './lib/goals.ts';
import { localDate, money, setActiveCurrency } from './lib/format.ts';
import { isSupabaseConfigured, supabase } from './supabase.ts';

const NAV = [
  { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'goals', label: 'Savings goals', icon: Target },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
  { id: 'reminders', label: 'Reminders', icon: Bell },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'budget', label: 'Budget & cash flow', icon: CalendarRange },
  { id: 'wallets', label: 'Wallets & accounts', icon: Wallet },
  { id: 'settings', label: 'Profile & settings', icon: SettingsIcon },
];

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme; else delete root.dataset.theme;
  try { if (theme === 'light' || theme === 'dark') localStorage.setItem('iponwise-theme', theme); else localStorage.removeItem('iponwise-theme'); } catch { /* ignore */ }
}

function AccountMenu({ name, email, avatarUrl, isSuperadmin, onNavigate, onSignOut, signingOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return <div className="account-menu" ref={ref}>
    <button type="button" className="account-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
      <Avatar name={name} url={avatarUrl} className="avatar-sm" /><span className="account-name">{name}</span><ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && <div className="menu" role="menu">
      <div className="menu-head"><strong>{name}</strong><span className="muted">{email}</span></div>
      {isSuperadmin && <button type="button" role="menuitem" onClick={() => { setOpen(false); window.location.assign('/superadmin'); }}><ShieldCheck size={16} aria-hidden="true" /> Superadmin portal</button>}
      <button type="button" role="menuitem" onClick={() => { setOpen(false); onNavigate('settings'); }}><SettingsIcon size={16} aria-hidden="true" /> Profile & settings</button>
      <button type="button" role="menuitem" disabled={signingOut} aria-busy={signingOut || undefined} onClick={() => { setOpen(false); onSignOut(); }}>{signingOut ? <Spinner size={16} /> : <LogOut size={16} aria-hidden="true" />}{signingOut ? 'Signing out…' : 'Sign out'}</button>
    </div>}
  </div>;
}

function Shell({ session, onReady, onSignOutStart, onSignOutAbort }: { session: any; onReady?: () => void; onSignOutStart?: () => void; onSignOutAbort?: () => void }) {
  const toast = useToast();
  const [page, setPage] = useState('overview');
  const [navOpen, setNavOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [searchSeed, setSearchSeed] = useState({ key: 0, text: '' });
  const [topSearch, setTopSearch] = useState('');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const menuButton = useRef(null);
  const tokenRef = useRef(session.access_token);
  tokenRef.current = session.access_token;
  const getToken = useCallback(() => tokenRef.current, []);

  const expiring = useRef(false);
  const onAuthError = useCallback(async () => {
    if (expiring.current) return;
    expiring.current = true;
    toast.warning(SESSION_EXPIRED_MESSAGE, { title: 'Session expired', key: 'session-expired' });
    await supabase?.auth.signOut({ scope: 'local' }).catch(() => {});
    expiring.current = false;
  }, [toast]);

  const data = useAppData({ userId: session.user.id, getToken, onAuthError });
  const actions = useActions({ getToken, toast, data, onAuthError });
  const [shown, closing] = useExitTransition(modal, 180);
  const closeModal = useCallback(() => setModal(null), []);

  if (data.profile) setActiveCurrency(data.profile.currency_code);
  useEffect(() => { if (data.profile) applyTheme(data.profile.theme); }, [data.profile?.theme]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.title = `${NAV.find((n) => n.id === page)?.label || 'IponWise'} · IponWise`; }, [page]);
  useEffect(() => { if (!navOpen) return undefined; const onKey = (e) => { if (e.key === 'Escape') { setNavOpen(false); menuButton.current?.focus(); } }; document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey); }, [navOpen]);

  useEffect(() => { if (data.status === 'ready' || data.status === 'error') onReady?.(); }, [data.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = data.profile?.display_name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'You';
  const dueCount = useMemo(() => data.reminders.filter((r) => r.active && !r.completed && r.dueDate && r.dueDate <= localDate()).length, [data.reminders]);
  const notifications = useMemo<AppNotification[]>(() => {
    const today = localDate();
    const todayTime = new Date(`${today}T23:59:59`).getTime();
    const result: AppNotification[] = [];
    data.goals.forEach((goal) => {
      const progress = Number(goal.target) > 0 ? Number(goal.saved) / Number(goal.target) : 0;
      if (goal.createdAt && Date.now() - new Date(goal.createdAt).getTime() <= 30 * 86400000) {
        result.push({ id: `goal-created-${goal.id}`, kind: 'goal', title: `${goal.name} was created`, detail: 'Your savings plan is ready. Make the first contribution when you can.', target: 'goals' });
      }
      if (progress >= 1) result.push({ id: `goal-complete-${goal.id}`, kind: 'success', title: `${goal.name} is complete`, detail: 'You reached this savings target.', target: 'goals' });
      else if (progress >= 0.8) result.push({ id: `goal-near-${goal.id}`, kind: 'goal', title: `${goal.name} is almost there`, detail: `${Math.round(progress * 100)}% of the target is saved.`, target: 'goals' });
      if (goal.deadline && new Date(`${goal.deadline}T23:59:59`).getTime() <= todayTime + 7 * 86400000 && progress < 1) {
        result.push({ id: `goal-deadline-${goal.id}`, kind: 'goal', title: `${goal.name} deadline is near`, detail: `Target date: ${goal.deadline}. Review your next contribution.`, target: 'goals' });
      }
    });
    data.reminders.forEach((reminder) => {
      if (!reminder.active || reminder.completed || !reminder.dueDate) return;
      const due = new Date(`${reminder.dueDate}T23:59:59`).getTime();
      if (due < new Date(`${today}T00:00:00`).getTime()) result.push({ id: `reminder-overdue-${reminder.id}`, kind: 'reminder', title: `${reminder.title} is overdue`, detail: `Due ${reminder.dueDate}.`, target: 'reminders' });
    });
    data.wallets.forEach((wallet) => {
      if (!wallet.lastCheckedAt) return;
      const age = Date.now() - new Date(wallet.lastCheckedAt).getTime();
      if (age > 7 * 86400000) result.push({ id: `wallet-stale-${wallet.id}`, kind: 'wallet', title: `${wallet.name} needs a balance check`, detail: 'This account has not been checked in over a week.', target: 'wallets' });
    });
    return result;
  }, [data.goals, data.reminders, data.wallets]);

  const monthlyRate = useMemo(() => averageMonthlyDeposits(data.report?.monthly), [data.report]);
  const [guideBusy, setGuideBusy] = useState(false);

  const exportCsv = async () => { if (exporting) return; setExporting(true); await actions.exportCsv(); setExporting(false); };

  const go = (id) => {
    if (page === id) return;
    setPage(id);
    setNavOpen(false);
    window.scrollTo?.({ top: 0 });
  };
  const scrollToId = (id: string) => setTimeout(() => document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 60);
  const browseIdeas = () => { go('goals'); scrollToId('goal-ideas'); };
  const dismissGuide = async () => { if (guideBusy) return; setGuideBusy(true); await actions.saveProfile({ onboarding_dismissed: true }, 'Guide hidden. You can show it again from Profile & settings.'); setGuideBusy(false); };
  const guideAction = (step) => {
    if (step.target === 'goals') browseIdeas();
    else if (step.target === 'emergency') { go('goals'); scrollToId('planners'); }
    else if (step.target === 'deposit') setModal({ type: 'transaction', defaultType: 'deposit' });
    else if (step.target === 'reminders') setModal({ type: 'reminder' });
    else if (step.target === 'wallets') { go('wallets'); }
    else if (step.target === 'settings') go('settings');
  };

  const signOut = async () => {
    if (signingOut) return;
    if (!supabase) { setSigningOut(false); return; }
    setSigningOut(true);
    onSignOutStart?.();
    try {
      const { error } = await supabase.auth.signOut();
      if (!error) {
        toast.success('You’ve been signed out securely.', { title: 'Signed out' });
        return;
      }
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      const { data: current } = await supabase.auth.getSession();
      if (current?.session) {
        toast.error('We couldn’t sign you out. You’re still signed in — check your connection and try again.', { title: 'Sign-out failed', key: 'signout-failed' });
        setSigningOut(false);
        onSignOutAbort?.();
      } else {
        toast.warning('You’re signed out on this device, but we couldn’t confirm it with the server. Other devices may stay signed in until their session expires.', { title: 'Signed out locally' });
      }
    } catch {
      const { data: current } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      if (current?.session) {
        toast.error('We couldn’t confirm sign-out. Check your connection and try again.', { title: 'Sign-out failed', key: 'signout-failed' });
        setSigningOut(false);
        onSignOutAbort?.();
      } else {
        toast.warning('You’re signed out on this device, but we couldn’t confirm it with the server.', { title: 'Signed out locally' });
      }
    }
  };

  const afterOk = (result) => { if (result.ok) closeModal(); return result; };
  const submitTransaction = async (values, editing) => afterOk(editing ? await actions.updateTransaction(editing.id, values) : await actions.createTransaction(values));
  const submitGoal = async (values, editing) => afterOk(editing ? await actions.updateGoal(editing.id, values) : await actions.createGoal(values));
  const submitGoalMoney = async (goal, values, mode) => afterOk(mode === 'contribute' ? await actions.contribute(goal, values) : await actions.useGoalFunds(goal, values));
  const submitReminder = async (values, id) => afterOk(await actions.saveReminder(values, id));
  const submitWallet = async (values) => afterOk(await actions.saveWallet(values));
  const submitBalance = async (wallet, balance, checkIn) => afterOk(await actions.updateWalletBalance(wallet, balance, checkIn));

  const confirmDelete = async () => {
    if (busyDelete || !modal) return;
    setBusyDelete(true);
    const { kind, record } = modal;
    const run = { transaction: actions.deleteTransaction, goal: actions.deleteGoal, reminder: actions.deleteReminder, wallet: actions.deleteWallet }[kind];
    await run(record);
    setBusyDelete(false);
    closeModal();
  };

  const confirmCopy = (m) => {
    if (m.kind === 'transaction') return { title: 'Delete this transaction?', message: `“${m.record.note || m.record.category}” (${m.record.type === 'deposit' ? '+' : '−'}${money(m.record.amount)} on ${m.record.date}) will be removed from your records.`, details: m.record.goalId ? 'Its effect on the linked goal’s progress will be reversed.' : 'Your recorded balance will be recalculated.' };
    if (m.kind === 'goal') return { title: `Delete “${m.record.name}”?`, message: `This goal and its ${money(m.record.saved)} of progress will be removed.`, details: 'Transactions linked to it stay in your history and balance, but will no longer count toward a goal.' };
    if (m.kind === 'reminder') return { title: 'Delete this reminder?', message: `“${m.record.title}” will be permanently removed.` };
    return { title: `Remove “${m.record.name}”?`, message: 'This account snapshot will be removed. It does not affect your transactions or goals.' };
  };

  if (data.status === 'loading' || data.status === 'idle') return <div className="app-loading"><Brand /><LoadingBlock label="Loading your savings…" rows={3} /></div>;
  if (data.status === 'error') return <div className="app-loading"><Brand /><ErrorState title="Couldn’t load your savings" message={data.error?.message} onRetry={() => data.reload()} /><Button variant="ghost" icon={LogOut} loading={signingOut} onClick={signOut}>Sign out</Button></div>;

  const content = {
    overview: <Overview data={data} name={name} monthlyRate={monthlyRate} currency={data.profile?.currency_code} guideBusy={guideBusy} onGuideAction={guideAction} onDismissGuide={dismissGuide} onScanWallet={() => setModal({ type: 'wallet-scan' })} onAddCard={() => setModal({ type: 'wallet-card' })} onBrowseIdeas={browseIdeas} onNavigate={go} onAddTransaction={(t) => setModal({ type: 'transaction', defaultType: t })} onAddGoal={() => setModal({ type: 'goal' })} onContribute={(goal) => setModal({ type: 'goal-money', goal, mode: 'contribute' })} onPlanEmergency={() => { go('goals'); setTimeout(() => document.getElementById('planners')?.scrollIntoView({ behavior: 'smooth' }), 50); }} />,
    goals: <Goals goals={data.goals} monthlyRate={monthlyRate} onCreate={(prefill) => setModal({ type: 'goal', prefill })} onEdit={(goal) => setModal({ type: 'goal', goal })} onDelete={(record) => setModal({ type: 'confirm', kind: 'goal', record })} onContribute={(goal) => setModal({ type: 'goal-money', goal, mode: 'contribute' })} onUseFunds={(goal) => setModal({ type: 'goal-money', goal, mode: 'withdraw' })} />,
    transactions: <Transactions key={searchSeed.key} initialSearch={searchSeed.text} getToken={getToken} ledgerVersion={data.ledgerVersion} goals={data.goals} onAuthError={onAuthError} onAdd={(t) => setModal({ type: 'transaction', defaultType: t })} onEdit={(transaction) => setModal({ type: 'transaction', transaction })} onDelete={(record) => setModal({ type: 'confirm', kind: 'transaction', record })} onExport={exportCsv} exporting={exporting} />,
    reminders: <Reminders reminders={data.reminders} notifications={notifications} onNotificationNavigate={go} onEdit={(reminder) => setModal({ type: 'reminder', reminder })} onToggle={actions.setReminderActive} onComplete={actions.setReminderCompleted} onDelete={(record) => setModal({ type: 'confirm', kind: 'reminder', record })} />,
    reports: <Reports report={data.report} error={data.sectionErrors.report} onRetry={() => data.reloadSection('report')} onExport={exportCsv} exporting={exporting} />,
    budget: <BudgetCashFlow getToken={getToken} />,
    wallets: <Wallets wallets={data.wallets} goalsSaved={data.dashboard?.goals_saved || 0} currency={data.profile?.currency_code || 'PHP'} error={data.sectionErrors.wallets} onRetry={() => data.reloadSection('wallets')} onAdd={() => setModal({ type: 'wallet' })} onScan={() => setModal({ type: 'wallet-scan' })} onAddCard={() => setModal({ type: 'wallet-card' })} onEdit={(wallet) => setModal({ type: 'wallet', wallet })} onDelete={(record) => setModal({ type: 'confirm', kind: 'wallet', record })} onUpdateBalance={(wallet) => setModal({ type: 'wallet-balance', wallet })} onHistory={(wallet) => setModal({ type: 'wallet-history', wallet })} />,
    settings: <Settings profile={data.profile} email={session.user.email} avatarUrl={data.avatarUrl} onSaveProfile={actions.saveProfile} onUploadAvatar={actions.uploadAvatar} onDeleteAvatar={actions.deleteAvatar} onExport={exportCsv} exporting={exporting} onSignOut={signOut} signingOut={signingOut} />,
  }[page];

  return <div className="app">
    <a className="skip-link" href="#main">Skip to content</a>
    <aside className={`sidebar ${navOpen ? 'sidebar-open' : ''}`} aria-label="Primary">
      <div className="sidebar-head"><Brand /><button type="button" className="icon-btn sidebar-close" aria-label="Close menu" onClick={() => setNavOpen(false)}><X size={18} aria-hidden="true" /></button></div>
      <nav><ul>{NAV.map(({ id, label, icon: Icon }) => <li key={id}><button type="button" className={`nav-item ${page === id ? 'nav-active' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => go(id)}><Icon size={19} aria-hidden="true" /><span>{label}</span>{id === 'reminders' && dueCount > 0 && <b className="nav-count">{dueCount}</b>}</button></li>)}</ul></nav>
      <div className="sidebar-foot"><a href="/terms">Terms</a><a href="/privacy">Privacy</a></div>
    </aside>
    <div className={`scrim ${navOpen ? 'scrim-open' : ''}`} onClick={() => setNavOpen(false)} aria-hidden="true" />

    <div className="workspace">
      <header className="topbar">
        <button type="button" ref={menuButton} className="icon-btn menu-button" aria-label="Open menu" aria-expanded={navOpen} onClick={() => setNavOpen(true)}><Menu size={20} aria-hidden="true" /></button>
        <form className="topbar-search" role="search" onSubmit={(e) => { e.preventDefault(); setSearchSeed((s) => ({ key: s.key + 1, text: topSearch.trim() })); go('transactions'); }}>
          <Search size={16} aria-hidden="true" /><input aria-label="Search transactions" className="control" placeholder="Search transactions" value={topSearch} onChange={(e) => setTopSearch(e.target.value)} />
        </form>
        <div className="topbar-end">
          <NotificationCenter notifications={notifications} onNavigate={go} />
          <AccountMenu name={name} email={session.user.email} avatarUrl={data.avatarUrl} isSuperadmin={data.profile?.role === 'superadmin'} onNavigate={go} onSignOut={signOut} signingOut={signingOut} />
        </div>
      </header>
      <main id="main" className="content" tabIndex={-1}><div key={page} className="page-enter">
        {content}
      </div></main>
    </div>

    <button type="button" className="assistant-fab" aria-label="Open IponWise assistant" title="Ask IponWise assistant" onClick={() => setAssistantOpen(true)}><MessageCircle size={23} strokeWidth={2.2} aria-hidden="true" /></button>
    {shown?.type === 'transaction' && <TransactionModal closing={closing} transaction={shown.transaction} defaultType={shown.defaultType} goals={data.goals} onSubmit={submitTransaction} onClose={closeModal} />}
    {shown?.type === 'goal' && <GoalModal closing={closing} goal={shown.goal} prefill={shown.prefill} onSubmit={submitGoal} onClose={closeModal} />}
    {shown?.type === 'goal-money' && <GoalMoneyModal closing={closing} goal={shown.goal} mode={shown.mode} onSubmit={submitGoalMoney} onClose={closeModal} />}
    {shown?.type === 'reminder' && <ReminderModal closing={closing} reminder={shown.reminder} onSubmit={submitReminder} onClose={closeModal} />}
    {shown?.type === 'wallet' && <WalletModal closing={closing} wallet={shown.wallet} onSubmit={submitWallet} onClose={closeModal} />}
    {shown?.type === 'wallet-scan' && <ScanWalletModal closing={closing} onSubmit={submitWallet} onClose={closeModal} />}
    {shown?.type === 'wallet-card' && <CardModal closing={closing} onSubmit={submitWallet} onClose={closeModal} />}
    {shown?.type === 'wallet-balance' && <BalanceModal closing={closing} wallet={shown.wallet} onSubmit={submitBalance} onClose={closeModal} />}
    {shown?.type === 'wallet-history' && <HistoryModal closing={closing} wallet={shown.wallet} load={() => actions.loadWalletHistory(shown.wallet)} onClose={closeModal} />}
    {shown?.type === 'confirm' && <ConfirmDialog closing={closing} {...confirmCopy(shown)} confirmLabel={shown.kind === 'wallet' ? 'Remove account' : 'Delete'} busy={busyDelete} onCancel={closeModal} onConfirm={confirmDelete} />}
    {assistantOpen && <AssistantDialog token={getToken()} onClose={() => setAssistantOpen(false)} />}
  </div>;
}

const cameBackFromProvider = () => /access_token=|[?&#]code=/.test(`${window.location.search}${window.location.hash}`);

function Root() {
  const [session, setSession] = useState<any>(null);
  const [recoveringPassword, setRecoveringPassword] = useState(false);
  const [ready, setReady] = useState(!isSupabaseConfigured || !supabase);
  const [shellReady, setShellReady] = useState(false);
  const [splash, setSplash] = useState<{ mode: SplashMode; since: number } | null>(() => (isSupabaseConfigured && supabase ? { mode: cameBackFromProvider() ? 'enter' : 'open', since: Date.now() } : null));
  const sessionRef = useRef<any>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) { sessionRef.current = data.session; setSession(data.session); setReady(true); } }).catch(() => { if (active) setReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      const previous = sessionRef.current;
      sessionRef.current = next;
      if (event === 'PASSWORD_RECOVERY') setRecoveringPassword(true);
      if (event === 'SIGNED_OUT') setRecoveringPassword(false);
      // Do not show the entry transition for token refreshes.
      if (!previous && next && event === 'SIGNED_IN') { setShellReady(false); setSplash((current) => (current?.mode === 'enter' ? current : { mode: 'enter', since: Date.now() })); }
      if (!next) setShellReady(false);
      setSession(next);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  // Keep the transition visible for its configured minimum duration.
  useEffect(() => {
    if (!splash) return undefined;
    const finished = splash.mode === 'leave' ? !session : splash.mode === 'open' ? ready && (!session || shellReady) : ready && shellReady;
    const minimum = splash.mode === 'enter' ? SPLASH_MS.enter : splash.mode === 'leave' ? SPLASH_MS.leave : 0;
    const timers: ReturnType<typeof setTimeout>[] = [setTimeout(() => setSplash(null), Math.max(0, splash.since + SPLASH_MS.maxWait - Date.now()))];
    if (finished) timers.push(setTimeout(() => setSplash(null), Math.max(0, splash.since + minimum - Date.now())));
    return () => timers.forEach(clearTimeout);
  }, [splash, session, ready, shellReady]);

  const markReady = useCallback(() => setShellReady(true), []);
  const startSignOut = useCallback(() => setSplash({ mode: 'leave', since: Date.now() }), []);
  const abortSignOut = useCallback(() => setSplash((current) => (current?.mode === 'leave' ? null : current)), []);
  const isSuperadminPath = window.location.pathname.replace(/\/+$/, '') === '/superadmin';
  const signOutPortal = useCallback(async () => { await supabase?.auth.signOut(); }, []);

  const overlay = splash ? <SessionSplash mode={splash.mode} /> : null;
  if (!ready) return overlay || <div className="app-loading"><Brand /><LoadingBlock label="Opening IponWise…" rows={2} /></div>;
  if (recoveringPassword && session) return <><PasswordRecoveryPage onComplete={() => setRecoveringPassword(false)} />{overlay}</>;
  // Changing accounts remounts the shell to clear account-specific UI state.
  if (isSuperadminPath && session && !(splash?.mode === 'leave' && !sessionRef.current)) return <>{<SuperadminPortal session={session} onSignOut={signOutPortal} />}{overlay}</>;
  return <>
    {session && !(splash?.mode === 'leave' && !sessionRef.current) ? <Shell key={session.user.id} session={session} onReady={markReady} onSignOutStart={startSignOut} onSignOutAbort={abortSignOut} /> : (splash?.mode === 'leave' ? null : <AuthPage />)}
    {overlay}
  </>;
}

export default function App() {
  const publicPath = window.location.pathname.replace(/\/+$/, '') || '/';
  if (publicPath === '/terms' || publicPath === '/privacy') return <LegalPage type={publicPath.slice(1)} />;
  return <ToastProvider><Root /></ToastProvider>;
}
