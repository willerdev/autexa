import { supabase } from '../lib/supabase';

export type ServiceRow = {
  id: string;
  name: string;
  category: string;
  slug: string | null;
};

export async function listServices(): Promise<{ data: ServiceRow[]; error: Error | null }> {
  const { data, error } = await supabase.from('services').select('id,name,category,slug').order('name');
  if (error) return { data: [], error: new Error(error.message) };
  return { data: data ?? [], error: null };
}
