import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SESSION_KEY, buildGoogleAuthorizeUrl, getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured, parseAuthHash, resolveAppRedirect } from '../lib/supabase';
export interface AuthUser { id: string; email: string | null }
interface StoredSession { accessToken: string; refreshToken: string; expiresAt: number; user: AuthUser }
interface AuthContextValue { user: AuthUser | null; isLoading: boolean; errorEs: string | null; signInWithGoogle: () => void; signOut: () => void; clearError: () => void }
const AuthContext = createContext<AuthContextValue | null>(null);
function readStored(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (parsed.expiresAt < Date.now()) window.localStorage.removeItem(SESSION_KEY);
    return parsed.expiresAt < Date.now() ? null : parsed;
  } catch { return null }
}
async function fetchUser(accessToken: string): Promise<AuthUser> {
  const res = await fetch(`${getSupabaseUrl()}/auth/v1/user`, { headers: { apikey: getSupabaseAnonKey(), Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error('No se pudo iniciar sesión con Google');
  const data = (await res.json()) as { id: string; email?: string | null };
  return { id: data.id, email: data.email ?? null };
}
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorEs, setErrorEs] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function init(): Promise<void> {
      try {
        const parsed = parseAuthHash(window.location.href);
        if (parsed.kind === 'error') {
          window.localStorage.removeItem(SESSION_KEY);
          window.location.hash = '';
          if (!cancelled) setErrorEs(parsed.errorEs);
        } else if (parsed.kind === 'tokens') {
          try {
            const profile = await fetchUser(parsed.accessToken);
            window.localStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken: parsed.accessToken, refreshToken: parsed.refreshToken, expiresAt: Date.now() + 55 * 60 * 1000, user: profile } satisfies StoredSession));
            window.location.hash = '';
            if (!cancelled) setUser(profile);
          } catch {
            window.localStorage.removeItem(SESSION_KEY);
            window.location.hash = '';
            if (!cancelled) setErrorEs('No se pudo iniciar sesión con Google');
          }
        } else {
          const stored = readStored();
          if (stored !== null && !cancelled) setUser(stored.user);
        }
      } finally { if (!cancelled) setIsLoading(false) }
    }
    void init();
    return () => { cancelled = true };
  }, []);
  const signInWithGoogle = useCallback(() => {
    try {
      if (!isSupabaseConfigured()) { setErrorEs('Configura Supabase para iniciar sesión'); return }
      window.location.assign(buildGoogleAuthorizeUrl(resolveAppRedirect()));
    } catch (error) { setErrorEs(error instanceof Error ? error.message : 'No se pudo iniciar sesión con Google') }
  }, []);
  const signOut = useCallback(() => { window.localStorage.removeItem(SESSION_KEY); setUser(null); setErrorEs(null) }, []);
  const clearError = useCallback(() => setErrorEs(null), []);
  const value = useMemo<AuthContextValue>(() => ({ user, isLoading, errorEs, signInWithGoogle, signOut, clearError }), [user, isLoading, errorEs, signInWithGoogle, signOut, clearError]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
