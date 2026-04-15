import type { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { fetchProfile } from '../api/profile';
import { claimReferralCode, maybeCreditReferral } from '../api/referrals';
import { isSupabaseConfigured } from '../config/env';
import { getAuthActionErrorMessage } from '../lib/errors';
import { supabase } from '../lib/supabase';
import { useSessionStore } from '../stores/sessionStore';

type AuthUser = {
  firstName: string;
  email: string;
  phone: string;
};

type AuthContextValue = {
  session: Session | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  authReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (firstName: string, email: string, password: string, phone?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function hydrateProfile(session: Session | null): Promise<void> {
  if (!session?.user?.id) {
    useSessionStore.getState().setProfile(null);
    useSessionStore.getState().setUserContext(null);
    return;
  }
  const userId = session.user.id;
  try {
    const { data, error } = await fetchProfile(userId);
    if (error) {
      if (__DEV__) {
        console.warn('[Auth] hydrateProfile: profile fetch failed', error.message);
      }
      useSessionStore.getState().setProfile(null);
      return;
    }
    useSessionStore.getState().setProfile(data ?? null);
    await useSessionStore.getState().refreshUserAiContext();

    // Referral flow:
    // - If the user entered a code at sign-up, claim it after first authenticated session.
    // - Credit the referrer once (idempotent) when the referred user becomes active.
    try {
      const pending = (await AsyncStorage.getItem('autexa:pending_referral_code')) || '';
      const code = pending.trim();
      if (code) {
        await claimReferralCode(code);
        await AsyncStorage.removeItem('autexa:pending_referral_code');
      }
    } catch (e) {
      if (__DEV__) console.warn('[Auth] referral claim skipped:', e instanceof Error ? e.message : e);
    }
    try {
      await maybeCreditReferral();
    } catch (e) {
      if (__DEV__) console.warn('[Auth] referral credit skipped:', e instanceof Error ? e.message : e);
    }
  } catch (e) {
    if (__DEV__) {
      console.warn('[Auth] hydrateProfile: unexpected error', e);
    }
    useSessionStore.getState().setProfile(null);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const session = useSessionStore((s) => s.session);
  const profile = useSessionStore((s) => s.profile);
  const authInitializing = useSessionStore((s) => s.authInitializing);
  const loginInFlight = useRef(false);
  const registerInFlight = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      useSessionStore.getState().setSession(null);
      useSessionStore.getState().setProfile(null);
      useSessionStore.getState().setUserContext(null);
      useSessionStore.getState().setAuthInitializing(false);
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (error) {
          if (__DEV__) {
            console.warn('[Auth] getSession failed', error.message);
          }
          useSessionStore.getState().setSession(null);
          useSessionStore.getState().setProfile(null);
          useSessionStore.getState().setUserContext(null);
        } else {
          const next = data?.session ?? null;
          useSessionStore.getState().setSession(next);
          await hydrateProfile(next);
        }
      } catch (e) {
        if (__DEV__) {
          console.warn('[Auth] bootstrap session failed', e);
        }
        if (!cancelled) {
          useSessionStore.getState().setSession(null);
          useSessionStore.getState().setProfile(null);
          useSessionStore.getState().setUserContext(null);
        }
      } finally {
        if (!cancelled) {
          useSessionStore.getState().setAuthInitializing(false);
        }
      }
    };

    void bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      useSessionStore.getState().setSession(nextSession);
      if (!nextSession) {
        useSessionStore.getState().setUserContext(null);
      }
      void (async () => {
        try {
          await hydrateProfile(nextSession);
        } catch (e) {
          if (__DEV__) {
            console.warn('[Auth] onAuthStateChange hydrate failed', e);
          }
        }
      })();
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase is not configured. Add credentials to .env and rebuild the app.');
    }
    if (loginInFlight.current) {
      throw new Error('Sign-in is already in progress.');
    }
    loginInFlight.current = true;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (__DEV__) {
          console.warn('[Auth] signInWithPassword error', error.message);
        }
        throw new Error(getAuthActionErrorMessage(error, 'Sign in failed. Please try again.'));
      }
      const nextSession = data?.session ?? null;
      const user = data?.user;
      if (!user || !nextSession) {
        if (__DEV__) {
          console.warn('[Auth] signInWithPassword: missing user or session', {
            hasUser: Boolean(user),
            hasSession: Boolean(nextSession),
          });
        }
        throw new Error('Sign-in did not return a valid session. Please try again.');
      }
      useSessionStore.getState().setSession(nextSession);
      await hydrateProfile(nextSession);
    } catch (e) {
      if (e instanceof Error && e.message) {
        throw e;
      }
      throw new Error(getAuthActionErrorMessage(e, 'Sign in failed. Please try again.'));
    } finally {
      loginInFlight.current = false;
    }
  }, []);

  const register = useCallback(async (firstName: string, email: string, password: string, phone?: string) => {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase is not configured. Add credentials to .env and rebuild the app.');
    }
    if (registerInFlight.current) {
      throw new Error('Registration is already in progress.');
    }
    registerInFlight.current = true;
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: firstName,
            phone: phone ?? '',
          },
        },
      });
      if (error) {
        if (__DEV__) {
          console.warn('[Auth] signUp error', error.message);
        }
        throw new Error(getAuthActionErrorMessage(error, 'Could not create account. Please try again.'));
      }
      if (!data?.user) {
        if (__DEV__) {
          console.warn('[Auth] signUp: no user in response');
        }
        throw new Error('Could not create account. Please try again.');
      }
    } catch (e) {
      if (e instanceof Error && e.message) {
        throw e;
      }
      throw new Error(getAuthActionErrorMessage(e, 'Could not create account. Please try again.'));
    } finally {
      registerInFlight.current = false;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error && __DEV__) {
        console.warn('[Auth] signOut error', error.message);
      }
    } catch (e) {
      if (__DEV__) {
        console.warn('[Auth] signOut threw', e);
      }
    } finally {
      useSessionStore.getState().setSession(null);
      useSessionStore.getState().setProfile(null);
      useSessionStore.getState().setUserContext(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      await hydrateProfile(useSessionStore.getState().session);
    } catch (e) {
      if (__DEV__) {
        console.warn('[Auth] refreshProfile failed', e);
      }
    }
  }, []);

  const user = useMemo((): AuthUser | null => {
    if (!session?.user) return null;
    const email = profile?.email ?? session.user.email ?? '';
    const name = profile?.name?.trim() ?? '';
    const firstName = name ? name.split(/\s+/)[0] : (email.split('@')[0] || 'there');
    return {
      firstName: firstName.charAt(0).toUpperCase() + firstName.slice(1),
      email,
      phone: profile?.phone ?? '',
    };
  }, [session, profile]);

  const value = useMemo(
    () => ({
      session,
      user,
      isAuthenticated: Boolean(session),
      authReady: !authInitializing,
      login,
      register,
      logout,
      refreshProfile,
    }),
    [session, user, authInitializing, login, register, logout, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
