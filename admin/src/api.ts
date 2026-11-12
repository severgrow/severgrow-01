// The dashboard's transport: the player's own bearer token against the admin API.
//
// Two rules this file exists to keep:
//   * the token is the PLAYER's normal token — there is no admin key, no service-role key and no
//     database credential anywhere in this build, and none is ever fetched;
//   * a token comes from "Sign in with Google" on this page (admin/src/google.ts), from this device's
//     own storage (where the game already keeps it) or is pasted by the owner, and is never taken
//     from the URL — a token in a query string ends up in history,
//     referrers and screenshots.

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; status: number; code: string; message: string };
export type ApiResult<T> = ApiOk<T> | ApiErr;

/**
 * The server's code when migration 0012 (the admin tables `feedback_triage` / `admin_seen`) has not
 * been applied. It is NOT an empty result and NOT a bug: the screens show a plain "not enabled yet"
 * state instead of an error or a list that would read as "there is nothing here".
 * (Server side: `ApiErrorCode` in server/src/errors.ts.)
 */
export const ADMIN_MIGRATION_PENDING = 'ADMIN_MIGRATION_PENDING';

/** The client version the API handshake expects (server/src/config.ts `minClientVersion`). */
const CLIENT_VERSION = '0.5.0';

/**
 * localStorage keys the GAME writes its online identity under, most likely first. The game prefixes
 * its keys per channel (`futa05:` at the root, `futa04:` under /futa0.4/, none on older channels), so
 * all of them are tried; the first that yields a token wins. Reading the game's own key is the whole
 * point — the owner should not have to hunt for a token on the machine they already play on.
 */
export const IDENTITY_KEYS: readonly string[] = [
  'futa05:severgrow.duel.identity.v1',
  'futa04:severgrow.duel.identity.v1',
  'severgrow.duel.identity.v1',
];

/** Where a pasted token is kept for this tab only (never `localStorage`: it is not the game's). */
export const ADMIN_TOKEN_KEY = 'severgrow.admin.token';

export type TokenSource = 'google' | 'game' | 'pasted';

/** Set for this tab by "Sign out": the game's token on this device is then not picked up again. */
export const SIGNED_OUT_KEY = 'futasaku.admin.signed-out';
/** The dashboard's own token from "Sign in with Google" (admin/src/google.ts). */
const OWN_TOKEN_KEY = 'futasaku.admin.token.v1';

/**
 * Which token to use, in order: the dashboard's own Google sign-in, the game's identity on this
 * device (unless the owner signed out of the dashboard in this tab), then a pasted token.
 */
export const pickToken = (found: {
  own: string | null;
  game: string | null;
  pasted: string | null;
  signedOut: boolean;
}): { token: string; source: TokenSource } | null => {
  const usable = (t: string | null): t is string => typeof t === 'string' && t.length >= 16;
  if (usable(found.own)) return { token: found.own, source: 'google' };
  if (usable(found.game) && !found.signedOut) return { token: found.game, source: 'game' };
  if (usable(found.pasted)) return { token: found.pasted, source: 'pasted' };
  return null;
};

export const readIdentityToken = (storage: Storage): string | null => {
  for (const key of IDENTITY_KEYS) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { token?: unknown };
      if (typeof parsed.token === 'string' && parsed.token.length >= 16) return parsed.token;
    } catch {
      /* a malformed or unreadable entry is simply skipped */
    }
  }
  return null;
};

/** A safe storage handle: a browser with storage blocked must not break the page. */
const safeStorage = (kind: 'local' | 'session'): Storage | null => {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};

const safeGet = (storage: Storage | null, key: string): string | null => {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

/** The game's own token on this device, whether or not the dashboard would use it. */
export const gameToken = (): string | null => {
  const local = safeStorage('local');
  return local ? readIdentityToken(local) : null;
};

/** Find a usable token, and say where it came from so the UI can be honest about it. */
export const findToken = (): { token: string; source: TokenSource } | null => {
  const local = safeStorage('local');
  const session = safeStorage('session');
  return pickToken({
    own: safeGet(local, OWN_TOKEN_KEY),
    game: gameToken(),
    pasted: safeGet(session, ADMIN_TOKEN_KEY),
    signedOut: safeGet(session, SIGNED_OUT_KEY) === '1',
  });
};

/** A fresh sign-in (Google or pasted) lifts this tab's "signed out" mark. */
export const clearSignedOut = (): void => {
  try {
    safeStorage('session')?.removeItem(SIGNED_OUT_KEY);
  } catch {
    /* ignored */
  }
};

/** Keep a pasted token for this tab. It never touches the game's own stored identity. */
export const rememberPastedToken = (token: string): void => {
  try {
    safeStorage('session')?.setItem(ADMIN_TOKEN_KEY, token);
  } catch {
    /* a blocked session storage just means "paste again next time" */
  }
};

/**
 * Sign out of the DASHBOARD: forget its own token and any pasted one, and stop using the game's token
 * in this tab. The game's stored identity is never removed — signing out here must not sign the game
 * out (or, for a guest, lose the player for good).
 */
export const forgetToken = (): void => {
  const session = safeStorage('session');
  try {
    session?.removeItem(ADMIN_TOKEN_KEY);
    session?.setItem(SIGNED_OUT_KEY, '1');
  } catch {
    /* ignored */
  }
  try {
    safeStorage('local')?.removeItem(OWN_TOKEN_KEY);
  } catch {
    /* ignored */
  }
};

/** Drop only a token that the server called dead, leaving the game's identity alone. */
export const forgetDeadToken = (source: TokenSource): void => {
  if (source === 'google') {
    try {
      safeStorage('local')?.removeItem(OWN_TOKEN_KEY);
    } catch {
      /* ignored */
    }
  } else if (source === 'pasted') {
    try {
      safeStorage('session')?.removeItem(ADMIN_TOKEN_KEY);
    } catch {
      /* ignored */
    }
  }
};

/** The API base from the build variable, or null when this build has no endpoint configured. */
export const apiBaseUrl = (): string | null => {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const raw = env?.VITE_DUEL_API_URL?.trim();
  return raw ? raw.replace(/\/+$/, '') : null;
};

/** A query-string override so the owner can point a preview build at a local server (`?api=…`). */
export const apiBaseFromLocation = (search: string): string | null => {
  const params = new URLSearchParams(search);
  const override = params.get('api')?.trim();
  if (!override) return null;
  try {
    const url = new URL(override);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin + url.pathname.replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
};

export type AdminSession = {
  admin: { id: string; displayName: string | null; tag: string };
  rulesVersion: string;
  limits: { maxPage: number; csvMaxRows: number; tagScanLimit: number; readsPerHour: number };
  serverNow: number;
};

class AdminTimeout extends Error {}
const failed = (error: unknown): { ok: false; status: number; code: string; message: string } =>
  error instanceof AdminTimeout
    ? { ok: false, status: 0, code: 'TIMEOUT', message: TIMEOUT_MESSAGE }
    : { ok: false, status: 0, code: 'OFFLINE', message: 'Could not reach the duel API.' };

export type Page<T> = { rows: T[]; total: number; nextCursor: string | null };

/**
 * ONE REQUEST AT A TIME, and none forever (owner report, 2026-10-28: "Seeds & world" showed "Function
 * failed due to not having enough compute resources" and "Loading…" without end). The page used to
 * fire several heavy reads together; the Edge function has a small per-request budget and its pooled
 * queries can hang when issued together (server/src/admin/postgres.ts, `world`). The client now sends
 * them in the order asked, each after the last has answered, and gives up after this long.
 */
export const ADMIN_REQUEST_TIMEOUT_MS = 45_000;
const TIMEOUT_MESSAGE = 'The server took too long to answer. Try again.';

export class AdminApi {
  /** The tail of the one-at-a-time line every request joins. */
  private line: Promise<unknown> = Promise.resolve();

  /** Join the line: start only when the request ahead has answered, and stop waiting at the timeout. */
  private send(url: string, init: RequestInit = {}): Promise<Response> {
    const run = async (): Promise<Response> => {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), ADMIN_REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(url, { ...init, signal: abort.signal });
        const body = await response.arrayBuffer();
        return new Response([204,205,304].includes(response.status) ? null : body, { status: response.status, statusText: response.statusText, headers: response.headers });
      } catch (error) {
        if (abort.signal.aborted) throw new AdminTimeout();
        throw error;
      } finally {
        clearTimeout(timer);
      }
    };
    const turn = this.line.then(run, run);
    this.line = turn.catch(() => undefined);
    return turn;
  }

  constructor(
    private readonly base: string,
    readonly token: string,
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      accept: 'application/json',
      authorization: `Bearer ${this.token}`,
      'x-futasaku-client-version': CLIENT_VERSION,
      ...extra,
    };
  }

  private async parse<T>(response: Response): Promise<ApiResult<T>> {
    if (response.ok) {
      try {
        return { ok: true, data: (await response.json()) as T };
      } catch {
        return { ok: false, status: response.status, code: 'BAD_BODY', message: 'The server sent a response this page could not read.' };
      }
    }
    let code = 'ERROR';
    let message = `The server answered ${response.status}.`;
    try {
      const body = (await response.json()) as { code?: unknown; message?: unknown };
      if (typeof body.code === 'string') code = body.code;
      if (typeof body.message === 'string') message = body.message;
    } catch {
      /* keep the defaults */
    }
    return { ok: false, status: response.status, code, message };
  }

  async get<T>(path: string, params: Record<string, string | number | null | undefined> = {}): Promise<ApiResult<T>> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      search.set(key, String(value));
    }
    const text = search.toString();
    try {
      const response = await this.send(`${this.base}${path}${text ? `?${text}` : ''}`, { headers: this.headers() });
      return await this.parse<T>(response);
    } catch (error) {
      return failed(error);
    }
  }

  async post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
    try {
      const response = await this.send(`${this.base}${path}`, {
        method: 'POST',
        headers: this.headers({ 'content-type': 'application/json' }),
        body: JSON.stringify(body ?? {}),
      });
      return await this.parse<T>(response);
    } catch (error) {
      return failed(error);
    }
  }

  /** The CSV export: the same filters, the same authorization, a `text/csv` body. */
  async csv(path: string, params: Record<string, string | number | null | undefined> = {}): Promise<ApiResult<string>> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      search.set(key, String(value));
    }
    const text = search.toString();
    try {
      const response = await this.send(`${this.base}${path}${text ? `?${text}` : ''}`, { headers: this.headers({ accept: 'text/csv' }) });
      if (response.ok) return { ok: true, data: await response.text() };
      const parsed = await this.parse<never>(response);
      if (parsed.ok) return { ok: false, status: response.status, code: 'ERROR', message: 'The export could not be read.' };
      return { ok: false, status: parsed.status, code: parsed.code, message: parsed.message };
    } catch (error) {
      return failed(error);
    }
  }

  /** Session probe: the one call that decides "admin" from "not an admin". */
  session(): Promise<ApiResult<AdminSession & { ok: true }>> {
    return this.get<AdminSession & { ok: true }>('/v1/admin/session');
  }
}
