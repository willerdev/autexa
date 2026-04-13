import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PublicProviderRow, PublicServiceRow } from '../../lib/api';

function priceLabel(cents: number | null | undefined) {
  if (cents == null || !Number.isFinite(Number(cents))) return 'Quote';
  return `from $${(Number(cents) / 100).toFixed(0)}`;
}

function ratingNum(r: number | string | null | undefined) {
  const n = typeof r === 'string' ? parseFloat(r) : Number(r);
  return Number.isFinite(n) ? n : 0;
}

const QUICK_HINTS = ['Car Wash', 'Mechanic', 'Tow Truck', 'Detailing', 'Tire', 'Battery'];

type Props = {
  providers: PublicProviderRow[];
  services: PublicServiceRow[];
  loading: boolean;
};

export default function HomeBrowse({ providers, services, loading }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const s = new Set<string>();
    (services ?? []).forEach((x) => {
      if (x.category?.trim()) s.add(x.category.trim());
    });
    return Array.from(s).sort();
  }, [services]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const namesInCat =
      category == null
        ? null
        : new Set(
            (services ?? [])
              .filter((s) => s.category === category)
              .map((s) => s.name.toLowerCase()),
          );

    return (providers ?? []).filter((p) => {
      const st = (p.service_type ?? '').toLowerCase();
      const matchQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        st.includes(q) ||
        (p.location ?? '').toLowerCase().includes(q);
      if (!matchQ) return false;
      if (!namesInCat || namesInCat.size === 0) return true;
      for (const n of namesInCat) {
        if (st.includes(n) || n.includes(st)) return true;
      }
      return false;
    });
  }, [providers, query, category, services]);

  function applyQuickHint(name: string) {
    setQuery(name);
    setCategory(null);
  }

  return (
    <section className="home-section">
      <div className="home-section-head">
        <h2 className="home-section-title">Browse services & providers</h2>
        <p className="home-section-sub">Search real listings from your Autexa marketplace.</p>
      </div>

      <div className="home-search-row">
        <input
          className="input home-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search services or providers…"
          aria-label="Search providers"
        />
      </div>

      <div className="home-chips" role="group" aria-label="Quick services">
        {QUICK_HINTS.map((name) => (
          <button key={name} type="button" className="home-chip" onClick={() => applyQuickHint(name)}>
            {name}
          </button>
        ))}
      </div>

      {categories.length > 0 ? (
        <div className="home-chips home-chips-cats" role="group" aria-label="Categories">
          <button
            type="button"
            className={`home-chip ${category == null ? 'home-chip-active' : ''}`}
            onClick={() => setCategory(null)}
          >
            All categories
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={`home-chip ${category === c ? 'home-chip-active' : ''}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? <p className="home-muted">Loading providers…</p> : null}

      {!loading && filtered.length === 0 ? (
        <p className="home-muted">No providers match. Try another search or category.</p>
      ) : null}

      <div className="home-provider-grid">
        {filtered.map((p) => {
          const cover = p.cover_image_url?.trim();
          return (
            <Link key={p.id} to={`/providers/${p.id}`} className="card home-provider-card home-provider-card--link">
              <div className="home-provider-media">
                {cover ? (
                  <img
                    src={cover}
                    alt=""
                    className="home-provider-img"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="home-provider-img home-provider-img--placeholder" aria-hidden />
                )}
              </div>
              <div className="home-provider-tint" aria-hidden />
              <h3 className="home-provider-name">{p.name}</h3>
              <p className="home-provider-spec">{p.service_type}</p>
              <div className="home-provider-meta">
                <span className="home-provider-rating">★ {ratingNum(p.rating).toFixed(1)}</span>
                <span className="home-provider-price">{priceLabel(p.base_price_cents)}</span>
              </div>
              {p.location ? <p className="home-provider-loc">{p.location}</p> : null}
              <p className="home-provider-book-hint">View photos &amp; listings · book in the app</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
