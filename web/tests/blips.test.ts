import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FAILURES_BEFORE_NOTICE, shouldReportFailure } from '../src/online/blips.js';

describe('a blip is not an error (2026-11-12)', () => {
  it('says nothing for one or two failed reads in a row, and speaks up on the third', () => {
    expect(FAILURES_BEFORE_NOTICE).toBe(3);
    expect([0, 1, 2, 3, 4].map(shouldReportFailure)).toEqual([false, false, false, true, true]);
  });

  it('the map keeps its normal pace after a failure: a sooner re-read repainted the planet under a tap', () => {
    const world = readFileSync(new URL('../src/online/world-view.ts', import.meta.url), 'utf8');
    expect(world).toMatch(/void this\.refresh\(\); else this\.schedule\(\); \}, 12_000\)/);
  });

  it('the world map and the territory chat both go through it', () => {
    const world = readFileSync(new URL('../src/online/world-view.ts', import.meta.url), 'utf8');
    const chat = readFileSync(new URL('../src/online/territory-chat.ts', import.meta.url), 'utf8');
    expect(world).toMatch(/shouldReportFailure\(this\.readFailures\)\) this\.notice\(ONLINE\.worldError\)/);
    expect(chat).toMatch(/shouldReportFailure\(this\.failures\)\) this\.say\(ONLINE\.worldChatOffline\)/);
  });
});
