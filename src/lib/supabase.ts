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

// M9 email/password auth (GoTrue REST, no new backend). Google flow above untouched.
export interface EmailSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string | null };
}
interface GoTrueSessionResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  user?: { id?: unknown; email?: unknown } | null;
}
function requireEmailConfig(): { base: string; anon: string } {
  const base = getSupabaseUrl();
  const anon = getSupabaseAnonKey();
  if (base === '' || anon === '') throw new Error('Configura Supabase para iniciar sesión');
  return { base, anon };
}
export function validateEmailCredentials(email: string, password: string): { email: string; password: string } {
  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('Correo electrónico inválido');
  if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
  return { email: cleanEmail, password };
}
/** Parse a GoTrue session payload; throws Spanish errors (pure, unit-tested via roles/apiMe tests). */
export const PENDING_CONFIRMATION_ES = 'Revisa tu correo para confirmar tu cuenta';
export function parseGoTrueSession(data: unknown): EmailSession {
  const body = (typeof data === 'object' && data !== null ? data : {}) as GoTrueSessionResponse;
  const accessToken = typeof body.access_token === 'string' ? body.access_token : '';
  // Signup with email confirmation returns a user but no session: caller
  // (signUpWithEmailPassword) retries a password sign-in before surfacing this.
  if (accessToken === '') {
    const pendingUser = typeof body.user?.id === 'string' ? body.user.id : '';
    if (pendingUser !== '') throw new Error(PENDING_CONFIRMATION_ES);
    throw new Error('No se pudo iniciar sesión con correo');
  }
  const id = typeof body.user?.id === 'string' ? body.user.id : '';
  if (id === '') throw new Error('No se pudo iniciar sesión con correo');
  const email = typeof body.user?.email === 'string' ? body.user.email : null;
  return {
    accessToken,
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : '',
    expiresIn: typeof body.expires_in === 'number' && Number.isFinite(body.expires_in) ? body.expires_in : 3600,
    user: { id, email },
  };
}
async function postGoTrue(path: string, payload: { email: string; password: string }): Promise<EmailSession> {
  const { base, anon } = requireEmailConfig();
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('No se pudo iniciar sesión con correo');
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    // GoTrue error shape varies by endpoint: /signup uses `msg`, while
    // /token (OAuth2 grant) uses `error_description`. Read all known fields
    // so failures never surface as a silent generic message.
    const body = (typeof data === 'object' && data !== null ? data : {}) as {
      msg?: unknown;
      message?: unknown;
      error_description?: unknown;
    };
    const raw = [body.msg, body.message, body.error_description].find(
      (v): v is string => typeof v === 'string' && v !== '',
    ) ?? '';
    if (/invalid login credentials/i.test(raw)) throw new Error('Correo o contraseña incorrectos');
    if (/already registered|already exists|user already/i.test(raw)) throw new Error('Este correo ya está registrado, inicia sesión');
    if (/email not confirmed/i.test(raw)) throw new Error(PENDING_CONFIRMATION_ES);
    throw new Error('No se pudo iniciar sesión con correo');
  }
  return parseGoTrueSession(data);
}
/** POST /auth/v1/signup (GoTrue REST). Falls back to a password sign-in when
 * signup returns no session (email confirmation ON: user created, inbox
 * pending) so a fresh turista is still logged in and the form can close. */
export async function signUpWithEmailPassword(email: string, password: string): Promise<EmailSession> {
  const creds = validateEmailCredentials(email, password);
  try {
    return await postGoTrue('/auth/v1/signup', creds);
  } catch (error) {
    if (error instanceof Error && error.message === PENDING_CONFIRMATION_ES) {
      return postGoTrue('/auth/v1/token?grant_type=password', creds);
    }
    throw error;
  }
}
/** POST /auth/v1/token?grant_type=password (GoTrue REST). */
export function signInWithEmailPassword(email: string, password: string): Promise<EmailSession> {
  const creds = validateEmailCredentials(email, password);
  return postGoTrue('/auth/v1/token?grant_type=password', creds);
}
