import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { describe, expect, it } from 'vitest';
const source = transformSync(readFileSync(new URL('../src/channel.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const boot = (channel: string) => {
  class Storage {
    data = new Map<string, string>();
    getItem(k: string) { return this.data.get(k) ?? null; }
    setItem(k: string, v: string) { this.data.set(k, v); }
    removeItem(k: string) { this.data.delete(k); }
  }
  const exports: Record<string, any> = {};
  const module = { exports };
  runInNewContext(source, { __CHANNEL__: channel, Storage, exports, module });
  return { policy: module.exports, Storage };
};
describe('release channel policy', () => {
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
    for (const k of ['lab', 'design', 'watch', 'replay', 'weakTools', 'ownershipMarks', 'v3']) expect(f[k]).toBe(false);
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
  it('Main retains legacy player behavior and Dev retains tools', () => {
    expect(boot('live').policy.FEATURES.tapAgain).toBe(false);
    expect(boot('live').policy.FEATURES.replay).toBe(true);
    expect(boot('live').policy.FEATURES.ownershipMarks).toBe(true);
    expect(boot('test').policy.FEATURES.lab).toBe(true);
    expect(boot('test').policy.FEATURES.ownershipMarks).toBe(false);
  });
});
