import { useMemo, useState } from 'react';
import { CarFront, GraduationCap } from 'lucide-react';
import { AmountInput, Button, Field } from './ui.tsx';
import { installmentTarget, purchaseTarget } from '../calculator.ts';
import { currencySymbol, money } from '../lib/format.ts';

export type HelperKind = 'purchase' | 'installment' | null;

/** Which planner suits a goal's purpose. Emergency funds have their own planner inside GoalModal. */
export function helperForCategory(category: string): HelperKind {
  if (/Vehicle|Gadget|Business/i.test(category)) return 'purchase';
  if (/Tuition|Debt|Rent|Medical|Utilities/i.test(category)) return 'installment';
  return null;
}

/** Buying something (laptop, phone, motorcycle, car): save the down payment plus one-off costs. */
export function PurchaseHelper({ open, onUse }: { open?: boolean; onUse: (target: number) => void }) {
  const [v, setV] = useState({ price: '', down: '100', extras: '' });
  const set = (k: string) => (e: any) => setV((s) => ({ ...s, [k]: e.target.value }));
  const out = useMemo(() => { if (!v.price) return null; try { return { ok: purchaseTarget({ price: v.price, downPaymentPercent: v.down, extras: v.extras || 0 }) }; } catch (e: any) { return { error: e.message }; } }, [v]);
  return <details className="helper" open={open}>
    <summary><CarFront size={16} aria-hidden="true" /> Plan the purchase (laptop, phone, car…)</summary>
    <p className="field-hint">Pay in full, or save only the down payment. Add one-off costs such as registration, insurance or accessories. An estimate, not financial advice.</p>
    <div className="grid-2">
      <Field label="Item price"><AmountInput symbol={currencySymbol()} value={v.price} onChange={set('price')} placeholder="0.00" /></Field>
      <Field label="How will you pay?"><select className="control" value={v.down} onChange={set('down')}><option value="100">Pay in full</option>{[50, 30, 20, 10].map((p) => <option key={p} value={p}>{p}% down payment</option>)}</select></Field>
    </div>
    <Field label="Extra one-off costs" optional hint="Registration, insurance, case, delivery…"><AmountInput symbol={currencySymbol()} value={v.extras} onChange={set('extras')} placeholder="0.00" /></Field>
    {out?.error && <p className="field-error" role="alert">{out.error}</p>}
    {out?.ok && <div className="helper-result"><span>{money(out.ok.downPayment)} + {money(out.ok.extras)} extras = <strong>{money(out.ok.target)}</strong>{out.ok.financed > 0 && <small className="muted"> · {money(out.ok.financed)} left to finance later</small>}</span><Button size="sm" variant="secondary" onClick={() => onUse(out.ok.target)}>Use as target</Button></div>}
  </details>;
}

/** Fees paid in instalments: tuition per semester, loan amortization, rent, medicine. */
export function InstallmentHelper({ open, onUse }: { open?: boolean; onUse: (target: number) => void }) {
  const [v, setV] = useState({ amount: '', count: '' });
  const set = (k: string) => (e: any) => setV((s) => ({ ...s, [k]: e.target.value }));
  const out = useMemo(() => { if (!v.amount && !v.count) return null; try { return { total: installmentTarget({ amount: v.amount, count: v.count }) }; } catch (e: any) { return v.amount && v.count ? { error: e.message } : null; } }, [v]);
  return <details className="helper" open={open}>
    <summary><GraduationCap size={16} aria-hidden="true" /> Add up fees or payments (tuition, loan, rent…)</summary>
    <p className="field-hint">Amount per payment × number of payments, e.g. tuition for 2 semesters or 12 monthly loan payments.</p>
    <div className="grid-2">
      <Field label="Amount per payment"><AmountInput symbol={currencySymbol()} value={v.amount} onChange={set('amount')} placeholder="0.00" /></Field>
      <Field label="Number of payments"><input className="control" inputMode="numeric" value={v.count} onChange={set('count')} placeholder="e.g. 12" /></Field>
    </div>
    {out?.error && <p className="field-error" role="alert">{out.error}</p>}
    {out?.total !== undefined && <div className="helper-result"><span>{money(v.amount)} × {v.count} = <strong>{money(out.total)}</strong></span><Button size="sm" variant="secondary" onClick={() => onUse(out.total)}>Use as target</Button></div>}
  </details>;
}
