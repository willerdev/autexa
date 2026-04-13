const items = [
  {
    title: 'Natural-language booking',
    body: 'Ask for a mechanic, car wash, or tow — Autexa uses tools to search real listings, not guesses.',
  },
  {
    title: 'Bill preview before you commit',
    body: 'Review a clear summary (and bill preview when enabled) before confirming a booking.',
  },
  {
    title: 'Wallet & payments',
    body: 'Top up and pay with methods that fit your region, including mobile money where supported.',
  },
  {
    title: 'Notifications',
    body: 'Stay updated on bookings, payments, and messages from providers.',
  },
  {
    title: 'Cars & history',
    body: 'Save vehicles and keep booking context for faster repeat service.',
  },
  {
    title: 'Provider tools',
    body: 'Providers can manage services, categories, and incoming work from the app.',
  },
];

export default function Features() {
  return (
    <div>
      <h1>Features</h1>
      <p>What you get with the Autexa mobile app today.</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '1.5rem 0 0', display: 'grid', gap: '1rem' }}>
        {items.map((f) => (
          <li key={f.title} className="card" style={{ margin: 0 }}>
            <h3>{f.title}</h3>
            <p style={{ margin: 0 }}>{f.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
