-- Idempotent demo provider for Map tab QA (near Kampala).
-- RLS: authenticated users can read providers; this row is inserted as superuser via migration.

insert into public.providers (
  id,
  name,
  service_type,
  rating,
  location,
  is_available,
  lat,
  lng,
  base_price_cents,
  user_id
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'Autexa Map Test Garage',
  'Car wash',
  4.90,
  'Near Kampala (demo pin)',
  true,
  0.3476,
  32.5825,
  15000,
  null
)
on conflict (id) do update set
  name = excluded.name,
  service_type = excluded.service_type,
  rating = excluded.rating,
  location = excluded.location,
  is_available = excluded.is_available,
  lat = excluded.lat,
  lng = excluded.lng,
  base_price_cents = excluded.base_price_cents,
  user_id = coalesce(public.providers.user_id, excluded.user_id);
