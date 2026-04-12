import { Router } from 'express';
import { requireUser } from '../lib/auth.js';
import { createServiceClient } from '../lib/supabase.js';
import { normalizeBookingPaymentMethod } from '../lib/bookingPayments.js';
import { buildTextReceiptLines } from '../lib/bookingBillPreview.js';
import { listProvidersAvailable, parseDistanceKm } from '../lib/providers.js';

export const pitstopRouter = Router();
pitstopRouter.use(requireUser);

function norm(s) {
  return String(s ?? '').trim().toLowerCase();
}

pitstopRouter.post('/provider/ensure-profile', async (req, res) => {
  try {
    const sb = createServiceClient();
    const userId = req.user.id;

    const { data: userRow } = await sb.from('users').select('id,name,email').eq('id', userId).maybeSingle();
    const displayName = userRow?.name?.trim() || userRow?.email?.split('@')?.[0] || 'Provider';

    const { data: existing } = await sb
      .from('providers')
      .select('id,name,user_id,service_type,location,is_available,base_price_cents,rating')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing?.id) {
      return res.json({ provider: existing });
    }

    const { data: created, error } = await sb
      .from('providers')
      .insert({
        user_id: userId,
        name: displayName,
        service_type: 'general',
        location: '',
        is_available: true,
        base_price_cents: 4999,
        rating: 4.5,
      })
      .select('id,name,user_id,service_type,location,is_available,base_price_cents,rating')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ provider: created });
  } catch (e) {
    console.error('[POST /pitstop/provider/ensure-profile]', e);
    return res.status(500).json({ error: e?.message || 'ensure-profile failed' });
  }
});

function pickService(services, query) {
  const q = norm(query);
  if (!q) return null;
  // Basic keyword matching against service name/slug/category.
  const scored = services.map((s) => {
    const name = norm(s.name);
    const slug = norm(s.slug);
    const cat = norm(s.category);
    let score = 0;
    if (slug && q.includes(slug)) score += 6;
    if (name && q.includes(name)) score += 6;
    if (name && name.includes(q)) score += 5;
    if (slug && slug.includes(q)) score += 5;
    if (cat && q.includes(cat)) score += 3;
    // common synonyms
    if (q.includes('mechanic') && (name.includes('mechanic') || slug.includes('mechanic'))) score += 4;
    if (q.includes('car wash') && (name.includes('wash') || slug.includes('wash'))) score += 4;
    if (q.includes('tow') && (name.includes('tow') || slug.includes('tow'))) score += 4;
    if (q.includes('tire') && (name.includes('tire') || slug.includes('tire'))) score += 4;
    if (q.includes('battery') && (name.includes('battery') || slug.includes('battery'))) score += 4;
    return { s, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score ? scored[0].s : null;
}

function rankProviders(providers, intent) {
  const wantsCheapest = intent.includes('cheap') || intent.includes('cheapest') || intent.includes('lowest price');
  const wantsNearest = intent.includes('near') || intent.includes('closest');

  const scored = providers.map((p) => {
    const dist = parseDistanceKm(p.location);
    const rating = Number(p.rating) || 0;
    const price = Number(p.base_price_cents) || 5000;
    // Simple marketplace score (not AI): tuned for action, not advice.
    let score = rating * 10 - dist * 0.8 - price / 1500;
    if (wantsCheapest) score -= price / 300; // weight price harder
    if (wantsNearest) score -= dist * 3;
    return { id: p.id, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.id);
}

pitstopRouter.post('/find-services', async (req, res) => {
  try {
    const { query } = req.body ?? {};
    const sb = createServiceClient();
    const { data, error } = await sb.from('services').select('id,name,category,slug').order('name');
    if (error) return res.status(500).json({ error: error.message });
    const q = norm(query);
    const list = (data ?? []).filter((s) => {
      if (!q) return true;
      return norm(s.name).includes(q) || norm(s.slug).includes(q) || norm(s.category).includes(q);
    });
    return res.json({ services: list });
  } catch (e) {
    console.error('[POST /pitstop/find-services]', e);
    return res.status(500).json({ error: e?.message || 'find-services failed' });
  }
});

pitstopRouter.post('/find-providers', async (req, res) => {
  try {
    const { serviceId, serviceName } = req.body ?? {};
    const sb = createServiceClient();
    let service = null;
    if (serviceId) {
      const { data } = await sb.from('services').select('id,name,category,slug').eq('id', serviceId).maybeSingle();
      service = data ?? null;
    }
    const providers = await listProvidersAvailable();
    const target = norm(serviceName || service?.name || '');
    const filtered = target
      ? providers.filter((p) => norm(p.service_type).includes(target) || target.includes(norm(p.service_type)))
      : providers;

    const out = filtered.map((p) => ({
      id: p.id,
      name: p.name,
      price_cents: p.base_price_cents ?? 5000,
      rating: Number(p.rating) || 0,
      distance_km: parseDistanceKm(p.location),
      availability: p.is_available ? 'available' : 'unavailable',
    }));
    return res.json({ providers: out });
  } catch (e) {
    console.error('[POST /pitstop/find-providers]', e);
    return res.status(500).json({ error: e?.message || 'find-providers failed' });
  }
});

pitstopRouter.post('/get-user-bookings', async (req, res) => {
  try {
    const sb = createServiceClient();
    const { data, error } = await sb
      .from('bookings')
      .select('id,date,time,status,service_name,payment_status,providers(name)')
      .eq('user_id', req.user.id)
      .order('date', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ bookings: data ?? [] });
  } catch (e) {
    console.error('[POST /pitstop/get-user-bookings]', e);
    return res.status(500).json({ error: e?.message || 'get-user-bookings failed' });
  }
});

pitstopRouter.post('/create-booking', async (req, res) => {
  try {
    const { providerId, date, time, serviceName, paymentMethod } = req.body ?? {};
    if (!providerId || !date || !time) {
      return res.status(400).json({ error: 'providerId, date, time are required' });
    }
    const sb = createServiceClient();
    const { data, error } = await sb
      .from('bookings')
      .insert({
        user_id: req.user.id,
        provider_id: providerId,
        date,
        time,
        status: 'pending',
        payment_status: 'unpaid',
        payment_method: paymentMethod || 'card',
        service_name: serviceName ?? null,
      })
      .select('id')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    // Save an in-app notification for the user.
    await sb.from('user_notifications').insert({
      user_id: req.user.id,
      title: 'Booking created',
      body: `Your booking is ready. Complete payment to confirm.`,
      data: {
        booking_id: data.id,
        provider_id: providerId,
        service_name: serviceName ?? null,
        date,
        time,
        payment_method: paymentMethod || 'card',
      },
    });
    return res.json({ booking: { id: data.id } });
  } catch (e) {
    console.error('[POST /pitstop/create-booking]', e);
    return res.status(500).json({ error: e?.message || 'create-booking failed' });
  }
});

pitstopRouter.post('/auto-book', async (req, res) => {
  try {
    const { text, date, time, serviceName, strategy, paymentMethod } = req.body ?? {};
    const input = String(text ?? '').trim();
    const lower = norm(input);
    const sb = createServiceClient();
    const { data: services, error } = await sb.from('services').select('id,name,category,slug').order('name');
    if (error) return res.status(500).json({ error: error.message });

    const svc = serviceName ? { id: null, name: serviceName } : pickService(services ?? [], input);
    if (!svc?.name) {
      return res.status(400).json({ error: 'Could not determine service. Say e.g. “book a mechanic”.' });
    }

    const all = await listProvidersAvailable();
    const providers = all.filter(
      (p) => norm(p.service_type).includes(norm(svc.name)) || norm(svc.name).includes(norm(p.service_type)),
    );
    if (!providers.length) {
      return res.status(400).json({ error: `No providers found for ${svc.name}` });
    }

    const strat = String(strategy || '').toLowerCase();
    let picked = null;
    if (strat === 'cheapest' || lower.includes('cheapest') || lower.includes('cheap')) {
      picked = [...providers].sort((a, b) => (a.base_price_cents ?? 0) - (b.base_price_cents ?? 0))[0];
    } else if (strat === 'nearest' || lower.includes('nearest') || lower.includes('closest') || lower.includes('near')) {
      picked = [...providers].sort((a, b) => parseDistanceKm(a.location) - parseDistanceKm(b.location))[0];
    } else if (strat === 'best_rated' || strat === 'highest_rated') {
      picked = [...providers].sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0))[0];
    } else {
      picked = providers.find((p) => p.id === rankProviders(providers, lower)[0]) ?? providers[0];
    }
    if (!picked) picked = providers[0];

    const useDate = String(date || '').trim() || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const useTime = String(time || '').trim() || '10:30 AM';
    const payMethod = normalizeBookingPaymentMethod(paymentMethod || 'card');

    const { data: booking, error: insErr } = await sb
      .from('bookings')
      .insert({
        user_id: req.user.id,
        provider_id: picked.id,
        date: useDate,
        time: useTime,
        status: 'pending',
        payment_status: 'unpaid',
        payment_method: payMethod,
        service_name: svc.name,
        auto_assigned: true,
      })
      .select('id')
      .single();
    if (insErr) return res.status(500).json({ error: insErr.message });

    await sb.from('user_notifications').insert({
      user_id: req.user.id,
      title: 'Auto-booked',
      body: `Autexa booked ${svc.name} with ${picked.name}.`,
      data: {
        booking_id: booking.id,
        provider_id: picked.id,
        service_name: svc.name,
        date: useDate,
        time: useTime,
        payment_method: payMethod,
      },
    });

    const priceCents = picked.base_price_cents ?? 5000;
    const totalLabel = `$${(priceCents / 100).toFixed(2)}`;
    const lines = buildTextReceiptLines({
      serviceName: svc.name,
      providerName: picked.name,
      bookingDate: useDate,
      bookingTime: useTime,
      totalLabel,
      paymentMethodRaw: payMethod,
    });
    const textReceipt = { title: 'Autexa booking bill', lines };
    const billPreview = { textReceipt };

    return res.json({
      booking: { id: booking.id },
      provider: {
        id: picked.id,
        name: picked.name,
        price_cents: priceCents,
        rating: Number(picked.rating) || 0,
        distance_km: parseDistanceKm(picked.location),
        availability: picked.is_available ? 'available' : 'unavailable',
      },
      service: { id: svc.id, name: svc.name },
      billPreview,
    });
  } catch (e) {
    console.error('[POST /pitstop/auto-book]', e);
    return res.status(500).json({ error: e?.message || 'auto-book failed' });
  }
});

pitstopRouter.post('/get-price-estimate', async (req, res) => {
  try {
    const { serviceName } = req.body ?? {};
    const providers = await listProvidersAvailable();
    const target = norm(serviceName);
    const filtered = target
      ? providers.filter((p) => norm(p.service_type).includes(target) || target.includes(norm(p.service_type)))
      : providers;
    if (!filtered.length) {
      return res.json({ estimate: null });
    }
    const prices = filtered.map((p) => Number(p.base_price_cents) || 0).filter((n) => n > 0);
    prices.sort((a, b) => a - b);
    const lo = prices[0];
    const hi = prices[Math.min(prices.length - 1, Math.max(0, Math.floor(prices.length * 0.7)))];
    return res.json({ estimate: { min_cents: lo, max_cents: hi, currency: 'usd' } });
  } catch (e) {
    console.error('[POST /pitstop/get-price-estimate]', e);
    return res.status(500).json({ error: e?.message || 'get-price-estimate failed' });
  }
});

/**
 * Pitstop assistant: tool-only behavior, no generic advice.
 * Input: { text, location? } → Output: { reply, service?, providers? }
 */
pitstopRouter.post('/assist', async (req, res) => {
  try {
    const { text } = req.body ?? {};
    const input = String(text ?? '').trim();
    if (!input) return res.status(400).json({ error: 'text required' });

    const sb = createServiceClient();
    const { data: services, error } = await sb.from('services').select('id,name,category,slug').order('name');
    if (error) return res.status(500).json({ error: error.message });

    const lower = norm(input);

    if (
      lower.includes('reschedule') ||
      lower.includes('change date') ||
      lower.includes('change time') ||
      lower.includes('update booking') ||
      lower.includes('edit booking')
    ) {
      const { data: bookings, error: bErr } = await sb
        .from('bookings')
        .select('id,date,time,status,service_name,payment_status,payment_method,providers(name)')
        .eq('user_id', req.user.id)
        .order('date', { ascending: false })
        .order('time', { ascending: false });
      if (bErr) return res.status(500).json({ error: bErr.message });
      const list = (bookings ?? []).filter((b) => String(b.status ?? '').toLowerCase() !== 'cancelled');
      if (!list.length) {
        return res.json({
          reply: 'You have no active bookings to update.',
          action: { type: 'update_booking', bookings: [] },
        });
      }
      return res.json({
        reply: 'Which booking do you want to update?',
        action: { type: 'update_booking', bookings: list },
      });
    }

    async function loadActiveBookingsForAssist() {
      const { data: bookings, error: bErr } = await sb
        .from('bookings')
        .select('id,date,time,status,service_name,payment_status,payment_method,providers(name)')
        .eq('user_id', req.user.id)
        .order('date', { ascending: false })
        .order('time', { ascending: false });
      if (bErr) throw new Error(bErr.message);
      return (bookings ?? []).filter((b) => String(b.status ?? '').toLowerCase() !== 'cancelled');
    }

    if (
      (lower.includes('cancel') && lower.includes('booking')) ||
      lower.includes('cancel my booking') ||
      lower.includes('cancel a booking') ||
      ((lower.includes('delete') || lower.includes('remove') || lower.includes('clear')) && lower.includes('booking'))
    ) {
      try {
        const list = await loadActiveBookingsForAssist();
        if (!list.length) {
          return res.json({ reply: 'You have no active bookings to cancel.', action: { type: 'cancel_booking', bookings: [] } });
        }
        return res.json({
          reply: 'Which booking do you want to cancel?',
          action: { type: 'cancel_booking', bookings: list },
        });
      } catch (e) {
        return res.status(500).json({ error: e?.message || 'bookings query failed' });
      }
    }

    if (lower.includes('show my bookings') || /\bmy bookings\b/.test(lower)) {
      try {
        const list = await loadActiveBookingsForAssist();
        if (!list.length) {
          return res.json({
            reply: 'You have no active bookings right now.',
            action: { type: 'show_bookings', bookings: [] },
          });
        }
        return res.json({
          reply: `Here are your ${list.length} active booking(s).`,
          action: { type: 'show_bookings', bookings: list },
        });
      } catch (e) {
        return res.status(500).json({ error: e?.message || 'bookings query failed' });
      }
    }

    const service = pickService(services ?? [], input);
    if (!service) {
      return res.json({
        reply: 'Tell me which service you need (e.g. “mechanic”, “car wash”, “tow”).',
        service: null,
        providers: [],
      });
    }

    const all = await listProvidersAvailable();
    const providers = all.filter(
      (p) => norm(p.service_type).includes(norm(service.name)) || norm(service.name).includes(norm(p.service_type)),
    );
    if (!providers.length) {
      return res.json({
        reply: `No providers found for ${service.name}. Try expanding your search.`,
        service: { id: service.id, name: service.name },
        providers: [],
      });
    }

    const rankedIds = rankProviders(providers, lower);
    const top = rankedIds
      .map((id) => providers.find((p) => p.id === id))
      .filter(Boolean)
      .slice(0, 3)
      .map((p) => ({
        id: p.id,
        name: p.name,
        price_cents: p.base_price_cents ?? 5000,
        rating: Number(p.rating) || 0,
        distance_km: parseDistanceKm(p.location),
        availability: p.is_available ? 'available' : 'unavailable',
      }));

    return res.json({
      reply: `Top ${service.name} options:`,
      service: { id: service.id, name: service.name },
      providers: top,
    });
  } catch (e) {
    console.error('[POST /pitstop/assist]', e);
    return res.status(500).json({ error: e?.message || 'assist failed' });
  }
});

pitstopRouter.post('/update-booking', async (req, res) => {
  try {
    const { bookingId, date, time, paymentMethod } = req.body ?? {};
    if (!bookingId) return res.status(400).json({ error: 'bookingId required' });

    const patch = {};
    if (date) patch.date = String(date).trim();
    if (time) patch.time = String(time).trim();
    if (paymentMethod) patch.payment_method = normalizeBookingPaymentMethod(paymentMethod);
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'No fields to update' });

    const sb = createServiceClient();
    const { data: booking, error } = await sb
      .from('bookings')
      .update(patch)
      .eq('id', bookingId)
      .eq('user_id', req.user.id)
      .select('id,provider_id,date,time,service_name,payment_method')
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!booking?.id) return res.status(404).json({ error: 'Booking not found' });

    await sb.from('user_notifications').insert({
      user_id: req.user.id,
      title: 'Booking updated',
      body: `Updated to ${booking.date} at ${booking.time}.`,
      data: {
        booking_id: booking.id,
        provider_id: booking.provider_id,
        date: booking.date,
        time: booking.time,
        service_name: booking.service_name ?? null,
        payment_method: booking.payment_method ?? null,
      },
    });

    return res.json({ ok: true, booking });
  } catch (e) {
    console.error('[POST /pitstop/update-booking]', e);
    return res.status(500).json({ error: e?.message || 'update-booking failed' });
  }
});

pitstopRouter.post('/cancel-booking', async (req, res) => {
  try {
    const { bookingId, reason } = req.body ?? {};
    if (!bookingId) return res.status(400).json({ error: 'bookingId required' });
    const provided = String(reason ?? '').trim();
    const defaults = [
      'Change of plans',
      'Found another provider',
      'Scheduling conflict',
      'Booked by mistake',
      'No longer needed',
    ];
    const why = provided && provided.toLowerCase() !== 'skip' ? provided : defaults[Math.floor(Math.random() * defaults.length)];
    const sb = createServiceClient();

    const { data: booking, error } = await sb
      .from('bookings')
      .update({
        status: 'cancelled',
        cancel_reason: why || null,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .eq('user_id', req.user.id)
      .select('id,provider_id,date,time,service_name')
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!booking?.id) return res.status(404).json({ error: 'Booking not found' });

    await sb.from('user_notifications').insert({
      user_id: req.user.id,
      title: 'Booking cancelled',
      body: why ? `Reason: ${why}` : 'Your booking was cancelled.',
      data: { booking_id: booking.id, provider_id: booking.provider_id, date: booking.date, time: booking.time, service_name: booking.service_name ?? null },
    });

    return res.json({ ok: true, booking: { id: booking.id } });
  } catch (e) {
    console.error('[POST /pitstop/cancel-booking]', e);
    return res.status(500).json({ error: e?.message || 'cancel-booking failed' });
  }
});

