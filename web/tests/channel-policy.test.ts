import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { describe, expect, it } from 'vitest';
const source = transformSync(readFileSync(new URL('../src/channel.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const boot = (channel: string, pathname?: string) => {
  class Storage {
    data = new Map<string, string>();
    getItem(k: string) { return this.data.get(k) ?? null; }
    setItem(k: string, v: string) { this.data.set(k, v); }
    removeItem(k: string) { this.data.delete(k); }
  }
  const exports: Record<string, any> = {};
  const module = { exports };
  const location = pathname ? { hostname: 'futasaku.com', pathname } : undefined;
  runInNewContext(source, { __CHANNEL__: channel, Storage, exports, module, ...(location ? { location } : {}) });
  return { policy: module.exports, Storage };
};
describe('release channel policy', () => {
  it('the real service worker assigns disjoint caches to root, /2/, /3/ and /test/',()=>{
    const worker=readFileSync(new URL('../public/futa04-sw.js',import.meta.url),'utf8');
    const prefixes=['/','/2/','/3/','/test/'].map(path=>runInNewContext(worker+'\nPREFIX',{
      URL,self:{registration:{scope:'https://futasaku.com'+path},addEventListener:()=>{}},
    }));
    expect(new Set(prefixes).size).toBe(4);
    for(const a of prefixes)for(const b of prefixes)if(a!==b)expect(a.startsWith(b)).toBe(false);
  });
  it('/test/ keeps its own save namespace, so staging never touches real progress', () => {
    const {policy,Storage}=boot('futa05','/test/');
    expect(policy.STORAGE_PREFIX).toBe('futa05-test:');
    const store=new Storage();store.data.set('futa05:save','real progress');
    expect(store.getItem('save')).toBeNull();store.setItem('save','experiment');
    expect(store.data.get('futa05:save')).toBe('real progress');
  });
  // OWNER CHANGED THE RULE (2026-11-04): THE PLANET was /test/-only; asked "When you promote, should
  // THE PLANET go live for everyone?", the owner answered "Yes, planet goes live". So it is the whole
  // futa05 game on every route, and still never the locked futa04 line or the other channels.
  it('THE PLANET is the whole futa05 game, and nothing else', () => {
    for (const path of ['/', '/2/', '/3/', '/test/', '/test2/']) expect(boot('futa05',path).policy.FEATURES.planet).toBe(true);
    for (const channel of ['futa04','futa-test','test','live']) {
      for (const path of ['/', '/test/']) expect(boot(channel,path).policy.FEATURES.planet).toBe(false);
    }
  });
  it.each(['live', 'test', 'futa04', 'futa-test', 'futa05'])('%s isolates local and session storage', (channel) => {
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
  it('Futa04 has approved player features without owner icons or experiments', () => {
    const f = boot('futa04').policy.FEATURES;
    for (const k of ['typography', 'phoneLayout', 'guidance', 'desktopCoach', 'slimHeader', 'tapAgain', 'smartCamera', 'mapBehindCards']) expect(f[k]).toBe(true);
    for (const k of ['lab', 'design', 'watch', 'replay', 'weakTools', 'ownershipMarks', 'v3', 'blitz']) expect(f[k]).toBe(false);
  });
  it('futa-test shares Futa04 presentation with its own storage prefix', () => {
    const policy = boot('futa-test').policy;
    expect(policy.IS_FUTA04).toBe(true);
    expect(policy.IS_TEST).toBe(true);
    expect(policy.STORAGE_PREFIX).toBe('futa-test:');
    expect(policy.FEATURES.v3).toBe(false);
    expect(policy.FEATURES.lab).toBe(false);
  });
  it('futa05 shares Futa04 presentation with its own storage prefix', () => {
    const policy = boot('futa05').policy;
    expect(policy.IS_FUTA04).toBe(true);
    expect(policy.IS_TEST).toBe(false);
    expect(policy.STORAGE_PREFIX).toBe('futa05:');
    expect(policy.FEATURES.typography).toBe(true);
    expect(policy.FEATURES.lab).toBe(false);
    expect(policy.FEATURES.v3).toBe(false);
  });
  it('the /3/ preview keeps its own storage; the root and /2/ keep theirs, unchanged', () => {
    expect(boot('futa05', '/3/').policy.STORAGE_PREFIX).toBe('futa05-3:');
    expect(boot('futa05', '/3/index.html').policy.STORAGE_PREFIX).toBe('futa05-3:');
    expect(boot('futa05', '/').policy.STORAGE_PREFIX).toBe('futa05:');
    expect(boot('futa05', '/2/').policy.STORAGE_PREFIX).toBe('futa05:');
    // Only the first path segment counts: a deeper "/3/" elsewhere is not the /3/ copy.
    expect(boot('futa05', '/2/3/').policy.STORAGE_PREFIX).toBe('futa05:');
    const { policy, Storage } = boot('futa05', '/3/');
    const store = new Storage();
    store.data.set('futa05:severgrow.campaign.progress.v1', 'root progress');
    expect(store.getItem('severgrow.campaign.progress.v1')).toBeNull();
    store.setItem('severgrow.campaign.progress.v1', 'lessons');
    expect(store.data.get('futa05:severgrow.campaign.progress.v1')).toBe('root progress');
    expect(policy.STORAGE_PREFIX).toBe('futa05-3:');
  });
  it('Main retains legacy player behavior and Dev retains tools', () => {
    expect(boot('live').policy.FEATURES.tapAgain).toBe(false);
    expect(boot('live').policy.FEATURES.replay).toBe(true);
    expect(boot('live').policy.FEATURES.ownershipMarks).toBe(true);
    expect(boot('test').policy.FEATURES.lab).toBe(true);
    expect(boot('test').policy.FEATURES.ownershipMarks).toBe(false);
  });
  it('experimental Blitz exists ONLY on the /test/ copy', () => {
    // /test/ is the futa05 build moved to the staging path (docs/RELEASE-FLOW.md). The live root is
    // the SAME channel, so only the route can separate them — and it does.
    expect(boot('futa05', '/test/').policy.FEATURES.blitz).toBe(true);
    expect(boot('futa05', '/test/index.html').policy.FEATURES.blitz).toBe(true);
    expect(boot('futa05', '/').policy.FEATURES.blitz).toBe(false); // the live root: never
    expect(boot('futa05', '/2/').policy.FEATURES.blitz).toBe(false);
    expect(boot('futa05', '/test2/').policy.FEATURES.blitz).toBe(false);
    // The locked product and every other copy: never.
    expect(boot('futa04').policy.FEATURES.blitz).toBe(false);
    expect(boot('futa04', '/test/').policy.FEATURES.blitz).toBe(false);
    expect(boot('futa-test').policy.FEATURES.blitz).toBe(false);
    expect(boot('test', '/test/').policy.FEATURES.blitz).toBe(false);
    expect(boot('live').policy.FEATURES.blitz).toBe(false);
  });
});
