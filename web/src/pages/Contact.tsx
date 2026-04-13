import { FormEvent, useState } from 'react';

export default function Contact() {
  const [sent, setSent] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const subject = encodeURIComponent(String(fd.get('subject') || 'Autexa web contact'));
    const body = encodeURIComponent(
      `Name: ${fd.get('name')}\nEmail: ${fd.get('email')}\n\n${fd.get('message')}`,
    );
    window.location.href = `mailto:support@autexa.app?subject=${subject}&body=${body}`;
    setSent(true);
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <h1>Contact</h1>
      <p>Reach our team. Replace the mailto address in production with your real support inbox.</p>
      <form className="card" onSubmit={onSubmit} style={{ display: 'grid', gap: '1rem' }}>
        <div>
          <label className="label" htmlFor="name">
            Name
          </label>
          <input className="input" id="name" name="name" required />
        </div>
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input className="input" id="email" name="email" type="email" required />
        </div>
        <div>
          <label className="label" htmlFor="subject">
            Subject
          </label>
          <input className="input" id="subject" name="subject" />
        </div>
        <div>
          <label className="label" htmlFor="message">
            Message
          </label>
          <textarea className="textarea" id="message" name="message" required />
        </div>
        <button type="submit" className="btn btn-primary">
          Open email client
        </button>
        {sent ? (
          <p style={{ margin: 0, fontSize: '0.9rem' }}>If your mail app did not open, email support@autexa.app.</p>
        ) : null}
      </form>
    </div>
  );
}
