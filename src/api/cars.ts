import { supabase } from '../lib/supabase';

export type CarRow = {
  id: string;
  make: string;
  model: string;
  year: string;
  plate: string;
  created_at: string;
  updated_at: string;
};

export async function listMyCars(): Promise<{ data: CarRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('cars')
    .select('id,make,model,year,plate,created_at,updated_at')
    .order('updated_at', { ascending: false });
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as unknown as CarRow[], error: null };
}

export async function getMyCar(id: string): Promise<{ data: CarRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('cars')
    .select('id,make,model,year,plate,created_at,updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: (data ?? null) as unknown as CarRow | null, error: null };
}

export async function upsertMyCar(input: {
  id?: string;
  make: string;
  model: string;
  year?: string;
  plate?: string;
}): Promise<{ data: CarRow | null; error: Error | null }> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return { data: null, error: new Error(userErr?.message ?? 'Not signed in') };

  const row: Record<string, unknown> = {
    id: input.id,
    user_id: userData.user.id,
    make: input.make.trim(),
    model: input.model.trim(),
    year: (input.year ?? '').trim(),
    plate: (input.plate ?? '').trim(),
  };

  const { data, error } = await supabase
    .from('cars')
    .upsert(row)
    .select('id,make,model,year,plate,created_at,updated_at')
    .single();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as unknown as CarRow, error: null };
}

export async function deleteMyCar(id: string): Promise<{ ok: boolean; error: Error | null }> {
  const { error } = await supabase.from('cars').delete().eq('id', id);
  if (error) return { ok: false, error: new Error(error.message) };
  return { ok: true, error: null };
}

