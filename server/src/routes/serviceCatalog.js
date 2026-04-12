import { Router } from 'express';
import { requireUser } from '../lib/auth.js';
import { createServiceClient } from '../lib/supabase.js';

export const serviceCatalogRouter = Router();
serviceCatalogRouter.use(requireUser);

/** GET /api/services/types — schemas for provider UI + AI */
serviceCatalogRouter.get('/types', async (_req, res) => {
  try {
    const sb = createServiceClient();
    const { data, error } = await sb
      .from('service_type_schemas')
      .select('service_type, display_name, description, metadata_schema, booking_fields')
      .order('display_name');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ types: data ?? [] });
  } catch (e) {
    console.error('[GET /services/types]', e);
    res.status(500).json({ error: 'Could not load service types' });
  }
});

/** POST /api/services/types — providers or admins add a new type (AI learns on next request) */
serviceCatalogRouter.post('/types', async (req, res) => {
  try {
    const sb = createServiceClient();
    const { data: u, error: uErr } = await sb.from('users').select('role').eq('id', req.user.id).maybeSingle();
    if (uErr || !u?.role) return res.status(403).json({ error: 'Forbidden' });
    if (u.role !== 'provider' && u.role !== 'admin') {
      return res.status(403).json({ error: 'Only providers or admins can create service types' });
    }

    const { service_type, display_name, description, metadata_schema, booking_fields } = req.body ?? {};
    const st = String(service_type ?? '').trim().toLowerCase().replace(/\s+/g, '_');
    const dn = String(display_name ?? '').trim();
    if (!st || !dn) {
      return res.status(400).json({ error: 'service_type and display_name required' });
    }

    const row = {
      service_type: st,
      display_name: dn,
      description: description != null ? String(description) : null,
      metadata_schema: metadata_schema && typeof metadata_schema === 'object' ? metadata_schema : { fields: [] },
      booking_fields:
        booking_fields && typeof booking_fields === 'object'
          ? booking_fields
          : { required: ['date', 'time'], optional: ['notes'] },
    };

    const { data, error } = await sb.from('service_type_schemas').insert(row).select().single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'service_type already exists' });
      }
      return res.status(500).json({ error: error.message });
    }
    res.status(201).json(data);
  } catch (e) {
    console.error('[POST /services/types]', e);
    res.status(500).json({ error: 'Could not create service type' });
  }
});
