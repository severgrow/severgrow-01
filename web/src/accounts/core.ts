// Accounts — the pure half (no DOM): the Google sign-in round trip through Supabase Auth, done with
// plain HTTP and PKCE (no SDK), and the small records this device keeps. See docs/ACCOUNTS.md.
//
// The round trip:
//   1. start: make a random `verifier`, keep it on this device, send the browser to Supabase's
//      /auth/v1/authorize?provider=google with sha256(verifier) as the challenge.
//   2. Google → Supabase → back to this page with ?code=…
//   3. finish: trade code + verifier for a Supabase access token (only this device has the verifier),
//      hand that token ONCE to our server (POST /v1/auth/google), which asks Supabase who it is and
//      answers with one of our own player tokens. The Supabase session is then closed.
import type { KeyValue } from '../../../server/src/client.js';
import { ACCOUNT } from '../../../src/strings.js';

export const PENDING_KEY = 'futasaku.auth.pending.v1';
export const ACCOUNT_KEY = 'futasaku.account.v1';
export const WELCOME_KEY = 'futasaku.account.welcome.v1';
export const FLASH_KEY = 'futasaku.account.flash.v1';
/** A one-shot invitation to choose a nickname; set by the sign-in that FORMED the account. */
export const NICKNAME_KEY = 'futasaku.account.nickname.v1';
/** A sign-in started longer ago than this is ignored (the verifier is single-use anyway). */
export const PENDING_MAX_AGE_MS = 15 * 60 * 1000;

export type ReturnTo = 'online' | 'settings' | 'menu';
export type Pending = { verifier: string; returnTo: ReturnTo; at: number };
/** What this device remembers about the sign-in, for Settings. The email never goes to our server. */
export type AccountRecord = { provider: 'google'; email: string | null; playerId: string };
export type Flash = { kind: 'signed-in' | 'failed'; text: string; returnTo: ReturnTo };

export const base64Url = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** 43+ characters from the unreserved set, as RFC 7636 asks. */
export const newVerifier = (random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string => base64Url(random(48));

export const challengeFor = async (verifier: string): Promise<string> =>
  base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));

export const authorizeUrl = (supabaseUrl: string, redirectTo: string, challenge: string): string => {
  const q = new URLSearchParams({ provider: 'google', redirect_to: redirectTo, code_challenge: challenge, code_challenge_method: 's256' });
  return `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/authorize?${q.toString()}`;
};

/** Where Supabase sends the player back: this page, without any query or hash. */
export const redirectTarget = (loc: { origin: string; pathname: string }): string => loc.origin + loc.pathname;

const CALLBACK_PARAMS = ['code', 'error', 'error_code', 'error_description', 'state', 'sb'];

/** What came back in the URL (query, or the hash for some error pages), or null when nothing did. */
export const readCallback = (search: string, hash = ''): { code: string } | { error: string } | null => {
  const q = new URLSearchParams(search);
  const h = new URLSearchParams(hash.replace(/^#/, ''));
  const code = q.get('code');
  if (code && /^[A-Za-z0-9._~-]{8,512}$/.test(code)) return { code };
  const err = q.get('error_description') ?? q.get('error') ?? h.get('error_description') ?? h.get('error');
  return err ? { error: err.slice(0, 200) } : null;
};

/** The same query string with the sign-in leftovers removed (other parameters, e.g. ?seed=, stay). */
export const cleanSearch = (search: string): string => {
  const q = new URLSearchParams(search);
  for (const k of CALLBACK_PARAMS) q.delete(k);
  const s = q.toString();
  return s ? `?${s}` : '';
};

/** True when the hash only carries sign-in leftovers (an error), so it can be dropped. */
export const isCallbackHash = (hash: string): boolean => /(^|[#&])(error|error_description|access_token)=/.test(hash);

const readJson = <T>(kv: KeyValue | null, key: string): T | null => {
  try {
    const raw = kv?.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const writeJson = (kv: KeyValue | null, key: string, value: unknown): boolean => {
  try {
    if (!kv) return false;
    kv.set(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};
const drop = (kv: KeyValue | null, key: string) => {
  try {
    kv?.remove(key);
  } catch {
    /* storage blocked */
  }
};

export const savePending = (kv: KeyValue | null, p: Pending): boolean => writeJson(kv, PENDING_KEY, p);

/** Reads AND removes the pending sign-in (single use). Null when missing, malformed or too old. */
export const takePending = (kv: KeyValue | null, now: number): Pending | null => {
  const p = readJson<Partial<Pending>>(kv, PENDING_KEY);
  drop(kv, PENDING_KEY);
  if (!p || typeof p.verifier !== 'string' || typeof p.at !== 'number') return null;
  if (now - p.at > PENDING_MAX_AGE_MS || p.at > now + 60_000) return null;
  const returnTo: ReturnTo = p.returnTo === 'online' || p.returnTo === 'settings' ? p.returnTo : 'menu';
  return { verifier: p.verifier, returnTo, at: p.at };
};

export const readAccount = (kv: KeyValue | null): AccountRecord | null => {
  const a = readJson<Partial<AccountRecord>>(kv, ACCOUNT_KEY);
  if (!a || a.provider !== 'google' || typeof a.playerId !== 'string') return null;
  return { provider: 'google', email: typeof a.email === 'string' ? a.email : null, playerId: a.playerId };
};
export const writeAccount = (kv: KeyValue | null, a: AccountRecord): boolean => writeJson(kv, ACCOUNT_KEY, a);
export const clearAccount = (kv: KeyValue | null) => drop(kv, ACCOUNT_KEY);

export const setFlash = (kv: KeyValue | null, f: Flash): boolean => writeJson(kv, FLASH_KEY, f);
export const takeFlash = (kv: KeyValue | null): Flash | null => {
  const f = readJson<Flash>(kv, FLASH_KEY);
  drop(kv, FLASH_KEY);
  return f && typeof f.text === 'string' ? f : null;
};

/**
 * The one-shot nickname invitation. It is set by the sign-in that FORMED the account (a brand-new
 * account, or a guest upgraded in place) and read once after the reload that follows, so the step
 * is asked exactly once no matter how many times the player signs in later. Skipping consumes it.
 */
export const setNicknamePrompt = (kv: KeyValue | null, playerId: string): boolean => writeJson(kv, NICKNAME_KEY, { playerId });
/** Reads AND removes the pending invitation (single use). Null when missing or malformed. */
export const takeNicknamePrompt = (kv: KeyValue | null): string | null => {
  const p = readJson<{ playerId?: unknown }>(kv, NICKNAME_KEY);
  drop(kv, NICKNAME_KEY);
  return p && typeof p.playerId === 'string' ? p.playerId : null;
};

/** The new account's name step, still owed (read WITHOUT removing): it is asked until a name is saved. */
export const pendingNicknamePrompt = (kv: KeyValue | null): string | null => {
  const p = readJson<{ playerId?: unknown }>(kv, NICKNAME_KEY);
  return p && typeof p.playerId === 'string' ? p.playerId : null;
};
/** A name was saved: the step is settled. */
export const clearNicknamePrompt = (kv: KeyValue | null): void => { drop(kv, NICKNAME_KEY); };

/** GET /auth/v1/settings → is the Google provider switched on in the Supabase dashboard? */
export const googleEnabled = (settings: unknown): boolean => {
  const ext = (settings as { external?: Record<string, unknown> } | null)?.external;
  return ext?.google === true;
};

/** The identity record the online lobby reads (web/src/online/identity.ts), from our server's answer. */
export const identityFromSignIn = (body: unknown): { token: string; playerId: string; displayName: string | null; kind: 'guest' | 'account' } | null => {
  const b = body as { token?: unknown; player?: { id?: unknown; displayName?: unknown; kind?: unknown } } | null;
  if (typeof b?.token !== 'string' || typeof b.player?.id !== 'string') return null;
  const kind = b.player.kind === 'account' ? 'account' : 'guest';
  return { token: b.token, playerId: b.player.id, displayName: typeof b.player.displayName === 'string' ? b.player.displayName : null, kind };
};

/**
 * The toast after a Google sign-in (owner, 2026-10-22). "Games played as a guest were not moved" is
 * said only when an earlier, different identity actually had matches — or when that could not be
 * checked (null), because then the warning is the honest default. A guest who never played (the one
 * Play online creates on a new phone) is simply welcomed back.
 */
export const signInMessage = (s: {
  outcome: unknown;
  name: string;
  beforePlayerId: string | null;
  afterPlayerId: string;
  guestHadMatches: boolean | null;
}): string => {
  if (s.outcome === 'linked') return ACCOUNT.linked(s.name);
  const switched = s.outcome === 'signed-in' && s.beforePlayerId !== null && s.beforePlayerId !== s.afterPlayerId;
  return switched && s.guestHadMatches !== false ? ACCOUNT.switched(s.name) : ACCOUNT.welcomeBack(s.name);
};
