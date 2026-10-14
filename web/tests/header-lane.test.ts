// FUTASAKU 0.5 — the header lane's copy and priority (owner's cleanup, 2026-10-14).
//
// ONE place decides what the strip says, the words are all short, and no player-visible "live"
// wording survives (the mode is "Real time"). These are pure checks: no DOM, no network.
import { describe, expect, it } from 'vitest';
import { HEADER, HEADER_MAX, HEADER_PRIORITY, HEADER_SOURCE, LIVE, ONLINE, headerText } from '../../src/strings.js';
import { resolveHeader } from '../src/online/duel-hud.js';

describe('the header string table', () => {
  it('every header string is short (hard cap 32, aim 24)', () => {
    expect(HEADER_MAX).toBe(32);
    for (const [key, word] of Object.entries(HEADER)) {
      expect(word.length, `${key} = "${word}"`).toBeLessThanOrEqual(HEADER_MAX);
    }
    // The house target: the common words are comfortably inside 24 characters.
    for (const key of ['yourTurn', 'theirTurn', 'opponentAway', 'opponentHere', 'idle', 'finished'] as const) {
      expect(HEADER[key].length, key).toBeLessThanOrEqual(24);
    }
  });

  it('every word maps to a real slot in the priority list', () => {
    for (const [key, source] of Object.entries(HEADER_SOURCE)) {
      expect(HEADER_PRIORITY, key).toContain(source);
    }
    expect([...HEADER_PRIORITY]).toEqual(['danger', 'clock', 'turn', 'presence', 'idle']);
  });

  it('headerText is the one reader', () => {
    expect(headerText('yourTurn')).toBe(HEADER.yourTurn);
    expect(headerText('replaying')).toBe(HEADER.replaying);
  });
});

describe('the priority list decides the one message', () => {
  it('a danger message outranks the clock, the turn and presence', () => {
    const pick = resolveHeader({ danger: "Time's up", clock: true, turn: 'mine', presence: 'online' });
    expect(pick.source).toBe('danger');
    expect(pick.text).toBe("Time's up");
  });

  it('the real-time clock outranks whose turn it is', () => {
    const pick = resolveHeader({ danger: null, clock: true, turn: 'mine', presence: 'online' });
    expect(pick.source).toBe('clock');
    expect(pick.key).toBe('clock');
    expect(pick.text).toBe('');
  });

  it('whose turn it is outranks the presence line', () => {
    expect(resolveHeader({ danger: null, clock: false, turn: 'mine', presence: 'away' })).toMatchObject({ source: 'turn', key: 'yourTurn' });
    expect(resolveHeader({ danger: null, clock: false, turn: 'replaying', presence: 'away' })).toMatchObject({ source: 'turn', key: 'replaying', dots: false });
    expect(resolveHeader({ danger: null, clock: false, turn: 'theirs', presence: 'away' })).toMatchObject({ source: 'turn', key: 'theirTurn' });
    expect(resolveHeader({ danger: null, clock: false, turn: 'finished', presence: 'away' })).toMatchObject({ source: 'turn', key: 'finished' });
  });

  it('the presence line is used only when no turn word applies, and idle is last', () => {
    // A turn state always yields a word, so presence/idle are the fallbacks (an unknown turn).
    expect(resolveHeader({ danger: null, clock: false, turn: 'unknown' as never, presence: 'away' })).toMatchObject({ source: 'presence', key: 'opponentAway' });
    expect(resolveHeader({ danger: null, clock: false, turn: 'unknown' as never, presence: 'online' })).toMatchObject({ source: 'presence', key: 'opponentHere' });
    expect(resolveHeader({ danger: null, clock: false, turn: 'unknown' as never, presence: 'unknown' })).toMatchObject({ source: 'idle', key: 'idle' });
  });
});

describe('the mode is "Real time" everywhere a player can read it', () => {
  const OLD = /\b(?:go\s*live|live\s*game|live\s*duel|live\s*mode|in a live|live 60)\b/i;

  it('the LIVE table keeps no old "live" wording', () => {
    const strings = [
      LIVE.goLive,
      LIVE.goLiveAria('Fern', 60),
      LIVE.waiting('Fern', 60),
      LIVE.waitingFor('Fern'),
      LIVE.waitingShort,
      LIVE.inLiveGame,
      LIVE.rateLimited,
      LIVE.wantsToGoLive,
      LIVE.terms(60),
      LIVE.chip(60),
      LIVE.chipAria(60),
      LIVE.leaveLive,
      LIVE.leaveWarning,
      LIVE.leaveWarningHelp,
      LIVE.endedTitle,
      LIVE.rematchWaiting('Fern', 60),
      LIVE.allowChallenges,
      LIVE.failed,
    ];
    for (const text of strings) expect(text, text).not.toMatch(OLD);
  });

  it('the ONLINE first card no longer says "Play live"', () => {
    for (const line of ONLINE.firstCardLines) expect(line, line).not.toMatch(OLD);
  });
});
