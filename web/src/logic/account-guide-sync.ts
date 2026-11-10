// The in-game guide's account copy (owner, 2026-11-09: seen windows "follow the account").
// Every Play Online player keeps it, guests too (2026-11-10: so "opened a lesson -> finished a game"
// can be measured); the identity is read on each call, so one made later is picked up. Silent on an
// older server (no `account-guide` feature) or any failure:
// the guide always works from this device's own copy.
import type { KeyValue } from '../../../server/src/client.js';
import { DuelClient } from '../../../server/src/client.js';
import { ACCOUNT_GUIDE_FEATURE } from '../../../server/src/account-guide.js';
import { fetchServerFeatures, readAccountIdentity } from './account-progress.js';
import { duelApiUrl, duelRegion } from '../online/config.js';
import { parseGuideProgress } from './guide-watcher.js';
import type { GuideProgress } from './guide-watcher.js';

export type GuideAccount = { load(): Promise<GuideProgress | null>; save(p: GuideProgress): Promise<GuideProgress | null> };

/** The server copy for this device's Play Online player (guest or account); null with no server. */
export const guideAccount = (storage: KeyValue | null, deps: {
  client?: Pick<DuelClient, 'accountGuide' | 'putAccountGuide'> | null;
  features?: () => Promise<readonly string[] | null>;
} = {}): GuideAccount | null => {
  const token = () => readAccountIdentity(storage)?.token ?? null;
  const base = duelApiUrl();
  const region = duelRegion();
  const client = deps.client !== undefined ? deps.client : base ? new DuelClient({ baseUrl: base, ...(region ? { region } : {}) }) : null;
  if (!client) return null;
  let supported: Promise<boolean> | null = null;
  const ready = () => (supported ??= (deps.features ?? (() => fetchServerFeatures()))().then(
    (f) => !f || f.includes(ACCOUNT_GUIDE_FEATURE), () => false));
  return {
    async load() {
      const t = token();
      if (!t || !(await ready())) return null;
      try { const g = await client.accountGuide(t); return g ? parseGuideProgress(g) : null; } catch { return null; }
    },
    async save(p) {
      const t = token();
      if (!t || !(await ready())) return null;
      try { return parseGuideProgress(await client.putAccountGuide(t, { seen: [...p.seen], games: p.games })); } catch { return null; }
    },
  };
};
