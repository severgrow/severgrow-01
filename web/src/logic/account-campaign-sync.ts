// ACCOUNT CAMPAIGN PROGRESS SYNC (owner, 2026-11-08). Signed-in only: pull the account snapshot,
// merge further-ahead with this device (and with verified receipt highest), push when local wins.
//
// Failure is silent. An older server (404 / missing feature) leaves the device record alone and
// never blocks a duel or a level. This module talks ONLY to the campaign progress route — wallet,
// map and reward ledgers stay server-authoritative on their own paths.
import type { CampaignProgress } from '../../../src/campaign/index.js';
import {
  CAMPAIGN_PROGRESS_VERSION,
  compareProgressRank,
  freshProgress,
  mergeAccountProgress,
  parseProgress,
  progressRank,
} from '../../../src/campaign/index.js';
import type { KeyValue } from '../../../server/src/client.js';
import { DuelClient, DuelError } from '../../../server/src/client.js';
import { ACCOUNT_CAMPAIGN_PROGRESS_FEATURE } from '../../../server/src/account-campaign-progress.js';
import type { AccountCampaignProgressWire } from '../../../server/src/account-campaign-progress.js';
import { readAccountIdentity } from './account-progress.js';
import { duelApiUrl, duelRegion } from '../online/config.js';

/** The only path this sync may call. Tests pin the allow-list. */
export const ACCOUNT_CAMPAIGN_PROGRESS_PATHS = Object.freeze([
  '/v1/players/me/campaign/progress',
] as const);

const PROGRESS_PATH = ACCOUNT_CAMPAIGN_PROGRESS_PATHS[0]!;

/** Refuse any other path — a local save must not raise wallet, map or reward ledgers. */
export const assertProgressSyncIsSafe = (path: string): void => {
  if (!(ACCOUNT_CAMPAIGN_PROGRESS_PATHS as readonly string[]).includes(path)) {
    throw new Error(`account campaign sync must not call ${path}`);
  }
};

export const progressWireFromLocal = (local: CampaignProgress): AccountCampaignProgressWire => ({
  completed: [...local.completed],
  best: { ...local.best },
});

export const progressWireToLocal = (wire: AccountCampaignProgressWire): CampaignProgress =>
  parseProgress(JSON.stringify({
    version: CAMPAIGN_PROGRESS_VERSION,
    unlocked: 1,
    completed: wire.completed,
    best: wire.best,
  }));

export type AccountCampaignSyncResult = {
  /** The merged local record after further-ahead + receipt raise. */
  progress: CampaignProgress;
  /** True when the device record changed and the caller should persist it. */
  localChanged: boolean;
  /** True when this device was ahead and a push was attempted successfully. */
  pushed: boolean;
  /** Why a network half was skipped, when it was. */
  status: 'ok' | 'signed-out' | 'unavailable' | 'older-server';
};

export type AccountCampaignSyncDeps = {
  storage: KeyValue | null;
  local: CampaignProgress;
  /** Verified receipt highest from `loadAccountClears` / GET campaign, or null. */
  serverHighest: number | null | undefined;
  /** Optional override for tests. Production builds a DuelClient from the online config. */
  fetchProgress?: (token: string) => Promise<AccountCampaignProgressWire | null>;
  putProgress?: (token: string, wire: AccountCampaignProgressWire) => Promise<AccountCampaignProgressWire>;
  /** Health features; when known and missing the flag, skip the network. */
  features?: readonly string[] | null;
};

const clientOf = (): DuelClient | null => {
  const baseUrl = duelApiUrl();
  if (!baseUrl) return null;
  const region = duelRegion();
  return new DuelClient({ baseUrl, ...(region ? { region } : {}) });
};

const isOlderServer = (error: unknown): boolean =>
  error instanceof DuelError && error.status === 404 && error.code === 'NOT_FOUND';

/**
 * One signed-in sync pass. Guests return the local record unchanged. Network failures leave local
 * truth alone.
 */
export const syncAccountCampaignProgress = async (
  deps: AccountCampaignSyncDeps,
): Promise<AccountCampaignSyncResult> => {
  const identity = readAccountIdentity(deps.storage);
  if (!identity || identity.kind !== 'account') {
    return { progress: deps.local, localChanged: false, pushed: false, status: 'signed-out' };
  }
  if (deps.features && !deps.features.includes(ACCOUNT_CAMPAIGN_PROGRESS_FEATURE)) {
    const raised = mergeAccountProgress(deps.local, null, deps.serverHighest);
    return {
      progress: raised,
      localChanged: raised !== deps.local,
      pushed: false,
      status: 'older-server',
    };
  }

  const fetchProgress = deps.fetchProgress ?? (async (token: string) => {
    assertProgressSyncIsSafe(PROGRESS_PATH);
    const client = clientOf();
    if (!client) throw new Error('no online endpoint');
    return client.accountCampaignProgress(token);
  });
  const putProgress = deps.putProgress ?? (async (token: string, wire: AccountCampaignProgressWire) => {
    assertProgressSyncIsSafe(PROGRESS_PATH);
    const client = clientOf();
    if (!client) throw new Error('no online endpoint');
    return client.putAccountCampaignProgress(token, wire);
  });

  let accountWire: AccountCampaignProgressWire | null;
  try {
    accountWire = await fetchProgress(identity.token);
  } catch (error) {
    if (isOlderServer(error)) {
      const raised = mergeAccountProgress(deps.local, null, deps.serverHighest);
      return {
        progress: raised,
        localChanged: raised !== deps.local,
        pushed: false,
        status: 'older-server',
      };
    }
    return { progress: deps.local, localChanged: false, pushed: false, status: 'unavailable' };
  }

  const accountLocal = accountWire ? progressWireToLocal(accountWire) : null;
  const merged = mergeAccountProgress(deps.local, accountLocal, deps.serverHighest);
  const localChanged = merged !== deps.local;

  // Push only when the merged place is strictly further ahead than what the account already holds.
  const baseline = accountLocal ?? freshProgress();
  const shouldPush = compareProgressRank(progressRank(merged), progressRank(baseline)) > 0;

  let pushed = false;
  if (shouldPush) {
    try {
      await putProgress(identity.token, progressWireFromLocal(merged));
      pushed = true;
    } catch (error) {
      if (isOlderServer(error)) {
        return { progress: merged, localChanged, pushed: false, status: 'older-server' };
      }
      return { progress: merged, localChanged, pushed: false, status: 'unavailable' };
    }
  }

  return { progress: merged, localChanged, pushed, status: 'ok' };
};
