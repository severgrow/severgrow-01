// Futasaku 0.4 is the product channel. `futa-test` is the quick experiment copy.
// `futa05` is the online-duels preview: same product UI, own storage + Find Opponent.
declare const __CHANNEL__: string;
export type Channel = 'live' | 'test' | 'futa04' | 'futa-test' | 'futa05';
const raw = typeof __CHANNEL__ !== 'undefined' ? __CHANNEL__ : 'futa04';
export const CHANNEL: Channel =
  raw === 'test' || raw === 'futa04' || raw === 'futa-test' || raw === 'futa05' || raw === 'live' ? raw : 'futa04';
export const IS_TEST = CHANNEL === 'test' || CHANNEL === 'futa-test';
export const IS_FUTA04 = CHANNEL === 'futa04' || CHANNEL === 'futa-test' || CHANNEL === 'futa05';
/**
 * The staging copy at `/test/` (docs/RELEASE-FLOW.md). It is built from the SAME `futa05` source as
 * the live root and only moved to the `/test/` path afterwards, so the channel alone can never tell
 * the two apart — the path can, and does. Only the first path segment counts.
 */
export const IS_TEST_ROUTE = typeof location !== 'undefined' && /^\/test(\/|$)/.test(location.pathname);
const modern = IS_TEST || IS_FUTA04;
export const FEATURES = Object.freeze({
  typography: modern,
  phoneLayout: modern,
  guidance: modern,
  desktopCoach: modern,
  slimHeader: modern,
  tapAgain: modern,
  smartCamera: modern,
  mapBehindCards: modern,
  replay: !modern,
  weakTools: !modern,
  ownershipMarks: !modern,
  lab: CHANNEL === 'test',
  design: CHANNEL === 'test',
  /** V3 art archived; skins come later */
  v3: false,
  watch: CHANNEL === 'test',
  /**
   * Campaign mode (the primary offline experience). Product channels only — the lab / experiment
   * copy (`test`, `futa-test`) keeps the menu it is used to, so its e2e keeps working unchanged.
   */
  campaign: CHANNEL === 'futa04' || CHANNEL === 'futa05',
  /**
   * EXPERIMENTAL Blitz (Practice only): the STAGING COPY, and nothing else. The live root is the
   * same `futa05` build one promote behind it, so the channel is not enough: the `/test/` route is
   * what makes this true only for the staging copy and always false for the futa04 product.
   */
  blitz: CHANNEL === 'futa05' && IS_TEST_ROUTE,
  firstExperience: CHANNEL === 'futa05' && IS_TEST_ROUTE,
  /**
   * THE PLANET (owner, 2026-11-04): the Territory window shows its ground as a planet in space,
   * called THE PLANET, and the planet is the main menu's backdrop. First on the staging copy; then
   * "When you promote, should THE PLANET go live for everyone?" — "Yes, planet goes live". So it is
   * the whole futa05 game (it reaches futasaku.com with the next promote); the locked futa04 line
   * keeps its flat Territory.
   */
  planet: CHANNEL === 'futa05',
});
const isPreviewHost = typeof location !== 'undefined' && (
  location.hostname.endsWith('.chatgpt.site') ||
  location.pathname.includes('/futa0.4/') ||
  location.pathname.includes('/futa0.5/') ||
  location.pathname.includes('/futa-test/')
);
/**
 * The /3/ preview (levels 1-10 as the tutorial) is published on the same origin as the root and
 * /2/, so it keeps its OWN storage: its level progress and saves never reach the released game's.
 * Only the first path segment counts.
 */
export const IS_PREVIEW_3 = typeof location !== 'undefined' && /^\/3(\/|$)/.test(location.pathname);
export const STORAGE_PREFIX = CHANNEL === 'futa-test' ? 'futa-test:'
  : CHANNEL === 'futa05' ? (IS_TEST_ROUTE ? 'futa05-test:' : IS_PREVIEW_3 ? 'futa05-3:' : 'futa05:')
  : CHANNEL === 'test' ? 'test:'
  : IS_FUTA04 ? (isPreviewHost ? 'futa04:' : 'main2:')
  : '';
if (STORAGE_PREFIX && typeof Storage !== 'undefined') {
  const proto = Storage.prototype;
  const get = proto.getItem, set = proto.setItem, remove = proto.removeItem;
  proto.getItem = function (k: string) { return get.call(this, STORAGE_PREFIX + k); };
  proto.setItem = function (k: string, v: string) { set.call(this, STORAGE_PREFIX + k, v); };
  proto.removeItem = function (k: string) { remove.call(this, STORAGE_PREFIX + k); };
}
