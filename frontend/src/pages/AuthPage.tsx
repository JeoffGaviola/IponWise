import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, LockKeyhole, Mail, UserRound } from 'lucide-react';
import Brand from '../components/Brand.tsx';
import AuthScene from '../components/AuthScene.tsx';
import { Button, Field, FormAlert, PasswordInput, Spinner } from '../components/ui.tsx';
import { useToast } from '../components/Toast.tsx';
import { friendlyAuthError, providerName, readOAuthError } from '../lib/auth.ts';
import { isSupabaseConfigured, supabase } from '../supabase.ts';

type AuthMode = 'login' | 'signup' | 'forgot';
type SocialProvider = 'google' | 'facebook';
type BusyState = 'password' | SocialProvider | null;
type AuthValues = { name: string; email: string; password: string; confirm: string };
type AuthErrors = Partial<Record<keyof AuthValues, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROVIDER_KEY = 'iponwise-oauth-provider';
const COPY: Record<AuthMode, { title: string; subtitle: string; submit: string }> = {
  login: { title: 'Welcome back', subtitle: 'Sign in to see your savings, goals, and progress.', submit: 'Sign in' },
  signup: { title: 'Create your account', subtitle: 'Join with Google or Facebook, or register with your email — it takes about a minute.', submit: 'Create account' },
  forgot: { title: 'Reset your password', subtitle: 'Enter your email and we’ll send password reset instructions.', submit: 'Request reset link' },
};

function GoogleMark() {
  return <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.5v5.4h7.1c4.1-3.8 6.6-9.4 6.6-15.9z"/><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.4c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.6C8.1 41.1 15.5 46 24 46z"/><path fill="#FBBC05" d="M11.8 28.4c-.4-1.3-.7-2.7-.7-4.4s.3-3 .7-4.4v-5.6H4.5C3 17 2.2 20.4 2.2 24s.8 7 2.3 10l7.3-5.6z"/><path fill="#EA4335" d="M24 10.6c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.1 29.9 2 24 2 15.5 2 8.1 6.9 4.5 14l7.3 5.6c1.7-5.2 6.5-9 12.2-9z"/></svg>;
}

function FacebookMark() {
  return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.8v8.4A12 12 0 0 0 24 12z"/></svg>;
}

/** 0–4 from length and variety; only guidance, the server (Supabase) enforces its own rules. */
export function passwordStrength(password: string): { score: number; label: string } {
  if (!password) return { score: 0, label: '' };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password) || (/\d/.test(password) && password.length >= 10)) score += 1;
  if (password.length < 8) score = Math.min(score, 1);
  return { score, label: ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][score] };
}

export default function AuthPage() {
  const toast = useToast();
  const [mode, setMode] = useState<AuthMode>('login');
  const [values, setValues] = useState<AuthValues>({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<AuthErrors>({});
  const [busy, setBusy] = useState<BusyState>(null);
  const copy = COPY[mode];

  useEffect(() => {
    let last = '';
    try { last = sessionStorage.getItem(PROVIDER_KEY) || ''; } catch { /* session storage can be disabled */ }
    const message = readOAuthError(window.location.search, window.location.hash, last);
    if (message) {
      toast.error(message, { title: 'Sign-in didn’t complete', key: 'oauth-error' });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [toast]);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setErrors({});
  };

  const updateField = (name: keyof AuthValues) => (event: ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({ ...current, [name]: event.target.value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const validate = (): AuthErrors => {
    const found: AuthErrors = {};
    if (mode === 'signup' && values.name.trim().length < 2) found.name = 'Enter your name (at least 2 characters).';
    if (!EMAIL.test(values.email.trim())) found.email = 'Enter a valid email address, like name@example.com.';
    if (mode !== 'forgot') {
      if (!values.password) found.password = mode === 'signup' ? 'Create a password with at least 8 characters.' : 'Enter your password.';
      else if (mode === 'signup' && values.password.length < 8) found.password = 'Use at least 8 characters.';
    }
    if (mode === 'signup' && !found.password && values.confirm !== values.password) found.confirm = values.confirm ? 'The passwords don’t match.' : 'Re-enter your password to confirm it.';
    return found;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>('.auth-form [aria-invalid="true"]')?.focus());
      return;
    }
    if (!isSupabaseConfigured || !supabase) {
      toast.error('Sign-in isn’t configured for this build. Add your Supabase URL and public anon key to frontend/.env.local.', { title: 'Not configured', key: 'not-configured' });
      return;
    }

    const email = values.email.trim();
    setBusy('password');
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: values.password });
        if (error) throw error;
        toast.success('Welcome back! You’re signed in.', { title: 'Signed in' });
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: values.password,
          options: { data: { full_name: values.name.trim() }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          toast.warning('An account with this email already exists. Try signing in, or reset your password.', { title: 'Already registered' });
          switchMode('login');
        } else if (!data.session) {
          toast.success('Your account has been created. Check your inbox and verify your email address, then sign in.', { title: 'Verify your email', duration: 9000 });
          setValues((current) => ({ ...current, password: '', confirm: '' }));
          switchMode('login');
        } else {
          toast.success('Your account has been created. Welcome to IponWise!', { title: 'Account created' });
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) throw error;
        toast.success('Password reset instructions have been requested. If an account exists for that email, a reset link is on its way.', { title: 'Check your email', duration: 9000 });
        switchMode('login');
      }
    } catch (error) {
      const action = mode === 'login' ? 'signin' : mode === 'signup' ? 'signup' : 'reset';
      const message = friendlyAuthError(error, action);
      toast.error(message, { title: mode === 'login' ? 'Couldn’t sign in' : mode === 'signup' ? 'Couldn’t create account' : 'Couldn’t request reset', key: `auth:${mode}:${message}` });
    } finally {
      setBusy(null);
    }
  };

  const social = async (provider: SocialProvider) => {
    if (busy) return;
    if (!isSupabaseConfigured || !supabase) {
      toast.error(`${providerName(provider)} sign-in needs Supabase to be configured first.`, { title: 'Not configured', key: 'not-configured' });
      return;
    }
    setBusy(provider);
    try { sessionStorage.setItem(PROVIDER_KEY, provider); } catch { /* session storage can be disabled */ }
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });
      if (error) throw error;
      // Supabase navigates to the provider on success, so the busy state stays visible until redirect.
    } catch (error) {
      toast.error(readOAuthError('', `error_description=${encodeURIComponent((error as Error).message)}`, provider) || friendlyAuthError(error), { title: `${providerName(provider)} sign-in failed`, key: `oauth:${provider}` });
      setBusy(null);
    }
  };

  const strength = passwordStrength(values.password);
  const signup = mode === 'signup';
  return <main className="auth">
    <aside className="auth-visual">
      <AuthScene />
      <div className="auth-visual-copy">
        <Brand tone="light" />
        <div className="auth-visual-text">
          <h2>Every peso has a purpose.</h2>
          <p>Ipon today, ginhawa tomorrow.</p>
          <small>Ipon means saving. Ginhawa means comfort and peace of mind.</small>
        </div>
      </div>
    </aside>

    <section className="auth-panel" aria-labelledby="auth-heading">
      <div className="auth-panel-inner">
        {mode === 'forgot' && <button type="button" className="back-link" disabled={Boolean(busy)} onClick={() => switchMode('login')}><ArrowLeft size={16} aria-hidden="true" /> Back to sign in</button>}
        <div key={mode} className="auth-form-enter">
          <div className="auth-intro">
            <h1 id="auth-heading">{copy.title}</h1>
            <p className="muted">{copy.subtitle}</p>
          </div>

          {!isSupabaseConfigured && <FormAlert tone="warning">Sign-in isn’t configured for this build, so account actions will not work yet. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>frontend/.env.local</code>.</FormAlert>}

          {mode !== 'forgot' && <>
            <div className="social-stack" role="group" aria-label="Continue with a social account">
              <Button variant="secondary" size="lg" className="btn-social" loading={busy === 'google'} disabled={Boolean(busy) && busy !== 'google'} onClick={() => social('google')}><GoogleMark /> Continue with Google</Button>
              <Button variant="secondary" size="lg" className="btn-social" loading={busy === 'facebook'} disabled={Boolean(busy) && busy !== 'facebook'} onClick={() => social('facebook')}><FacebookMark /> Continue with Facebook</Button>
            </div>
            <div className="divider"><span>{signup ? 'or register with your email' : 'or sign in with your email'}</span></div>
          </>}

          <form className="stack auth-form" noValidate onSubmit={submit} aria-busy={busy === 'password'}>
            {signup && <Field label="Full name" error={errors.name}><input className="control" value={values.name} onChange={updateField('name')} autoComplete="name" placeholder="Maria Santos" /></Field>}
            <Field label="Email" error={errors.email}><input className="control" type="email" value={values.email} onChange={updateField('email')} autoComplete="email" placeholder="you@example.com" inputMode="email" /></Field>
            {mode !== 'forgot' && <Field label="Password" error={errors.password} hint={signup ? 'Use at least 8 characters. A mix of letters, numbers and symbols is stronger.' : undefined}>
              <PasswordInput className="control" value={values.password} onChange={updateField('password')} autoComplete={signup ? 'new-password' : 'current-password'} placeholder={signup ? 'Create a strong password' : 'Enter your password'} />
            </Field>}
            {signup && values.password && <div className={`strength strength-${strength.score}`} role="status" aria-live="polite"><span className="strength-bars" aria-hidden="true"><i /><i /><i /><i /></span><span>Password strength: <strong>{strength.label}</strong></span></div>}
            {signup && <Field label="Confirm password" error={errors.confirm}><PasswordInput className="control" value={values.confirm} onChange={updateField('confirm')} autoComplete="new-password" placeholder="Type your password again" /></Field>}
            {mode === 'login' && <button type="button" className="link-button align-end" disabled={Boolean(busy)} onClick={() => switchMode('forgot')}>Forgot password?</button>}
            <Button type="submit" size="lg" loading={busy === 'password'} disabled={Boolean(busy) && busy !== 'password'} icon={mode === 'forgot' ? Mail : signup ? UserRound : LockKeyhole}>{copy.submit}<ArrowRight size={16} aria-hidden="true" /></Button>
          </form>

          {busy && <p className="auth-progress" role="status" aria-live="polite"><Spinner size={15} /> {busy === 'password' ? mode === 'forgot' ? 'Requesting your reset link…' : signup ? 'Creating your account securely…' : 'Signing you in securely…' : `Connecting to ${providerName(busy)}…`}</p>}
          {mode !== 'forgot' && <p className="auth-switch">{mode === 'login' ? 'New to IponWise?' : 'Already have an account?'} <button type="button" className="link-button" disabled={Boolean(busy)} onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>}
          <p className="auth-legal">By continuing, you agree to our <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>.</p>
        </div>
      </div>
    </section>
  </main>;
}
