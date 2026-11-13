import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownUp, Download, Plus, Search } from 'lucide-react';
import { api } from '../api.ts';
import { isAuthError } from '../lib/errors.ts';
import { Button, EmptyState, ErrorState, Field, LoadingBlock, PageHeading, Panel, SearchInput } from '../components/ui.tsx';
import { StatCard, TransactionItem } from '../components/domain.tsx';
import { money } from '../lib/format.ts';
import { TrendingDown, TrendingUp } from 'lucide-react';

const PAGE = 25;

export default function Transactions({ getToken, ledgerVersion, goals, initialSearch = '', onAdd, onEdit, onDelete, onExport, exporting, onAuthError }) {
  const [filters, setFilters] = useState({ search: initialSearch, type: '', month: '', sort: 'date-desc' });
  const [debounced, setDebounced] = useState(initialSearch);
  const [rows, setRows] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const request = useRef(0);

  useEffect(() => { const t = setTimeout(() => setDebounced(filters.search.trim()), 300); return () => clearTimeout(t); }, [filters.search]);

  const query = useCallback((offset) => {
    const [sort_by, sort_order] = filters.sort.split('-');
    return api.transactions(getToken(), { search: debounced, type: filters.type, month: filters.month, sort_by, sort_order, limit: PAGE + 1, offset });
  }, [getToken, debounced, filters.type, filters.month, filters.sort]);

  const load = useCallback(async () => {
    const id = ++request.current;
    setStatus('loading'); setError(null);
    try {
      const page = await query(0);
      if (id !== request.current) return;
      setRows(page.slice(0, PAGE)); setHasMore(page.length > PAGE); setStatus('ready');
    } catch (err) {
      if (id !== request.current) return;
      if (isAuthError(err)) { onAuthError?.(err); return; }
      setError(err); setStatus('error');
    }
  }, [query, onAuthError]);

  useEffect(() => { load(); }, [load, ledgerVersion]);

  const loadMore = async () => {
    const id = request.current;
    setLoadingMore(true);
    try {
      const page = await query(rows.length);
      if (id !== request.current) return;
      setRows((current) => [...current, ...page.slice(0, PAGE)]); setHasMore(page.length > PAGE);
    } catch (err) { if (isAuthError(err)) onAuthError?.(err); else setError(err); }
    finally { setLoadingMore(false); }
  };

  const set = (name) => (event) => setFilters((f) => ({ ...f, [name]: event.target.value }));
  const deposits = rows.filter((t) => t.type === 'deposit').reduce((a, t) => a + t.amount, 0);
  const withdrawals = rows.filter((t) => t.type === 'withdrawal').reduce((a, t) => a + t.amount, 0);
  const filtered = Boolean(debounced || filters.type || filters.month);
  const goalName = (id) => goals.find((g) => g.id === id)?.name;

  return <>
    <PageHeading title="Transactions" description="Every deposit and withdrawal you’ve recorded."
      actions={<><Button variant="secondary" icon={Download} loading={exporting} onClick={onExport}>Export CSV</Button><Button variant="success" icon={Plus} onClick={() => onAdd('deposit')}>Add transaction</Button></>} />

    <div className="stat-grid stat-grid-3">
      <StatCard icon={TrendingUp} tone="success" label="Deposits shown" value={money(deposits)} />
      <StatCard icon={TrendingDown} tone="neutral" label="Withdrawals shown" value={money(withdrawals)} />
      <StatCard icon={ArrowDownUp} tone="info" label="Net shown" value={money(deposits - withdrawals)} caption={hasMore ? `First ${rows.length} results — load more for the rest` : `${rows.length} result${rows.length === 1 ? '' : 's'}`} />
    </div>

    <Panel>
      <div className="filters" role="search">
        <Field label="Search"><SearchInput className="control" value={filters.search} onChange={set('search')} placeholder="Note or category" /></Field>
        <Field label="Type"><select className="control" value={filters.type} onChange={set('type')}><option value="">All types</option><option value="deposit">Deposits</option><option value="withdrawal">Withdrawals</option></select></Field>
        <Field label="Month"><input className="control" type="month" value={filters.month} onChange={set('month')} /></Field>
        <Field label="Sort by"><select className="control" value={filters.sort} onChange={set('sort')}><option value="date-desc">Newest first</option><option value="date-asc">Oldest first</option><option value="amount-desc">Largest amount</option><option value="amount-asc">Smallest amount</option></select></Field>
      </div>
      {status === 'loading' && <LoadingBlock label="Loading transactions…" rows={4} />}
      {status === 'error' && <ErrorState title="Couldn’t load transactions" message={error?.message} onRetry={load} />}
      {status === 'ready' && (rows.length
        ? <>
          <ul className="tx-list" aria-label="Transactions">{rows.map((tx) => <TransactionItem key={tx.id} tx={tx} goalName={goalName(tx.goalId)} onEdit={onEdit} onDelete={onDelete} />)}</ul>
          {hasMore && <div className="center"><Button variant="secondary" loading={loadingMore} onClick={loadMore}>Load more</Button></div>}
        </>
        : filtered
          ? <EmptyState icon={Search} title="No matching transactions" action={<Button variant="secondary" onClick={() => setFilters({ search: '', type: '', month: '', sort: 'date-desc' })}>Clear filters</Button>}>Try a different search or month.</EmptyState>
          : <EmptyState icon={ArrowDownUp} title="No transactions yet" action={<Button variant="success" icon={Plus} onClick={() => onAdd('deposit')}>Record a deposit</Button>}>Add your first deposit to start tracking your savings.</EmptyState>)}
    </Panel>
  </>;
}
