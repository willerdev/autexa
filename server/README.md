# Autexa API (Node.js)

Secure backend for **Gemini AI**, **Flutterwave v4** (wallet + booking mobile money), **auto-assign bookings**, and **Expo push token** registration. Secrets stay here — never in the Expo app.

**Production deploy:** see [../DEPLOY.md](../DEPLOY.md) (Docker, Render, Fly.io, Railway, Flutterwave webhook, EAS).

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
| `PUBLIC_API_BASE_URL` | Public HTTPS URL of this server (Render/Fly URL in production; must match webhook host) |
| `FLUTTERWAVE_CLIENT_ID` / `FLUTTERWAVE_CLIENT_SECRET` | Flutterwave v4 OAuth |
| `FLUTTERWAVE_SECRET_HASH` | Webhook `verif-hash` verification |
| `STRIPE_*` | Legacy; optional if `STRIPE_WEBHOOK_ENABLED=1` |

## Flutterwave

Webhook: `POST /api/webhooks/flutterwave` — set URL in Flutterwave Dashboard; see [../DEPLOY.md](../DEPLOY.md).

## Admin API

`GET /api/admin/summary` — requires `users.role = 'admin'` in Supabase (set manually in SQL for your user id).
