import { BarChart3, Download, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Button, EmptyState, ErrorState, PageHeading, Panel } from '../components/ui.tsx';
import { StatCard } from '../components/domain.tsx';
import { CategoryBars, MonthlyChart, lastMonths } from '../components/charts.tsx';
import { money } from '../lib/format.ts';

export default function Reports({ report, error, onRetry, onExport, exporting }) {
  const months = lastMonths(report?.monthly);
  const deposits = months.reduce((a, m) => a + m.deposits, 0);
  const withdrawals = months.reduce((a, m) => a + m.withdrawals, 0);
  const categories = (report?.withdrawal_categories || []).slice(0, 8);
  return <>
    <PageHeading title="Reports" description="Totals are calculated by the server from your recorded transactions." actions={<Button variant="secondary" icon={Download} loading={exporting} onClick={onExport}>Export CSV</Button>} />
    {error && !report ? <Panel><ErrorState title="Couldn’t load reports" message={error.message} onRetry={onRetry} /></Panel> : <>
      <div className="stat-grid stat-grid-3">
        <StatCard icon={TrendingUp} tone="success" label="Deposits (6 months)" value={money(deposits)} />
        <StatCard icon={TrendingDown} tone="neutral" label="Withdrawals (6 months)" value={money(withdrawals)} />
        <StatCard icon={Wallet} tone="info" label="Net (6 months)" value={money(deposits - withdrawals)} />
      </div>
      <div className="dash-grid">
        <Panel title="Deposits vs withdrawals" description="Calendar months, including this month so far" className="span-2"><MonthlyChart months={months} /></Panel>
        <Panel title="Where withdrawals went" description="All-time, by category">
          {categories.length ? <CategoryBars items={categories} /> : <EmptyState compact icon={BarChart3} title="No withdrawals yet">Spending categories appear after you record a withdrawal.</EmptyState>}
        </Panel>
      </div>
    </>}
  </>;
}
