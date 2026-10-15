// The live turn length has ONE source of truth: the server's `LIVE_TURN_MS` default.
//
// Owner's change (2026-10-14): the live round is 60 seconds, not 45. The clock itself reads the
// server's `limitMs`, so this one constant is the whole change. The COPY no longer spells the
// duration anywhere (owner's later cleanup: no "LIVE 60s", no "60-second turns") — the only number
// a player reads is the live clock's own m:ss, which the UI builds from `limitMs`.
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

  it('every real-time turn is exactly the turn clock: no extra seconds on entry or for the replay', () => {
    // Owner, 2026-10-15: "1st round is longer than 60s - 2nd too -- all turn to be 60s". The
    // allowances stay as tunable knobs (the harness exercises them), but by default they add nothing.
    expect(DEFAULT_LIVE_CONFIG.replayAllowanceMs).toBe(0);
    expect(DEFAULT_LIVE_CONFIG.entryAllowanceMs).toBe(0);
  });

  it('the strike and leaver-cooldown knobs are gone (a real-time timeout now loses outright)', () => {
    // Owner's ruling, 2026-10-14: leaving real-time forfeits AND a real-time timeout loses, so there
    // is no strike escape hatch and nothing to cooldown. A future change must not silently re-add a
    // dead knob: the config type has no such field at all.
    for (const gone of ['strikesToEnd', 'leaveGraceMs', 'leaveCooldownMs', 'leaveCooldownTurns'] as const) {
      expect(gone in DEFAULT_LIVE_CONFIG).toBe(false);
    }
  });

  it('no player-facing sentence spells a duration (the live clock is the only number)', () => {
    // Owner's cleanup, 2026-10-14: the rule-stating number of seconds is gone from every short
    // label (it was "LIVE 60s" / "60-second turns"). The single number a player reads is the live
    // clock's own m:ss, which the UI builds from `limitMs` — never words in this table.
    const words = [
      LIVE.goLive,
      LIVE.goLiveAria('Fern', 60),
      LIVE.terms(60),
      LIVE.chip(60),
      LIVE.chipAria(60),
      LIVE.waiting('Fern', 60),
      LIVE.waitingFor('Fern'),
      LIVE.rematchWaiting('Fern', 60),
      LIVE.leaveLive,
      LIVE.inLiveGame,
      LIVE.wantsToGoLive,
    ];
    for (const text of words) expect(text).not.toMatch(/\d+\s*(?:s\b|sec)/i);
  });
});
