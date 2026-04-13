import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUserSession } from '../context/UserSessionContext';
import {
  adminFetch,
  ApiError,
  autexaApiFetch,
  createWalletPaymentLink,
  fetchWalletPaymentLinks,
  getApiBase,
  setWalletPaymentLinkActive,
  type WalletPaymentLinkRow,
} from '../lib/api';
import { supabase } from '../lib/supabase';

type AiContext = {
  user?: { firstName?: string };
  wallet?: { formatted?: string; balance?: number; currency?: string; is_locked?: boolean } | null;
  recentBookings?: { service_name?: string | null; provider_name?: string | null; date?: string; status?: string }[];
  cars?: unknown[];
  savedPayees?: unknown[];
  learnedMemories?: unknown[];
};

export default function AccountPage() {
  const { accessToken, email } = useUserSession();
  const [ctx, setCtx] = useState<AiContext | null>(null);
  const [ctxErr, setCtxErr] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [payLinks, setPayLinks] = useState<WalletPaymentLinkRow[]>([]);
  const [payLinksLoading, setPayLinksLoading] = useState(false);
  const [payTitle, setPayTitle] = useState('');
  const [paySuggested, setPaySuggested] = useState('');
  const [payErr, setPayErr] = useState('');
  const [payCreateBusy, setPayCreateBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setCtxErr('');
      if (!getApiBase()) {
        setCtx(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      try {
        const [ctxRes, adminProbe] = await Promise.allSettled([
          autexaApiFetch<{ context: AiContext }>('/api/ai/context', accessToken, {}),
          adminFetch('/summary', accessToken, {}),
        ]);
        if (cancelled) return;
        if (ctxRes.status === 'fulfilled') {
          setCtx(ctxRes.value.context ?? {});
        } else {
          setCtxErr(ctxRes.reason instanceof Error ? ctxRes.reason.message : 'Could not load account data');
        }
        setIsAdmin(adminProbe.status === 'fulfilled');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!getApiBase() || !accessToken) {
      setPayLinks([]);
      return;
    }
    let cancelled = false;
    setPayLinksLoading(true);
    void fetchWalletPaymentLinks(accessToken)
      .then((r) => {
        if (!cancelled) setPayLinks(r.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setPayLinks([]);
      })
      .finally(() => {
        if (!cancelled) setPayLinksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function signOut() {
    await supabase?.auth.signOut();
    window.location.href = '/';
  }

  async function onCreatePayLink() {
    setPayErr('');
    const sug = paySuggested.trim() ? Number(paySuggested.replace(/,/g, '')) : null;
    if (sug != null && (!Number.isFinite(sug) || sug < 1000)) {
      setPayErr('Suggested amount must be at least 1,000 UGX or leave empty.');
      return;
    }
    try {
      setPayCreateBusy(true);
      const row = await createWalletPaymentLink(accessToken, {
        title: payTitle.trim() || undefined,
        suggestedAmountUgx: sug,
      });
      setPayLinks((prev) => [row, ...prev]);
      setPayTitle('');
      setPaySuggested('');
    } catch (e) {
      setPayErr(e instanceof ApiError ? e.message : 'Could not create link');
    } finally {
      setPayCreateBusy(false);
    }
  }

  function payUrl(slug: string) {
    return `${window.location.origin}/pay/${slug}`;
  }

  async function copyPayUrl(slug: string) {
    try {
      await navigator.clipboard.writeText(payUrl(slug));
    } catch {
      /* ignore */
    }
  }

  async function deactivateLink(id: string) {
    try {
      await setWalletPaymentLinkActive(accessToken, id, false);
      setPayLinks((prev) => prev.map((r) => (r.id === id ? { ...r, active: false } : r)));
    } catch {
      /* ignore */
    }
  }

  const first = ctx?.user?.firstName || email.split('@')[0] || 'there';

  return (
    <div className="account-page">
      <header className="account-header">
        <div>
          <h1 className="account-h1">Hi, {first}</h1>
          <p className="account-email">{email}</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>

      {isAdmin ? (
        <div className="card admin-banner">
          <strong>Admin</strong>
          <span>You have full admin access.</span>
          <Link to="/admin" className="btn btn-primary btn-sm">
            Open admin portal
          </Link>
        </div>
      ) : null}

      {!getApiBase() ? (
        <div className="card">
          <h2>Connect the API</h2>
          <p>
            Add <code>VITE_AUTEXA_API_URL</code> in <code>web/.env</code> or <code>web/src/.env</code> (same base URL as
            the app) to load wallet, bookings, and cars here.
          </p>
        </div>
      ) : loading ? (
        <p>Loading your Autexa data…</p>
      ) : ctxErr ? (
        <div className="card">
          <p className="form-error">{ctxErr}</p>
        </div>
      ) : (
        <div className="account-grid">
          <div className="card">
            <h2>Wallet</h2>
            {ctx?.wallet ? (
              <>
                <p className="account-big">{ctx.wallet.formatted ?? `${ctx.wallet.balance} ${ctx.wallet.currency}`}</p>
                {ctx.wallet.is_locked ? <p className="form-error">Wallet locked</p> : null}
              </>
            ) : (
              <p>No wallet row yet — open the app to set up wallet.</p>
            )}
          </div>
          <div className="card">
            <h2>Vehicles</h2>
            <p className="account-big">{ctx?.cars?.length ?? 0}</p>
            <p className="account-muted">Cars saved in the app appear here.</p>
          </div>
          <div className="card">
            <h2>Saved payees</h2>
            <p className="account-big">{ctx?.savedPayees?.length ?? 0}</p>
          </div>
          <div className="card account-card-wide">
            <h2>Recent bookings</h2>
            {(ctx?.recentBookings?.length ?? 0) === 0 ? (
              <p className="account-muted">No recent bookings.</p>
            ) : (
              <ul className="account-booking-list">
                {(ctx?.recentBookings ?? []).map((b, i) => (
                  <li key={`${b.date}-${i}`}>
                    <span className="account-bk-service">{b.service_name ?? 'Service'}</span>
                    <span className="account-bk-meta">
                      {b.date} · {b.status}
                      {b.provider_name ? ` · ${b.provider_name}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {getApiBase() && accessToken ? (
        <section className="card account-card-wide" style={{ marginTop: '1.25rem' }}>
          <h2>Payment links</h2>
          <p className="account-muted">
            Share a link so anyone can top up your Autexa wallet with MTN or Airtel mobile money — they do not need an
            account. If you set a fixed amount, payers must send exactly that amount.
          </p>
          {payErr ? <p className="form-error">{payErr}</p> : null}
          <div className="pay-link-field" style={{ marginTop: '0.75rem' }}>
            <label className="label" htmlFor="pay-link-title">
              Label (optional)
            </label>
            <input
              id="pay-link-title"
              className="input"
              placeholder="e.g. Weekend wash"
              value={payTitle}
              onChange={(e) => setPayTitle(e.target.value)}
            />
          </div>
          <div className="pay-link-field">
            <label className="label" htmlFor="pay-link-sug">
              Fixed amount UGX (optional)
            </label>
            <input
              id="pay-link-sug"
              className="input"
              inputMode="numeric"
              placeholder="Leave empty for payer to choose"
              value={paySuggested}
              onChange={(e) => setPaySuggested(e.target.value)}
            />
          </div>
          <button type="button" className="btn btn-primary" disabled={payCreateBusy} onClick={() => void onCreatePayLink()}>
            {payCreateBusy ? 'Creating…' : 'Create link'}
          </button>
          {payLinksLoading ? <p style={{ marginTop: '1rem' }}>Loading links…</p> : null}
          {!payLinksLoading && payLinks.length === 0 ? (
            <p className="account-muted" style={{ marginTop: '1rem' }}>
              No links yet.
            </p>
          ) : null}
          {payLinks.map((row) => (
            <div key={row.id} className="account-pay-link-row">
              <p style={{ margin: '0 0 0.35rem', fontWeight: 600 }}>{row.title || 'Payment link'}</p>
              <p className="account-muted" style={{ margin: 0, fontSize: '0.8rem', wordBreak: 'break-all' }}>
                {payUrl(row.slug)}
              </p>
              {row.suggested_amount_ugx != null ? (
                <p className="account-muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
                  Fixed amount: {Math.round(Number(row.suggested_amount_ugx)).toLocaleString()} UGX
                </p>
              ) : null}
              <div className="account-pay-links-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copyPayUrl(row.slug)}>
                  Copy link
                </button>
                {row.active ? (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => void deactivateLink(row.id)}>
                    Deactivate
                  </button>
                ) : (
                  <span className="account-muted" style={{ fontSize: '0.85rem' }}>
                    Inactive
                  </span>
                )}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="card account-actions">
        <h2>Continue in the app</h2>
        <p>The mobile app has chat booking, payments, scans, and full provider tools.</p>
        <div className="account-action-btns">
          <Link to="/download" className="btn btn-primary">
            Download app
          </Link>
          <Link to="/features" className="btn btn-secondary">
            Features
          </Link>
          <Link to="/contact" className="btn btn-secondary">
            Contact
          </Link>
        </div>
      </section>
    </div>
  );
}
