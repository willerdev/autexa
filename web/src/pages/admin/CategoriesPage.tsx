import { FormEvent, useEffect, useState } from 'react';
import { useAdminSession } from '../../context/AdminSessionContext';
import { adminFetch } from '../../lib/api';

type Cat = {
  id: string;
  name: string;
  slug: string | null;
  display_order: number;
  active: boolean;
  created_at: string;
};

export default function CategoriesPage() {
  const { accessToken } = useAdminSession();
  const [list, setList] = useState<Cat[]>([]);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [order, setOrder] = useState(0);
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try {
      const j = await adminFetch<{ categories: Cat[] }>('/categories', accessToken, {});
      setList(j.categories ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Load failed');
    }
  }

  useEffect(() => {
    void load();
  }, [accessToken]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await adminFetch('/categories', accessToken, {
        method: 'POST',
        json: {
          name: name.trim(),
          slug: slug.trim() || undefined,
          display_order: order,
          active: true,
        },
      });
      setName('');
      setSlug('');
      setOrder(0);
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Create failed');
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this category?')) return;
    try {
      await adminFetch(`/categories/${id}`, accessToken, { method: 'DELETE' });
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Delete failed');
    }
  }

  async function toggleActive(c: Cat) {
    try {
      await adminFetch(`/categories/${c.id}`, accessToken, {
        method: 'PATCH',
        json: { active: !c.active },
      });
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Update failed');
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Marketplace categories</h1>
      <p>Curated labels for the marketing site (and future app use). They appear on the public home when active.</p>
      {err ? <p style={{ color: 'var(--color-danger)' }}>{err}</p> : null}
      <form className="card" onSubmit={onAdd} style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.5rem', maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>Add category</h3>
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">Slug (optional)</label>
          <input className="input" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto from name if empty" />
        </div>
        <div>
          <label className="label">Display order</label>
          <input className="input" type="number" value={order} onChange={(e) => setOrder(Number(e.target.value))} />
        </div>
        <button type="submit" className="btn btn-primary">
          Add
        </button>
      </form>
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Order</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{c.slug || '—'}</td>
                <td>{c.display_order}</td>
                <td>{c.active ? 'Yes' : 'No'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className="btn btn-secondary" style={{ padding: '0.35rem 0.65rem', marginRight: 6 }} onClick={() => void toggleActive(c)}>
                    Toggle active
                  </button>
                  <button type="button" className="btn btn-danger" style={{ padding: '0.35rem 0.65rem' }} onClick={() => void remove(c.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length ? <p style={{ padding: '1rem' }}>No categories yet.</p> : null}
      </div>
    </div>
  );
}
