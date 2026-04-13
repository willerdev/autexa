import { createServiceClient, createUserClient } from './supabase.js';

export async function requireUser(req, res, next) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return res.status(500).json({
        error: 'Server Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in server/.env and restart the API.',
      });
    }
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization bearer token' });
    }
    const token = h.slice(7).trim();
    if (!token) {
      return res.status(401).json({ error: 'Empty token' });
    }
    const supabase = createUserClient(token);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user?.id) {
      return res.status(401).json({ error: error?.message ?? 'Invalid or expired session' });
    }

    const svc = createServiceClient();
    const { data: prof, error: banErr } = await svc
      .from('users')
      .select('banned_at')
      .eq('id', user.id)
      .maybeSingle();
    if (banErr) {
      console.error('[auth] banned check', banErr);
    } else if (prof?.banned_at) {
      return res.status(403).json({ error: 'This account has been suspended.' });
    }

    req.authToken = token;
    req.user = user;
    next();
  } catch (e) {
    console.error('[auth] requireUser', e);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

export function requireRole(role) {
  return async (req, res, next) => {
    try {
      const sb = createServiceClient();
      const { data, error } = await sb.from('users').select('role').eq('id', req.user.id).maybeSingle();
      if (error || !data) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (data.role !== role) {
        return res.status(403).json({ error: `Requires role: ${role}` });
      }
      next();
    } catch (e) {
      console.error('[auth] requireRole', e);
      return res.status(500).json({ error: 'Authorization failed' });
    }
  };
}
