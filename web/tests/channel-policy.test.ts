import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { describe, expect, it } from 'vitest';
const source = transformSync(readFileSync(new URL('../src/channel.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const boot = (channel: string, location?: { hostname: string; pathname: string }) => {
  class Storage {
    data = new Map<string, string>();
    getItem(k: string) { return this.data.get(k) ?? null; }
    setItem(k: string, v: string) { this.data.set(k, v); }
    removeItem(k: string) { this.data.delete(k); }
  }
  const exports: Record<string, any> = {};
  const module = { exports };
  runInNewContext(source, { __CHANNEL__: channel, Storage, exports, module, location });
  return { policy: module.exports, Storage };
};
describe('release channel policy', () => {
  it.each(['live', 'test', 'test2'])('%s isolates local and session storage', (channel) => {
    const { policy, Storage } = boot(channel);
    for (const store of [new Storage(), new Storage()]) {
      store.data.set('sentinel', 'Main'); store.data.set('test:sentinel', 'Dev');
      store.setItem('save', 'candidate');
      expect(store.data.get(`${policy.STORAGE_PREFIX}save`)).toBe('candidate');
      expect(store.getItem('save')).toBe('candidate');
      store.removeItem('save'); expect(store.getItem('save')).toBeNull();
      expect(store.data.get('sentinel')).toBe('Main');
      expect(store.data.get('test:sentinel')).toBe('Dev');
    }
  });
  it('Test2 has approved player features without owner icons or experiments', () => {
    const f = boot('test2').policy.FEATURES;
    for (const k of ['typography', 'phoneLayout', 'guidance', 'desktopCoach', 'slimHeader', 'tapAgain', 'smartCamera', 'mapBehindCards']) expect(f[k]).toBe(true);
    for (const k of ['lab', 'design', 'watch', 'replay', 'weakTools', 'ownershipMarks']) expect(f[k]).toBe(false);
  });
  it('preview addresses keep separate saves from Test2', () => {
    const host = (pathname: string, hostname = 'severgrow.github.io') => boot('test2', { hostname, pathname }).policy.STORAGE_PREFIX;
    expect(host('/severgrow-01/futasaku-03-preview/')).toBe('futasaku03:');
    expect(host('/severgrow-01/futasaku-04-preview/')).toBe('futasaku04:');
    expect(host('/', 'play.chatgpt.site')).toBe('futasaku03:');
    expect(host('/severgrow-01/test2/')).toBe('main2:');
    const isolated = boot('test2', { hostname: 'severgrow.github.io', pathname: '/severgrow-01/futasaku-04-preview/' });
    const store = new isolated.Storage();
    store.setItem('severgrow.save', 'kept');
    expect(store.data.get('futasaku04:severgrow.save')).toBe('kept');
    expect(store.data.has('severgrow.save')).toBe(false);
    expect(store.data.has('main2:severgrow.save')).toBe(false);
    expect(boot('live', { hostname: 'severgrow.github.io', pathname: '/severgrow-01/futasaku-04-preview/' }).policy.STORAGE_PREFIX).toBe('');
  });
  it('Main retains legacy player behavior and Dev retains tools', () => {
    expect(boot('live').policy.FEATURES.tapAgain).toBe(false);
    expect(boot('live').policy.FEATURES.replay).toBe(true);
    expect(boot('live').policy.FEATURES.ownershipMarks).toBe(true);
    expect(boot('test').policy.FEATURES.lab).toBe(true);
    expect(boot('test').policy.FEATURES.ownershipMarks).toBe(false);
  });
});
