import { supabase } from '../lib/supabase';

export type BookingRow = {
  id: string;
  date: string;
  time: string;
  status: string;
  service_name: string | null;
  payment_status?: string | null;
  providers: { name: string } | null;
};

export async function createBooking(input: {
  providerId: string;
  date: string;
  time: string;
  serviceName?: string;
  providerServiceId?: string | null;
  status?: string;
  paymentStatus?: string;
  paymentMethod?: 'card' | 'mobile_money' | 'pay_later';
  amountCents?: number;
  autoAssigned?: boolean;
}): Promise<{ data: { id: string } | null; error: Error | null }> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return { data: null, error: new Error(userErr?.message ?? 'Not signed in') };

  const row: Record<string, unknown> = {
    user_id: userData.user.id,
    provider_id: input.providerId,
    date: input.date,
    time: input.time,
    status: input.status ?? 'pending',
    service_name: input.serviceName ?? null,
  };
  if (input.paymentStatus !== undefined) row.payment_status = input.paymentStatus;
  if (input.paymentMethod !== undefined) row.payment_method = input.paymentMethod;
  if (input.amountCents !== undefined) row.amount_cents = input.amountCents;
  if (input.autoAssigned !== undefined) row.auto_assigned = input.autoAssigned;
  if (input.providerServiceId) row.provider_service_id = input.providerServiceId;

  const { data, error } = await supabase.from('bookings').insert(row).select('id').single();

  if (error) return { data: null, error: new Error(error.message) };
  return { data: { id: data.id }, error: null };
}

export async function listMyBookings(): Promise<{ data: BookingRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id,date,time,status,service_name,payment_status,providers(name)')
    .order('date', { ascending: false });

  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as unknown as BookingRow[], error: null };
}
