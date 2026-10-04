// Release channels. The live game (the site root, from main) is "live"; the test copy (/test/,
// from the dev branch) is "test". The build sets it (CHANNEL=test npm run web:build); anything
// test-only (the Lab) checks it, so the live game never shows or loads it.
//
// Both copies share one web address, so the test copy keeps its own storage: every
// localStorage key it uses gets the "test:" prefix. Live saves and settings are never touched.
declare const __CHANNEL__: string;
export type Channel = 'live' | 'test';
export const CHANNEL: Channel = (typeof __CHANNEL__ !== 'undefined' && __CHANNEL__ === 'test' ? 'test' : 'live');
export const IS_TEST = CHANNEL === 'test';

if (IS_TEST && typeof Storage !== 'undefined') {
  const P = 'test:';
  const proto = Storage.prototype;
  const get = proto.getItem;
  const set = proto.setItem;
  const remove = proto.removeItem;
  proto.getItem = function (k: string) {
    return get.call(this, P + k);
  };
  proto.setItem = function (k: string, v: string) {
    set.call(this, P + k, v);
  };
  proto.removeItem = function (k: string) {
    remove.call(this, P + k);
  };
}
