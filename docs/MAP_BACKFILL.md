# Map backfill (lat/lng) for providers

The Map page shows providers only when they have coordinates:

- `providers.lat`
- `providers.lng`

Right now `providers.location` is text (e.g. “Kampala, Ntinda”), so you need to backfill coordinates once.

## Option A (recommended): Supabase Table Editor (manual)

1. Open Supabase Dashboard → **Table Editor** → `providers`.
2. For each provider/business row:
   - Set `lat` and `lng` (decimal degrees).
   - Example (Kampala): `lat=0.3476`, `lng=32.5825`
3. Save.
4. Re-open the app → Map. Providers with coordinates will appear as pins.

## Option B: Quick CSV import

1. Export `providers` to CSV.
2. Add `lat` and `lng` columns.
3. Import back into Supabase with **Upsert** enabled.

## Notes

- If a provider has no `lat/lng`, it will not show on the map (by design).
- For production, use a **Mapbox public token** (`pk.*`) via `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN`.
  Do not embed secret tokens (`sk.*`) in the mobile app.

