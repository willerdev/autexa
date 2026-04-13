import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { autexaApiFetch, getApiBase } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';

type Msg = { id: string; role: 'user' | 'assistant'; content: string };

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type Props = {
  accessToken: string | null;
};

export default function HomeAiChat({ accessToken }: Props) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Hi — I’m Autexa. Ask about bookings, services, your wallet, or cars. I use the same tools as the mobile app.',
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending || !accessToken) return;
    setErr('');
    setInput('');
    const userMsg: Msg = { id: uid(), role: 'user', content: text };
    setMessages((m) => [...m, userMsg]);
    setSending(true);
    try {
      const j = await autexaApiFetch<{ answer?: string; error?: string }>('/api/ai/chat', accessToken, {
        method: 'POST',
        json: { message: text },
      });
      const answer = typeof j.answer === 'string' && j.answer.trim() ? j.answer.trim() : j.error || 'No reply.';
      setMessages((m) => [...m, { id: uid(), role: 'assistant', content: answer }]);
    } catch (ex) {
      const msg = getErrorMessage(ex);
      setErr(msg);
      setMessages((m) => [...m, { id: uid(), role: 'assistant', content: `Sorry — ${msg}` }]);
    } finally {
      setSending(false);
    }
  }

  const apiOk = Boolean(getApiBase());

  return (
    <section className="home-section home-ai">
      <div className="home-section-head">
        <h2 className="home-section-title">Ask Autexa</h2>
        <p className="home-section-sub">Same AI assistant as the app — books, wallet, and account tools.</p>
      </div>
      <div className="home-ai-card card">
        {!apiOk ? (
          <p className="form-error" style={{ marginTop: 0 }}>
            Set <code>VITE_AUTEXA_API_URL</code> to enable chat.
          </p>
        ) : !accessToken ? (
          <p className="home-ai-gate">
            <Link to={`/login?next=${encodeURIComponent('/')}`}>Sign in</Link> to use Ask Autexa on the web (same account as
            the app).
          </p>
        ) : (
          <>
            <div className="home-ai-thread" aria-live="polite">
              {messages.map((m) => (
                <div key={m.id} className={`home-ai-bubble home-ai-bubble-${m.role}`}>
                  {m.content}
                </div>
              ))}
              {sending ? <div className="home-ai-bubble home-ai-bubble-assistant home-ai-typing">…</div> : null}
            </div>
            {err ? <p className="form-error">{err}</p> : null}
            <form className="home-ai-form" onSubmit={onSubmit}>
              <input
                className="input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g. I need a mechanic, show my bookings, wallet balance…"
                disabled={sending}
                aria-label="Message to Autexa"
              />
              <button type="submit" className="btn btn-primary" disabled={sending || !input.trim()}>
                Send
              </button>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
