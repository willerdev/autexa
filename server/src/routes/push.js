import { Router } from 'express';
import { requireUser } from '../lib/auth.js';
import { createServiceClient } from '../lib/supabase.js';

export const pushRouter = Router();
pushRouter.use(requireUser);

pushRouter.post('/register-token', async (req, res) => {
  try {
    const { expoPushToken, platform } = req.body ?? {};
    if (!expoPushToken || typeof expoPushToken !== 'string') {
      return res.status(400).json({ error: 'expoPushToken required' });
    }
    const sb = createServiceClient();
    const { error } = await sb.from('user_push_tokens').upsert(
      {
        user_id: req.user.id,
        expo_push_token: expoPushToken,
        platform: typeof platform === 'string' ? platform : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,expo_push_token' },
    );
    if (error) {
      console.error('[push/register-token]', error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[POST /push/register-token]', e);
    res.status(500).json({ error: e?.message || 'register-token failed' });
  }
});
