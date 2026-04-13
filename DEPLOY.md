# Deploy Autexa (API online + Android APK)

This document implements the hosting and distribution checklist for production.

## 1. Production Supabase

1. Create a **production** project at [supabase.com](https://supabase.com) (separate from dev if you want clean data).
2. Apply schema: **SQL Editor** → run each file in [`supabase/migrations/`](supabase/migrations/) **in filename order** (run [`scripts/list-supabase-migrations.sh`](scripts/list-supabase-migrations.sh) to print the list), or use the Supabase CLI:
   - `supabase link --project-ref <ref>`
   - `supabase db push` (if you use linked migrations)
3. Copy **Project URL** and **anon public** key from **Project Settings → API** into your app env as `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
4. **Auth → URL configuration**: add your app’s deep link / site URL if you add OAuth or magic links later.
5. Never put **service_role** in the mobile app; it belongs only on the API host.

## 2. Deploy the Node API (`server/`)

You need a public **HTTPS** base URL (example: `https://autexa-api.fly.dev`). Set `EXPO_PUBLIC_AUTEXA_API_URL` in the app to that origin (no trailing slash).

### Option A — Fly.io

1. Install [flyctl](https://fly.io/docs/hands-on/install-flyctl/).
2. From `server/`: `fly auth login`
3. Edit [`server/fly.toml`](server/fly.toml) — set `app = "your-unique-name"` (or run `fly launch` once to generate the file).
4. `fly deploy` from `server/` (uses [`server/Dockerfile`](server/Dockerfile)).
5. Set secrets:  
   `fly secrets set SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... GEMINI_API_KEY=... PUBLIC_API_BASE_URL=https://your-app.fly.dev`  
   Add Flutterwave vars from [`server/.env.example`](server/.env.example). Add Stripe only if enabled.

### Option B — Render (step-by-step)

1. Sign up at [render.com](https://render.com) and connect **GitHub**.
2. **New → Blueprint** → select repo **`willerdev/autexa`** and apply [`render.yaml`](render.yaml), **or** **New → Web Service** → same repo with:
   - **Runtime:** Docker  
   - **Dockerfile path:** `server/Dockerfile`  
   - **Docker context:** `server`
3. Wait for the first deploy; copy the service URL (e.g. `https://autexa-api.onrender.com`, no trailing slash).
4. In **Environment**, set **`PUBLIC_API_BASE_URL`** to that exact URL. Add every variable listed in [`render.yaml`](render.yaml) / [`server/.env.example`](server/.env.example); mark secrets (Supabase service role, Gemini, Flutterwave client secret, webhook hash) as **Secret**.
5. **Flutterwave:** Dashboard → Webhooks → URL `https://<your-render-host>/api/webhooks/flutterwave` → copy **secret hash** into **`FLUTTERWAVE_SECRET_HASH`** on Render.
6. Verify: open `https://<your-host>/health` in a browser (should succeed). Free tier may sleep; first request after idle can take ~30–60s.
7. In the app, set **`EXPO_PUBLIC_AUTEXA_API_URL`** to the same Render URL ([`.env.example`](.env.example), EAS secrets — see §4).

### Option C — Railway

1. New project from GitHub; set **Dockerfile** path to `server/Dockerfile` (see [`railway.toml`](railway.toml)).
2. Configure environment variables in the Railway UI.

### API environment reference

See [`server/.env.example`](server/.env.example). **Minimum for production:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `PORT` (default 8787), `PUBLIC_API_BASE_URL` (your public API URL, must match the host users and webhooks call).

**Payments (Flutterwave v4):** `FLUTTERWAVE_CLIENT_ID`, `FLUTTERWAVE_CLIENT_SECRET`, `FLUTTERWAVE_SECRET_HASH` (webhook), optional `FLUTTERWAVE_SANDBOX=1`, `FLUTTERWAVE_BOOKING_USD_TO_UGX`.

Health check: `GET /health`

The server listens on `0.0.0.0` so it works inside containers.

## 3. Flutterwave webhooks (wallet + bookings)

1. Dashboard → **Webhooks** → URL: `https://<your-api-host>/api/webhooks/flutterwave`
2. Set **`FLUTTERWAVE_SECRET_HASH`** on the API host to the dashboard secret hash (header `verif-hash`).  
3. Handler: [`server/src/index.js`](server/src/index.js) (`charge.completed` → credit wallet / mark booking paid).

## 4. Stripe webhooks (legacy, optional)

1. Set **`STRIPE_WEBHOOK_ENABLED=1`** on the API host only if you use Stripe; otherwise the route is disabled.
2. In **Stripe Dashboard → Developers → Webhooks → Add endpoint**  
   URL: `https://<your-api-host>/api/webhooks/stripe`  
   Events: at least `checkout.session.completed` (as implemented in [`server/src/index.js`](server/src/index.js)).
3. Copy the **Signing secret** into `STRIPE_WEBHOOK_SECRET` on the API host.

## 5. EAS Build (Android APK / AAB)

1. `npx expo login` and `npm install` at repo root.
2. `npx eas-cli@latest init` — links the project and writes `extra.eas.projectId` into your Expo config when prompted.
3. Set **EAS environment variables** for the **production** environment (Expo dashboard → Project → Environment variables, or CLI) so cloud builds embed public client config. Use your **HTTPS** API URL (never `localhost` on EAS):

   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_AUTEXA_API_URL` (e.g. `https://your-api.onrender.com`)
   - Optional: `EXPO_PUBLIC_WEB_APP_URL` (payment links in browser), `EXPO_PUBLIC_SUPPORT_USER_ID`

   Example (adjust profile/environment flags to match your Expo account):

   ```bash
   npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://xxx.supabase.co" --environment production --type string
   npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJ..." --environment production --type sensitive
   npx eas-cli@latest env:create --name EXPO_PUBLIC_AUTEXA_API_URL --value "https://your-api.example.com" --environment production --type string
   ```

4. Builds are defined in [`eas.json`](eas.json):
   - **preview** — internal APK for testers.
   - **production** — release APK (sideload / distribution outside Play if you use APK).
   - **production-aab** — Android App Bundle for **Google Play** (`distribution: store`).

   ```bash
   npx eas-cli@latest build -p android --profile preview
   npx eas-cli@latest build -p android --profile production
   npx eas-cli@latest build -p android --profile production-aab
   ```

5. iTunes / Play: use `eas submit` when you are ready (Apple Developer / Play Console accounts required).

## 6. Distributing the APK to testers

**Internal APK (preview profile)**

1. After the build finishes, open the link from EAS and download the `.apk`.
2. Send the file (Drive, Dropbox, etc.) or share the EAS build page with trusted testers.
3. On Android: **Settings → Security** (or app settings) → allow install from that source; open the APK to install.
4. Warn testers: first install may show “unknown source” — expected for sideloading.

**Google Play (production AAB)**

1. Create a Play Console app, upload the `.aab` from the production build.
2. Use **Internal testing** track first, then **Open testing** / **Production**.
3. Future updates must be signed with the **same** keystore (EAS credentials — do not lose access).

## Security reminders

- Rotate any key that was ever committed or pasted in chat.
- Tighten CORS in [`server/src/index.js`](server/src/index.js) if you expose a web app with a fixed origin.
- Monitor Gemini and Flutterwave usage in production dashboards.
