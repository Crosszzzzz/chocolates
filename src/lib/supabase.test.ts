import { describe, expect, it } from 'vitest';
import { isAllowedRedirectUrl, PROD_ORIGIN, parseGoTrueSession, validateEmailCredentials } from './supabase';

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
