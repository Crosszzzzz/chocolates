import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAllowedRedirectUrl, PROD_ORIGIN, parseGoTrueSession, signUpWithEmailPassword, validateEmailCredentials } from './supabase';

describe('isAllowedRedirectUrl', () => {
  it('allows prod origin', () => {
    expect(isAllowedRedirectUrl(PROD_ORIGIN + '/')).toBe(true);
  });

  it('allows *.vercel.app previews', () => {
    expect(isAllowedRedirectUrl('https://chocolates-abc123.vercel.app/')).toBe(true);
    expect(isAllowedRedirectUrl('https://foo-bar.vercel.app/callback')).toBe(true);
  });

  it('allows localhost', () => {
    expect(isAllowedRedirectUrl('http://localhost:3000/')).toBe(true);
    expect(isAllowedRedirectUrl('http://127.0.0.1:3000/')).toBe(true);
  });

  it('rejects evil.com', () => {
    expect(isAllowedRedirectUrl('https://evil.com/')).toBe(false);
    expect(isAllowedRedirectUrl('https://evil.com/callback?next=https://chocolates-zeta.vercel.app')).toBe(false);
  });
});

describe('validateEmailCredentials', () => {
  it('normalizes email and accepts valid credentials', () => {
    expect(validateEmailCredentials('  Ana@Tusitio.BO ', 'secreta1')).toEqual({ email: 'ana@tusitio.bo', password: 'secreta1' });
  });

  it('rejects bad email and short password in Spanish', () => {
    expect(() => validateEmailCredentials('no-es-correo', 'secreta1')).toThrow('Correo electrónico inválido');
    expect(() => validateEmailCredentials('ana@tusitio.bo', '123')).toThrow('La contraseña debe tener al menos 6 caracteres');
  });
});

describe('parseGoTrueSession', () => {
  it('parses a GoTrue session payload', () => {
    const session = parseGoTrueSession({
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 3600,
      user: { id: 'uid-1', email: 'ana@tusitio.bo' },
    });
    expect(session).toEqual({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 3600,
      user: { id: 'uid-1', email: 'ana@tusitio.bo' },
    });
  });

  it('asks for inbox confirmation when signup returns no session', () => {
    expect(() => parseGoTrueSession({ user: { id: 'uid-1' } })).toThrow('Revisa tu correo para confirmar tu cuenta');
    expect(() => parseGoTrueSession({})).toThrow('No se pudo iniciar sesión con correo');
  });
});

describe('signUpWithEmailPassword', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function stubSupabaseEnv(): void {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  }

  function mockFetchSequence(responses: { ok: boolean; status: number; data: unknown }[]): string[] {
    const urls: string[] = [];
    let i = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        urls.push(String(url));
        const r = responses[Math.min(i, responses.length - 1)];
        i += 1;
        return { ok: r.ok, status: r.status, json: async () => r.data };
      }),
    );
    return urls;
  }

  const SESSION = {
    access_token: 'at',
    refresh_token: 'rt',
    expires_in: 3600,
    user: { id: 'uid-1', email: 'ana@tusitio.bo' },
  };

  it('returns the signup session directly when confirmation is off', async () => {
    stubSupabaseEnv();
    const urls = mockFetchSequence([{ ok: true, status: 200, data: SESSION }]);
    const session = await signUpWithEmailPassword('ana@tusitio.bo', 'secreta1');
    expect(session.accessToken).toBe('at');
    expect(session.user).toEqual({ id: 'uid-1', email: 'ana@tusitio.bo' });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('/auth/v1/signup');
  });

  it('falls back to password sign-in when signup returns no session', async () => {
    stubSupabaseEnv();
    const urls = mockFetchSequence([
      { ok: true, status: 200, data: { user: { id: 'uid-1', email: 'ana@tusitio.bo' } } },
      { ok: true, status: 200, data: SESSION },
    ]);
    const session = await signUpWithEmailPassword('ana@tusitio.bo', 'secreta1');
    expect(session.accessToken).toBe('at');
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('/auth/v1/signup');
    expect(urls[1]).toContain('/auth/v1/token');
  });

  it('surfaces inbox confirmation when sign-in is also unconfirmed', async () => {
    stubSupabaseEnv();
    mockFetchSequence([
      { ok: true, status: 200, data: { user: { id: 'uid-1', email: 'ana@tusitio.bo' } } },
      { ok: false, status: 400, data: { error: 'invalid_grant', error_description: 'Email not confirmed' } },
    ]);
    await expect(signUpWithEmailPassword('ana@tusitio.bo', 'secreta1')).rejects.toThrow(
      'Revisa tu correo para confirmar tu cuenta',
    );
  });

  it('reads OAuth-style error_description for invalid credentials', async () => {
    stubSupabaseEnv();
    mockFetchSequence([
      { ok: false, status: 400, data: { error: 'invalid_grant', error_description: 'Invalid login credentials' } },
    ]);
    await expect(signUpWithEmailPassword('ana@tusitio.bo', 'secreta1')).rejects.toThrow(
      'Correo o contraseña incorrectos',
    );
  });
});
