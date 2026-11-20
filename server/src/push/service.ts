// THE SERVER'S DECISION — who gets one notification, for which event, exactly once.
//
// Every recipient comes from authoritative state: the match's gated turn (the same projection the
// board uses) and the challenge rows the economy service already returns. A page only says "look
// now" (`/v1/push/nudge`); it can never name a recipient, a title or a body.
//
// This module is deliberately total: a sender that fails, a browser that dropped its subscription,
// or a missing table changes a counter, never a game. `nudge`/`dispatch` resolve; they do not throw
// for a push failure.
import { ApiError } from '../errors.js';
import { gatedStateFor } from '../turn-boundary.js';
import type { MatchListRow, PlayerRecord } from '../storage/types.js';
import {
  challengeAcceptedNotification,
  challengeNotification,
  dueReminderKind,
  payloadFor,
  reminderNotification,
  turnNotification,
} from '../../../src/notifications.js';
import type { PushNotification } from '../../../src/notifications.js';
import { b64uDecode } from './webpush.js';
import type { PushStore, PushSender, PushSubscriptionInput } from './types.js';
import type { PushConfig } from './config.js';

/** A challenge row as the economy service already sends it (`WorldChallengeWire` is compatible). */
export type ChallengeSource = Readonly<{
  id: string;
  cellId: string;
  status: string;
  challengerId: string;
  defenderId: string;
  challengerName: string | null;
  defenderName?: string | null;
  expiresAt: number;
  matchId?: string | null;
}>;

export type ChallengeLists = Readonly<{ incoming: readonly ChallengeSource[]; outgoing: readonly ChallengeSource[] }>;

export type PushSource = Readonly<{
  /** The caller's match rows (storage `listMatchesForPlayer`); the service projects the turn. */
  matchesOf(playerId: string): Promise<readonly MatchListRow[]>;
  /** The caller's private challenge lists (`WorldEconomyService.challenges`). */
  challengesOf(player: PlayerRecord): Promise<ChallengeLists>;
}>;

export type PushServiceDeps = Readonly<{
  config: PushConfig;
  store: PushStore;
  /** Null when the feature is dark or the VAPID pair did not decode; then nothing ever sends. */
  sender: PushSender | null;
  source: PushSource;
  now?: () => number;
  log?: (line: string) => void;
}>;

/** One nudge looks at this many events at most, so one request can never fan out without bound. */
export const MAX_EVENTS_PER_NUDGE = 20;

const ENDPOINT_MAX = 2048;

/**
 * A push endpoint is a capability URL on a PUBLIC https host. Rejecting IP literals, localhost and
 * single-label names keeps a subscription from turning the sender into a probe for an internal host.
 * The payload is still ciphertext for the browser's own keys, so a forged endpoint learns nothing.
 */
export const validPushEndpoint = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const endpoint = value.trim();
  if (endpoint.length === 0 || endpoint.length > ENDPOINT_MAX) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (!host.includes('.')) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return false;
  return true;
};

/** Public keys from a browser: 65-byte uncompressed P-256 and a 16-byte auth secret, or refused. */
const validKeys = (input: PushSubscriptionInput): boolean => {
  const p256dh = b64uDecode(input.p256dh);
  const auth = b64uDecode(input.auth);
  return !!p256dh && p256dh.length === 65 && p256dh[0] === 0x04 && !!auth && auth.length === 16;
};

export const createPushService = (deps: PushServiceDeps) => {
  const now = deps.now ?? (() => Date.now());
  const log = deps.log ?? (() => undefined);
  const available = (): boolean => deps.config.enabled && deps.sender !== null;

  /**
   * Deliver one event to every device of its ONE recipient. The claim is taken BEFORE the send, so
   * a crash, a timeout or a racing nudge can never produce a second notification. A device the push
   * service has dropped (404/410) is removed here.
   */
  const deliver = async (event: PushNotification, at: number): Promise<number> => {
    if (!deps.sender) return 0;
    const targets = await deps.store.forPlayer(event.playerId);
    if (targets.length === 0) return 0; // never claim an event nobody could receive
    if (!(await deps.store.claim(event.playerId, event.dedupeKey, event.kind, at))) return 0;
    const payload = payloadFor(event);
    let sent = 0;
    for (const target of targets) {
      const result = await deps.sender.send(target, payload).catch(() => ({ ok: false as const, gone: false as const }));
      if (result.ok) sent += 1;
      else if (result.gone) await deps.store.revoke(event.playerId, target.endpoint).catch(() => undefined);
    }
    return sent;
  };

  return {
    available,

    /** The public half for `/v1/health` (null when dark). */
    publicConfig(): { enabled: true; publicKey: string } | null {
      return available() && deps.config.publicKey ? { enabled: true, publicKey: deps.config.publicKey } : null;
    },

    /** Remember (or re-point) one browser endpoint for the authenticated player. */
    async subscribe(player: PlayerRecord, input: PushSubscriptionInput, at = now()): Promise<number> {
      if (!available()) throw new ApiError('NOT_FOUND', 'Notifications are not enabled.');
      const endpoint = typeof input.endpoint === 'string' ? input.endpoint.trim() : '';
      if (!validPushEndpoint(endpoint) || !validKeys(input)) {
        throw new ApiError('INVALID_REQUEST', 'That notification subscription is not valid.');
      }
      await deps.store.save({
        playerId: player.id,
        endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
        createdAt: at,
        lastSeenAt: at,
      });
      return deps.store.countForPlayer(player.id);
    },

    async unsubscribe(player: PlayerRecord, endpoint: unknown): Promise<boolean> {
      if (!available()) return false;
      if (typeof endpoint !== 'string' || endpoint.trim().length === 0) {
        throw new ApiError('INVALID_REQUEST', 'A subscription endpoint is required.');
      }
      return deps.store.remove(player.id, endpoint.trim());
    },

    async subscribedDevices(player: PlayerRecord): Promise<number> {
      return available() ? deps.store.countForPlayer(player.id) : 0;
    },

    /**
     * "Look now." The caller's own matches/challenges are read; the SERVER builds every event and
     * decides every recipient. Repeated nudges hit the dedupe ledger and send nothing new.
     */
    async nudge(player: PlayerRecord): Promise<{ sent: number }> {
      if (!available()) return { sent: 0 };
      const at = now();
      const events: PushNotification[] = [];
      try {
        for (const row of await deps.source.matchesOf(player.id)) {
          const match = row.match;
          if (match.status !== 'active') continue;
          if (match.turnDeadlineAt !== null && at > match.turnDeadlineAt) continue;
          const gated = gatedStateFor(match, row.mySeat);
          const event = turnNotification({
            matchId: match.id,
            status: match.status,
            turnPlayer: gated.turnPlayer,
            callerSeat: row.mySeat,
            turnStartRevision: match.turnStartRevision,
            opponentId: row.opponentId,
            callerName: player.displayName,
          });
          if (event) events.push(event);
        }
      } catch {
        // Reading matches is best-effort: a nudge is never worth an error on the player's path.
      }
      try {
        const lists = await deps.source.challengesOf(player);
        for (const challenge of [...lists.incoming, ...lists.outgoing]) {
          const fresh = challengeNotification(challenge, player.id, at);
          if (fresh) events.push(fresh);
          const accepted = challengeAcceptedNotification(challenge, player.id);
          if (accepted) events.push(accepted);
        }
      } catch {
        // Same rule for challenges (a Territory read is already lazy and may fail).
      }
      let sent = 0;
      for (const event of events.slice(0, MAX_EVENTS_PER_NUDGE)) {
        sent += await deliver(event, at).catch(() => 0);
      }
      if (sent > 0) log(`push nudge player=${player.id} events=${events.length} sent=${sent}`);
      return { sent };
    },

    /**
     * The reminder sweep: 12 h and 1 h before a challenge window closes. Bounded and deduped; a
     * closed or expired row is skipped by the pure rule. Meant for cron/hand-run, not player traffic.
     */
    async dispatch(): Promise<{ due: number; sent: number }> {
      if (!available()) return { due: 0, sent: 0 };
      const at = now();
      let rows;
      try {
        rows = await deps.store.pendingChallenges(at, deps.config.dispatchLimit);
      } catch {
        return { due: 0, sent: 0 };
      }
      let due = 0;
      let sent = 0;
      for (const row of rows) {
        const kind = dueReminderKind(row.expiresAt, at);
        if (!kind) continue;
        const event = reminderNotification({ ...row, status: 'pending' }, kind, at);
        if (!event) continue;
        due += 1;
        sent += await deliver(event, at).catch(() => 0);
      }
      if (sent > 0) log(`push dispatch due=${due} sent=${sent}`);
      return { due, sent };
    },
  };
};

export type PushService = ReturnType<typeof createPushService>;
