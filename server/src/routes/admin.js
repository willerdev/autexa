import { Router } from 'express';
import { requireRole, requireUser } from '../lib/auth.js';
import { createServiceClient } from '../lib/supabase.js';
import { getApiFlags, mergeApiFlags } from '../lib/adminFeatureFlags.js';

export const adminRouter = Router();
adminRouter.use(requireUser);
adminRouter.use(requireRole('admin'));

function slugify(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 96);
}

adminRouter.get('/summary', async (_req, res) => {
  try {
    const sb = createServiceClient();
    const [users, bookings, providers] = await Promise.all([
      sb.from('users').select('id', { count: 'exact', head: true }),
      sb.from('bookings').select('id', { count: 'exact', head: true }),
      sb.from('providers').select('id', { count: 'exact', head: true }),
    ]);
    res.json({
      userCount: users.count ?? null,
      bookingCount: bookings.count ?? null,
      providerCount: providers.count ?? null,
    });
  } catch (e) {
    console.error('[GET /admin/summary]', e);
    res.status(500).json({ error: e?.message || 'summary failed' });
  }
});

adminRouter.get('/users', async (req, res) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
    const sb = createServiceClient();
    let query = sb
      .from('users')
      .select('id, name, email, phone, role, banned_at, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (q) {
      const esc = q.replace(/%/g, '\\%').replace(/_/g, '\\_');
      query = query.or(`email.ilike.%${esc}%,name.ilike.%${esc}%,phone.ilike.%${esc}%`);
    }
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ users: data ?? [] });
  } catch (e) {
    console.error('[GET /admin/users]', e);
    res.status(500).json({ error: e?.message || 'users list failed' });
  }
});

adminRouter.post('/users/:userId/ban', async (req, res) => {
  try {
    const userId = String(req.params.userId ?? '').trim();
    if (!userId) return res.status(400).json({ error: 'userId required' });
    if (userId === req.user.id) return res.status(400).json({ error: 'Cannot ban yourself' });
    const sb = createServiceClient();
    const { data, error } = await sb
      .from('users')
      .update({ banned_at: new Date().toISOString() })
      .eq('id', userId)
      .select('id, banned_at')
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true, user: data });
  } catch (e) {
    console.error('[POST /admin/users/ban]', e);
    res.status(500).json({ error: e?.message || 'ban failed' });
  }
});

adminRouter.post('/users/:userId/unban', async (req, res) => {
  try {
    const userId = String(req.params.userId ?? '').trim();
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const sb = createServiceClient();
    const { data, error } = await sb
      .from('users')
      .update({ banned_at: null })
      .eq('id', userId)
      .select('id, banned_at')
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true, user: data });
  } catch (e) {
    console.error('[POST /admin/users/unban]', e);
    res.status(500).json({ error: e?.message || 'unban failed' });
  }
});

adminRouter.get('/categories', async (_req, res) => {
  try {
    const sb = createServiceClient();
    const { data, error } = await sb
      .from('marketplace_categories')
      .select('id, name, slug, display_order, active, created_at')
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) {
      if (/marketplace_categories/.test(error.message) || error.code === '42P01') {
        return res.json({ categories: [] });
      }
      return res.status(500).json({ error: error.message });
    }
    res.json({ categories: data ?? [] });
  } catch (e) {
    console.error('[GET /admin/categories]', e);
    res.status(500).json({ error: e?.message || 'categories failed' });
  }
});

adminRouter.post('/categories', async (req, res) => {
  try {
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'name required' });
    const slug = String(req.body?.slug ?? '').trim() || slugify(name);
    const display_order = Number.isFinite(Number(req.body?.display_order))
      ? Math.floor(Number(req.body.display_order))
      : 0;
    const active = req.body?.active !== false;
    const sb = createServiceClient();
    const { data, error } = await sb
      .from('marketplace_categories')
      .insert({ name, slug, display_order, active })
      .select('id, name, slug, display_order, active, created_at')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ category: data });
  } catch (e) {
    console.error('[POST /admin/categories]', e);
    res.status(500).json({ error: e?.message || 'create category failed' });
  }
});

adminRouter.patch('/categories/:id', async (req, res) => {
  try {
    const id = String(req.params.id ?? '').trim();
    if (!id) return res.status(400).json({ error: 'id required' });
    const patch = {};
    if (req.body?.name != null) patch.name = String(req.body.name).trim();
    if (req.body?.slug != null) patch.slug = String(req.body.slug).trim() || null;
    if (req.body?.display_order != null && Number.isFinite(Number(req.body.display_order))) {
      patch.display_order = Math.floor(Number(req.body.display_order));
    }
    if (req.body?.active != null) patch.active = Boolean(req.body.active);
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'No fields to update' });
    const sb = createServiceClient();
    const { data, error } = await sb
      .from('marketplace_categories')
      .update(patch)
      .eq('id', id)
      .select('id, name, slug, display_order, active, created_at')
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json({ category: data });
  } catch (e) {
    console.error('[PATCH /admin/categories]', e);
    res.status(500).json({ error: e?.message || 'update failed' });
  }
});

adminRouter.delete('/categories/:id', async (req, res) => {
  try {
    const id = String(req.params.id ?? '').trim();
    if (!id) return res.status(400).json({ error: 'id required' });
    const sb = createServiceClient();
    const { error } = await sb.from('marketplace_categories').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /admin/categories]', e);
    res.status(500).json({ error: e?.message || 'delete failed' });
  }
});

adminRouter.get('/api-controls', async (_req, res) => {
  try {
    const flags = await getApiFlags();
    const twilioConfigured = Boolean(
      String(process.env.TWILIO_ACCOUNT_SID ?? '').trim() &&
        String(process.env.TWILIO_AUTH_TOKEN ?? '').trim() &&
        String(process.env.TWILIO_FROM_NUMBER ?? process.env.TWILIO_PHONE_NUMBER ?? '').trim(),
    );
    const geminiConfigured = Boolean(String(process.env.GEMINI_API_KEY ?? '').trim());
    res.json({
      flags,
      env: {
        twilioConfigured,
        geminiConfigured,
        flutterwaveConfigured: Boolean(
          String(process.env.FLUTTERWAVE_CLIENT_ID ?? '').trim() &&
            String(process.env.FLUTTERWAVE_CLIENT_SECRET ?? '').trim(),
        ),
      },
    });
  } catch (e) {
    console.error('[GET /admin/api-controls]', e);
    res.status(500).json({ error: e?.message || 'api-controls failed' });
  }
});

adminRouter.put('/api-controls', async (req, res) => {
  try {
    const body = req.body ?? {};
    const patch = {};
    if ('twilio_sms' in body) patch.twilio_sms = Boolean(body.twilio_sms);
    if ('ai_chat' in body) patch.ai_chat = Boolean(body.ai_chat);
    if ('pitstop_assist' in body) patch.pitstop_assist = Boolean(body.pitstop_assist);
    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: 'Provide twilio_sms, ai_chat, and/or pitstop_assist booleans' });
    }
    const flags = await mergeApiFlags(patch);
    res.json({ ok: true, flags });
  } catch (e) {
    console.error('[PUT /admin/api-controls]', e);
    res.status(500).json({ error: e?.message || 'api-controls update failed' });
  }
});

/** Public read for marketing site (no auth) — categories only */
export async function getPublicCategoriesHandler(req, res) {
  try {
    const sb = createServiceClient();
    const { data, error } = await sb
      .from('marketplace_categories')
      .select('id, name, slug, display_order')
      .eq('active', true)
      .order('display_order', { ascending: true });
    if (error) {
      if (/marketplace_categories/.test(error.message) || error.code === '42P01') {
        return res.json({ categories: [] });
      }
      return res.status(500).json({ error: error.message });
    }
    res.json({ categories: data ?? [] });
  } catch (e) {
    console.error('[GET /public/categories]', e);
    res.status(500).json({ error: e?.message || 'failed' });
  }
}
