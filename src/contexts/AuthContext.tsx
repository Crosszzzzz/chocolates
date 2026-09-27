import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SESSION_KEY, buildGoogleAuthorizeUrl, getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured, parseAuthHash, resolveAppRedirect, signInWithEmailPassword, signUpWithEmailPassword } from '../lib/supabase';
import { DEFAULT_ROLE, isAdminRole, isEmpresaRole, isTuristaRole, normalizeRole, type UserRole } from '../lib/roles';
export interface AuthUser { id: string; email: string | null; role: UserRole }
interface StoredSession { accessToken: string; refreshToken: string; expiresAt: number; user: AuthUser }
interface AuthContextValue {
  user: AuthUser | null;
  role: UserRole | null;
  isAdmin: boolean;
  isEmpresa: boolean;
  isTurista: boolean;
  isLoading: boolean;
  errorEs: string | null;
  signInWithGoogle: () => void;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  clearError: () => void;
}
const AuthContext = createContext<AuthContextValue | null>(null);
function readStored(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (parsed.expiresAt < Date.now()) window.localStorage.removeItem(SESSION_KEY);
    if (parsed.expiresAt < Date.now()) return null;
    // Legacy sessions (pre-M9) carry no role: normalize to turista, refresh below.
    parsed.user.role = normalizeRole((parsed.user as { role?: unknown }).role);
    return parsed;
  } catch { return null }
}
function writeStored(session: StoredSession): void {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
async function fetchUser(accessToken: string): Promise<{ id: string; email: string | null }> {
  const res = await fetch(`${getSupabaseUrl()}/auth/v1/user`, { headers: { apikey: getSupabaseAnonKey(), Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error('No se pudo iniciar sesión con Google');
  const data = (await res.json()) as { id: string; email?: string | null };
  return { id: data.id, email: data.email ?? null };
}
/** Role lookup via /api/me (service_role). Never throws: defaults to turista. */
async function fetchRole(userId: string): Promise<{ email: string | null; role: UserRole }> {
  try {
    const res = await fetch('/api/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) return { email: null, role: DEFAULT_ROLE };
    const data = (await res.json()) as { email?: unknown; role?: unknown };
    return {
      email: typeof data.email === 'string' ? data.email : null,
      role: normalizeRole(data.role),
    };
  } catch {
    return { email: null, role: DEFAULT_ROLE };
  }
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
          // Google flow untouched: tokens -> user -> role -> store.
          try {
            const profile = await fetchUser(parsed.accessToken);
            const me = await fetchRole(profile.id);
            const full: AuthUser = { id: profile.id, email: me.email ?? profile.email, role: me.role };
            writeStored({ accessToken: parsed.accessToken, refreshToken: parsed.refreshToken, expiresAt: Date.now() + 55 * 60 * 1000, user: full } satisfies StoredSession);
            window.location.hash = '';
            if (!cancelled) setUser(full);
          } catch {
            window.localStorage.removeItem(SESSION_KEY);
            window.location.hash = '';
            if (!cancelled) setErrorEs('No se pudo iniciar sesión con Google');
          }
        } else {
          const stored = readStored();
          if (stored !== null) {
            if (!cancelled) setUser(stored.user);
            // Legacy/refresh: confirm role in background (best-effort, silent).
            void fetchRole(stored.user.id).then((me) => {
              if (cancelled || me.role === stored.user.role) return;
              const next: AuthUser = { ...stored.user, email: me.email ?? stored.user.email, role: me.role };
              writeStored({ ...stored, user: next });
              setUser(next);
            });
          }
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
  const persistEmailSession = useCallback(async (email: string, password: string, kind: 'signup' | 'signin'): Promise<void> => {
    setErrorEs(null);
    let session;
    try {
      session = kind === 'signup'
        ? await signUpWithEmailPassword(email, password)
        : await signInWithEmailPassword(email, password);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo iniciar sesión con correo';
      setErrorEs(message);
      throw new Error(message);
    }
    const me = await fetchRole(session.user.id);
    const full: AuthUser = { id: session.user.id, email: me.email ?? session.user.email, role: me.role };
    writeStored({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: Date.now() + session.expiresIn * 1000,
      user: full,
    });
    setUser(full);
  }, []);
  const signUpWithEmail = useCallback((email: string, password: string) => persistEmailSession(email, password, 'signup'), [persistEmailSession]);
  const signInWithEmail = useCallback((email: string, password: string) => persistEmailSession(email, password, 'signin'), [persistEmailSession]);
  const signOut = useCallback(() => { window.localStorage.removeItem(SESSION_KEY); setUser(null); setErrorEs(null) }, []);
  const clearError = useCallback(() => setErrorEs(null), []);
  const value = useMemo<AuthContextValue>(() => ({
    user,
    role: user?.role ?? null,
    isAdmin: isAdminRole(user?.role),
    isEmpresa: isEmpresaRole(user?.role),
    isTurista: user !== null && isTuristaRole(user.role),
    isLoading,
    errorEs,
    signInWithGoogle,
    signUpWithEmail,
    signInWithEmail,
    signOut,
    clearError,
  }), [user, isLoading, errorEs, signInWithGoogle, signUpWithEmail, signInWithEmail, signOut, clearError]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
