import { useEffect, useState } from 'react';
import { CalendarDays, Clock3, LogOut, ShieldCheck, Trash2, Undo2, Users } from 'lucide-react';
import { api } from '../api.ts';
import { Button, ErrorState, LoadingBlock, PageHeading, Panel, Badge } from '../components/ui.tsx';
import Brand from '../components/Brand.tsx';

export default function SuperadminPortal({ session, onSignOut }) {
  const [state, setState] = useState({ status: 'loading', users: [], error: '' });
  const [busyUser, setBusyUser] = useState('');

  const loadUsers = async () => {
    const result = await api.adminUsers(session.access_token);
    setState({ status: 'ready', users: result.users || [], error: '' });
    return result;
  };

  useEffect(() => {
    let active = true;
    loadUsers()
      .then((result) => { if (active) setState({ status: 'ready', users: result.users || [], error: '' }); })
      .catch((error) => { if (active) setState({ status: 'error', users: [], error: error.message || 'Could not load the admin portal.' }); });
    return () => { active = false; };
  }, [session.access_token]);

  const changeUserStatus = async (user) => {
    if (busyUser) return;
    setBusyUser(user.id);
    try {
      if (user.status === 'removed') await api.restoreAdminUser(session.access_token, user.id);
      else await api.removeAdminUser(session.access_token, user.id);
      await loadUsers();
    } catch (error) {
      setState((current) => ({ ...current, error: error.message || 'Could not update this account.' }));
    } finally {
      setBusyUser('');
    }
  };

  const formatDate = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not recorded';
  const roleLabel = (role) => role === 'superadmin' ? 'Superadmin' : 'User';

  return <div className="superadmin-shell">
    <header className="superadmin-header">
      <Brand />
      <div className="superadmin-header-actions">
        <Button variant="ghost" size="sm" icon={LogOut} onClick={onSignOut}>Sign out</Button>
      </div>
    </header>
    <main className="superadmin-content">
      <PageHeading title="Superadmin portal" description="System-wide account and access overview." />
      {state.status === 'loading' && <LoadingBlock label="Loading system users…" rows={4} />}
      {state.status === 'error' && <ErrorState title="Couldn’t load the superadmin portal" message={state.error} />}
      {state.status === 'ready' && <>
        <div className="superadmin-stats">
          <div className="stat stat-primary"><span className="stat-icon"><ShieldCheck size={18} aria-hidden="true" /></span><div className="superadmin-stat-content"><p>Access level</p><strong>Superadmin</strong><small>Full system access</small></div></div>
          <div className="stat stat-info"><span className="stat-icon"><Users size={18} aria-hidden="true" /></span><div className="superadmin-stat-content"><p>Total accounts</p><strong>{state.users.length}</strong><small>Registered profiles</small></div></div>
        </div>
        <Panel title="System users" description="Review account identities, registration history, and assigned roles.">
          <div className="superadmin-users" role="list">
            {state.users.map((user) => <div className="superadmin-user" role="listitem" key={user.id}>
            <div className="superadmin-user-main">
              <div className="superadmin-user-identity"><strong>{user.display_name || 'Unnamed account'}</strong><span className="muted">{user.email || 'No email available'}</span></div>
              <div className="superadmin-timeline">
                <span><CalendarDays size={14} aria-hidden="true" /> Registered: {formatDate(user.registered_at)}</span>
                <span><Clock3 size={14} aria-hidden="true" /> Last sign-in: {formatDate(user.last_sign_in_at)}</span>
              </div>
            </div>
            <div className="superadmin-user-actions">
              <Badge tone={user.status === 'removed' ? 'warning' : user.role === 'superadmin' ? 'success' : 'neutral'}>{user.status === 'removed' ? 'Removed' : roleLabel(user.role)}</Badge>
              {user.role === 'user' && <Button variant={user.status === 'removed' ? 'secondary' : 'danger'} size="sm" icon={user.status === 'removed' ? Undo2 : Trash2} loading={busyUser === user.id} onClick={() => changeUserStatus(user)}>{user.status === 'removed' ? 'Recover' : 'Remove'}</Button>}
            </div>
            </div>)}
          </div>
        </Panel>
      </>}
    </main>
  </div>;
}
