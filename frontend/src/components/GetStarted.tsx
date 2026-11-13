import { ArrowRight, Check, EyeOff, PartyPopper } from 'lucide-react';
import { Button } from './ui.tsx';
import { progressOf, type StartStep } from '../lib/onboarding.ts';

/** A savings jar that fills with coins as setup steps are completed. Decorative; the numbers are in text. */
export function JarProgress({ percent }: { percent: number }) {
  const fill = Math.max(0, Math.min(100, percent));
  const top = 150 - (fill / 100) * 104;      // jar interior runs y=46..150
  return <div className="jar-wrap"><svg className="jar" viewBox="20 24 80 136" width="96" height="163" aria-hidden="true" focusable="false">
    <defs>
      <clipPath id="gs-jar-inside"><path d="M26 46 Q22 46 22 52 L22 142 Q22 154 34 154 L86 154 Q98 154 98 142 L98 52 Q98 46 94 46 Z" /></clipPath>
      <linearGradient id="gs-coin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFE08A" /><stop offset="1" stopColor="#E9A92C" /></linearGradient>
    </defs>
    <g clipPath="url(#gs-jar-inside)">
      <rect className="jar-fill" x="20" y={top} width="80" height="120" fill="url(#gs-coin)" />
      {fill > 0 && [0, 1, 2, 3, 4].map((i) => <ellipse key={i} cx={34 + i * 13} cy={top + 8 + (i % 2) * 9} rx="9" ry="3.2" fill="#fff" opacity="0.4" />)}
    </g>
    <path d="M26 46 Q22 46 22 52 L22 142 Q22 154 34 154 L86 154 Q98 154 98 142 L98 52 Q98 46 94 46 Z" fill="none" className="jar-glass" strokeWidth="3.5" />
    <rect x="30" y="30" width="60" height="16" rx="6" className="jar-lid" />
  </svg><span className="jar-percent">{fill}%</span></div>;
}

export default function GetStarted({ steps, onAction, onDismiss, dismissing = false }: { steps: StartStep[]; onAction: (step: StartStep) => void; onDismiss: () => void; dismissing?: boolean }) {
  const { done, total, percent, complete } = progressOf(steps);
  const next = steps.find((s) => !s.done);
  return <section className="getstarted" aria-labelledby="gs-title">
    <div className="gs-hero">
      <JarProgress percent={percent} />
      <div className="gs-copy">
        <h2 id="gs-title">{complete ? 'You’re all set up' : 'Get started with IponWise'}</h2>
        <p className="muted">{complete ? 'Every step is done. Keep adding money to your goals and your jar keeps growing.' : 'A few quick steps to turn “someday” into a plan. Do them in any order.'}</p>
        <p className="gs-count" role="status"><strong>{done} of {total}</strong> steps complete</p>
        <div className="gs-hero-actions">
          {next && <Button variant="success" onClick={() => onAction(next)}>{next.cta}<ArrowRight size={16} aria-hidden="true" /></Button>}
          {complete && <span className="gs-done"><PartyPopper size={18} aria-hidden="true" /> Nicely done</span>}
          <Button variant="secondary" icon={EyeOff} loading={dismissing} onClick={onDismiss}>Hide guide</Button>
        </div>
      </div>
    </div>
    <ul className="gs-steps" aria-label="Setup steps">
      {steps.map((step) => <li key={step.id} className={`gs-step ${step.done ? 'gs-step-done' : ''}`}>
        <span className="gs-check" aria-hidden="true">{step.done && <Check size={15} strokeWidth={3} />}</span>
        <div className="gs-step-body">
          <strong>{step.title}</strong>
          <p className="muted">{step.description}</p>
        </div>
        {step.done ? <span className="gs-status">Done<span className="sr-only">: {step.title}</span></span>
          : step.id === next?.id ? <Button size="sm" variant="secondary" aria-label={`${step.cta}: ${step.title}`} onClick={() => onAction(step)}>Next</Button>
          : <Button size="sm" variant="secondary" onClick={() => onAction(step)}>{step.cta}<span className="sr-only">: {step.title}</span></Button>}
      </li>)}
    </ul>
  </section>;
}
