// The live turn length has ONE source of truth: the server's `LIVE_TURN_MS` default.
//
// Owner's change (2026-10-14): the live round is 60 seconds, not 45. Everything the client shows
// (the "Go live" pill, the challenge window's terms, the live chip, the new header clock) reads the
// server's `limitMs`, so this one constant is the whole change — plus the player words that name it.
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIVE_CONFIG, LIVE_TURN_MS_DEFAULT, liveConfigFromEnv } from '../src/live/config.js';
import { LIVE } from '../../src/strings.js';

describe('the live turn length', () => {
  it('defaults to 60 seconds', () => {
    expect(LIVE_TURN_MS_DEFAULT).toBe(60_000);
    expect(DEFAULT_LIVE_CONFIG.turnMs).toBe(60_000);
  });

  it('keeps the one override: LIVE_TURN_MS wins when it is set', () => {
    const previous = process.env.LIVE_TURN_MS;
    try {
      process.env.LIVE_TURN_MS = '30000';
      expect(liveConfigFromEnv().turnMs).toBe(30_000);
    } finally {
      if (previous === undefined) delete process.env.LIVE_TURN_MS;
      else process.env.LIVE_TURN_MS = previous;
    }
    expect(liveConfigFromEnv().turnMs).toBe(60_000);
  });

  it('the other live timings are untouched by the turn-length change', () => {
    expect(DEFAULT_LIVE_CONFIG.replayAllowanceMs).toBe(6_000);
    expect(DEFAULT_LIVE_CONFIG.entryAllowanceMs).toBe(15_000);
    expect(DEFAULT_LIVE_CONFIG.leaveGraceMs).toBe(60_000);
    expect(DEFAULT_LIVE_CONFIG.strikesToEnd).toBe(2);
  });

  it('every player-facing sentence takes its number from the wire, not from a fixed word', () => {
    // The copy does not spell a duration anywhere: it is always built from the seconds it is given,
    // so changing the constant above changes what the players read.
    expect(LIVE.terms(60)).toContain('60-second');
    expect(LIVE.chip(60)).toContain('60');
    expect(LIVE.chipAria(60)).toContain('60-second');
    expect(LIVE.goLiveAria('Fern', 60)).toContain('60-second');
    expect(LIVE.terms(60)).not.toContain('45');
  });
});
