import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { adminFetch, ApiError, getApiBase } from '../lib/api';

function safeNext(raw: string | null, fallback: string) {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return fallback;
  if (raw.includes('://')) return fallback;
  return raw;
}

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const nav = useNavigate();
  const next = useMemo(() => safeNext(searchParams.get('next'), '/account'), [searchParams]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const supabaseOk = isSupabaseConfigured && supabase;
  const apiOk = Boolean(getApiBase());

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!supabaseOk) {
      setError('Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (in web/.env or web/src/.env).');
      return;
    }
    setBusy(true);
    try {
      const { data, error: signErr } = await supabase!.auth.signInWithPassword({ email, password });
      if (signErr) {
        setError(signErr.message);
        return;
      }
      const token = data.session?.access_token;
      if (!token) {
        setError('No session returned.');
        return;
      }

      const wantsAdmin = next === '/admin' || next.startsWith('/admin/');

      if (wantsAdmin) {
        if (!apiOk) {
          setError('Admin sign-in needs VITE_AUTEXA_API_URL so we can verify your role.');
          return;
        }
        try {
          await adminFetch('/summary', token, {});
          nav(next, { replace: true });
          return;
        } catch (err) {
          if (err instanceof ApiError && err.status === 403) {
            nav('/account', { replace: true });
            return;
          }
          throw err;
        }
      }

      nav(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-center">
      <div className="card login-card">
        <h1 className="login-title">Sign in</h1>
        <p className="login-sub">
          Use the same email and password as in the Autexa app. After signing in you can open your account hub on the web;
          admins can open the admin portal from there or by choosing Admin below.
        </p>
        <form onSubmit={onSubmit} className="login-form">
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              className="input"
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              inputMode="email"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              className="input"
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error ? <p className="form-error">{error}</p> : null}
          {!supabaseOk ? <p className="form-error">Missing Supabase env vars — check web/.env or web/src/.env</p> : null}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="login-links">
          <Link to="/">← Back to site</Link>
          <span className="login-links-sep">·</span>
          <Link to="/login?next=/admin">Admin portal sign-in</Link>
        </div>
      </div>
    </div>
  );
}
