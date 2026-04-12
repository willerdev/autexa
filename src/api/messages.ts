import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type MessageRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  created_at: string;
};

export async function listMessagesWithPeer(
  myUserId: string,
  peerUserId: string,
): Promise<{ data: MessageRow[]; error: Error | null }> {
  const [outbound, inbound] = await Promise.all([
    supabase
      .from('messages')
      .select('id,sender_id,receiver_id,message,created_at')
      .eq('sender_id', myUserId)
      .eq('receiver_id', peerUserId),
    supabase
      .from('messages')
      .select('id,sender_id,receiver_id,message,created_at')
      .eq('sender_id', peerUserId)
      .eq('receiver_id', myUserId),
  ]);

  const err = outbound.error ?? inbound.error;
  if (err) return { data: [], error: new Error(err.message) };

  const merged = [...(outbound.data ?? []), ...(inbound.data ?? [])] as MessageRow[];
  merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return { data: merged, error: null };
}

export async function sendMessage(input: {
  senderId: string;
  receiverId: string;
  text: string;
}): Promise<{ data: MessageRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      sender_id: input.senderId,
      receiver_id: input.receiverId,
      message: input.text,
    })
    .select('id,sender_id,receiver_id,message,created_at')
    .single();

  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as MessageRow, error: null };
}

export function subscribeToConversation(
  myUserId: string,
  peerUserId: string,
  onInsert: (row: MessageRow) => void,
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`messages:${myUserId}:${peerUserId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => {
        const row = payload.new as MessageRow;
        const involvesMe =
          (row.sender_id === myUserId && row.receiver_id === peerUserId) ||
          (row.sender_id === peerUserId && row.receiver_id === myUserId);
        if (involvesMe) onInsert(row);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
