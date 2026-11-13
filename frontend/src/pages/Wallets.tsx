import { AlertTriangle, Banknote, Building2, CheckCircle2, CreditCard, History, Landmark, LineChart, Pencil, Plus, QrCode, RefreshCw, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { Badge, Button, EmptyState, ErrorState, FormAlert, IconButton, PageHeading, Panel, ProgressBar } from '../components/ui.tsx';
import { Sparkline } from '../components/charts.tsx';
import { money } from '../lib/format.ts';
import { SOURCE_LABELS, WALLET_KINDS, freshness, fundingCheck, identifier } from '../lib/wallets.ts';

const ICONS: Record<string, any> = { ewallet: Smartphone, bank: Building2, atm: CreditCard, cash: Banknote, investment: LineChart };
const kindLabel = (kind: string) => WALLET_KINDS.find(([v]) => v === kind)?.[1] || kind;

/** Do the accounts you track actually hold the money you've set aside for goals? */
export function FundingCheck({ wallets, goalsSaved, currency }: { wallets: any[]; goalsSaved: number; currency: string }) {
  const f = fundingCheck(wallets, goalsSaved, currency);
  if (!f.hasAccounts || f.reserved <= 0) return null;
  return <section className={`fund-check ${f.covered ? 'fund-ok' : 'fund-short'}`} aria-label="Funding check">
    <span className="fund-icon" aria-hidden="true">{f.covered ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}</span>
    <div className="fund-body">
      <strong>{f.covered ? 'Your goal savings are backed by your accounts' : 'Some goal savings aren’t in a tracked account yet'}</strong>
      <p className="muted">{f.covered
        ? <>You’ve set aside <strong>{money(f.reserved, currency)}</strong> for goals and your tracked accounts hold <strong>{money(f.tracked, currency)}</strong>{f.difference > 0 && <> — {money(f.difference, currency)} more than you’ve assigned</>}.</>
        : <>Your goals show <strong>{money(f.reserved, currency)}</strong> saved, but tracked accounts hold <strong>{money(f.tracked, currency)}</strong>. About <strong>{money(Math.abs(f.difference), currency)}</strong> is either in an account you haven’t added, or needs a balance update.</>}</p>
      <ProgressBar value={f.percent} tone={f.covered ? 'success' : 'warning'} label={`Accounts cover ${f.percent}% of your goal savings`} />
    </div>
  </section>;
}

type Props = { wallets: any[]; goalsSaved?: number; currency?: string; error: any; onRetry: () => void; onAdd: () => void; onScan: () => void; onAddCard: () => void; onEdit: (w: any) => void; onDelete: (w: any) => void; onUpdateBalance: (w: any) => void; onHistory: (w: any) => void };

export default function Wallets({ wallets, goalsSaved = 0, currency = 'PHP', error, onRetry, onAdd, onScan, onAddCard, onEdit, onDelete, onUpdateBalance, onHistory }: Props) {
  // Totals are per currency: balances in different currencies are never added together.
  const totals = Object.entries(wallets.reduce((acc: Record<string, number>, w) => ({ ...acc, [w.currencyCode]: (acc[w.currencyCode] || 0) + w.balance }), {}));
  const needCheck = wallets.filter((w) => ['aging', 'stale'].includes(freshness(w).key)).length;
  const actions = <>
    <Button variant="info" icon={QrCode} onClick={onScan}>Scan e-wallet QR</Button>
    <Button variant="success" icon={CreditCard} onClick={onAddCard}>Add ATM card</Button>
    <Button variant="secondary" icon={Plus} onClick={onAdd}>Add manually</Button>
  </>;
  return <>
    <PageHeading title="Wallets & accounts" description="Track the balance of your e-wallets, bank accounts and ATM cards in one place — view only." actions={actions} />
    <p className="safe-note safe-note-block"><ShieldCheck size={18} aria-hidden="true" /><span><strong>Tracking only.</strong> IponWise can’t see, move or spend your money. Balances are snapshots you enter, card numbers are never stored (just the last 4 digits), and we never ask for a PIN, CVV or one-time code.</span></p>
    {error && !wallets.length ? <Panel><ErrorState title="Couldn’t load your accounts" message={error.message} onRetry={onRetry} /></Panel>
      : wallets.length === 0 ? <Panel><EmptyState icon={Landmark} title="No accounts added yet" action={<div className="empty-actions">{actions}</div>}>Scan the QR code of your e-wallet, add an ATM card by its last 4 digits, or enter an account yourself. You’ll see your balances side by side and get a nudge when one needs a refresh.</EmptyState></Panel>
        : <>
          <div className="stat-grid stat-grid-3">
            {totals.map(([code, total]) => <article className="stat stat-primary" key={code}><span className="stat-icon"><Landmark size={20} aria-hidden="true" /></span><div><p>Total in {code}</p><strong>{money(total as number, code)}</strong><small>{wallets.filter((w) => w.currencyCode === code).length} tracked account{wallets.filter((w) => w.currencyCode === code).length === 1 ? '' : 's'}</small></div></article>)}
            <article className={`stat ${needCheck ? 'stat-neutral' : 'stat-success'}`}><span className="stat-icon">{needCheck ? <RefreshCw size={20} aria-hidden="true" /> : <CheckCircle2 size={20} aria-hidden="true" />}</span><div><p>Balance freshness</p><strong>{needCheck ? `${needCheck} to refresh` : 'All up to date'}</strong><small>{needCheck ? 'Not checked in over a week' : 'Checked within the last week'}</small></div></article>
          </div>
          <FundingCheck wallets={wallets} goalsSaved={goalsSaved} currency={currency} />
          <div className="wallet-grid">{wallets.map((w) => {
            const Icon = ICONS[w.kind] || Landmark;
            const fresh = freshness(w);
            const ident = identifier(w);
            return <article className="wallet" key={w.id}>
              <header><span className="wallet-icon"><Icon size={20} aria-hidden="true" /></span><div><h3>{w.name}</h3><span className="muted">{w.provider} · {kindLabel(w.kind)}</span></div>
                <span className="goal-tools"><IconButton label={`Edit ${w.name}`} icon={Pencil} tone="warning" onClick={() => onEdit(w)} /><IconButton label={`Delete ${w.name}`} icon={Trash2} tone="danger" onClick={() => onDelete(w)} /></span></header>
              <div className="wallet-balance-row"><strong className="wallet-balance">{money(w.balance, w.currencyCode)}</strong><Sparkline points={w.trend || []} width={104} height={34} /></div>
              <div className="badge-row">
                <Badge tone="neutral" icon={false}>{SOURCE_LABELS[w.source] || 'Added manually'}</Badge>
                {ident && <Badge tone="info" icon={false}>{ident}</Badge>}
                <Badge tone={fresh.tone} icon={fresh.key === 'fresh' ? CheckCircle2 : AlertTriangle}>{fresh.label}</Badge>
              </div>
              {w.note && <p className="muted">{w.note}</p>}
              <footer className="wallet-actions">
                <Button size="sm" variant="warning" icon={RefreshCw} onClick={() => onUpdateBalance(w)}>Update balance<span className="sr-only">: {w.name}</span></Button>
                <Button size="sm" variant="info" icon={History} onClick={() => onHistory(w)}>History<span className="sr-only">: {w.name}</span></Button>
              </footer>
            </article>;
          })}</div>
          {error && <FormAlert tone="warning">Some account details couldn’t be refreshed just now.</FormAlert>}
        </>}
  </>;
}
