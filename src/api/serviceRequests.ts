import { supabase } from '../lib/supabase';

export type RequestStatus = 'pending' | 'accepted' | 'completed';

export type ServiceRequestRow = {
  id: string;
  user_id: string;
  service_id: string;
  description: string;
  location: string;
  status: RequestStatus;
  urgency: string;
  created_at: string;
  services?: { name: string } | null;
};

export async function createServiceRequest(input: {
  serviceId: string;
  description: string;
  location: string;
  urgency: string;
}): Promise<{ data: { id: string } | null; error: Error | null }> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return { data: null, error: new Error(userErr?.message ?? 'Not signed in') };

  const { data, error } = await supabase
    .from('service_requests')
    .insert({
      user_id: userData.user.id,
      service_id: input.serviceId,
      description: input.description,
      location: input.location,
      urgency: input.urgency,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) return { data: null, error: new Error(error.message) };
  return { data: { id: data.id }, error: null };
}

export async function listMyServiceRequests(): Promise<{ data: ServiceRequestRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('service_requests')
    .select('id,user_id,service_id,description,location,status,urgency,created_at,services(name)')
    .order('created_at', { ascending: false });

  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as unknown as ServiceRequestRow[], error: null };
}

export async function assignProviderToRequest(
  requestId: string,
  providerId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('service_requests')
    .update({ status: 'accepted', assigned_provider_id: providerId })
    .eq('id', requestId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
