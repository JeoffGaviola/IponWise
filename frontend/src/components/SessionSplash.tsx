import { useEffect, useState } from 'react';
import { PiggyBank } from 'lucide-react';

export type SplashMode = 'open' | 'enter' | 'leave';
const COPY: Record<SplashMode, { title: string; steps: string[] }> = {
  open: { title: 'Opening IponWise', steps: ['Checking your session…', 'Almost there…'] },
  enter: { title: 'Signing you in', steps: ['Verifying your account…', 'Loading your goals and accounts…', 'Getting your dashboard ready…'] },
  leave: { title: 'Signing you out', steps: ['Closing your session securely…', 'Clearing this device…', 'See you soon!'] },
};

export default function SessionSplash({ mode }: { mode: SplashMode }) {
  const copy = COPY[mode];
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, copy.steps.length - 1)), 650);
    return () => clearInterval(timer);
  }, [mode, copy.steps.length]);
  return <div className={`splash splash-${mode}`} role="status" aria-live="polite" aria-label={copy.title}>
    <div className="splash-card">
      <span className="splash-mark"><i className="splash-ring" aria-hidden="true" /><PiggyBank size={34} strokeWidth={2.2} aria-hidden="true" /></span>
      <strong className="splash-brand">Ipon<span>Wise</span></strong>
      <h1 className="splash-title">{copy.title}</h1>
      <p className="splash-step" key={step}>{copy.steps[step]}</p>
      <span className="splash-bar" aria-hidden="true"><i /></span>
    </div>
  </div>;
}
