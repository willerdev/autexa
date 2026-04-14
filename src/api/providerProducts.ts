import { supabase } from '../lib/supabase';

export type ProviderProductRow = {
  id: string;
  provider_id: string;
  title: string;
  description: string;
  price_cents: number;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function listProviderProducts(providerId: string): Promise<{ data: ProviderProductRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('provider_products')
    .select('id,provider_id,title,description,price_cents,image_url,is_active,created_at,updated_at')
    .eq('provider_id', providerId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false });
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as unknown as ProviderProductRow[], error: null };
}

