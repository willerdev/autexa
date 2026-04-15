import { supabase } from '../lib/supabase';
import type { UserProfile } from '../stores/sessionStore';

export async function fetchProfile(userId: string): Promise<{ data: UserProfile | null; error: Error | null }> {
  const { data, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
  if (error) return { data: null, error: new Error(error.message) };
  if (!data) return { data: null, error: null };
  return {
    data: {
      id: data.id,
      name: data.name ?? '',
      email: data.email ?? null,
      phone: data.phone ?? null,
      created_at: data.created_at,
      role: (data as { role?: string }).role ?? 'user',
      twofaEnabled: Boolean((data as { twofa_enabled?: boolean }).twofa_enabled),
      twofaPhone: (data as { twofa_phone?: string | null }).twofa_phone ?? null,
    },
    error: null,
  };
}

export async function updateProfile(
  userId: string,
  patch: Partial<Pick<UserProfile, 'name' | 'phone' | 'role'>>,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('users').update(patch).eq('id', userId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
