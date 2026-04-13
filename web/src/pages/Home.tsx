import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import HomeAccountStrip from '../components/home/HomeAccountStrip';
import HomeAiChat from '../components/home/HomeAiChat';
import HomeBrowse from '../components/home/HomeBrowse';
import { useAutexaSession } from '../hooks/useAutexaSession';
import {
  fetchPublicCategories,
  fetchPublicProviders,
  fetchPublicServices,
  getApiBase,
  type PublicProviderRow,
  type PublicServiceRow,
} from '../lib/api';

type Tab = 'browse' | 'ai';

export default function Home() {
  const { accessToken, email, signedIn } = useAutexaSession();
  const [tab, setTab] = useState<Tab>('browse');
  const [providers, setProviders] = useState<PublicProviderRow[]>([]);
  const [services, setServices] = useState<PublicServiceRow[]>([]);
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const firstName = email?.split('@')[0] ?? 'there';

  useEffect(() => {
    let cancelled = false;
    if (!getApiBase()) {
      setProviders([]);
      setServices([]);
      setCats([]);
      setCatalogLoading(false);
      return;
    }
    setCatalogLoading(true);
    void Promise.all([fetchPublicProviders(), fetchPublicServices(), fetchPublicCategories()])
      .then(([p, s, c]) => {
        if (cancelled) return;
        setProviders(p);
        setServices(s);
        setCats(c.map((x) => ({ id: x.id, name: x.name })));
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="home-app">
      <section className="home-hero card">
        <div className="home-hero-text">
          <h1 className="home-hero-title">{signedIn ? `Hello, ${firstName}` : 'Autexa'}</h1>
          <p className="home-hero-tagline">
            {signedIn
              ? 'Browse trusted pros or ask the AI — same data as your app.'
              : 'Book car care and services. Browse providers below or sign in for Ask Autexa and your wallet.'}
          </p>
          <div className="home-hero-actions">
            <Link to="/download" className="btn btn-primary">
              Get the app
            </Link>
            {!signedIn ? (
              <Link to={`/login?next=${encodeURIComponent('/')}`} className="btn btn-secondary">
                Sign in
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <HomeAccountStrip accessToken={accessToken} />

      <div className="home-tabs" role="tablist" aria-label="Home mode">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'browse'}
          className={`home-tab ${tab === 'browse' ? 'home-tab-active' : ''}`}
          onClick={() => setTab('browse')}
        >
          Browse
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'ai'}
          className={`home-tab ${tab === 'ai' ? 'home-tab-active' : ''}`}
          onClick={() => setTab('ai')}
        >
          Ask Autexa
        </button>
      </div>

      {tab === 'browse' ? (
        <HomeBrowse providers={providers} services={services} loading={catalogLoading} />
      ) : (
        <HomeAiChat accessToken={accessToken} />
      )}

      {cats.length > 0 ? (
        <section className="home-section">
          <h2 className="home-section-title">Featured categories</h2>
          <p className="home-section-sub">Curated by the Autexa team.</p>
          <div className="home-cat-pills">
            {cats.map((c) => (
              <span key={c.id} className="home-cat-pill">
                {c.name}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
