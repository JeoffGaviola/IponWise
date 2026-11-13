import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, CreditCard, ImageUp, Landmark, QrCode, RefreshCw, ShieldCheck } from 'lucide-react';
import { Modal } from './Modal.tsx';
import { AmountInput, Badge, Button, ErrorState, Field, FormAlert, LoadingBlock, Spinner } from './ui.tsx';
import { Sparkline } from './charts.tsx';
import { useForm } from '../hooks/useForm.ts';
import { NETWORK_LABELS, checkCardEntry, containsCardNumber, formatCardInput, maskedCard, type CardNetwork } from '../lib/card.ts';
import { cameraSupported, decodeQrFromFile, decodeQrPixels, parseWalletQr, type ScannedWallet } from '../lib/qr.ts';
import { CURRENCIES, currencySymbol, dateLabel, money } from '../lib/format.ts';
import { PROVIDER_SUGGESTIONS, freshness } from '../lib/wallets.ts';
import { amountError } from '../lib/validate.ts';

const FormButtons = ({ form, onClose, label, icon: Icon, variant = 'success', disabled }: { form: any; onClose: () => void; label: string; icon: any; variant?: any; disabled?: boolean }) => <div className="modal-actions">
  <Button variant="secondary" onClick={onClose} disabled={form.submitting}>Cancel</Button>
  <Button type="submit" variant={variant} icon={Icon} loading={form.submitting} disabled={disabled}>{label}</Button>
</div>;

const ProviderList = () => <datalist id="provider-suggestions">{PROVIDER_SUGGESTIONS.map((p) => <option key={p} value={p} />)}</datalist>;
const SafetyNote = () => <p className="safe-note"><ShieldCheck size={16} aria-hidden="true" /><span>IponWise only <strong>tracks</strong>. It can’t see or move your money, and never asks for your PIN, CVV, password or one-time codes.</span></p>;

function cameraMessage(error: any): string {
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access is blocked. Allow the camera in your browser settings, or upload a screenshot of the QR code instead.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device. Upload a screenshot of the QR code instead.';
  return 'We couldn’t start the camera. Upload a screenshot of the QR code instead.';
}

function QrCameraView({ onText, onProblem }: { onText: (text: string) => void; onProblem: (message: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const textRef = useRef(onText); textRef.current = onText;
  const problemRef = useRef(onProblem); problemRef.current = onProblem;
  const [starting, setStarting] = useState(true);
  useEffect(() => {
    let stopped = false; let stream: MediaStream | null = null; let raf = 0; let last = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const detector = 'BarcodeDetector' in window ? new (window as any).BarcodeDetector({ formats: ['qr_code'] }) : null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const video = videoRef.current; if (!video) return;
        video.srcObject = stream; await video.play(); setStarting(false);
        const tick = async (now: number) => {
          if (stopped) return;
          if (now - last > 160 && video.readyState >= 2 && video.videoWidth) {
            last = now; let found: string | null = null;
            try {
              if (detector) found = (await detector.detect(video))[0]?.rawValue ?? null;
              else if (ctx) { const k = Math.min(1, 720 / video.videoWidth); canvas.width = Math.round(video.videoWidth * k); canvas.height = Math.round(video.videoHeight * k); ctx.drawImage(video, 0, 0, canvas.width, canvas.height); const img = ctx.getImageData(0, 0, canvas.width, canvas.height); found = decodeQrPixels(img.data, img.width, img.height); }
            } catch { /* a bad frame is fine; try the next one */ }
            if (found) { textRef.current(found); return; }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (error) { if (!stopped) problemRef.current(cameraMessage(error)); }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return <div className="scan-view">
    <video ref={videoRef} className="scan-video" playsInline muted aria-label="Camera preview for scanning a QR code" />
    <span className="scan-frame" aria-hidden="true" />
    {starting && <span className="scan-starting"><Spinner size={18} /> Starting camera…</span>}
  </div>;
}

type SubmitFn = (values: any) => unknown;

export function ScanWalletModal({ onSubmit, onClose, closing = false }: { onSubmit: SubmitFn; onClose: () => void; closing?: boolean }) {
  const [method, setMethod] = useState<'camera' | 'upload'>(cameraSupported() ? 'camera' : 'upload');
  const [scanned, setScanned] = useState<ScannedWallet | null>(null);
  const [scanError, setScanError] = useState('');
  const [reading, setReading] = useState(false);
  const [scanKey, setScanKey] = useState(0);
  const [pasted, setPasted] = useState('');
  const [values, setValues] = useState({ provider: '', name: '', accountTail: '', balance: '', currencyCode: 'PHP', note: '' });

  const handleText = (text: string) => {
    const result = parseWalletQr(text);
    if (!result.valid) { setScanError('That doesn’t look like an e-wallet or bank payment QR. Open the “My QR” or “Receive money” screen in your wallet app and try again.'); setScanKey((k) => k + 1); return; }
    setScanError(''); setScanned(result);
    setValues((v) => ({ ...v, provider: result.provider, name: result.provider ? `${result.provider} wallet` : '', accountTail: result.accountTail, currencyCode: CURRENCIES[result.currency] ? result.currency : v.currencyCode }));
  };
  const handleFile = async (file?: File | null) => {
    if (!file) return;
    setReading(true); setScanError('');
    try {
      const text = await decodeQrFromFile(file);
      if (!text) setScanError('We couldn’t find a QR code in that image. Try a sharper, well-lit screenshot with the whole code visible.');
      else handleText(text);
    } catch { setScanError('That file couldn’t be read as an image. Choose a PNG or JPG screenshot of the QR code.'); }
    setReading(false);
  };

  const validate = useMemo(() => (v: any) => {
    const e: Record<string, string> = {};
    if (v.provider.trim().length < 2) e.provider = 'Choose or type the provider, e.g. GCash.';
    if (v.name.trim().length < 2) e.name = 'Give this account a name (at least 2 characters).';
    const b = amountError(v.balance, { label: 'Balance', allowZero: true }); if (b) e.balance = b;
    if (!/^[0-9A-Za-z]{0,4}$/.test(v.accountTail.trim())) e.accountTail = 'Use up to 4 letters or digits.';
    if ([v.name, v.provider, v.note].some((t) => containsCardNumber(t))) e.note = 'Please don’t enter a full card number.';
    return e;
  }, []);
  const form = useForm({ validate, onSubmit: (v: any) => onSubmit({ name: v.name.trim(), provider: v.provider.trim(), kind: scanned?.kind || 'ewallet', balance: v.balance, currencyCode: v.currencyCode, note: v.note.trim(), source: 'qr', accountTail: v.accountTail.trim() || undefined }) });
  const set = (name: string) => (e: any) => { setValues((v) => ({ ...v, [name]: e.target.value })); form.clearError(name); };

  return <Modal title={scanned ? 'Confirm your account' : 'Scan an e-wallet QR code'} description={scanned ? 'Check what we read from the QR code, then enter the balance you see in your wallet app.' : 'Point your camera at the “My QR” or “Receive money” code in your wallet app.'} onClose={onClose} closing={closing} busy={form.submitting} size="lg">
    {!scanned ? <div className="stack">
      <SafetyNote />
      <div className="segmented" role="group" aria-label="How to read the QR code">
        <button type="button" className="seg" aria-pressed={method === 'camera'} disabled={!cameraSupported()} onClick={() => { setMethod('camera'); setScanError(''); setScanKey((k) => k + 1); }}><Camera size={16} aria-hidden="true" /> Use camera</button>
        <button type="button" className="seg" aria-pressed={method === 'upload'} onClick={() => { setMethod('upload'); setScanError(''); }}><ImageUp size={16} aria-hidden="true" /> Upload image</button>
      </div>
      {method === 'camera' && cameraSupported() && <QrCameraView key={scanKey} onText={handleText} onProblem={(m) => { setScanError(m); setMethod('upload'); }} />}
      {method === 'upload' && <label className="dropzone"><ImageUp size={22} aria-hidden="true" /><strong>{reading ? 'Reading QR code…' : 'Choose a screenshot of the QR code'}</strong><span className="muted">PNG or JPG. It is read on this device and not uploaded.</span>
        <input type="file" accept="image/*" aria-label="QR code image" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} /></label>}
      <FormAlert>{scanError}</FormAlert>
      <details className="helper"><summary>Trouble scanning? Paste the QR text</summary>
        <div className="stack"><Field label="QR code text" hint="Some apps let you copy the code as text."><textarea className="control" rows={3} value={pasted} onChange={(e) => setPasted(e.target.value)} /></Field>
          <div><Button variant="info" icon={QrCode} disabled={!pasted.trim()} onClick={() => handleText(pasted)}>Read this text</Button></div></div></details>
      <p className="fine-print">A QR code only identifies an account. It can never reveal a balance, so you’ll type the balance yourself in the next step.</p>
      <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button></div>
    </div>
      : <form ref={form.formRef} className="stack" noValidate onSubmit={(e) => form.handleSubmit(e, values)}>
        <ProviderList />
        <FormAlert>{form.serverError}</FormAlert>
        <div className="found-card" role="status"><CheckCircle2 size={18} aria-hidden="true" /><div><strong>QR code read{scanned.provider ? ` — looks like ${scanned.provider}` : ''}</strong>
          <span className="muted">{scanned.displayName ? `Name on the code: ${scanned.displayName}. ` : ''}{scanned.accountTail ? `Reference ending ${scanned.accountTail}. ` : ''}{scanned.currency ? `Currency: ${scanned.currency}.` : ''}</span></div></div>
        {scanned.notes.map((n) => <FormAlert key={n} tone="warning">{n}</FormAlert>)}
        <div className="grid-2">
          <Field label="Provider" error={form.errors.provider}><input className="control" list="provider-suggestions" value={values.provider} onChange={set('provider')} placeholder="e.g. GCash" autoComplete="off" /></Field>
          <Field label="Account name" error={form.errors.name} hint="How you’ll recognise it."><input className="control" value={values.name} onChange={set('name')} placeholder="e.g. GCash for daily use" maxLength={80} /></Field>
        </div>
        <div className="grid-2">
          <Field label={`Balance in ${values.provider || 'your wallet app'}`} error={form.errors.balance} hint="Type the balance shown in your app today."><AmountInput symbol={currencySymbol(values.currencyCode)} value={values.balance} onChange={set('balance')} placeholder="0.00" autoFocus /></Field>
          <Field label="Currency"><select className="control" value={values.currencyCode} onChange={set('currencyCode')}>{Object.entries(CURRENCIES).map(([code, c]) => <option key={code} value={code}>{code} — {c.label}</option>)}</select></Field>
        </div>
        <Field label="Reference ending" optional error={form.errors.accountTail} hint="Last 4 characters only, to tell similar accounts apart."><input className="control" value={values.accountTail} onChange={set('accountTail')} maxLength={4} autoComplete="off" /></Field>
        <Field label="Note" optional error={form.errors.note}><input className="control" value={values.note} onChange={set('note')} maxLength={250} /></Field>
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => { setScanned(null); setScanKey((k) => k + 1); }} disabled={form.submitting} icon={RefreshCw}>Scan again</Button>
          <Button type="submit" variant="success" icon={Landmark} loading={form.submitting}>Add account</Button>
        </div>
      </form>}
  </Modal>;
}

export function CardModal({ onSubmit, onClose, closing = false }: { onSubmit: SubmitFn; onClose: () => void; closing?: boolean }) {
  const [values, setValues] = useState({ digits: '', network: '' as CardNetwork | '', name: '', provider: '', balance: '', currencyCode: 'PHP' });
  const check = useMemo(() => (values.digits ? checkCardEntry(values.digits, values.network) : null), [values.digits, values.network]);
  const validate = useMemo(() => (v: any) => {
    const e: Record<string, string> = {};
    const c = checkCardEntry(v.digits, v.network); if ('error' in c) e.digits = c.error;
    if (v.name.trim().length < 2) e.name = 'Give this card a name, e.g. “Payroll ATM”.';
    if (containsCardNumber(v.name) || containsCardNumber(v.provider)) e.name = 'Please don’t put the card number in the name.';
    if (v.provider.trim().length < 2) e.provider = 'Enter the bank that issued the card.';
    const b = amountError(v.balance, { label: 'Balance', allowZero: true }); if (b) e.balance = b;
    return e;
  }, []);
  // Send only privacy-safe card metadata to the API.
  const form = useForm({ validate, onSubmit: (v: any) => { const c: any = checkCardEntry(v.digits, v.network); return onSubmit({ name: v.name.trim(), provider: v.provider.trim(), kind: 'atm', balance: v.balance, currencyCode: v.currencyCode, note: '', source: 'card', cardLast4: c.last4, cardNetwork: c.network }); } });
  const set = (name: string) => (e: any) => { setValues((v) => ({ ...v, [name]: e.target.value })); form.clearError(name); };
  const shownNetwork = check && check.ok ? check.network : 'other';

  return <Modal title="Add an ATM or debit card" description="Track the balance of a card you use. We keep only the last 4 digits." onClose={onClose} closing={closing} busy={form.submitting} size="lg">
    <form ref={form.formRef} className="stack" noValidate onSubmit={(e) => form.handleSubmit(e, values)} autoComplete="off">
      <ProviderList />
      <SafetyNote />
      <FormAlert>{form.serverError}</FormAlert>
      <Field label="Card number or last 4 digits" error={form.errors.digits} hint="You can type the whole number or just the last 4. It’s checked on this device, then discarded.">
        <input className="control card-input" name="iponwise-card-digits" inputMode="numeric" autoComplete="off" autoCorrect="off" spellCheck={false} placeholder="•••• •••• •••• 1234" value={formatCardInput(values.digits)} onChange={(e) => { setValues((v) => ({ ...v, digits: e.target.value.replace(/\D/g, '').slice(0, 19) })); form.clearError('digits'); }} />
      </Field>
      <div className={`card-preview ${check && check.ok ? 'card-preview-ok' : ''}`} aria-live="polite">
        <CreditCard size={20} aria-hidden="true" />
        <div><strong>{NETWORK_LABELS[shownNetwork]} {check && check.ok ? maskedCard(check.last4) : '•••• ••••'}</strong>
          <span className="muted">{check && check.ok ? (check.mode === 'full' ? 'Number looks valid. Only the last 4 digits will be saved.' : 'Last 4 digits only.') : 'Nothing is saved until you add the card.'}</span></div>
      </div>
      <div className="grid-2">
        <Field label="Card name" error={form.errors.name}><input className="control" value={values.name} onChange={set('name')} placeholder="e.g. Payroll ATM" maxLength={80} /></Field>
        <Field label="Bank or issuer" error={form.errors.provider}><input className="control" list="provider-suggestions" value={values.provider} onChange={set('provider')} placeholder="e.g. BDO" autoComplete="off" /></Field>
      </div>
      <div className="grid-2">
        <Field label="Card network" hint="Detected automatically. Change it if it’s wrong."><select className="control" value={values.network || shownNetwork} onChange={set('network')}>{Object.entries(NETWORK_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Balance (from your bank app or ATM slip)" error={form.errors.balance}><AmountInput symbol={currencySymbol(values.currencyCode)} value={values.balance} onChange={set('balance')} placeholder="0.00" /></Field>
      </div>
      <FormButtons form={form} onClose={onClose} label="Add card" icon={CreditCard} />
    </form>
  </Modal>;
}

export function BalanceModal({ wallet, onSubmit, onClose, closing = false }: { wallet: any; onSubmit: (wallet: any, balance: number, checkIn: boolean) => unknown; onClose: () => void; closing?: boolean }) {
  const [balance, setBalance] = useState(String(wallet.balance));
  const [mode, setMode] = useState<'update' | 'confirm'>('update');
  const form = useForm({ validate: (v: any) => { const e = amountError(v.balance, { label: 'Balance', allowZero: true }); return e ? { balance: e } : {}; }, onSubmit: (v: any) => onSubmit(wallet, Number(v.balance), mode === 'confirm') });
  const fresh = freshness(wallet);
  return <Modal title={`Update ${wallet.name}`} description="Enter the balance you see in your app right now. Each update is saved so you can see your trend." onClose={onClose} closing={closing} busy={form.submitting}>
    <form ref={form.formRef} className="stack" noValidate onSubmit={(e) => form.handleSubmit(e, { balance })}>
      <FormAlert>{form.serverError}</FormAlert>
      <p className="muted">Last saved balance <strong>{money(wallet.balance, wallet.currencyCode)}</strong> · {fresh.label.toLowerCase()}</p>
      <Field label="Current balance" error={form.errors.balance}><AmountInput symbol={currencySymbol(wallet.currencyCode)} value={balance} onChange={(e) => { setBalance(e.target.value); setMode('update'); form.clearError('balance'); }} autoFocus /></Field>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose} disabled={form.submitting}>Cancel</Button>
        <Button variant="info" icon={CheckCircle2} disabled={form.submitting || Number(balance) !== Number(wallet.balance)} onClick={() => { setMode('confirm'); setTimeout(() => form.formRef.current?.requestSubmit(), 0); }}>It’s still correct</Button>
        <Button type="submit" variant="warning" icon={RefreshCw} loading={form.submitting} disabled={Number(balance) === Number(wallet.balance)} onClick={() => setMode('update')}>Save new balance</Button>
      </div>
    </form>
  </Modal>;
}

export function HistoryModal({ wallet, load, onClose, closing = false }: { wallet: any; load: () => Promise<any[]>; onClose: () => void; closing?: boolean }) {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; rows: any[]; error?: string }>({ status: 'loading', rows: [] });
  const run = () => { setState({ status: 'loading', rows: [] }); load().then((rows) => setState({ status: 'ready', rows }), (e) => setState({ status: 'error', rows: [], error: e?.message })); };
  useEffect(run, []); // eslint-disable-line react-hooks/exhaustive-deps
  const chronological = [...state.rows].reverse();
  return <Modal title={`${wallet.name} balance history`} description="Every balance you’ve recorded, newest first." onClose={onClose} closing={closing} size="lg">
    {state.status === 'loading' && <LoadingBlock label="Loading history…" rows={3} />}
    {state.status === 'error' && <ErrorState title="Couldn’t load history" message={state.error} onRetry={run} />}
    {state.status === 'ready' && <div className="stack">
      <Sparkline points={chronological.map((r) => r.balance)} width={520} height={72} label="Balance trend" />
      <ul className="history-list">{state.rows.map((r, i) => {
        const prev = state.rows[i + 1]; const delta = prev ? Math.round((r.balance - prev.balance) * 100) / 100 : null;
        return <li key={`${r.recordedAt}-${i}`}><span className="muted">{dateLabel(r.recordedAt)}</span><strong>{money(r.balance, wallet.currencyCode)}</strong>
          <span>{r.reason === 'created' ? <Badge tone="info" icon={false}>Added</Badge> : r.reason === 'check-in' ? <Badge tone="success">Confirmed</Badge> : <Badge tone="warning" icon={false}>Updated</Badge>}{delta !== null && delta !== 0 && <span className={`delta ${delta > 0 ? 'delta-up' : 'delta-down'}`}>{delta > 0 ? '+' : '−'}{money(Math.abs(delta), wallet.currencyCode)}</span>}</span></li>;
      })}</ul>
    </div>}
    <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Close</Button></div>
  </Modal>;
}
