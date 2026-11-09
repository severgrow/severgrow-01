// The in-game guide's account copy (owner, 2026-11-09: seen windows "follow the account").
// Signed-in accounts only; silent on an older server (no `account-guide` feature) or any failure:
// the guide always works from this device's own copy.
import type { KeyValue } from '../../../server/src/client.js';
import { DuelClient } from '../../../server/src/client.js';
import { ACCOUNT_GUIDE_FEATURE } from '../../../server/src/account-guide.js';
import { fetchServerFeatures, readAccountIdentity } from './account-progress.js';
import { duelApiUrl, duelRegion } from '../online/config.js';
import { parseGuideProgress } from './guide-watcher.js';
import type { GuideProgress } from './guide-watcher.js';

export type GuideAccount = { load(): Promise<GuideProgress | null>; save(p: GuideProgress): Promise<GuideProgress | null> };

/** The account copy for this device's signed-in player, or null when there is none. */
export const guideAccount = (storage: KeyValue | null, deps: {
  client?: Pick<DuelClient, 'accountGuide' | 'putAccountGuide'> | null;
  features?: () => Promise<readonly string[] | null>;
} = {}): GuideAccount | null => {
  const token = () => {
    const id = readAccountIdentity(storage);
    return id && id.kind === 'account' ? id.token : null;
  };
  if (!token()) return null;
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
