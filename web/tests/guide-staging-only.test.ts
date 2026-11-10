// The in-game guide stays on the staging copy (owner, 2026-11-10: "promote, but not the guide tho").
import { describe, expect, it } from 'vitest';
import { inGameGuideOn } from '../src/channel';

describe('the in-game guide is staging-only for now', () => {
  it('is off on the live game at futasaku.com', () => {
    expect(inGameGuideOn('futa05', '/', 'futasaku.com')).toBe(false);
    expect(inGameGuideOn('futa05', '/', 'www.futasaku.com')).toBe(false);
    expect(inGameGuideOn('futa05', '/testing', 'www.futasaku.com')).toBe(false);
  });
  it('is on at /test/, on local test servers, and on the other channels', () => {
    expect(inGameGuideOn('futa05', '/test/', 'www.futasaku.com')).toBe(true);
    expect(inGameGuideOn('futa05', '/test', 'www.futasaku.com')).toBe(true);
    expect(inGameGuideOn('futa05', '/', '127.0.0.1')).toBe(true);
    expect(inGameGuideOn('futa05', '/', 'localhost')).toBe(true);
    expect(inGameGuideOn('futa04', '/', 'www.futasaku.com')).toBe(true);
  });
});
