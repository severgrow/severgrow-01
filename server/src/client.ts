// A small isomorphic client for the duel API. It depends only on an injected `fetch` and an
// injected key/value store, so the same code runs in the browser (with localStorage), in a Node
// test, or in another service. It carries no game logic: it sends semantic actions and renders
// whatever the server returns.
import type { Player } from '../../src/engine/index.js';
import { CURRENT_RULES_VERSION } from '../../src/engine/index.js';
import type {
  CancelSearchResponse,
  CreateGuestResponse,
  CreateMatchResponse,
  FindOpponentResponse,
  GetViewResponse,
  JoinMatchResponse,
  LinkCodeResponse,
  LinkRedeemResponse,
  MatchListResponse,
  MatchSummaryResponse,
  MatchViewPayload,
  MeResponse,
  ReconnectResponse,
  ResignResponse,
  SubmitActionRequest,
  SubmitActionResponse,
  UpgradeResponse,
} from './protocol.js';

/** Protocol version the browser/build reports (P-5 handshake). */
export const DUEL_CLIENT_VERSION = '0.5.0';

/** The minimal transport shape this client needs (window.fetch, undici, or a test double). */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ status: number; ok?: boolean; json(): Promise<unknown> }>;

export type KeyValue = {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
};

/** The browser's localStorage, adapted to `KeyValue`, or null when unavailable. */
export const browserStorage = (): KeyValue | null => {
  const ls = (globalThis as {
    localStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
  }).localStorage;
  if (!ls) return null;
  try {
    const probe = '__severgrow_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
  } catch {
    return null;
  }
  return { get: (k) => ls.getItem(k), set: (k, v) => ls.setItem(k, v), remove: (k) => ls.removeItem(k) };
};

export class DuelError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'DuelError';
    this.code = code;
    this.status = status;
  }
}

/** What a client keeps between reloads to resume its match ("refresh" / reconnect). */
export type DuelSession = { token: string; matchId: string; seat: Player };

export type DuelClientOptions = {
  baseUrl: string;
  fetch?: FetchLike;
  storage?: KeyValue | null;
  sessionKey?: string;
  /** Override the handshake version (tests). Default: DUEL_CLIENT_VERSION. */
  clientVersion?: string;
  /** Override the rules version header (tests). Default: CURRENT_RULES_VERSION. */
  rulesVersion?: string;
};

export const DEFAULT_SESSION_KEY = 'severgrow.duel.session.v1';

export class DuelClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly storage: KeyValue | null;
  private readonly sessionKey: string;
  private readonly clientVersion: string;
  private readonly rulesVersion: string;

  constructor(options: DuelClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    const injected = options.fetch;
    this.fetchImpl =
      injected ??
      ((url, init) => {
        const native = (globalThis as { fetch?: FetchLike }).fetch;
        if (!native) throw new DuelError('NO_FETCH', 'No fetch implementation is available.', 0);
        return native(url, init);
      });
    this.storage = options.storage ?? browserStorage();
    this.sessionKey = options.sessionKey ?? DEFAULT_SESSION_KEY;
    this.clientVersion = options.clientVersion ?? DUEL_CLIENT_VERSION;
    this.rulesVersion = options.rulesVersion ?? CURRENT_RULES_VERSION;
  }

  // ---- identity ----

  createGuest(displayName?: string): Promise<CreateGuestResponse> {
    return this.request<CreateGuestResponse>('POST', '/v1/guests', {
      body: displayName === undefined ? {} : { displayName },
    });
  }

  getMe(token: string): Promise<MeResponse> {
    return this.request<MeResponse>('GET', '/v1/players/me', { token });
  }

  upgrade(token: string, displayName: string): Promise<UpgradeResponse> {
    return this.request<UpgradeResponse>('POST', '/v1/players/me/upgrade', { token, body: { displayName } });
  }

  createLinkCode(token: string): Promise<LinkCodeResponse> {
    return this.request<LinkCodeResponse>('POST', '/v1/players/me/link-code', { token, body: {} });
  }

  redeemLinkCode(code: string): Promise<LinkRedeemResponse> {
    return this.request<LinkRedeemResponse>('POST', '/v1/players/link', { body: { code } });
  }

  listMatches(token: string): Promise<MatchListResponse> {
    return this.request<MatchListResponse>('GET', '/v1/players/me/matches', { token });
  }

  // ---- match lifecycle ----

  createMatch(token: string): Promise<CreateMatchResponse> {
    return this.request<CreateMatchResponse>('POST', '/v1/matches', { token, body: {} });
  }

  joinMatch(token: string, inviteCode: string): Promise<JoinMatchResponse> {
    return this.request<JoinMatchResponse>('POST', '/v1/matches/join', { token, body: { inviteCode } });
  }

  /** Phase 7 Find Opponent (server pairs or creates an open-queue waiting match). */
  findOpponent(token: string): Promise<FindOpponentResponse> {
    return this.request<FindOpponentResponse>('POST', '/v1/matchmaking/find', { token, body: {} });
  }

  /** Stop a parked Find Opponent search (retires the waiting open-queue match). */
  cancelSearch(token: string): Promise<CancelSearchResponse> {
    return this.request<CancelSearchResponse>('POST', '/v1/matchmaking/cancel', { token, body: {} });
  }

  getMatch(token: string, matchId: string): Promise<MatchSummaryResponse> {
    return this.request<MatchSummaryResponse>('GET', `/v1/matches/${encodeURIComponent(matchId)}`, { token });
  }

  /** The current player view (optionally only events newer than `sinceRevision`). */
  getState(token: string, matchId: string, sinceRevision?: number): Promise<GetViewResponse> {
    const query = sinceRevision === undefined ? '' : `?since=${sinceRevision}`;
    return this.request<GetViewResponse>('GET', `/v1/matches/${encodeURIComponent(matchId)}/view${query}`, { token });
  }

  /** Reconnect after a reload: same view, plus everything since the last revision seen. */
  reconnect(token: string, matchId: string, sinceRevision?: number): Promise<ReconnectResponse> {
    return this.request<ReconnectResponse>('POST', `/v1/matches/${encodeURIComponent(matchId)}/reconnect`, {
      token,
      body: sinceRevision === undefined ? {} : { sinceRevision },
    });
  }

  submitAction(token: string, matchId: string, request: SubmitActionRequest): Promise<SubmitActionResponse> {
    return this.request<SubmitActionResponse>('POST', `/v1/matches/${encodeURIComponent(matchId)}/actions`, {
      token,
      body: request,
    });
  }

  resign(token: string, matchId: string): Promise<ResignResponse> {
    return this.request<ResignResponse>('POST', `/v1/matches/${encodeURIComponent(matchId)}/resign`, {
      token,
      body: {},
    });
  }

  // ---- local session (so a page refresh can resume) ----

  saveSession(session: DuelSession): void {
    this.storage?.set(this.sessionKey, JSON.stringify(session));
  }

  loadSession(): DuelSession | null {
    const raw = this.storage?.get(this.sessionKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<DuelSession>;
      if (typeof parsed.token !== 'string' || typeof parsed.matchId !== 'string') return null;
      const seat: Player = parsed.seat === 1 ? 1 : 0;
      return { token: parsed.token, matchId: parsed.matchId, seat };
    } catch {
      return null;
    }
  }

  clearSession(): void {
    this.storage?.remove(this.sessionKey);
  }

  /** Resume a stored match: reconnect and return the fresh view, or null when there is none. */
  async resume(): Promise<{ session: DuelSession; player: MatchViewPayload } | null> {
    const session = this.loadSession();
    if (!session) return null;
    const { player } = await this.reconnect(session.token, session.matchId);
    this.saveSession({ token: session.token, matchId: player.matchId, seat: player.seat });
    return { session: { token: session.token, matchId: player.matchId, seat: player.seat }, player };
  }

  // ---- transport ----

  private async request<T>(method: string, path: string, options: { token?: string; body?: unknown } = {}): Promise<T> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'x-futasaku-client-version': this.clientVersion,
      'x-futasaku-rules-version': this.rulesVersion,
    };
    if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`;
    const init: { method: string; headers: Record<string, string>; body?: string } = { method, headers };
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    const ok = response.ok ?? (response.status >= 200 && response.status < 300);
    if (!ok || isFailure(data)) {
      const code = isFailure(data) ? data.code : 'HTTP_ERROR';
      const message = isFailure(data) ? data.message : `Request failed with status ${response.status}.`;
      throw new DuelError(code, message, response.status);
    }
    return data as T;
  }
}

const isFailure = (value: unknown): value is { ok: false; code: string; message: string } =>
  typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === false;
