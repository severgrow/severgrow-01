// WEB PUSH — the shapes shared by the subscription store, the sender and the routes.
//
// One subscription is one DEVICE's browser endpoint. It is always owned by exactly one player id,
// and the store enforces that with `unique (endpoint)`: a phone used by two accounts can only be
// subscribed to the account that enabled notifications on it last. That is the identity-scoping
// rule in one line — the sender reads `forPlayer(caller)`, never a recipient named by a page.
import type { PushKind } from '../../../src/notifications.js';

export type { PushKind };

export type PushSubscriptionInput = Readonly<{
  endpoint: string;
  /** The browser's public key for this subscription (base64url, uncompressed P-256). */
  p256dh: string;
  /** The browser's 16-byte auth secret (base64url). */
  auth: string;
  userAgent?: string | null;
}>;

export type PushSubscriptionRecord = PushSubscriptionInput &
  Readonly<{ playerId: string; createdAt: number; lastSeenAt: number }>;

/** What the sender needs from a subscription (no player id, no timestamps). */
export type PushTarget = Readonly<{ endpoint: string; p256dh: string; auth: string }>;

export type PushPayload = Readonly<{
  title: string;
  body: string;
  url: string;
  tag: string;
  kind: PushKind;
}>;

export type PushSendResult = Readonly<{
  ok: boolean;
  /** 404/410: the browser dropped the subscription, so the row can be removed. */
  gone?: boolean;
}>;

export type PushSender = Readonly<{
  send(target: PushTarget, payload: PushPayload): Promise<PushSendResult>;
}>;

/** One pending Territory challenge, from the authoritative table (reminder sweep only). */
export type PendingChallenge = Readonly<{
  id: string;
  cellId: string;
  challengerId: string;
  defenderId: string;
  challengerName: string | null;
  expiresAt: number;
}>;

export interface PushStore {
  /** Save (or re-point) this browser endpoint to `playerId`. One endpoint, one owner. */
  save(record: PushSubscriptionRecord): Promise<void>;
  /** Remove the endpoint only when the caller owns it; true when a row went away. */
  remove(playerId: string, endpoint: string): Promise<boolean>;
  /** Every device subscribed for this player. */
  forPlayer(playerId: string): Promise<readonly PushSubscriptionRecord[]>;
  countForPlayer(playerId: string): Promise<number>;
  /**
   * Claim the one send for `dedupeKey`. True only for the first claim; the unique index is the
   * real guard across Edge isolates, so two racing requests can never both send.
   */
  claim(playerId: string, dedupeKey: string, kind: PushKind, now: number): Promise<boolean>;
  /** Where the browser said the subscription is gone: drop it, so no future send retries it. */
  revoke(playerId: string, endpoint: string): Promise<void>;
  /** Bounded, oldest-deadline-first pending challenges (the reminder sweep). */
  pendingChallenges(now: number, limit: number): Promise<readonly PendingChallenge[]>;
}
