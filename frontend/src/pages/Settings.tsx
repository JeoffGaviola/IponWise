import { useState, type ReactNode } from 'react';
import { Download, FileText, LogOut, Save, ShieldCheck } from 'lucide-react';
import AvatarManager from '../AvatarManager.tsx';
import { Button, Field, FormAlert, PageHeading, Panel, Toggle } from '../components/ui.tsx';
import { CURRENCIES } from '../lib/format.ts';

function Row({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div className="setting-row"><div><strong>{title}</strong><p className="muted">{description}</p></div>{children}</div>;
}

export default function Settings({ profile, email, avatarUrl, onSaveProfile, onUploadAvatar, onDeleteAvatar, onExport, exporting, onSignOut, signingOut }) {
  const [name, setName] = useState(profile.display_name || '');
  const [nameError, setNameError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pref, setPref] = useState('');

  const saveName = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length > 120) { setNameError('Names can be up to 120 characters.'); return; }
    if (trimmed === (profile.display_name || '')) { setNameError(''); return; }
    setNameError(''); setSaving(true);
    const result = await onSaveProfile({ display_name: trimmed });
    setSaving(false);
    if (result?.inline) setNameError(result.error?.message || 'Could not save your name.');
    else if (result?.ok) setName(trimmed);
  };

  const savePref = async (key, patch) => { setPref(key); await onSaveProfile(patch, 'Your preferences have been saved.'); setPref(''); };

  return <>
    <PageHeading title="Profile & settings" description="Manage how IponWise looks and what it remembers about you." />
    <div className="settings-grid">
      <Panel title="Profile">
        <AvatarManager name={profile.display_name || email} url={avatarUrl} onUpload={onUploadAvatar} onDelete={onDeleteAvatar} />
        <form className="stack" noValidate onSubmit={saveName}>
          <Field label="Display name" error={nameError}><input className="control" value={name} onChange={(e) => { setName(e.target.value); setNameError(''); }} maxLength={120} autoComplete="name" /></Field>
          <Field label="Email" hint="Managed by your sign-in provider."><input className="control" value={email || ''} readOnly /></Field>
          <div><Button type="submit" variant="warning" icon={Save} loading={saving} disabled={name.trim() === (profile.display_name || '')}>Save profile</Button></div>
        </form>
      </Panel>

      <Panel title="Preferences" description="Saved to your account and restored on every device.">
        <Row title="Theme" description="Match your device, or choose light or dark.">
          <select className="control control-inline" aria-label="Theme" value={profile.theme} disabled={pref === 'theme'} onChange={(e) => savePref('theme', { theme: e.target.value })}>
            <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
          </select>
        </Row>
        <Row title="Currency" description="Used to display amounts across IponWise. Changes the symbol only. Amounts are not converted.">
          <select className="control control-inline" aria-label="Currency" value={profile.currency_code} disabled={pref === 'currency'} onChange={(e) => savePref('currency', { currency_code: e.target.value })}>
            {Object.entries(CURRENCIES).map(([code, c]) => <option key={code} value={code}>{code} — {c.label}</option>)}
          </select>
        </Row>
        <Row title="Get started guide" description="The setup checklist on your dashboard. Hide it once you’re comfortable, or bring it back any time.">
          <Toggle label="Show the Get started guide" checked={!profile.onboarding_dismissed} disabled={pref === 'guide'} onChange={(v) => savePref('guide', { onboarding_dismissed: !v })} />
        </Row>
        <Row title="Savings reminders" description="Stores your preference; reminders are shown in-app regardless. Email and push delivery are not active.">
          <Toggle label="Savings reminders" checked={profile.savings_reminders_enabled} disabled={pref === 'reminders'} onChange={(v) => savePref('reminders', { savings_reminders_enabled: v })} />
        </Row>
        <Row title="Email summaries" description="Stores your preference. Email delivery isn’t active yet.">
          <Toggle label="Email summaries" checked={profile.email_summaries_enabled} disabled={pref === 'email'} onChange={(v) => savePref('email', { email_summaries_enabled: v })} />
        </Row>
      </Panel>

      <Panel title="Your data">
        <Row title="Export transactions" description="Download every transaction as a CSV file."><Button variant="secondary" icon={Download} loading={exporting} onClick={onExport}>Export CSV</Button></Row>
        <Row title="Privacy" description="How IponWise handles your information."><a className="btn btn-secondary btn-md" href="/privacy"><ShieldCheck size={17} aria-hidden="true" /> Privacy Policy</a></Row>
        <Row title="Terms" description="The rules for using IponWise."><a className="btn btn-secondary btn-md" href="/terms"><FileText size={17} aria-hidden="true" /> Terms of Service</a></Row>
      </Panel>

      <Panel title="Account">
        <FormAlert tone="info">IponWise records the amounts you enter. It does not verify balances with your bank.</FormAlert>
        <Row title="Sign out" description="End your session on this device."><Button variant="secondary" icon={LogOut} loading={signingOut} onClick={onSignOut}>Sign out</Button></Row>
      </Panel>
    </div>
  </>;
}
