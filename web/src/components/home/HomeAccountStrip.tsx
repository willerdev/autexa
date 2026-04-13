import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { autexaApiFetch, getApiBase } from '../../lib/api';

type Ctx = {
  user?: { firstName?: string };
  wallet?: { formatted?: string } | null;
  cars?: unknown[];
  recentBookings?: unknown[];
};

type Props = {
  accessToken: string | null;
};

export default function HomeAccountStrip({ accessToken }: Props) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accessToken || !getApiBase()) {
      setCtx(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void autexaApiFetch<{ context: Ctx }>('/api/ai/context', accessToken, {})
      .then((j) => {
        if (!cancelled) setCtx(j.context ?? {});
      })
      .catch(() => {
        if (!cancelled) setCtx(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (!accessToken) {
    return (
      <section className="home-section home-account-guest card">
        <h2 className="home-section-title">Your Autexa</h2>
        <p>Wallet, cars, and bookings sync when you sign in with the same account as the app.</p>
        <Link to={`/login?next=${encodeURIComponent('/')}`} className="btn btn-primary">
          Sign in
        </Link>
      </section>
    );
  }

  return (
    <section className="home-section">
      <div className="home-section-head">
        <h2 className="home-section-title">Your Autexa</h2>
        <Link to="/account" className="home-link-all">
          Open full account →
        </Link>
      </div>
      {loading ? <p className="home-muted">Loading…</p> : null}
      <div className="home-account-grid">
        <div className="card home-stat-card">
          <div className="home-stat-label">Wallet</div>
          <div className="home-stat-value">{ctx?.wallet?.formatted ?? '—'}</div>
        </div>
        <div className="card home-stat-card">
          <div className="home-stat-label">My cars</div>
          <div className="home-stat-value">{ctx?.cars?.length ?? 0}</div>
        </div>
        <div className="card home-stat-card">
          <div className="home-stat-label">Recent bookings</div>
          <div className="home-stat-value">{ctx?.recentBookings?.length ?? 0}</div>
        </div>
      </div>
    </section>
  );
}
