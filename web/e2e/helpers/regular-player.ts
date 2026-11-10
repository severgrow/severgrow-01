// A player who is no longer new to the in-game guide (agreed design, 2026-11-10): every action has had
// its one-time light, so the help key is the bulb and opens Match Intel. Suites that test Match Intel
// for a regular player start from this; guide-help-key.ts and online-guide.ts test the new player.
import type { Page } from 'playwright-core';

export const REGULAR_PLAYER_GUIDE = JSON.stringify({
  hinted: ['blast', 'bloom', 'bomb', 'cut', 'strengthen', 'grow'], finished: 0, base: 0, reenabled: false,
});

/** Before any page script: the guide's device copy says "not new" (futa04 storage prefix). */
export const asRegularPlayer = (page: Page, prefix = 'main2:'): Promise<void> =>
  page.addInitScript(({ key, value }) => { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
    { key: `${prefix}severgrow.guide.local.v1`, value: REGULAR_PLAYER_GUIDE });
