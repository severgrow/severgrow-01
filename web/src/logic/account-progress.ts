// THE ACCOUNT'S PLACE, ON THIS DEVICE (owner report, 2026-10-25).
//
// Campaign progress is device-local by design: a guest keeps playing exactly as before and this
// module never touches them. A SIGNED-IN account is different — its place must be the same on the
// phone and the desktop. The server knows the furthest level that account has a verified first-clear
// receipt for, so on boot (and after a sign-in) one authenticated read is folded into the local
// record by `reconcileProgress`, which only ever RAISES.
//
// This file is the browser half: read the stored identity, ask the server, catch everything. It is
// deliberately free of DOM and of the page's state so the whole rule is unit-tested with a fake
// storage and a fake fetch (web/tests/campaign-sync.test.ts).
import type { CampaignLevel, CampaignProgress } from '../../../src/campaign/index.js';
import { CAMPAIGN_LEVELS, reconcileProgress } from '../../../src/campaign/index.js';
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

export type ProgressSyncDeps = {
  storage: KeyValue | null;
  /** The server's furthest verified clear for the token's own account, or null. */
  fetchHighest: (token: string) => Promise<number | null>;
  levels?: readonly CampaignLevel[];
};

/**
 * Bring a local record up to the account's server-known place.
 *
 * A guest is NEVER asked: no identity or `kind: 'guest'` returns the local record untouched. A
 * failed/unreachable read is silent — the player keeps playing on the local record, with no error
 * surface anywhere. Only an account whose server place is ahead changes anything.
 */
export const syncAccountProgress = async (
  local: CampaignProgress,
  deps: ProgressSyncDeps,
): Promise<CampaignProgress> => {
  const identity = readAccountIdentity(deps.storage);
  if (!identity || identity.kind !== 'account') return local;
  try {
    const highest = await deps.fetchHighest(identity.token);
    return reconcileProgress(local, highest, deps.levels ?? CAMPAIGN_LEVELS);
  } catch {
    // Offline, a 401, a 500, a malformed body: the local game is unaffected.
    return local;
  }
};

/**
 * The real read: the authenticated wallet endpoint, which also carries `campaignHighestLevel`.
 * One GET on boot, no new table and no new route. A build with no online endpoint (or a failed
 * request) simply resolves null, which reconciles to "no change".
 */
export const fetchAccountHighestLevel = async (token: string): Promise<number | null> => {
  const baseUrl = duelApiUrl();
  if (!baseUrl) return null;
  const region = duelRegion();
  const client = new DuelClient({ baseUrl, ...(region ? { region } : {}) });
  return client.accountCampaignLevel(token);
};
