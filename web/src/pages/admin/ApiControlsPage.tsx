import { useEffect, useState } from 'react';
import { useAdminSession } from '../../context/AdminSessionContext';
import { adminFetch } from '../../lib/api';

type Controls = {
  flags: { twilio_sms: boolean; ai_chat: boolean; pitstop_assist: boolean };
  env: { twilioConfigured: boolean; geminiConfigured: boolean; flutterwaveConfigured: boolean };
};

export default function ApiControlsPage() {
  const { accessToken } = useAdminSession();
  const [data, setData] = useState<Controls | null>(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setErr('');
    try {
      const j = await adminFetch<Controls>('/api-controls', accessToken, {});
      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Load failed');
    }
  }

  useEffect(() => {
    void load();
  }, [accessToken]);

  async function save(patch: Partial<Controls['flags']>) {
    setSaving(true);
    setErr('');
    try {
      const j = await adminFetch<{ flags: Controls['flags'] }>('/api-controls', accessToken, {
        method: 'PUT',
        json: patch,
      });
      setData((d) => (d ? { ...d, flags: j.flags } : d));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return err ? <p style={{ color: 'var(--color-danger)' }}>{err}</p> : <p>Loading…</p>;
  }

  const row = (label: string, key: keyof Controls['flags'], hint: string) => (
    <div className="card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
      <div>
        <strong>{label}</strong>
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>{hint}</p>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={data.flags[key]}
          disabled={saving}
          onChange={(e) => void save({ [key]: e.target.checked })}
        />
        <span>{data.flags[key] ? 'On' : 'Off'}</span>
      </label>
    </div>
  );

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>API controls</h1>
      <p>Runtime toggles stored in Supabase. Env vars must still be present for integrations (e.g. Twilio keys).</p>
      {err ? <p style={{ color: 'var(--color-danger)' }}>{err}</p> : null}
      <h3>Environment detected</h3>
      <ul style={{ marginBottom: '1.5rem' }}>
        <li>Gemini (AI): {data.env.geminiConfigured ? 'configured' : 'missing GEMINI_API_KEY'}</li>
        <li>Twilio (SMS): {data.env.twilioConfigured ? 'configured' : 'not fully configured'}</li>
        <li>Flutterwave: {data.env.flutterwaveConfigured ? 'configured' : 'not fully configured'}</li>
      </ul>
      <h3>Feature switches</h3>
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {row('AI tool chat', 'ai_chat', 'POST /api/ai/chat with { message } — in-app Ask Autexa.')}
        {row('Pitstop assist', 'pitstop_assist', 'POST /api/pitstop/assist — legacy marketplace assistant in the app.')}
        {row('Twilio SMS', 'twilio_sms', 'Outbound SMS (notifications + send_uganda_sms tool). Off blocks sends even if Twilio is configured.')}
      </div>
    </div>
  );
}
