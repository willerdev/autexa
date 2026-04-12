import { Router } from 'express';
import { requireRole, requireUser } from '../lib/auth.js';
import { createServiceClient } from '../lib/supabase.js';

export const adminRouter = Router();
adminRouter.use(requireUser);
adminRouter.use(requireRole('admin'));

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
