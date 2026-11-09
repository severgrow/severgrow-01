// Blitz has one configurable server turn limit. Short HUD labels omit the duration;
// send/accept windows state the authoritative seconds and no-undo rule.
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIVE_CONFIG, LIVE_TURN_MS_DEFAULT, liveConfigFromEnv } from '../src/live/config.js';
import { LIVE } from '../../src/strings.js';

describe('the live turn length', () => {
  // OWNER CHANGED THE RULE (2026-11-08): 30 seconds a turn. Was 21 s on 2026-11-06.
  it('defaults to 30 seconds (Blitz)', () => {
    expect(LIVE_TURN_MS_DEFAULT).toBe(30_000);
    expect(DEFAULT_LIVE_CONFIG.turnMs).toBe(30_000);
  });

  it('keeps the one override: LIVE_TURN_MS wins when it is set', () => {
    const previous = process.env.LIVE_TURN_MS;
    try {
      process.env.LIVE_TURN_MS = '45000';
      expect(liveConfigFromEnv().turnMs).toBe(45_000);
    } finally {
      if (previous === undefined) delete process.env.LIVE_TURN_MS;
      else process.env.LIVE_TURN_MS = previous;
    }
    expect(liveConfigFromEnv().turnMs).toBe(30_000);
  });

  it('every real-time turn is exactly the turn clock: no extra seconds on entry or for the replay', () => {
    // Owner, 2026-10-15: "1st round is longer than 60s - 2nd too -- all turn to be 60s". The
    // allowances stay as tunable knobs (the harness exercises them), but by default they add nothing.
    expect(DEFAULT_LIVE_CONFIG.replayAllowanceMs).toBe(0);
    expect(DEFAULT_LIVE_CONFIG.entryAllowanceMs).toBe(0);
  });

  it('the obsolete strike and leaver-cooldown knobs remain removed', () => {
    // These legacy settings do not control current Blitz. Connected timeout now completes a
    // turn; leaving forfeits. Do not silently reintroduce unused configuration fields.
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

  it('the send and accept windows DO say the seconds and no undo (owner, 2026-11-06)', () => {
    // "in the window asking to confirm send/accept BLITZ say 21seconds, no undo": the number is the
    // server's own limitMs, so the window never promises a clock the match is not using.
    expect(LIVE.duelTerms(21)).toBe('21 seconds a turn. No undo.');
    expect(LIVE.terms(21)).toBe('21 seconds a turn. No undo.');
    expect(LIVE.terms(37)).toBe('37 seconds a turn. No undo.');
  });
});
