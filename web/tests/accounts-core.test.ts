// Accounts, the pure half: PKCE, the callback URL, and the records this device keeps.
import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_KEY,
  PENDING_KEY,
  PENDING_MAX_AGE_MS,
  authorizeUrl,
  base64Url,
  challengeFor,
  cleanSearch,
  googleEnabled,
  identityFromSignIn,
  isCallbackHash,
  newVerifier,
  readAccount,
  readCallback,
  redirectTarget,
  savePending,
  takePending,
  writeAccount,
} from '../src/accounts/core.js';

const memory = () => {
  const m = new Map<string, string>();
  return { m, kv: { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) } };
};

describe('PKCE', () => {
  it('the verifier is long, URL-safe and random', () => {
    const a = newVerifier();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(newVerifier()).not.toBe(a);
  });

  it('the challenge is base64url(sha256(verifier)) — the RFC 7636 test vector', async () => {
    expect(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    expect(base64Url(new Uint8Array([251, 255]))).toBe('-_8');
  });

  it('sends the browser to Supabase with Google, our page as the way back, and only the CHALLENGE', () => {
    const url = new URL(authorizeUrl('https://proj.supabase.co/', 'https://www.futasaku.com/', 'CHAL'));
    expect(url.origin + url.pathname).toBe('https://proj.supabase.co/auth/v1/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({ provider: 'google', redirect_to: 'https://www.futasaku.com/', code_challenge: 'CHAL', code_challenge_method: 's256' });
    expect(redirectTarget({ origin: 'https://www.futasaku.com', pathname: '/' })).toBe('https://www.futasaku.com/');
  });
});

describe('the way back', () => {
  it('reads the code, or an error, and nothing else', () => {
    expect(readCallback('?code=abc123-XYZ_9')).toEqual({ code: 'abc123-XYZ_9' });
    expect(readCallback('?error=access_denied&error_description=User+cancelled')).toEqual({ error: 'User cancelled' });
    expect(readCallback('', '#error=server_error&error_description=bad')).toEqual({ error: 'bad' });
    expect(readCallback('?seed=4242')).toBeNull();
    expect(readCallback('?code=<script>')).toBeNull();
  });

  it('cleans only the sign-in leftovers out of the address', () => {
    expect(cleanSearch('?code=abc12345&seed=4242')).toBe('?seed=4242');
    expect(cleanSearch('?error=x&error_description=y&error_code=z')).toBe('');
    expect(isCallbackHash('#error=access_denied')).toBe(true);
    expect(isCallbackHash('#/join/ABCD')).toBe(false);
  });

  it('a pending sign-in is single use and expires', () => {
    const { m, kv } = memory();
    savePending(kv, { verifier: 'v', returnTo: 'online', at: 1000 });
    expect(takePending(kv, 2000)).toEqual({ verifier: 'v', returnTo: 'online', at: 1000 });
    expect(m.has(PENDING_KEY)).toBe(false);
    expect(takePending(kv, 2000)).toBeNull();
    savePending(kv, { verifier: 'v', returnTo: 'settings', at: 1000 });
    expect(takePending(kv, 1000 + PENDING_MAX_AGE_MS + 1)).toBeNull();
    m.set(PENDING_KEY, '{nonsense');
    expect(takePending(kv, 0)).toBeNull();
  });
});

describe('device records', () => {
  it('the account record round-trips and rejects junk', () => {
    const { m, kv } = memory();
    writeAccount(kv, { provider: 'google', email: 'a@gmail.com', playerId: 'p1' });
    expect(readAccount(kv)).toEqual({ provider: 'google', email: 'a@gmail.com', playerId: 'p1' });
    m.set(ACCOUNT_KEY, JSON.stringify({ provider: 'facebook', playerId: 'p1' }));
    expect(readAccount(kv)).toBeNull();
    expect(readAccount(null)).toBeNull();
  });

  it('only a Google switch that is really on counts', () => {
    expect(googleEnabled({ external: { google: true, email: true } })).toBe(true);
    expect(googleEnabled({ external: { google: false } })).toBe(false);
    expect(googleEnabled(null)).toBe(false);
  });

  it('turns the server answer into the identity the online lobby reads', () => {
    expect(identityFromSignIn({ token: 't', player: { id: 'p', displayName: 'MapleFox', kind: 'account' } })).toEqual({ token: 't', playerId: 'p', displayName: 'MapleFox', kind: 'account' });
    expect(identityFromSignIn({ player: { id: 'p' } })).toBeNull();
  });
});
