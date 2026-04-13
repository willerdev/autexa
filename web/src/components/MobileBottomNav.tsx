import { NavLink } from 'react-router-dom';

const tabs: { to: string; label: string; end?: boolean }[] = [
  { to: '/', label: 'Home', end: true },
  { to: '/bookings', label: 'Activities' },
  { to: '/cars', label: 'My cars' },
  { to: '/account', label: 'Profile' },
];

export default function MobileBottomNav() {
  return (
    <nav className="mobile-tabbar" aria-label="Main">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) => `mobile-tabbar__item${isActive ? ' mobile-tabbar__item--active' : ''}`}
        >
          <span className="mobile-tabbar__label">{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
