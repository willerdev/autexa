# Autexa API (Node.js)

Secure backend for **Gemini AI**, **Stripe Checkout**, **auto-assign bookings**, and **Expo push token** registration. Secrets stay here — never in the Expo app.

**Production deploy:** see [../DEPLOY.md](../DEPLOY.md) (Docker, Fly.io, Render, Railway, Stripe webhook URL, EAS).

## Setup

1. Copy `.env.example` → `.env` and fill values.
2. `npm install` (in this folder).
3. `npm run dev`

## Environment

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | Google AI Studio key (server only). **Rotate any key that was ever exposed in chat or git.** |
| `SUPABASE_URL` | Same project as the app |
| `SUPABASE_ANON_KEY` | Verify user JWTs |
| `SUPABASE_SERVICE_ROLE_KEY` | DB writes (webhooks, auto-assign, notifications) — **never** ship to clients |
| `STRIPE_SECRET_KEY` | Payments |
| `STRIPE_WEBHOOK_SECRET` | Verify Stripe webhooks |
| `PUBLIC_API_BASE_URL` | Public URL of this server (e.g. `http://192.168.1.10:8787` for a phone on Wi‑Fi) |

## Stripe

1. Create a **Checkout**-compatible price or use dynamic `price_data` (already implemented).
2. Add webhook endpoint: `https://<PUBLIC_API_BASE_HOST>/api/webhooks/stripe` (must match `PUBLIC_API_BASE_URL`).
3. Subscribe to `checkout.session.completed`.

## Mobile money

`POST /api/payments/mobile-money-placeholder` returns `501` until you integrate a provider (Flutterwave, MTN MoMo, etc.).

## Admin API

`GET /api/admin/summary` — requires `users.role = 'admin'` in Supabase (set manually in SQL for your user id).
