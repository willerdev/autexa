import { createContext, useContext } from 'react';

export type UserSessionValue = {
  accessToken: string;
  email: string;
};

export const UserSessionContext = createContext<UserSessionValue | null>(null);

export function useUserSession() {
  const ctx = useContext(UserSessionContext);
  if (!ctx) throw new Error('useUserSession outside provider');
  return ctx;
}
