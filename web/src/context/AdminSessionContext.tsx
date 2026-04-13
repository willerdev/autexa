import { createContext, useContext } from 'react';

export const AdminSessionContext = createContext<{ accessToken: string } | null>(null);

export function useAdminSession() {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) throw new Error('useAdminSession outside provider');
  return ctx;
}
