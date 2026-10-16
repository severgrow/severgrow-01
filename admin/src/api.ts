// The dashboard's transport: the player's own bearer token against the admin API.
//
// Two rules this file exists to keep:
//   * the token is the PLAYER's normal token — there is no admin key, no service-role key and no
//     database credential anywhere in this build, and none is ever fetched;
//   * a token is read from this device's own storage (where the game already keeps it) or pasted by
//     the owner, and is never taken from the URL — a token in a query string ends up in history,
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

export type TokenSource = 'game' | 'pasted';

const readIdentityToken = (storage: Storage): string | null => {
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

/** Find a usable token, and say where it came from so the UI can be honest about it. */
export const findToken = (): { token: string; source: TokenSource } | null => {
  const local = safeStorage('local');
  const fromGame = local ? readIdentityToken(local) : null;
  if (fromGame) return { token: fromGame, source: 'game' };
  const session = safeStorage('session');
  try {
    const pasted = session?.getItem(ADMIN_TOKEN_KEY) ?? null;
    if (pasted && pasted.length >= 16) return { token: pasted, source: 'pasted' };
  } catch {
    /* ignored */
  }
  return null;
};

/** Keep a pasted token for this tab. It never touches the game's own stored identity. */
export const rememberPastedToken = (token: string): void => {
  try {
    safeStorage('session')?.setItem(ADMIN_TOKEN_KEY, token);
  } catch {
    /* a blocked session storage just means "paste again next time" */
  }
};

/** Forget BOTH the pasted copy and the game's stored identity on this device. */
export const forgetToken = (): void => {
  try {
    safeStorage('session')?.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    /* ignored */
  }
  const local = safeStorage('local');
  if (!local) return;
  for (const key of IDENTITY_KEYS) {
    try {
      local.removeItem(key);
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

export type Page<T> = { rows: T[]; total: number; nextCursor: string | null };

export class AdminApi {
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
      const response = await fetch(`${this.base}${path}${text ? `?${text}` : ''}`, { headers: this.headers() });
      return await this.parse<T>(response);
    } catch {
      return { ok: false, status: 0, code: 'OFFLINE', message: 'Could not reach the duel API.' };
    }
  }

  async post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
    try {
      const response = await fetch(`${this.base}${path}`, {
        method: 'POST',
        headers: this.headers({ 'content-type': 'application/json' }),
        body: JSON.stringify(body ?? {}),
      });
      return await this.parse<T>(response);
    } catch {
      return { ok: false, status: 0, code: 'OFFLINE', message: 'Could not reach the duel API.' };
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
      const response = await fetch(`${this.base}${path}${text ? `?${text}` : ''}`, { headers: this.headers({ accept: 'text/csv' }) });
      if (response.ok) return { ok: true, data: await response.text() };
      const parsed = await this.parse<never>(response);
      if (parsed.ok) return { ok: false, status: response.status, code: 'ERROR', message: 'The export could not be read.' };
      return { ok: false, status: parsed.status, code: parsed.code, message: parsed.message };
    } catch {
      return { ok: false, status: 0, code: 'OFFLINE', message: 'Could not reach the duel API.' };
    }
  }

  /** Session probe: the one call that decides "admin" from "not an admin". */
  session(): Promise<ApiResult<AdminSession & { ok: true }>> {
    return this.get<AdminSession & { ok: true }>('/v1/admin/session');
  }
}
