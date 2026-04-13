export default function Download() {
  return (
    <div>
      <h1>Download the app</h1>
      <p>Autexa is a native mobile experience. Point these buttons to your Play Store and App Store listings when ready.</p>
      <div className="card" style={{ maxWidth: 480, marginTop: '1.5rem' }}>
        <h3 style={{ marginTop: 0 }}>Android</h3>
        <p>Build with EAS or publish to Google Play, then set the public store URL here.</p>
        <a href="#" className="btn btn-primary" style={{ opacity: 0.7, pointerEvents: 'none' }}>
          Google Play (coming soon)
        </a>
        <h3 style={{ marginTop: '1.5rem' }}>iOS</h3>
        <p>After App Store review, add your App Store link.</p>
        <a href="#" className="btn btn-primary" style={{ opacity: 0.7, pointerEvents: 'none' }}>
          App Store (coming soon)
        </a>
      </div>
      <p style={{ marginTop: '1.5rem', fontSize: '0.9rem' }}>
        Developers: use the same Supabase project and API URL as configured in the mobile app.
      </p>
    </div>
  );
}
