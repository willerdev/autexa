# Deploy Autexa (API online + Android APK)

This document implements the hosting and distribution checklist for production.

## 1. Production Supabase

1. Create a **production** project at [supabase.com](https://supabase.com) (separate from dev if you want clean data).
2. Apply schema: **SQL Editor** → run each file in [`supabase/migrations/`](supabase/migrations/) **in filename order**, or use the Supabase CLI:
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
   Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` if you use Stripe.

### Option B — Render

1. New **Web Service** → connect repo, or use [`render.yaml`](render.yaml) (Blueprint).
2. **Docker**: Dockerfile path `server/Dockerfile`, context `server`.
3. Set the same env vars as in `render.yaml` (mark secrets in the dashboard).

### Option C — Railway

1. New project from GitHub; set **Dockerfile** path to `server/Dockerfile` (see [`railway.toml`](railway.toml)).
2. Configure environment variables in the Railway UI.

### API environment reference

See [`server/.env.example`](server/.env.example). Minimum: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `PORT` (default 8787), `PUBLIC_API_BASE_URL` (your public API URL for Stripe return URLs).

Health check: `GET /health`

The server listens on `0.0.0.0` so it works inside containers.

## 3. Stripe webhooks (if used)

1. In **Stripe Dashboard → Developers → Webhooks → Add endpoint**  
   URL: `https://<your-api-host>/api/webhooks/stripe`  
   Events: at least `checkout.session.completed` (as implemented in [`server/src/index.js`](server/src/index.js)).
2. Copy the **Signing secret** into `STRIPE_WEBHOOK_SECRET` on the API host.
3. Ensure `PUBLIC_API_BASE_URL` matches the same host you use in Stripe redirects.

## 4. EAS Build (Android APK / AAB)

1. `npx expo login` and `npm install` at repo root.
2. `npx eas-cli@latest init` — links the project and writes `extra.eas.projectId` into your Expo config when prompted.
3. Create secrets so **production** builds embed public client config (not secrets like service role):

   ```bash
   npx eas-cli@latest secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://xxx.supabase.co" --type string
   npx eas-cli@latest secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJ..." --type string
   npx eas-cli@latest secret:create --scope project --name EXPO_PUBLIC_AUTEXA_API_URL --value "https://your-api.example.com" --type string
   ```

   Optional: `EXPO_PUBLIC_SUPPORT_USER_ID` if you use it.

4. Builds are defined in [`eas.json`](eas.json):
   - **preview** — `android.buildType: apk` → shareable APK for testers.
   - **production** — `app-bundle` → upload to Google Play.

   ```bash
   npx eas-cli@latest build -p android --profile preview
   npx eas-cli@latest build -p android --profile production
   ```

5. iTunes / Play: use `eas submit` when you are ready (Apple Developer / Play Console accounts required).

## 5. Distributing the APK to testers

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
- Monitor Gemini and Stripe usage in production dashboards.
