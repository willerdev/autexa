import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  fetchPublicProviderDetail,
  getApiBase,
  type PublicListingRow,
  type PublicProviderRow,
} from '../lib/api';

function priceLabel(cents: number | null | undefined) {
  if (cents == null || !Number.isFinite(Number(cents))) return 'Quote';
  return `$${(Number(cents) / 100).toFixed(0)}`;
}

function ratingNum(r: number | string | null | undefined) {
  const n = typeof r === 'string' ? parseFloat(r) : Number(r);
  return Number.isFinite(n) ? n : 0;
}

function listingThumb(row: PublicListingRow): string | null {
  const u = row.image_url?.trim();
  if (u) return u;
  for (const x of row.gallery_urls ?? []) {
    if (typeof x === 'string' && x.trim()) return x.trim();
  }
  return null;
}

function listingGallery(row: PublicListingRow): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (u: string | null | undefined) => {
    const t = String(u ?? '').trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  };
  add(row.image_url);
  for (const x of row.gallery_urls ?? []) add(x);
  return out;
}

export default function ProviderDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const [provider, setProvider] = useState<PublicProviderRow | null>(null);
  const [listings, setListings] = useState<PublicListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!id || !getApiBase()) {
      setErr(getApiBase() ? 'Missing provider' : 'API URL is not configured.');
      setProvider(null);
      setListings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr('');
    void fetchPublicProviderDetail(id).then((data) => {
      if (cancelled) return;
      if (!data?.provider) {
        setErr('This provider could not be found or is no longer available.');
        setProvider(null);
        setListings([]);
      } else {
        setProvider(data.provider);
        setListings(data.listings ?? []);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const firstListing = listings[0];
  const hero =
    provider?.cover_image_url?.trim() || (firstListing ? listingThumb(firstListing) : null);

  return (
    <div className="provider-detail-page">
      <nav className="provider-detail-back">
        <Link to="/">← Back to home</Link>
      </nav>

      {loading ? <p className="home-muted">Loading…</p> : null}
      {!loading && err ? (
        <div className="card">
          <p className="form-error">{err}</p>
          <Link to="/" className="btn btn-primary">
            Go home
          </Link>
        </div>
      ) : null}

      {!loading && provider ? (
        <>
          <header className="provider-detail-hero">
            <div className="provider-detail-hero-media">
              {hero ? (
                <img
                  src={hero}
                  alt=""
                  className="provider-detail-hero-img"
                  loading="eager"
                  decoding="async"
                />
              ) : (
                <div className="provider-detail-hero-placeholder" aria-hidden />
              )}
            </div>
            <div className="provider-detail-hero-text">
              {!provider.is_available ? (
                <p className="provider-detail-unavailable">This provider is not accepting new bookings on Autexa right now.</p>
              ) : null}
              <h1 className="provider-detail-title">{provider.name}</h1>
              <p className="provider-detail-spec">{provider.service_type}</p>
              <div className="provider-detail-meta-row">
                <span className="home-provider-rating">★ {ratingNum(provider.rating).toFixed(1)}</span>
                <span className="account-muted">From {priceLabel(provider.base_price_cents)}</span>
              </div>
              {provider.location ? <p className="provider-detail-loc">{provider.location}</p> : null}
              <p className="provider-detail-book-hint">
                Book and pay in the Autexa app for the full checkout and wallet flow.
              </p>
              <Link to="/download" className="btn btn-primary btn-sm">
                Get the app
              </Link>
            </div>
          </header>

          <section className="provider-detail-listings">
            <h2 className="home-section-title">Posted services</h2>
            <p className="home-section-sub">Photos and prices from this provider&apos;s active listings.</p>
            {listings.length === 0 ? (
              <p className="home-muted">No active listings with photos yet.</p>
            ) : (
              <div className="provider-detail-grid">
                {listings.map((L) => {
                  const imgs = listingGallery(L);
                  return (
                    <article key={L.id} className="card provider-detail-card">
                      <div className="provider-detail-card-gallery">
                        {imgs.length > 0 ? (
                          imgs.slice(0, 4).map((src) => (
                            <a
                              key={src}
                              href={src}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="provider-detail-thumb-wrap"
                              aria-label="Open image full size"
                            >
                              <img src={src} alt="" className="provider-detail-thumb" loading="lazy" />
                            </a>
                          ))
                        ) : (
                          <div className="provider-detail-thumb-empty">No images</div>
                        )}
                      </div>
                      <h3 className="provider-detail-card-title">{L.title}</h3>
                      {L.service_type ? (
                        <p className="provider-detail-card-type">{L.service_type}</p>
                      ) : null}
                      <p className="provider-detail-price">{priceLabel(L.price_cents)}</p>
                      {L.description?.trim() ? (
                        <p className="provider-detail-desc">{L.description.trim()}</p>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
