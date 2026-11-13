import { money } from '../lib/format.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (key) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`;

/** Last N calendar months ending now, filling months with no activity with zeros (server data is sparse). */
export function lastMonths(monthly = [], count = 6, now = new Date()) {
  const byMonth = new Map(monthly.map((m) => [String(m.month).slice(0, 7), m]));
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const row = byMonth.get(key);
    return { key, label: monthLabel(key), deposits: Number(row?.deposits || 0), withdrawals: Number(row?.withdrawals || 0) };
  });
}

const compact = (value) => (value >= 1000000 ? `${+(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${+(value / 1000).toFixed(1)}k` : String(Math.round(value)));
const niceMax = (value) => { if (value <= 0) return 100; const p = 10 ** Math.floor(Math.log10(value)); return Math.ceil(value / p) * p; };

/** Responsive grouped bar chart (SVG viewBox scales to any width). Includes a text alternative for screen readers. */
export function MonthlyChart({ months }) {
  const W = 560; const H = 250; const pad = { l: 44, r: 8, t: 12, b: 28 };
  const max = niceMax(Math.max(...months.flatMap((m) => [m.deposits, m.withdrawals]), 0));
  const plotH = H - pad.t - pad.b; const slot = (W - pad.l - pad.r) / months.length; const barW = Math.min(22, slot / 3);
  const y = (v) => pad.t + plotH - (v / max) * plotH;
  const total = months.reduce((a, m) => a + m.deposits + m.withdrawals, 0);
  return <figure className="chart">
    <div className="chart-legend" aria-hidden="true"><span><i className="dot dot-inflow" />Deposits</span><span><i className="dot dot-outflow" />Withdrawals</span></div>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={total ? 'Bar chart of deposits and withdrawals for the last six months. A data table follows.' : 'No deposits or withdrawals in the last six months.'}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => <g key={t}><line className="chart-grid" x1={pad.l} x2={W - pad.r} y1={y(max * t)} y2={y(max * t)} /><text className="chart-tick" x={pad.l - 8} y={y(max * t) + 4} textAnchor="end">{compact(max * t)}</text></g>)}
      {months.map((m, i) => {
        const cx = pad.l + slot * i + slot / 2;
        return <g key={m.key}>
          <rect className="bar bar-inflow" x={cx - barW - 2} y={y(m.deposits)} width={barW} height={Math.max(0, plotH + pad.t - y(m.deposits))} rx="4"><title>{`${m.label} deposits: ${money(m.deposits)}`}</title></rect>
          <rect className="bar bar-outflow" x={cx + 2} y={y(m.withdrawals)} width={barW} height={Math.max(0, plotH + pad.t - y(m.withdrawals))} rx="4"><title>{`${m.label} withdrawals: ${money(m.withdrawals)}`}</title></rect>
          <text className="chart-tick" x={cx} y={H - 8} textAnchor="middle">{m.label}</text>
        </g>;
      })}
    </svg>
    {!total && <p className="chart-empty">No activity yet — add a deposit to see your trend.</p>}
    <table className="sr-only"><caption>Monthly deposits and withdrawals</caption><thead><tr><th>Month</th><th>Deposits</th><th>Withdrawals</th></tr></thead><tbody>{months.map((m) => <tr key={m.key}><td>{m.label}</td><td>{money(m.deposits)}</td><td>{money(m.withdrawals)}</td></tr>)}</tbody></table>
  </figure>;
}

export function CategoryBars({ items }) {
  const max = Math.max(...items.map((i) => i.amount), 1);
  return <ul className="category-bars">{items.map((item) => <li key={item.category}>
    <div><span>{item.category}</span><strong>{money(item.amount)}</strong></div>
    <div className="meter" aria-hidden="true"><span style={{ width: `${Math.max(3, (item.amount / max) * 100)}%` }} /></div>
  </li>)}</ul>;
}

/** Tiny trend line for a balance history. Decorative: the numbers are always shown in text next to it. */
export function Sparkline({ points, width = 120, height = 36, label }: { points: number[]; width?: number; height?: number; label?: string }) {
  if (!points || points.length < 2) return <span className="spark-empty muted">Trend appears after your next update</span>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pad = 5; // room for the end dot so it is never clipped
  const step = (width - pad * 2) / (points.length - 1);
  const coords = points.map((v, i) => [pad + i * step, height - 4 - ((v - min) / span) * (height - 8)]);
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const up = points[points.length - 1] >= points[0];
  const [lx, ly] = coords[coords.length - 1];
  return <svg className={`spark ${up ? 'spark-up' : 'spark-down'}`} viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={label || `Balance trend over ${points.length} updates, ${up ? 'rising or flat' : 'falling'}`}>
    <path d={`${line} L${coords[coords.length - 1][0].toFixed(1)} ${height} L${pad} ${height} Z`} className="spark-area" /><path d={line} className="spark-line" fill="none" /><circle cx={lx} cy={ly} r="3" className="spark-dot" />
  </svg>;
}
