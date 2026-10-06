// Futasaku 0.3 uses the Test2 presentation. Historical channels remain for
// compatibility checks; each channel keeps its established storage namespace.
declare const __CHANNEL__: string;
export type Channel = 'live' | 'test' | 'test2';
export const CHANNEL: Channel = typeof __CHANNEL__ !== 'undefined' && (__CHANNEL__ === 'test' || __CHANNEL__ === 'test2') ? __CHANNEL__ : 'live';
export const IS_TEST = CHANNEL === 'test';
export const IS_TEST2 = CHANNEL === 'test2';
const modern = IS_TEST || IS_TEST2;
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
export const STORAGE_PREFIX = IS_TEST ? 'test:' : IS_TEST2 ? 'main2:' : '';
if (STORAGE_PREFIX && typeof Storage !== 'undefined') {
  const proto = Storage.prototype;
  const get = proto.getItem, set = proto.setItem, remove = proto.removeItem;
  proto.getItem = function (k: string) { return get.call(this, STORAGE_PREFIX + k); };
  proto.setItem = function (k: string, v: string) { set.call(this, STORAGE_PREFIX + k, v); };
  proto.removeItem = function (k: string) { remove.call(this, STORAGE_PREFIX + k); };
}
