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

## Demo pin (migration)

Migration [`20260415180000_seed_map_demo_provider.sql`](../supabase/migrations/20260415180000_seed_map_demo_provider.sql) inserts a fixed-id demo provider (`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`) with coordinates near Kampala so the Map tab always has at least one test pin after `supabase db push` (or applying migrations in the dashboard).

## Optional: pin tied to your admin user

`providers.user_id` must match your `auth.users.id` (same as `public.users.id`). Only one provider row per `user_id` is allowed (partial unique index).

Run in the Supabase SQL editor (replace the UUID with yours from **Authentication → Users**):

```sql
insert into public.providers (
  name, service_type, rating, location, is_available, user_id, lat, lng, base_price_cents
)
values (
  'My admin test shop',
  'Diagnostics',
  4.8,
  'Demo',
  true,
  '00000000-0000-0000-0000-000000000000'::uuid,  -- your auth user id
  0.3476,
  32.5825,
  12000
)
on conflict (user_id) do update set
  lat = excluded.lat,
  lng = excluded.lng,
  name = excluded.name,
  is_available = excluded.is_available;
```

If the insert fails because a conflicting index is not found, use `update public.providers set lat = 0.3476, lng = 32.5825 where user_id = '...'::uuid;` when the row already exists.

## Notes

- If a provider has no `lat/lng`, it will not show on the map (by design).
- For production, use a **Mapbox public token** (`pk.*`) via `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN`.
  Do not embed secret tokens (`sk.*`) in the mobile app.

