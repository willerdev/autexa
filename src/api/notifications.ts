import { supabase } from '../lib/supabase';

export type UserNotificationRow = {
  id: string;
  title: string;
  body: string;
  data: unknown | null;
  read_at: string | null;
  created_at: string;
};

export async function listMyNotifications(): Promise<{ data: UserNotificationRow[]; error: Error | null }> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return { data: [], error: new Error(userErr?.message ?? 'Not signed in') };

  const { data, error } = await supabase
    .from('user_notifications')
    .select('id,title,body,data,read_at,created_at')
    .order('created_at', { ascending: false });

  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as unknown as UserNotificationRow[], error: null };
}

export async function markNotificationRead(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('user_notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

