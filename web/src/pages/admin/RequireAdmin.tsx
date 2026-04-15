import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AdminSessionContext } from '../../context/AdminSessionContext';
import { adminFetch, ApiError } from '../../lib/api';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

export default function RequireAdmin({ children }: { children: any }) {
  const [phase, setPhase] = useState<'loading' | 'redirect' | 'deny' | 'ready'>('loading');
  const [token, setToken] = useState('');

  useEffect(() => {
    (async () => {
      if (!supabase || !isSupabaseConfigured) {
        setPhase('redirect');
        return;
      }
      const { data } = await supabase.auth.getSession();
      const t = data.session?.access_token;
      if (!t) {
        setPhase('redirect');
        return;
      }
      try {
        await adminFetch('/summary', t, {});
        setToken(t);
        setPhase('ready');
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) {
          setPhase('deny');
        } else if (e instanceof ApiError && (e.status === 401 || e.status === 0)) {
          setPhase('redirect');
        } else {
          setPhase('redirect');
        }
      }
    })();
  }, []);

  if (phase === 'loading') {
    return (
      <div style={{ minHeight: '50vh', display: 'grid', placeItems: 'center' }}>
        <div className="card">Checking admin access…</div>
      </div>
    );
  }
  if (phase === 'redirect') {
    return <Navigate to="/login?next=/admin" replace />;
  }
  if (phase === 'deny') {
    return (
      <div className="page-center" style={{ padding: '1rem' }}>
        <div className="card" style={{ maxWidth: 420 }}>
          <h2 style={{ marginTop: 0 }}>Admin only</h2>
          <p>
            This area is for administrators. Your account is signed in — use <strong>My account</strong> for your personal
            hub, or ask a developer to set <code>role = admin</code> on <code>public.users</code> if you need admin tools.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <Link to="/account" className="btn btn-primary">
              My account
            </Link>
            <Link to="/login?next=/admin" className="btn btn-secondary">
              Try another account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <AdminSessionContext.Provider value={{ accessToken: token }}>{children}</AdminSessionContext.Provider>;
}
