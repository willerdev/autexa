import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const links = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/api-controls', label: 'API controls' },
];

export default function AdminLayout() {
  const nav = useNavigate();

  async function signOut() {
    await supabase?.auth.signOut();
    nav('/admin/login', { replace: true });
  }

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <strong className="admin-brand">Autexa admin</strong>
        <nav className="admin-nav">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              style={({ isActive }) => ({
                fontWeight: 600,
                color: isActive ? 'var(--color-primary-dark)' : 'var(--color-primary)',
                textDecoration: isActive ? 'underline' : 'none',
              })}
            >
              {l.label}
            </NavLink>
          ))}
          <Link to="/" style={{ color: 'var(--color-text-secondary)' }}>
            Public site
          </Link>
          <button type="button" className="btn btn-secondary admin-signout" onClick={() => void signOut()}>
            Sign out
          </button>
        </nav>
      </header>
      <div className="admin-content">
        <Outlet />
      </div>
    </div>
  );
}
