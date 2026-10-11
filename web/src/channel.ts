// Which copy of Futasaku this page is, and where it keeps saves and settings. The game
// (/futa0.4/) and the test copy (/futa-test/, branch futa-test, AGENTS.md) use separate storage,
// so a TEST: experiment never touches a real save. The prefixes are historical and kept on
// purpose: existing saves and settings still load.
const path = typeof location !== 'undefined' ? location.pathname : '';
const host = typeof location !== 'undefined' ? location.hostname : '';

/** The quick test copy, published at /futa-test/. */
export const IS_TEST_COPY = path.includes('/futa-test/');

export const STORAGE_PREFIX = IS_TEST_COPY ? 'futatest:'
  : host.endsWith('.chatgpt.site') || path.includes('/futa0.4/') ? 'futa04:'
  : 'main2:';

if (typeof Storage !== 'undefined') {
  const proto = Storage.prototype;
  const get = proto.getItem, set = proto.setItem, remove = proto.removeItem;
  proto.getItem = function (k: string) { return get.call(this, STORAGE_PREFIX + k); };
  proto.setItem = function (k: string, v: string) { set.call(this, STORAGE_PREFIX + k, v); };
  proto.removeItem = function (k: string) { remove.call(this, STORAGE_PREFIX + k); };
}

// The test copy says so in the browser tab, so it is never mistaken for the game.
if (IS_TEST_COPY && typeof document !== 'undefined') document.title = `TEST · ${document.title}`;
