import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FAILURES_BEFORE_NOTICE, nextPollMs, shouldReportFailure } from '../src/online/blips.js';

describe('a blip is not an error (2026-11-12)', () => {
  it('says nothing for one or two failed reads in a row, and speaks up on the third', () => {
    expect(FAILURES_BEFORE_NOTICE).toBe(3);
    expect([0, 1, 2, 3, 4].map(shouldReportFailure)).toEqual([false, false, false, true, true]);
  });

  it('retries sooner after a failure, never slower than the normal pace', () => {
    expect(nextPollMs(12_000, 0)).toBe(12_000);
    expect(nextPollMs(12_000, 1)).toBe(3_000);
    expect(nextPollMs(12_000, 2)).toBe(6_000);
    expect(nextPollMs(12_000, 9)).toBe(12_000);
  });

  it('the world map and the territory chat both go through it', () => {
    const world = readFileSync(new URL('../src/online/world-view.ts', import.meta.url), 'utf8');
    const chat = readFileSync(new URL('../src/online/territory-chat.ts', import.meta.url), 'utf8');
    expect(world).toMatch(/shouldReportFailure\(this\.readFailures\)\) this\.notice\(ONLINE\.worldError\)/);
    expect(chat).toMatch(/shouldReportFailure\(this\.failures\)\) this\.say\(ONLINE\.worldChatOffline\)/);
  });
});
