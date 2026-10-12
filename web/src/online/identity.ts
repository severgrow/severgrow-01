// One player token for Play Online (separate from per-match DuelClient sessions). P-3 link codes.
import { DuelClient, DuelError, browserStorage } from '../../../server/src/client.js';
import type { KeyValue } from '../../../server/src/client.js';
import type { OnlineIdentityRecord } from './types.js';

export const IDENTITY_STORAGE_KEY = 'severgrow.duel.identity.v1';

export type IdentityStatus =
  | { ok: true; identity: OnlineIdentityRecord }
  | { ok: false; reason: 'storage_blocked' | 'storage_cleared' | 'create_failed'; message: string };

export type IdentityStore = {
  /** Load or silently create a guest. */
  ensure(): Promise<IdentityStatus>;
  /** Current stored identity, or null. */
  peek(): OnlineIdentityRecord | null;
  /** Replace the stored token after a link-code redeem (never moves an existing token). */
  adopt(identity: OnlineIdentityRecord): IdentityStatus;
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

export const createIdentityStore = (options: {
  client: DuelClient;
  storage?: KeyValue | null;
}): IdentityStore => {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const client = options.client;

  const write = (identity: OnlineIdentityRecord): IdentityStatus => {
    if (!storage) {
      return {
        ok: false,
        reason: 'storage_blocked',
        message: 'This browser blocked storage. Online matches cannot be kept on this device.',
      };
    }
    try {
      storage.set(IDENTITY_STORAGE_KEY, JSON.stringify(identity));
    } catch {
      return {
        ok: false,
        reason: 'storage_blocked',
        message: 'This browser blocked storage. Online matches cannot be kept on this device.',
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
          message: 'This browser blocked storage. Online matches cannot be kept on this device.',
        };
      }
      try {
        const created = await client.createGuest();
        return write({
          token: created.token,
          playerId: created.player.id,
          displayName: created.player.displayName,
          kind: created.player.kind,
        });
      } catch (error) {
        const message =
          error instanceof DuelError
            ? error.message
            : 'Could not create a FUTASAKU guest. Check your connection and try again.';
        return { ok: false, reason: 'create_failed', message };
      }
    },

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
