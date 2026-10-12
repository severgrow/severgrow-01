// Futasaku 0.4 is the product channel. `futa-test` is the quick experiment copy.
// `futa05` is the online-duels preview: same product UI, own storage + Find Opponent.
declare const __CHANNEL__: string;
export type Channel = 'live' | 'test' | 'futa04' | 'futa-test' | 'futa05';
const raw = typeof __CHANNEL__ !== 'undefined' ? __CHANNEL__ : 'futa04';
export const CHANNEL: Channel =
  raw === 'test' || raw === 'futa04' || raw === 'futa-test' || raw === 'futa05' || raw === 'live' ? raw : 'futa04';
export const IS_TEST = CHANNEL === 'test' || CHANNEL === 'futa-test';
export const IS_FUTA04 = CHANNEL === 'futa04' || CHANNEL === 'futa-test' || CHANNEL === 'futa05';
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
});
const isPreviewHost = typeof location !== 'undefined' && (
  location.hostname.endsWith('.chatgpt.site') ||
  location.pathname.includes('/futa0.4/') ||
  location.pathname.includes('/futa0.5/') ||
  location.pathname.includes('/futa-test/')
);
export const STORAGE_PREFIX = CHANNEL === 'futa-test' ? 'futa-test:'
  : CHANNEL === 'futa05' ? 'futa05:'
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
