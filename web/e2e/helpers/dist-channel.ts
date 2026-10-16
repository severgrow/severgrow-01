// The e2e suites serve a PRE-BUILT `web/dist` and seed localStorage before the app starts.
// The app's storage prefix is baked in AT BUILD TIME (`web/src/channel.ts`): a `CHANNEL=futa04`
// build installs `main2:`, `futa05` installs `futa05:`, and so on. These suites' fixtures seed
// `main2:`. If the dist on disk was built for another channel, the seeded save never reaches the
// app, `#menu-continue` stays hidden, and the suite dies inside a helper — which reads like a
// product bug and cost real time to diagnose (2026-10-14).
//
// `assertDistChannel` turns that into one loud, self-explanatory line. Call it once, right after
// the app has booted on the page you are about to drive.
import type { Page } from 'playwright-core';

/** The storage prefix a `CHANNEL=futa04` build installs. The single source for these suites. */
export const FUTA04_STORAGE_PREFIX = 'main2:';

/** The key of the class this guards: every suite fixture that seeds `main2:severgrow.*`. */
export const FUTA04_SEED_PREFIX = `${FUTA04_STORAGE_PREFIX}severgrow`;

/**
 * Ask the RUNNING app which storage prefix it actually installs (`channel.ts` wraps
 * `Storage.prototype`, so a probe key comes back prefixed). No product change needed:
 * the wrapper is already in place by the time `window.__severgrow` exists.
 */
export const resolveStoragePrefix = async (page: Page): Promise<string> => {
  await page.waitForFunction(() => !!(window as any).__severgrow, undefined, { timeout: 20000 });
  return page.evaluate(() => {
    const probe = '__severgrow_prefix_probe__';
    localStorage.setItem(probe, '1');
    const key = Object.keys(localStorage).find((k) => k.endsWith(probe));
    localStorage.removeItem(probe);
    return key ? key.slice(0, -probe.length) : '';
  });
};

/** The channel whose build the given prefix belongs to, for the error message. */
const channelHintFor = (prefix: string): string | null => {
  switch (prefix) {
    case FUTA04_STORAGE_PREFIX: return null;
    case 'futa05:': return 'futa05';
    case 'futa-test:': return 'futa-test';
    case 'test:': return 'test';
    case 'futa04:': return 'futa04 (a /futa0.4/ preview path)';
    case '': return 'live/test2 (no prefix)';
    default: return null;
  }
};

/**
 * Fail loudly if the served dist was built for another channel, instead of letting the suite
 * crash obscurely later. Throws with the exact command that fixes it.
 */
export const assertDistChannel = async (page: Page, expected: string = FUTA04_STORAGE_PREFIX): Promise<void> => {
  const actual = await resolveStoragePrefix(page);
  if (actual === expected) return;
  const hint = channelHintFor(actual);
  const wanted = expected === ''
    ? 'this suite\'s fixtures are UNPREFIXED (it targets the live channel, which installs no prefix)'
    : `this suite seeds '${expected}'`;
  throw new Error(
    `e2e dist channel mismatch: the served build installs the storage prefix '${actual || '(none)'}'`
    + ` but ${wanted}. Its fixtures write '${expected}severgrow.*', so the app`
    + ` cannot see them; the suite would then die obscurely (e.g. #menu-continue stays hidden).`
    + (hint ? ` The dist looks like a '${hint}' build.` : '')
    + ` Rebuild the dist for this channel first, e.g. \`CHANNEL=futa04 npm run web:build\`.`
  );
};
