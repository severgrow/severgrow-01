// One player token for Play Online (separate from per-match DuelClient sessions). P-3 link codes.
import { DuelClient, DuelError, browserStorage } from '../../../server/src/client.js';
import type { KeyValue } from '../../../server/src/client.js';
import type { OnlineIdentityRecord } from './types.js';

export const IDENTITY_STORAGE_KEY = 'severgrow.duel.identity.v1';

const STORAGE_BLOCKED_MESSAGE =
  'This browser blocked storage. Online matches cannot be kept on this device.';
const CREATE_FAILED_MESSAGE =
  'Could not create a FUTASAKU guest. Check your connection and try again.';

export type IdentityStatus =
  | {
      ok: true;
      identity: OnlineIdentityRecord;
      /** True only when a rejected/malformed identity was discarded and replaced with a fresh guest. */
      replaced?: true;
    }
  | { ok: false; reason: 'storage_blocked' | 'storage_cleared' | 'create_failed'; message: string };

export type IdentityStore = {
  /** Load or silently create a guest. */
  ensure(): Promise<IdentityStatus>;
  /** Current stored identity, or null. */
  peek(): OnlineIdentityRecord | null;
  /** Replace the stored token after a link-code redeem (never moves an existing token). */
  adopt(identity: OnlineIdentityRecord): IdentityStatus;
  /**
   * Discard a rejected identity and mint a fresh guest on this device. Called when the server
   * answers 401 UNAUTHORIZED for the stored token. Removes the dead record FIRST, so a failed
   * create can never leave `ensure()` returning the unusable token again. Concurrent callers share
   * one guest — a burst of 401s can never create a pile of guests.
   */
  recover(): Promise<IdentityStatus>;
  /** Issue a one-time link code for another browser. */
  createLinkCode(): Promise<{ code: string; expiresAt: number }>;
  /** Redeem a link code → new token for the same player on this device. */
  redeemLinkCode(code: string): Promise<IdentityStatus>;
  /** Honest storage note for Settings. */
  storageAvailable(): boolean;
};

const parseIdentity = (raw: string | null): OnlineIdentityRecord | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OnlineIdentityRecord>;
    if (typeof parsed.token !== 'string' || typeof parsed.playerId !== 'string') return null;
    if (parsed.kind !== 'guest' && parsed.kind !== 'account') return null;
    return {
      token: parsed.token,
      playerId: parsed.playerId,
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : null,
      kind: parsed.kind,
    };
  } catch {
    return null;
  }
};

/**
 * The name stored on THIS device for exactly `playerId`, or null.
 *
 * Territory's always-on identity line (owner, 2026-10-30) needs the player's own name without a new
 * request: the identity record already carries it (a guest's generated nature name, or the account's
 * chosen one), and a record belonging to another player is never borrowed. The channel's storage
 * prefix is applied below us (`channel.ts` patches `Storage.prototype`), so the plain key is right.
 */
export const storedDisplayName = (playerId: string): string | null => {
  try {
    const raw = globalThis.localStorage?.getItem(IDENTITY_STORAGE_KEY) ?? null;
    const parsed = raw ? JSON.parse(raw) as { playerId?: unknown; displayName?: unknown } : null;
    if (!parsed || parsed.playerId !== playerId || typeof parsed.displayName !== 'string') return null;
    const name = parsed.displayName.trim();
    return name ? name : null;
  } catch {
    return null;
  }
};

export const createIdentityStore = (options: {
  client: DuelClient;
  storage?: KeyValue | null;
  /** Notified once each time a rejected identity is replaced with a fresh guest. */
  onReplaced?: (identity: OnlineIdentityRecord) => void;
}): IdentityStore => {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const client = options.client;

  const write = (identity: OnlineIdentityRecord): IdentityStatus => {
    if (!storage) {
      return {
        ok: false,
        reason: 'storage_blocked',
        message: STORAGE_BLOCKED_MESSAGE,
      };
    }
    try {
      storage.set(IDENTITY_STORAGE_KEY, JSON.stringify(identity));
    } catch {
      return {
        ok: false,
        reason: 'storage_blocked',
        message: STORAGE_BLOCKED_MESSAGE,
      };
    }
    return { ok: true, identity };
  };

  const peek = (): OnlineIdentityRecord | null => {
    if (!storage) return null;
    try {
      return parseIdentity(storage.get(IDENTITY_STORAGE_KEY));
    } catch {
      return null;
    }
  };

  const createGuest = async (): Promise<IdentityStatus> => {
    try {
      const created = await client.createGuest();
      return write({
        token: created.token,
        playerId: created.player.id,
        displayName: created.player.displayName,
        kind: created.player.kind,
      });
    } catch (error) {
      const message = error instanceof DuelError ? error.message : CREATE_FAILED_MESSAGE;
      return { ok: false, reason: 'create_failed', message };
    }
  };

  const doRecover = async (): Promise<IdentityStatus> => {
    if (!storage) {
      return { ok: false, reason: 'storage_blocked', message: STORAGE_BLOCKED_MESSAGE };
    }
    // Drop the rejected record first: if minting a guest then fails, `ensure()` starts over
    // (creating a guest) instead of handing back the token the server just refused.
    try {
      storage.remove(IDENTITY_STORAGE_KEY);
    } catch {
      return { ok: false, reason: 'storage_blocked', message: STORAGE_BLOCKED_MESSAGE };
    }
    const status = await createGuest();
    if (status.ok) {
      options.onReplaced?.(status.identity);
      return { ...status, replaced: true };
    }
    return status;
  };

  let recovering: Promise<IdentityStatus> | null = null;

  const recover = (): Promise<IdentityStatus> => {
    if (recovering) return recovering;
    const inFlight = doRecover();
    recovering = inFlight;
    void inFlight.finally(() => {
      if (recovering === inFlight) recovering = null;
    });
    return inFlight;
  };

  return {
    storageAvailable: () => storage !== null,

    peek,

    adopt: (identity) => write(identity),

    async ensure() {
      const existing = peek();
      if (existing) return { ok: true, identity: existing };
      if (!storage) {
        return {
          ok: false,
          reason: 'storage_blocked',
          message: STORAGE_BLOCKED_MESSAGE,
        };
      }
      return createGuest();
    },

    recover,

    async createLinkCode() {
      const identity = peek();
      if (!identity) throw new DuelError('NO_IDENTITY', 'No online identity on this device.', 0);
      const res = await client.createLinkCode(identity.token);
      return { code: res.code, expiresAt: res.expiresAt };
    },

    async redeemLinkCode(code: string) {
      const redeemed = await client.redeemLinkCode(code.trim().toUpperCase());
      return write({
        token: redeemed.token,
        playerId: redeemed.player.id,
        displayName: redeemed.player.displayName,
        kind: redeemed.player.kind,
      });
    },
  };
};
