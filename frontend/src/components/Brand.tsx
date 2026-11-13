import { PiggyBank } from 'lucide-react';

export default function Brand({ compact = false, tone = 'default' }: { compact?: boolean; tone?: 'default' | 'light' }) {
  return <div className={`brand ${tone === 'light' ? 'brand-light' : ''}`}><span className="brand-mark"><PiggyBank size={compact ? 18 : 22} strokeWidth={2.2} aria-hidden="true" /></span><strong>Ipon<span>Wise</span></strong></div>;
}
