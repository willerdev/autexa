import { Router } from 'express';
import { requireUser } from '../lib/auth.js';
import { createServiceClient } from '../lib/supabase.js';
import { aiRankProviders, listProvidersAvailable } from '../lib/providers.js';
import { notifyProviderInAppAndSms } from '../services/notifyChannels.js';

export const bookingsRouter = Router();
bookingsRouter.use(requireUser);

bookingsRouter.post('/auto-select', async (req, res) => {
  try {
    const { date, time, serviceName, amountCents } = req.body ?? {};
    if (!date || !time) {
      return res.status(400).json({ error: 'date and time are required' });
    }
    const sb = createServiceClient();
    const providers = await listProvidersAvailable();
    if (!providers.length) {
      return res.status(400).json({ error: 'No available providers' });
    }
    const rank = await aiRankProviders(
      providers,
      `Auto booking for ${serviceName || 'car service'}`,
      serviceName,
    );
    const providerId = rank.topPickId;
    if (!providerId) {
      return res.status(400).json({ error: 'Could not pick a provider' });
    }
    const amount = typeof amountCents === 'number' ? amountCents : 4500;
    const { data: booking, error } = await sb
      .from('bookings')
      .insert({
        user_id: req.user.id,
        provider_id: providerId,
        date,
        time,
        status: 'pending',
        payment_status: 'unpaid',
        service_name: serviceName ?? null,
        amount_cents: amount,
        auto_assigned: true,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[auto-select] insert', error);
      return res.status(500).json({ error: error.message });
    }

    const provider = providers.find((p) => p.id === providerId);
    await notifyProviderInAppAndSms(sb, {
      providerId,
      title: 'New Gearup booking (auto)',
      body: `Booking ${booking.id} · ${serviceName ?? 'Service'} · ${date} ${time}`,
    });

    res.json({
      bookingId: booking.id,
      providerId,
      providerName: provider?.name ?? 'Provider',
      aiReason: rank.shortReason,
    });
  } catch (e) {
    console.error('[POST /bookings/auto-select]', e);
    res.status(500).json({ error: e?.message || 'auto-select failed' });
  }
});
