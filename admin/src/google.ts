// "Sign in with Google" on the dashboard itself, so the owner never has to open the game or paste a
// token first. It is the game's own round trip (web/src/accounts/core.ts, docs/ACCOUNTS.md), pointed
// back at /admin/:
//   1. a random verifier is kept on this device; the browser goes to Supabase's Google authorize page;
//   2. Google → Supabase → back to /admin/?code=…;
//   3. code + verifier → a Supabase access token → POST /v1/auth/google → one of OUR player tokens.
// The Supabase session is closed at once. The token is the owner's normal player token: the admin
// API still decides, server-side, whether that player is an admin.
//
// The token is kept under the dashboard's OWN key. The game's stored identity on this device is
// never written or removed here: signing in or out of the dashboard cannot sign the game out.
import { authorizeUrl, challengeFor, cleanSearch, googleEnabled, identityFromSignIn, newVerifier, readCallback } from '../../web/src/accounts/core.js';

/** The dashboard's own token (localStorage: it should survive closing the tab). */
export const ADMIN_OWN_TOKEN_KEY = 'futasaku.admin.token.v1';
const PENDING_KEY = 'futasaku.admin.pending.v1';
const PENDING_MAX_AGE_MS = 15 * 60 * 1000;
const CLIENT_VERSION = '0.5.0';

export type Supa = { url: string; key: string };

/** The public Supabase project address and anon key (the same build variables the game uses). */
export const supabaseConfig = (): Supa | null => {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const url = env?.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '');
  const key = env?.VITE_SUPABASE_ANON_KEY?.trim();
  return url && key ? { url, key } : null;
};

const local = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const readOwnToken = (): string | null => {
  try {
    const t = local()?.getItem(ADMIN_OWN_TOKEN_KEY) ?? null;
    return t && t.length >= 16 ? t : null;
  } catch {
    return null;
  }
};

export const forgetOwnToken = (): void => {
  try {
    local()?.removeItem(ADMIN_OWN_TOKEN_KEY);
  } catch {
    /* ignored */
  }
};

/** Is Google sign-in switched on in Supabase? */
export const googleAvailable = async (supa: Supa): Promise<boolean> => {
  try {
    const res = await fetch(`${supa.url}/auth/v1/settings`, { headers: { apikey: supa.key } });
    return res.ok && googleEnabled(await res.json());
  } catch {
    return false;
  }
};

/** Where Google sends the owner back: this page, without query or hash. */
const here = (): string => location.origin + location.pathname;

export const startGoogle = async (supa: Supa): Promise<void> => {
  const verifier = newVerifier();
  try {
    local()?.setItem(PENDING_KEY, JSON.stringify({ verifier, at: Date.now() }));
  } catch {
    throw new Error('This browser blocks storage, so the sign-in cannot be finished here.');
  }
  location.assign(authorizeUrl(supa.url, here(), await challengeFor(verifier)));
};

const takeVerifier = (): string | null => {
  const store = local();
  try {
    const raw = store?.getItem(PENDING_KEY);
    store?.removeItem(PENDING_KEY);
    const p = raw ? (JSON.parse(raw) as { verifier?: unknown; at?: unknown }) : null;
    if (!p || typeof p.verifier !== 'string' || typeof p.at !== 'number') return null;
    return Date.now() - p.at <= PENDING_MAX_AGE_MS ? p.verifier : null;
  } catch {
    return null;
  }
};

/**
 * Finish a sign-in when this page load is Google's return trip. Returns null when it is not one,
 * otherwise whether it worked (and why not). The code is removed from the address bar at once.
 */
export const finishGoogle = async (
  supa: Supa | null,
  apiBase: string,
  gameToken: string | null,
): Promise<null | { ok: true } | { ok: false; message: string }> => {
  const callback = readCallback(location.search, location.hash);
  if (!callback) return null;
  history.replaceState(history.state, '', location.pathname + cleanSearch(location.search));
  const verifier = takeVerifier();
  if (!verifier || !supa) return { ok: false, message: 'That sign-in was started somewhere else or too long ago. Try again.' };
  if ('error' in callback) return { ok: false, message: `Google sign-in did not finish (${callback.error}).` };
  try {
    const ex = await fetch(`${supa.url}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: { apikey: supa.key, 'content-type': 'application/json' },
      body: JSON.stringify({ auth_code: callback.code, code_verifier: verifier }),
    });
    const session = ex.ok ? ((await ex.json()) as { access_token?: unknown }) : null;
    const access = typeof session?.access_token === 'string' ? session.access_token : null;
    if (!access) return { ok: false, message: 'Google sign-in did not finish. Try again.' };
    // The game's token on this device (if any) goes along, exactly as the game sends it: a Google
    // account that is already linked is found by Google alone, and the token only matters for a
    // first sign-in, where it attaches Google to this device's player rather than a new one.
    const res = await fetch(`${apiBase}/v1/auth/google`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-futasaku-client-version': CLIENT_VERSION,
        ...(gameToken ? { authorization: `Bearer ${gameToken}` } : {}),
      },
      body: JSON.stringify({ accessToken: access }),
    });
    void fetch(`${supa.url}/auth/v1/logout`, { method: 'POST', headers: { apikey: supa.key, authorization: `Bearer ${access}` } }).catch(() => undefined);
    const identity = res.ok ? identityFromSignIn(await res.json()) : null;
    if (!identity) return { ok: false, message: `The game server did not accept the sign-in (${res.status}).` };
    local()?.setItem(ADMIN_OWN_TOKEN_KEY, identity.token);
    return { ok: true };
  } catch {
    return { ok: false, message: 'Could not reach the sign-in service. Check the connection and try again.' };
  }
};
