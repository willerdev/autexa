-- Autexa: wipe ALL application data (keeps Supabase auth.users intact).
-- Run in Supabase SQL editor (Project → SQL → New query).
--
-- What this removes:
-- - providers + listings + products/services + reviews/views
-- - bookings + requests + messages
-- - wallets + all wallet transactions + topups/withdrawals + payees
-- - notifications + reminder job state
-- - referrals + 2FA OTP sessions
-- - subscriptions + usage counters
-- - AI context/memory + push tokens + payment transactions
--
-- What this keeps:
-- - auth.users (Supabase Auth)
-- - public.users (profiles) by default (see optional section at end)
--
-- Notes:
-- - Uses TRUNCATE ... CASCADE where possible.
-- - Safe to re-run; missing tables are skipped.

do $$
declare
  t text;
  tables text[] := array[
    -- Base catalog / admin (often explains "old" AI behavior)
    'services',
    'marketplace_categories',
    'admin_settings',

    -- Marketplace / providers
    'provider_products',
    'provider_service_reviews',
    'provider_service_views',
    'provider_services',
    'provider_categories',
    'providers',

    -- Core flows
    'booking_items',
    'bookings',
    'service_requests',
    'messages',

    -- Cars
    'car_service_history',
    'cars',

    -- Wallet
    'wallet_payees',
    'withdrawal_requests',
    'topup_requests',
    'transactions',
    'wallet_payment_links',
    'wallets',

    -- Savings
    'savings_challenge_contributions',
    'savings_challenge_members',
    'savings_challenges',

    -- Notifications
    'notification_jobs_sent',
    'user_notifications',
    'provider_notifications',

    -- Referrals + 2FA
    'referrals',
    'referral_codes',
    'twofa_otps',

    -- Subscriptions + usage
    'usage_counters',
    'user_subscriptions',

    -- AI context / memory
    'user_ai_learned_memories',
    'user_ai_context',
    'user_service_preferences',
    'service_type_schemas',

    -- Payments + push tokens
    'payment_transactions',
    'user_push_tokens'
  ];
begin
  foreach t in array tables loop
    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('truncate table public.%I restart identity cascade;', t);
    end if;
  end loop;
end $$;

-- Optional: wipe public.users too (keeps auth.users; removes app profiles).
-- Uncomment if you want a totally fresh app DB:
-- truncate table public.users restart identity cascade;

