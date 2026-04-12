import { createClient } from '@supabase/supabase-js';

export function createUserClient(bearerToken) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {},
    },
  });
}

export function createServiceClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
