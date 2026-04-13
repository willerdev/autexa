import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Car = {
  id: string;
  make: string;
  model: string;
  year: string;
  plate: string;
};

export default function CarsPage() {
  const [cars, setCars] = useState<Car[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const { data, error } = await supabase!.from('cars').select('id,make,model,year,plate').order('created_at', {
      ascending: false,
    });
    if (error) {
      setErr(error.message);
      setCars([]);
    } else {
      setCars((data ?? []) as Car[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="account-page">
      <h1 className="account-h1">My cars</h1>
      <p className="account-muted" style={{ marginBottom: '1.25rem' }}>
        Vehicles you save in the app sync here when you use the same sign-in.
      </p>
      {err ? <p className="form-error">{err}</p> : null}
      {loading ? (
        <p>Loading…</p>
      ) : cars.length === 0 ? (
        <div className="card">
          <p className="account-muted">No cars yet — add one in the mobile app.</p>
        </div>
      ) : (
        <ul className="bookings-web-list">
          {cars.map((c) => (
            <li key={c.id} className="card bookings-web-item">
              <strong>
                {[c.make, c.model].filter(Boolean).join(' ') || 'Vehicle'}
              </strong>
              <span className="account-muted">
                {c.year ? `${c.year} · ` : ''}
                {c.plate || 'No plate'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
