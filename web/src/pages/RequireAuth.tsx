import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { UserSessionContext } from '../context/UserSessionContext';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export default function RequireAuth({ children }: { children: any }) {
  const loc = useLocation();
  const [phase, setPhase] = useState<'loading' | 'in' | 'out'>('loading');
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (!supabase || !isSupabaseConfigured) {
      setPhase('out');
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      if (!s?.access_token) {
        setPhase('out');
        return;
      }
      setToken(s.access_token);
      setEmail(s.user?.email ?? '');
      setPhase('in');
    });
  }, []);

  if (phase === 'loading') {
    return (
      <div className="page-center">
        <div className="card" style={{ maxWidth: 360 }}>
          <p style={{ margin: 0 }}>Loading your session…</p>
        </div>
      </div>
    );
  }
  if (phase === 'out') {
    return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  }

  return (
    <UserSessionContext.Provider value={{ accessToken: token, email }}>{children}</UserSessionContext.Provider>
  );
}
