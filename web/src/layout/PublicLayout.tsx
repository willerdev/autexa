import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import MobileBottomNav from '../components/MobileBottomNav';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const nav = [
  { to: '/', label: 'Home' },
  { to: '/features', label: 'Features' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
  { to: '/download', label: 'Download' },
];

export default function PublicLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!supabase || !isSupabaseConfigured) return;
    void supabase.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session?.access_token));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session?.access_token));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onResize = () => {
      if (window.innerWidth > 768) setMenuOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [menuOpen]);

  return (
    <div className={`public-shell${signedIn ? ' public-shell--signed-in' : ''}`}>
      <header className="site-header">
        <div className="site-header-inner">
          <Link to="/" className="site-logo" onClick={() => setMenuOpen(false)}>
            Autexa
          </Link>
          <button
            type="button"
            className="nav-mobile-toggle"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="nav-mobile-toggle-bar" />
            <span className="nav-mobile-toggle-bar" />
            <span className="nav-mobile-toggle-bar" />
          </button>
          <nav className={`site-nav ${menuOpen ? 'site-nav-open' : ''}`}>
            {nav.map((item) => (
              <Link key={item.to} to={item.to} className="site-nav-link" onClick={() => setMenuOpen(false)}>
                {item.label}
              </Link>
            ))}
            {signedIn ? (
              <Link to="/account" className="site-nav-link site-nav-account" onClick={() => setMenuOpen(false)}>
                My account
              </Link>
            ) : (
              <Link to="/login" className="site-nav-link site-nav-account" onClick={() => setMenuOpen(false)}>
                Sign in
              </Link>
            )}
            <Link to="/admin" className="site-nav-admin" onClick={() => setMenuOpen(false)}>
              Admin
            </Link>
          </nav>
        </div>
        {menuOpen ? <button type="button" className="nav-backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} /> : null}
      </header>
      <main className="site-main">
        <Outlet />
      </main>
      <footer className="site-footer">
        © {new Date().getFullYear()} Autexa. All rights reserved.
      </footer>
      {signedIn ? <MobileBottomNav /> : null}
    </div>
  );
}
