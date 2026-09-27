import { describe, expect, it } from 'vitest';
import { isAllowedRedirectUrl, PROD_ORIGIN } from './supabase';

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
