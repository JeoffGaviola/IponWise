import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2, Upload } from 'lucide-react';
import { Button, FormAlert, IconButton } from './components/ui.tsx';
import { ConfirmDialog, useExitTransition } from './components/Modal.tsx';
import { initials } from './lib/format.ts';

export function Avatar({ name, url, className = '' }) {
  return url
    ? <img className={`avatar avatar-image ${className}`} src={url} alt={`${name || 'Profile'} profile`} />
    : <div className={`avatar ${className}`} aria-hidden="true">{initials(name)}</div>;
}

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

export default function AvatarManager({ name, url, onUpload, onDelete, disabled = false }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [dialog, closing] = useExitTransition(confirming || null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const choose = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!TYPES.includes(file.type)) { setProblem('Choose a JPEG, PNG, or WebP image.'); event.target.value = ''; return; }
    if (file.size > MAX_BYTES) { setProblem('Profile pictures must be 5 MB or smaller.'); event.target.value = ''; return; }
    setProblem('');
    setPreview(URL.createObjectURL(file));
  };

  const upload = async () => {
    const file = inputRef.current?.files?.[0];
    if (!file || busy) return;
    setBusy(true); setProblem('');
    const result = await onUpload(file);
    setBusy(false);
    if (result?.ok) { setPreview(''); if (inputRef.current) inputRef.current.value = ''; }
    else if (result?.inline) setProblem(result.error?.message || 'The picture could not be saved.');
  };

  const remove = async () => {
    setBusy(true);
    const result = await onDelete();
    setBusy(false);
    setConfirming(false);
    return result;
  };

  return <div className="avatar-manager">
    <Avatar name={name} url={preview || url} className="avatar-large" />
    <div className="avatar-manager-body">
      <strong>Profile picture</strong>
      <span className="muted">JPEG, PNG or WebP, up to 5 MB.</span>
      <div className="row-wrap">
        <Button variant="secondary" size="sm" icon={ImagePlus} disabled={disabled || busy} onClick={() => inputRef.current?.click()}>Choose image</Button>
        {preview && <Button size="sm" icon={Upload} loading={busy} onClick={upload}>Save picture</Button>}
        {url && !preview && <IconButton label="Remove profile picture" icon={Trash2} tone="danger" disabled={disabled || busy} onClick={() => setConfirming(true)} />}
      </div>
      <FormAlert>{problem}</FormAlert>
    </div>
    <input ref={inputRef} type="file" accept={TYPES.join(',')} hidden onChange={choose} data-testid="avatar-input" />
    {dialog && <ConfirmDialog closing={closing} title="Remove profile picture?" message="Your picture will be deleted and your initials will be shown instead." confirmLabel="Remove picture" busy={busy} onCancel={() => setConfirming(false)} onConfirm={remove} />}
  </div>;
}
