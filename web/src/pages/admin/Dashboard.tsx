import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminSession } from '../../context/AdminSessionContext';
import { adminFetch } from '../../lib/api';

type Summary = { userCount: number | null; bookingCount: number | null; providerCount: number | null };

export default function Dashboard() {
  const { accessToken } = useAdminSession();
  const [s, setS] = useState<Summary | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    adminFetch<Summary>('/summary', accessToken, {})
      .then(setS)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load'));
  }, [accessToken]);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Overview</h1>
      {err ? <p style={{ color: 'var(--color-danger)' }}>{err}</p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
        {[
          { k: 'Users', v: s?.userCount, to: '/admin/users' },
          { k: 'Bookings', v: s?.bookingCount, to: null },
          { k: 'Providers', v: s?.providerCount, to: null },
        ].map((x) => (
          <div key={x.k} className="card">
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{x.k}</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{x.v ?? '—'}</div>
            {x.to ? (
              <Link to={x.to} style={{ fontSize: '0.85rem' }}>
                Manage →
              </Link>
            ) : null}
          </div>
        ))}
      </div>
      <h2 style={{ marginTop: '2rem' }}>Quick links</h2>
      <ul>
        <li>
          <Link to="/admin/users">Ban or unban users</Link>
        </li>
        <li>
          <Link to="/admin/categories">Curate marketplace categories (shown on the public site)</Link>
        </li>
        <li>
          <Link to="/admin/api-controls">Toggle AI chat, pitstop assist, and SMS</Link>
        </li>
      </ul>
    </div>
  );
}
