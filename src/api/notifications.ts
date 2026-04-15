import { supabase } from '../lib/supabase';

export type UserNotificationRow = {
  id: string;
  title: string;
  body: string;
  data: unknown | null;
  read_at: string | null;
  created_at: string;
  expires_at?: string;
  expired_at?: string | null;
};

export async function listMyNotifications(): Promise<{ data: UserNotificationRow[]; error: Error | null }> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return { data: [], error: new Error(userErr?.message ?? 'Not signed in') };

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('user_notifications')
    .select('id,title,body,data,read_at,created_at,expires_at,expired_at')
    .is('expired_at', null)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('created_at', { ascending: false });

  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as unknown as UserNotificationRow[], error: null };
}

export async function markNotificationRead(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('user_notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

