import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type Row = {
  id: string;
  date: string;
  time: string;
  status: string;
  service_name: string | null;
  providers: { name: string } | null;
};

export default function BookingsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const { data, error } = await supabase!
      .from('bookings')
      .select('id,date,time,status,service_name,providers(name)')
      .order('date', { ascending: false });
    if (error) {
      setErr(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as unknown as Row[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="account-page">
      <h1 className="account-h1">Recent activities</h1>
      <p className="account-muted" style={{ marginBottom: '1rem' }}>
        Your bookings from the same account as the Autexa app.
      </p>
      <Link to="/" className="btn btn-primary" style={{ marginBottom: '1.25rem', display: 'inline-flex' }}>
        Book a service
      </Link>
      {err ? <p className="form-error">{err}</p> : null}
      {loading ? (
        <p>Loading…</p>
      ) : rows.length === 0 ? (
        <div className="card">
          <p className="account-muted">No bookings yet.</p>
        </div>
      ) : (
        <ul className="bookings-web-list">
          {rows.map((b) => (
            <li key={b.id} className="card bookings-web-item">
              <strong>{b.service_name ?? 'Service'}</strong>
              <span className="account-muted">
                {(Array.isArray(b.providers) ? b.providers[0]?.name : b.providers?.name) ?? 'Provider'} · {b.date}{' '}
                {b.time} · {b.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
