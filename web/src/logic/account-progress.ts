// THE ACCOUNT'S IDENTITY, READ ON THIS DEVICE (owner report, 2026-10-25).
//
// Campaign progress is device-local by design: a guest keeps playing exactly as before and nothing
// here touches them. A SIGNED-IN account is different — its place must be the same on the phone and
// the desktop. The read itself (and its cache) now lives in `menu/account-clears.ts`, because the
// same one authenticated read serves both the account place and the menu's campaign suggestion; this
// file keeps the tolerant identity parse that read needs, the further-ahead campaign merge, plus the
// feature probe.
//
// This file is deliberately free of DOM and of the page's state so the rules are unit-tested with a
// fake storage and a fake fetch (web/tests/campaign-sync.test.ts, web/tests/account-clears.test.ts).
import {
  reconcileProgress,
  type CampaignProgress,
} from '../../../src/campaign/index.js';
import type { KeyValue } from '../../../server/src/client.js';
import { DuelClient } from '../../../server/src/client.js';
import { IDENTITY_STORAGE_KEY } from '../online/identity.js';
import { duelApiUrl, duelRegion } from '../online/config.js';

export type StoredIdentity = {
  token: string;
  playerId: string;
  kind: 'guest' | 'account';
};

/**
 * The identity this device keeps for Play Online, or null. Only `kind: 'account'` is an account;
 * a guest (and any unreadable record) is not synced. The parse is deliberately tolerant: a value
 * written by another build must never break boot.
 */
/** Furthest cleared level from a normalised account-clears list, or null when the account cleared none. */
export const accountHighestFromLevels = (levels: readonly number[] | null | undefined): number | null =>
  levels && levels.length > 0 ? levels[levels.length - 1]! : null;

/**
 * When the signed-in account has cleared further than this device, raise local campaign progress to
 * match (`reconcileProgress`). Empty or missing account data leaves the device record untouched.
 */
export const mergeFurtherAheadProgress = (
  local: CampaignProgress,
  accountLevels: readonly number[] | null | undefined,
): CampaignProgress => reconcileProgress(local, accountHighestFromLevels(accountLevels));

export const readAccountIdentity = (kv: KeyValue | null): StoredIdentity | null => {
  try {
    const raw = kv?.get(IDENTITY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredIdentity>;
    if (typeof parsed.token !== 'string' || typeof parsed.playerId !== 'string') return null;
    if (parsed.kind !== 'guest' && parsed.kind !== 'account') return null;
    return { token: parsed.token, playerId: parsed.playerId, kind: parsed.kind };
  } catch {
    return null;
  }
};

/**
 * What the server can do (`GET /v1/health` `features`), bounded to five seconds so a dead line can
 * never hold anything up. A build with no online endpoint answers "nothing".
 */
export const fetchServerFeatures = async (): Promise<readonly string[]> => {
  const baseUrl = duelApiUrl();
  if (!baseUrl) return [];
  const region = duelRegion();
  const client = new DuelClient({ baseUrl, ...(region ? { region } : {}) });
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), 5_000);
  try {
    return await client.serverFeatures(controller ? { signal: controller.signal } : {});
  } finally {
    clearTimeout(timer);
  }
};
