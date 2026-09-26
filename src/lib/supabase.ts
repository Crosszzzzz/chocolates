// Social auth config (PR2). No deps: GoTrue REST + OAuth redirect.
// Rollback: delete supabase.ts + AuthContext.tsx; Navbar renders no-auth UI.
export const PROD_ORIGIN = 'https://chocolates-zeta.vercel.app';
export const SESSION_KEY = 'chocolates.auth.session';
export function getSupabaseUrl(): string {
  const v = import.meta.env.VITE_SUPABASE_URL;
  return typeof v === 'string' ? v.trim().replace(/\/+$/, '') : '';
}
export function getSupabaseAnonKey(): string {
  const v = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return typeof v === 'string' ? v.trim() : '';
}
export function isSupabaseConfigured(): boolean {
  return getSupabaseUrl() !== '' && getSupabaseAnonKey() !== '';
}
// Allow-list: prod + *.vercel.app previews + local dev. All else rejected.
export function isAllowedRedirectUrl(candidate: string): boolean {
  try {
    const url = new URL(candidate);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
    if (url.origin === PROD_ORIGIN) return true;
    return url.hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}
export function resolveAppRedirect(): string {
  const redirectTo = `${window.location.origin}/`;
  if (!isAllowedRedirectUrl(redirectTo)) throw new Error('URL de retorno no autorizada');
  return redirectTo;
}
export function buildGoogleAuthorizeUrl(redirectTo: string): string {
  if (!isAllowedRedirectUrl(redirectTo)) throw new Error('URL de retorno no autorizada');
  const base = getSupabaseUrl();
  if (base === '' || getSupabaseAnonKey() === '') throw new Error('Configura Supabase para iniciar sesión');
  return `${base}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;
}
export type AuthHashResult =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'error'; errorEs: string }
  | { kind: 'empty' };
export function parseAuthHash(href: string): AuthHashResult {
  const i = href.indexOf('#');
  if (i === -1) return { kind: 'empty' };
  const params = new URLSearchParams(href.slice(i + 1));
  if (params.get('error') !== null) return { kind: 'error', errorEs: 'No se pudo iniciar sesión con Google' };
  const accessToken = params.get('access_token');
  if (!accessToken) return { kind: 'empty' };
  return { kind: 'tokens', accessToken, refreshToken: params.get('refresh_token') ?? '' };
}
