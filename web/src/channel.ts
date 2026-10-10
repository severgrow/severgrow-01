// Futasaku 0.4 uses the Futa04 presentation. Historical channels remain for
// compatibility checks; each channel keeps its established storage namespace.
declare const __CHANNEL__: string;
export type Channel = 'live' | 'test' | 'futa04';
export const CHANNEL: Channel = typeof __CHANNEL__ !== 'undefined' && (__CHANNEL__ === 'test' || __CHANNEL__ === 'futa04') ? __CHANNEL__ : 'live';
export const IS_TEST = CHANNEL === 'test';
export const IS_FUTA04 = CHANNEL === 'futa04';
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
  lab: IS_TEST,
  design: IS_TEST,
  /** the V3 look (skinned renderer, V3 art): an option in the menu of both test channels */
  v3: modern,
  watch: IS_TEST,
});
const isPreviewHost = typeof location !== 'undefined' && (location.hostname.endsWith('.chatgpt.site') || location.pathname.includes('/futa0.4/'));
export const STORAGE_PREFIX = IS_TEST ? 'test:' : IS_FUTA04 ? (isPreviewHost ? 'futa04:' : 'main2:') : '';
if (STORAGE_PREFIX && typeof Storage !== 'undefined') {
  const proto = Storage.prototype;
  const get = proto.getItem, set = proto.setItem, remove = proto.removeItem;
  proto.getItem = function (k: string) { return get.call(this, STORAGE_PREFIX + k); };
  proto.setItem = function (k: string, v: string) { set.call(this, STORAGE_PREFIX + k, v); };
  proto.removeItem = function (k: string) { remove.call(this, STORAGE_PREFIX + k); };
}
