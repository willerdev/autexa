import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { getAiContext } from '../api/aiMarketplace';
import type { UserAiContext } from '../types/aiContext';

export type UserProfile = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  role?: 'user' | 'provider' | 'admin' | string;
};

type SessionState = {
  session: Session | null;
  profile: UserProfile | null;
  userContext: UserAiContext | null;
  authInitializing: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setUserContext: (context: UserAiContext | null) => void;
  refreshUserAiContext: () => Promise<void>;
  setAuthInitializing: (value: boolean) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  profile: null,
  userContext: null,
  authInitializing: true,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setUserContext: (userContext) => set({ userContext }),
  refreshUserAiContext: async () => {
    try {
      const { context } = await getAiContext();
      set({ userContext: context });
    } catch (e) {
      if (__DEV__) {
        console.warn('[sessionStore] refreshUserAiContext failed', e);
      }
    }
  },
  setAuthInitializing: (authInitializing) => set({ authInitializing }),
}));
