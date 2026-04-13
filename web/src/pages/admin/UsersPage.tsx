import { FormEvent, useEffect, useState } from 'react';
import { useAdminSession } from '../../context/AdminSessionContext';
import { adminFetch } from '../../lib/api';

type UserRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  banned_at: string | null;
  created_at: string;
};

export default function UsersPage() {
  const { accessToken } = useAdminSession();
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setErr('');
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      const j = await adminFetch<{ users: UserRow[] }>(`/users?${params}`, accessToken, {});
      setUsers(j.users ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Load failed');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- search on mount; manual "Search" for q
  }, [accessToken]);

  async function ban(id: string) {
    setBusy(id);
    try {
      await adminFetch(`/users/${id}/ban`, accessToken, { method: 'POST', json: {} });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ban failed');
    } finally {
      setBusy(null);
    }
  }

  async function unban(id: string) {
    setBusy(id);
    try {
      await adminFetch(`/users/${id}/unban`, accessToken, { method: 'POST', json: {} });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unban failed');
    } finally {
      setBusy(null);
    }
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    void load();
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Users</h1>
      <p>Search by email, name, or phone. Banned users cannot call the API (403).</p>
      <form onSubmit={onSearch} className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label className="label" htmlFor="q">
            Search
          </label>
          <input className="input" id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="email, name, phone" />
        </div>
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>
      {err ? <p style={{ color: 'var(--color-danger)' }}>{err}</p> : null}
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{u.name || '—'}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{u.email || u.id}</div>
                </td>
                <td>
                  <span className="badge badge-admin">{u.role}</span>
                </td>
                <td>{u.banned_at ? <span className="badge badge-banned">Banned</span> : 'Active'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {u.banned_at ? (
                    <button type="button" className="btn btn-secondary" style={{ padding: '0.35rem 0.65rem' }} disabled={busy === u.id} onClick={() => void unban(u.id)}>
                      Unban
                    </button>
                  ) : (
                    <button type="button" className="btn btn-danger" style={{ padding: '0.35rem 0.65rem' }} disabled={busy === u.id} onClick={() => void ban(u.id)}>
                      Ban
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!users.length ? <p style={{ padding: '1rem' }}>No users found.</p> : null}
      </div>
    </div>
  );
}
