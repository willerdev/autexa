import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ApiError,
  fetchGuestTopupStatus,
  fetchPublicPaymentLinkMeta,
  getApiBase,
  postPublicPaymentLinkTopup,
  type PublicPaymentLinkMeta,
} from '../lib/api';

type Momo = 'mtn' | 'airtel';

function num(v: string) {
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

export default function PayLinkPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [meta, setMeta] = useState<PublicPaymentLinkMeta | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [provider, setProvider] = useState<Momo>('mtn');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [pollId, setPollId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!slug || !getApiBase()) {
      setLoadErr(getApiBase() ? 'Invalid link' : 'Payment service is not configured.');
      setMeta(null);
      return;
    }
    void fetchPublicPaymentLinkMeta(slug).then((m) => {
      if (cancelled) return;
      if (!m) setLoadErr('This payment link is inactive or expired.');
      else {
        setMeta(m);
        const sug = m.suggested_amount_ugx != null ? Number(m.suggested_amount_ugx) : NaN;
        if (Number.isFinite(sug) && sug >= 1000) setAmount(String(Math.round(sug)));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!pollId) return;
    let cancelled = false;
    const t = setInterval(() => {
      void fetchGuestTopupStatus(pollId).then(
        (s) => {
          if (cancelled) return;
          if (s.status === 'success') {
            setPollId(null);
            setMsg('Payment completed. The recipient’s Autexa wallet will update shortly. Thank you.');
          } else if (s.status === 'failed') {
            setPollId(null);
            setMsg(s.reason ?? 'Payment failed.');
          } else if (s.status === 'expired') {
            setPollId(null);
            setMsg('This top-up session expired. You can try again.');
          }
        },
        () => {
          /* keep polling */
        },
      );
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [pollId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const a = num(amount);
    if (!Number.isFinite(a)) {
      setMsg('Enter a valid amount.');
      return;
    }
    if (!phone.trim()) {
      setMsg('Enter the mobile money number that will pay (MTN or Airtel).');
      return;
    }
    try {
      setBusy(true);
      const res = await postPublicPaymentLinkTopup(slug, { amount: a, phone: phone.trim(), provider });
      setMsg(res.message);
      setPollId(res.topupRequestId);
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Could not start payment.');
    } finally {
      setBusy(false);
    }
  }

  const sug =
    meta?.suggested_amount_ugx != null ? Number(meta.suggested_amount_ugx) : NaN;
  const fixedAmount = Number.isFinite(sug) && sug >= 1000;

  return (
    <div className="pay-link-page">
      <header className="pay-link-header">
        <Link to="/" className="site-logo">
          Autexa
        </Link>
      </header>
      <main className="pay-link-main">
        <h1>Send mobile money</h1>
        <p className="account-muted">
          Funds go to the Autexa user who shared this link. You do not need an Autexa account.
        </p>

        {loadErr ? <p className="form-error">{loadErr}</p> : null}

        {meta ? (
          <div className="card pay-link-card">
            {meta.title ? <h2 className="pay-link-title">{meta.title}</h2> : null}
            {fixedAmount ? (
              <p className="account-big">{Math.round(sug).toLocaleString()} UGX</p>
            ) : meta.suggested_amount_ugx != null ? (
              <p className="account-muted">Suggested: {Math.round(Number(meta.suggested_amount_ugx)).toLocaleString()} UGX</p>
            ) : null}
            {meta.expires_at ? (
              <p className="account-muted" style={{ fontSize: '0.85rem' }}>
                Link valid until {new Date(meta.expires_at).toLocaleString()}
              </p>
            ) : null}

            <form className="pay-link-form" onSubmit={(e) => void onSubmit(e)}>
              <div className="pay-link-field">
                <span className="label">Network</span>
                <div className="pay-link-toggle">
                  {(['mtn', 'airtel'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`pay-link-toggle__btn${provider === p ? ' pay-link-toggle__btn--on' : ''}`}
                      onClick={() => setProvider(p)}
                    >
                      {p === 'mtn' ? 'MTN' : 'Airtel'}
                    </button>
                  ))}
                </div>
              </div>
              {!fixedAmount ? (
                <label className="pay-link-field">
                  <span className="label">Amount (UGX)</span>
                  <input
                    className="input"
                    inputMode="numeric"
                    placeholder="e.g. 50000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
              ) : null}
              <label className="pay-link-field">
                <span className="label">Phone number paying</span>
                <input
                  className="input"
                  inputMode="tel"
                  placeholder="256…"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                />
              </label>
              {msg ? <p className={msg.startsWith('Payment completed') ? 'pay-link-success' : 'form-error'}>{msg}</p> : null}
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? 'Starting…' : 'Pay with mobile money'}
              </button>
            </form>
          </div>
        ) : null}
      </main>
    </div>
  );
}
