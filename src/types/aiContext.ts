export type UserAiContext = {
  user?: { firstName?: string };
  cars: { make: string; model: string; year: string; mileage: number | null; last_service_date: string | null }[];
  recentBookings: { service_name: string | null; provider_name: string | null; date: string; status: string }[];
  preferredPayment: string;
  preferredLocation: string;
  aiNotes: string;
  /** Supabase-backed lines the assistant may use across sessions (see save_learned_memory). */
  learnedMemories?: { id: string; body: string; createdAt: string }[];
};
