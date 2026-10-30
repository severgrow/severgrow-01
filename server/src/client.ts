import type { TerritoryChatPage } from './chat/territory.js';
import type { ChatContent, ChatResult } from './chat/types.js';
// A small isomorphic client for the duel API. It depends only on an injected `fetch` and an
// injected key/value store, so the same code runs in the browser (with localStorage), in a Node
// test, or in another service. It carries no game logic: it sends semantic actions and renders
// whatever the server returns.
import type { Player } from '../../src/engine/index.js';
import { CURRENT_RULES_VERSION } from '../../src/engine/index.js';
import type {
  CancelMatchResponse,
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
  ReplayResponse,
  ResignResponse,
  SubmitActionRequest,
  SubmitActionResponse,
  UpgradeResponse,
  WorldMapPayload,
} from './protocol.js';
import type {
  ClaimResult,
  SellResult,
  RewardResult,
  SeedWallet,
  WorldChallengeWire,
  WorldChallengesPayload,
} from './seeds/types.js';
import type { AchievementView } from './seeds/achievements.js';
import type { Action, Event } from '../../src/engine/index.js';

/** Protocol version the browser/build reports (P-5 handshake). */
export const DUEL_CLIENT_VERSION = '0.5.0';

/**
 * A player's tile colour on the wire (`GET`/`POST /v1/world/colour`). `canChange` and
 * `remainingMs` are the SERVER's answer to the one-change-per-24 h rule (owner, 2026-10-30), so the
 * picker can say how long is left before a press and can never unlock itself on a wrong clock.
 */
export type WorldColour = {
  colourId: number;
  colour: string;
  name: string;
  chosen: boolean;
  canChange: boolean;
  /** Epoch ms of the next allowed change, or null when a change is available now. */
  changeAvailableAt: number | null;
  /** Milliseconds left on the 24 h window (0 when a change is available now). */
  remainingMs: number;
};

/** The minimal transport shape this client needs (window.fetch, undici, or a test double). */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
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
export type DuelSession = { token: string; matchId: string; seat: Player; revision?: number };

/** Where an authenticated request was rejected, so a recovery hook can decide what to do. */
export type UnauthorizedInfo = { method: string; path: string; hasBody: boolean };

/**
 * Called ONCE when an authenticated request is rejected with 401 UNAUTHORIZED. Return a
 * replacement token to retry the exact same request once (the body is resent byte-for-byte, so a
 * mutation keeps its `requestId` and idempotency holds); return null/undefined to surface the
 * error unchanged. Never called for a request that carried no token, and never for a non-401.
 */
export type UnauthorizedHandler = (info: UnauthorizedInfo) => Promise<string | null> | string | null;

export type DuelClientOptions = {
  baseUrl: string;
  fetch?: FetchLike;
  storage?: KeyValue | null;
  sessionKey?: string;
  /** Override the handshake version (tests). Default: DUEL_CLIENT_VERSION. */
  clientVersion?: string;
  /** Override the rules version header (tests). Default: CURRENT_RULES_VERSION. */
  rulesVersion?: string;
  /**
   * Pin Edge Function execution to one AWS region with the `forceFunctionRegion` query parameter
   * (e.g. `eu-west-1`, the region of the FUTASAKU database). Empty/omitted = let the platform pick
   * the region closest to the caller. Only meaningful for a Supabase Edge Function URL.
   */
  region?: string;
  /** Self-heal hook for a rejected token. See `UnauthorizedHandler`. */
  onUnauthorized?: UnauthorizedHandler;
  /**
   * Tag guests this client creates as automated test traffic (`x-futasaku-traffic: test`), so they
   * are marked `is_test` at creation and never land on the owner's human views.
   *
   * Default: TRUE when there is no browser (`typeof window === 'undefined'`). A real player is always
   * in a browser; a harness, an e2e suite and a soak script are Node processes. It is still an
   * explicit option, so a browser-driven suite can opt in and any other caller can opt out.
   */
  testTraffic?: boolean;
};

export const DEFAULT_SESSION_KEY = 'severgrow.duel.session.v1';

/**
 * The opponent's last turn, from a public event history: everything from their last Draw, when no
 * event of mine follows it (otherwise their turn is not the last thing that happened: nothing).
 */
export const lastOpponentTurn = (events: readonly Event[], seat: Player): Event[] => {
  const opp = seat === 0 ? 1 : 0;
  let start = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.t === 'Draw' && e.player === seat) return [];
    if (e.t === 'Draw' && e.player === opp) { start = i; break; }
  }
  return start < 0 ? [] : events.slice(start);
};

/** Per-match last-seen revisions (see `seenRevision`). */
const SEEN_KEY = 'severgrow.duel.seen.v1';
const SEEN_LIMIT = 40;

export class DuelClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly storage: KeyValue | null;
  private readonly sessionKey: string;
  private readonly clientVersion: string;
  private readonly rulesVersion: string;
  /**
   * The pinned Edge region, appended as `forceFunctionRegion`. See `DuelClientOptions.region`.
   */
  private readonly region: string | null;
  /** Whether this client tags the guests it creates as test traffic (see `DuelClientOptions`). */
  private readonly testTraffic: boolean;
  /**
   * Recovery hook for a rejected token. A public field (not just readonly options) so the owner of
   * this client can wire it after the identity store that the hook itself needs has been built.
   */
  onUnauthorized: UnauthorizedHandler | undefined;

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
    this.region = options.region && options.region.trim() ? options.region.trim() : null;
    this.testTraffic = options.testTraffic ?? (globalThis as { window?: unknown }).window === undefined;
    this.onUnauthorized = options.onUnauthorized;
  }

  // ---- identity ----

  createGuest(displayName?: string): Promise<CreateGuestResponse> {
    return this.request<CreateGuestResponse>('POST', '/v1/guests', {
      body: displayName === undefined ? {} : { displayName },
      // Only ever sent for guest CREATION, and only by a harness (see `DuelClientOptions`). The
      // server stores it as `players.is_test` — the marker the dashboard trusts.
      traffic: this.testTraffic,
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

  /** A mutual rematch of a finished standard duel (POST /v1/matches/:id/rematch, migration 0015). */
  rematch(token: string, finishedMatchId: string): Promise<JoinMatchResponse> {
    return this.request<JoinMatchResponse>('POST', `/v1/matches/${encodeURIComponent(finishedMatchId)}/rematch`, { token, body: {} });
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

  /** Cancel (retire) a WAITING match you own — the invite screen's "Cancel match". */
  cancelMatch(token: string, matchId: string): Promise<CancelMatchResponse> {
    return this.request<CancelMatchResponse>('POST', `/v1/matches/${encodeURIComponent(matchId)}/cancel`, {
      token,
      body: {},
    });
  }

  getMatch(token: string, matchId: string): Promise<MatchSummaryResponse> {
    return this.request<MatchSummaryResponse>('GET', `/v1/matches/${encodeURIComponent(matchId)}`, { token });
  }

  /** The current player view (optionally only events newer than `sinceRevision`). */
  getState(token: string, matchId: string, sinceRevision?: number): Promise<GetViewResponse> {
    const query = sinceRevision === undefined ? '' : `?since=${sinceRevision}`;
    return this.request<GetViewResponse>('GET', `/v1/matches/${encodeURIComponent(matchId)}/view${query}`, { token });
  }

  /**
   * A FINISHED duel's replay payload: the rules snapshot, the seed, the starting seat and the
   * ordered action log. The client rebuilds every position with the deterministic engine.
   */
  replay(token: string, matchId: string): Promise<ReplayResponse> {
    return this.request<ReplayResponse>('GET', `/v1/matches/${encodeURIComponent(matchId)}/replay`, { token });
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
    if (typeof session.revision === 'number') this.markSeen(session.matchId, session.revision);
  }

  // ---- how far THIS device has seen each match ----
  //
  // OWNER REPORT (2026-10-27): reopening an online match from the list "showed more moves than the
  // last one" and flickered. The list fetched the WHOLE history and the driver replays every event a
  // payload carries, so the entire game replayed over the finished board. The single session above
  // remembers only the last match opened; this remembers each match, so a reopen asks for the gap.

  private seenMap(): Record<string, number> {
    try {
      const data = JSON.parse(this.storage?.get(SEEN_KEY) ?? '{}') as unknown;
      return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, number>) : {};
    } catch {
      return {};
    }
  }

  private markSeen(matchId: string, revision: number): void {
    if (!this.storage || !Number.isInteger(revision) || revision < 0) return;
    const map = this.seenMap();
    if ((map[matchId] ?? -1) >= revision) return; // never backwards: a late, older view
    delete map[matchId];
    map[matchId] = revision; // most recent last
    const ids = Object.keys(map);
    for (const id of ids.slice(0, Math.max(0, ids.length - SEEN_LIMIT))) delete map[id];
    try {
      this.storage.set(SEEN_KEY, JSON.stringify(map));
    } catch {
      /* storage full or blocked: a reopen simply shows no catch-up */
    }
  }

  /** The last revision of this match this device has seen, or undefined. */
  seenRevision(matchId: string): number | undefined {
    const value = this.seenMap()[matchId];
    return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
  }

  /**
   * Open a match from a list: only the events this device has NOT seen come back (the turns played
   * while away), so the page replays exactly those. When this device has never seen the match, only
   * the opponent's LAST turn is kept (when it was the last thing that happened) — never the whole
   * game, which replayed every turn over the current board.
   */
  async openView(token: string, matchId: string): Promise<GetViewResponse> {
    const seen = this.seenRevision(matchId);
    const res = await this.getState(token, matchId, seen);
    return seen === undefined ? { ...res, player: { ...res.player, events: lastOpponentTurn(res.player.events, res.player.seat) } } : res;
  }

  loadSession(): DuelSession | null {
    const raw = this.storage?.get(this.sessionKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<DuelSession>;
      if (typeof parsed.token !== 'string' || typeof parsed.matchId !== 'string') return null;
      const seat: Player = parsed.seat === 1 ? 1 : 0;
      return typeof parsed.revision === 'number'
        ? { token: parsed.token, matchId: parsed.matchId, seat, revision: parsed.revision }
        : { token: parsed.token, matchId: parsed.matchId, seat };
    } catch {
      return null;
    }
  }

  clearSession(): void {
    this.storage?.remove(this.sessionKey);
  }

  /**
   * Resume a stored match: reconnect and return the fresh view, or null when there is none.
   * When the last-seen revision is known, only the gap events come back, so the caller can replay
   * exactly the turns missed while away. With no stored revision (an older save) the view is
   * fetched whole but its history is withheld — we cannot tell the gap from the whole match, and
   * replaying every turn ever played would be worse than no animation.
   */
  async resume(): Promise<{ session: DuelSession; player: MatchViewPayload } | null> {
    const session = this.loadSession();
    if (!session) return null;
    const knownRevision = typeof session.revision === 'number';
    const { player } = await this.reconnect(session.token, session.matchId, session.revision);
    const view = knownRevision ? player : { ...player, events: [] };
    this.saveSession({ token: session.token, matchId: view.matchId, seat: view.seat, revision: view.revision });
    return { session: { token: session.token, matchId: view.matchId, seat: view.seat, revision: view.revision }, player: view };
  }

  // ---- the shared world map ----

  /**
   * The public shared map: the same fixed grid for everyone, with each tile's holder. It needs no
   * account — looking at the map is the point of a shared map — so it takes no token.
   */
  async worldMap(): Promise<WorldMapPayload> {
    return await this.request<WorldMapPayload>('GET', '/v1/world');
  }

  async seedWallet(token: string): Promise<SeedWallet> {
    const response = await this.request<{ wallet: SeedWallet }>('GET', '/v1/seeds/wallet', { token });
    return response.wallet;
  }

  /**
   * THE PLAYER'S TILE COLOUR (owner, 2026-10-30): the stored choice, or the palette default derived
   * from the player id. `chosen` is false when nothing has ever been saved — the picker still marks
   * the current swatch, because the map is already drawing that colour.
   */
  async worldColour(token: string): Promise<WorldColour> {
    const response = await this.request<{ colour: WorldColour }>('GET', '/v1/world/colour', { token });
    return response.colour;
  }

  /** Save a palette choice so it follows the player to another device. */
  async chooseWorldColour(token: string, colourId: number): Promise<WorldColour> {
    const response = await this.request<{ colour: WorldColour }>(
      'POST', '/v1/world/colour', { token, body: { colourId } });
    return response.colour;
  }

  /**
   * The account's place: the furthest Campaign level its verified first-clear receipts show. It
   * rides the same authenticated wallet read, so no new route and no extra round trip is invented;
   * `null` means the player has never cleared a level (or an older server did not send the field).
   */
  async accountCampaignLevel(token: string): Promise<number | null> {
    const response = await this.request<{ campaignHighestLevel?: unknown }>('GET', '/v1/seeds/wallet', { token });
    const level = response.campaignHighestLevel;
    return typeof level === 'number' && Number.isFinite(level) && level >= 1 ? level : null;
  }

  async claimWorld(token: string, cellId: string, requestId: string): Promise<ClaimResult> {
    const response = await this.request<{ claim: ClaimResult }>('POST', '/v1/world/claims', { token, body: { cellId, requestId } });
    return response.claim;
  }

  /** Sell one of your own tiles back for its price. A refusal throws a DuelError with its code. */
  async sellWorld(token: string, cellId: string, requestId: string): Promise<SellResult> {
    const response = await this.request<{ sale: SellResult }>('POST', '/v1/world/sales', { token, body: { cellId, requestId } });
    return response.sale;
  }

  /** Territory achievements: progress and which are paid (server/src/seeds/achievements.ts). */
  async achievements(token: string): Promise<AchievementView[]> {
    const response = await this.request<{ achievements: AchievementView[] }>('GET', '/v1/seeds/achievements', { token });
    return response.achievements;
  }

  /** Claim one achievement's Seeds. Idempotent: a second claim replays the first payment. */
  async claimAchievement(token: string, id: string): Promise<{ id: string; awarded: number; replayed: boolean; wallet: SeedWallet }> {
    const response = await this.request<{ claim: { id: string; awarded: number; replayed: boolean; wallet: SeedWallet } }>(
      'POST', '/v1/seeds/achievements/claim', { token, body: { id } });
    return response.claim;
  }

  async acknowledgeWorldInvitation(token: string): Promise<void> {
    await this.request('POST', '/v1/world/invitation', { token, body: {} });
  }

  // ---- Territory challenges (docs/TERRITORY-CHALLENGES.md) ----

  async worldChallenges(token: string): Promise<WorldChallengesPayload> {
    const response = await this.request<WorldChallengesPayload & { ok: true }>('GET', '/v1/world/challenges', { token });
    return { incoming: response.incoming, outgoing: response.outgoing, serverNow: response.serverNow };
  }

  async sendWorldChallenge(token: string, cellId: string, requestId: string): Promise<{ challenge: WorldChallengeWire; replayed: boolean }> {
    return await this.request('POST', '/v1/world/challenges', { token, body: { cellId, requestId } });
  }

  async respondWorldChallenge(
    token: string,
    challengeId: string,
    accept: boolean,
    requestId?: string,
  ): Promise<{ challenge: WorldChallengeWire; matchId: string | null }> {
    return await this.request('POST', `/v1/world/challenges/${encodeURIComponent(challengeId)}/respond`, {
      token,
      body: { accept, ...(requestId === undefined ? {} : { requestId }) },
    });
  }

  async confirmWorldChallenge(token: string, challengeId: string, requestId?: string): Promise<{
    settled: boolean;
    winnerId: string | null;
    cellId: string;
    replayed: boolean;
    challenge: WorldChallengeWire;
  }> {
    return await this.request('POST', `/v1/world/challenges/${encodeURIComponent(challengeId)}/confirm`, {
      token,
      body: requestId === undefined ? {} : { requestId },
    });
  }

  async issueTrainingTicket(token: string, botLevel: number): Promise<{ id: string; seed: number; botLevel: number; expiresAt: number }> {
    const response = await this.request<{ ticket: { id: string; seed: number; botLevel: number; expiresAt: number } }>(
      'POST', '/v1/seeds/training/tickets', { token, body: { botLevel } });
    return response.ticket;
  }

  /**
   * Submit one finished game's replay for payment. `options.signal` is what lets the CALLER put a
   * deadline on it: a fetch that never settles is the mechanism behind the 2026-10-25 "Seeds
   * pending verification" report (a backgrounded mobile tab, or a captured connection, leaves the
   * promise pending forever). Only the seed proof takes a signal — every other request keeps the
   * transport's own behaviour, so a slow match read is never cut short.
   */
  async submitSeedProof(
    token: string,
    source: { levelId: string } | { ticketId: string },
    actions: readonly Action[],
    botVersion: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<RewardResult> {
    const campaign = 'levelId' in source;
    const response = await this.request<{ reward: RewardResult }>(
      'POST', campaign ? '/v1/seeds/campaign' : '/v1/seeds/training',
      { token, body: { ...source, actions, botVersion }, ...(options.signal ? { signal: options.signal } : {}) },
    );
    return response.reward;
  }

  // ---- transport ----

  chatHistory(token: string, matchId: string, cursor: { after?: number; before?: number } = {}, signal?: AbortSignal): Promise<ChatResult> {
    const query = cursor.after !== undefined ? `?after=${cursor.after}` : cursor.before !== undefined ? `?before=${cursor.before}` : '';
    return this.request('GET', `/v1/matches/${encodeURIComponent(matchId)}/chat${query}`, { token, ...(signal ? { signal } : {}) });
  }

  chatSend(token: string, matchId: string, content: ChatContent, requestId: string, turnRevision: number, signal?: AbortSignal): Promise<ChatResult> {
    return this.request('POST', `/v1/matches/${encodeURIComponent(matchId)}/chat`, { token, body: { ...content, requestId, turnRevision }, ...(signal ? { signal } : {}) });
  }

  chatAction(token: string, matchId: string, action: 'mute' | 'block' | 'report', body: { value: boolean } | { messageId: string; reason: 'abuse' | 'spam' | 'other' }, signal?: AbortSignal): Promise<ChatResult> {
    return this.request('POST', `/v1/matches/${encodeURIComponent(matchId)}/chat/${action}`, { token, body, ...(signal ? { signal } : {}) });
  }

  // ---- Territory chat (server/src/chat/territory.ts): one shared channel, newest 30 ----
  territoryChat(token: string, signal?: AbortSignal): Promise<TerritoryChatPage> {
    return this.request('GET', '/v1/territory/chat', { token, ...(signal ? { signal } : {}) });
  }

  territoryChatSend(token: string, text: string, requestId: string): Promise<TerritoryChatPage> {
    return this.request('POST', '/v1/territory/chat', { token, body: { text, requestId } });
  }

  territoryChatBlock(token: string, messageId: string): Promise<TerritoryChatPage> {
    return this.request('POST', '/v1/territory/chat/block', { token, body: { messageId } });
  }

  territoryChatReport(token: string, messageId: string, reason: 'abuse' | 'spam' | 'other'): Promise<{ reported: true }> {
    return this.request('POST', '/v1/territory/chat/report', { token, body: { messageId, reason } });
  }

  private request<T>(
    method: string,
    path: string,
    options: { token?: string; body?: unknown; traffic?: boolean; signal?: AbortSignal } = {},
  ): Promise<T> {
    return this.send<T>(method, path, options, true);
  }

  /**
   * One transport attempt, with a single recovery retry when an authenticated request is rejected
   * with 401 UNAUTHORIZED and a handler is installed. The retry resends the identical bytes (same
   * body object re-serialised), so a mutation keeps its `requestId`; `mayRecover` is false on the
   * retry, so this can never loop.
   */
  /**
   * The full request URL: base + path, plus the region pin when configured. The region goes as a
   * QUERY parameter (not a header) so it needs no CORS change: `x-region` would fail the preflight
   * because the deployed API only allows its own known headers.
   */
  private urlFor(path: string): string {
    const base = `${this.baseUrl}${path}`;
    if (!this.region) return base;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}forceFunctionRegion=${encodeURIComponent(this.region)}`;
  }

  private async send<T>(
    method: string,
    path: string,
    options: { token?: string; body?: unknown; traffic?: boolean; signal?: AbortSignal },
    mayRecover: boolean,
  ): Promise<T> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'x-futasaku-client-version': this.clientVersion,
      'x-futasaku-rules-version': this.rulesVersion,
    };
    if (options.traffic === true) headers['x-futasaku-traffic'] = 'test';
    if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`;
    const init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal } = { method, headers };
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    if (options.signal !== undefined) init.signal = options.signal;
    const response = await this.fetchImpl(this.urlFor(path), init);
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
      const error = new DuelError(code, message, response.status);
      const rejectedToken = error.status === 401 || error.code === 'UNAUTHORIZED';
      if (mayRecover && rejectedToken && options.token !== undefined && this.onUnauthorized) {
        const replacement = await this.onUnauthorized({
          method,
          path,
          hasBody: options.body !== undefined,
        });
        if (typeof replacement === 'string' && replacement.length > 0) {
          return this.send<T>(method, path, { ...options, token: replacement }, false);
        }
      }
      throw error;
    }
    return data as T;
  }
}

const isFailure = (value: unknown): value is { ok: false; code: string; message: string } =>
  typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === false;
