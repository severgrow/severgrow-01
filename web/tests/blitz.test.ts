import { describe, expect, it } from 'vitest';
import {
  BLITZ_DEFAULT, BLITZ_DROP_BOT_LEVEL, BLITZ_FIRST_MAP, BLITZ_KEY, BLITZ_LAST_MAP, BLITZ_MAPS,
  BLITZ_TURN_MS, blitzAfterGame, blitzClockText, blitzNextFlipIn, blitzDeadlineAt, blitzRemainingMs, blitzStage, blitzTempo, blitzTempoLine,
  blitzTick, blitzTimeoutAction, blitzTimeoutResult, blitzTimeoutState,
  parseBlitzState, pickBlitzMap, readBlitzState, recordBlitzOutcome,
} from '../src/logic/blitz.js';
import type { BlitzState, BlitzStore } from '../src/logic/blitz.js';
import { DIFFICULTIES } from '../src/logic/difficulty.js';
import { apply, newMatch, viewFor } from '../../src/engine/index.js';
import type { Card, State } from '../../src/engine/index.js';

/** The page's store is localStorage; the rule only needs get/set, so a Map is the honest fake. */
const fakeStore = (seed: Record<string, string> = {}) => {
  const data = new Map(Object.entries(seed));
  const store: BlitzStore = {
    get: (key) => data.get(key) ?? null,
    set: (key, value) => { data.set(key, value); },
  };
  return { store, data };
};

describe('Blitz ladder (the only bot rule that is not the tier carry-over)', () => {
  it('starts at bot 9 and drops to 8 only on the SECOND loss in a row', () => {
    let state = BLITZ_DEFAULT;
    expect(state).toEqual({ level: 9, losses: 0 });

    state = blitzAfterGame(state, 'loss');
    expect(state).toEqual({ level: 9, losses: 1 }); // one loss: still 9

    state = blitzAfterGame(state, 'loss');
    expect(state).toEqual({ level: 8, losses: 2 }); // two in a row: 8

    state = blitzAfterGame(state, 'loss');
    state = blitzAfterGame(state, 'loss');
    expect(state.level).toBe(8); // further losses never climb back
  });

  it('returns to 9 on a win and starts the run again', () => {
    let state: BlitzState = { level: BLITZ_DROP_BOT_LEVEL, losses: 5 };
    state = blitzAfterGame(state, 'win');
    expect(state).toEqual({ level: 9, losses: 0 });
    // ... and two fresh losses are needed again
    expect(blitzAfterGame(blitzAfterGame(state, 'loss'), 'loss')).toEqual({ level: 8, losses: 2 });
  });

  it('a draw is neither: it ends the losing run but never raises 8 back to 9', () => {
    expect(blitzAfterGame({ level: 9, losses: 1 }, 'draw')).toEqual({ level: 9, losses: 0 });
    expect(blitzAfterGame({ level: 8, losses: 4 }, 'draw')).toEqual({ level: 8, losses: 0 });
    // a single loss after that draw stays at 8 (only a WIN returns to 9)
    expect(blitzAfterGame({ level: 8, losses: 0 }, 'loss')).toEqual({ level: 8, losses: 1 });
    expect(blitzAfterGame({ level: 8, losses: 1 }, 'win')).toEqual({ level: 9, losses: 0 });
  });

  it('persists across a reload and reads junk as the default', () => {
    const { store, data } = fakeStore();
    recordBlitzOutcome(store, true, 'loss');
    recordBlitzOutcome(store, true, 'loss');
    expect(JSON.parse(data.get(BLITZ_KEY)!)).toEqual({ level: 8, losses: 2 });

    // A reload starts from the serialized value, not from a module variable.
    const reloaded = readBlitzState(store);
    expect(reloaded).toEqual({ level: 8, losses: 2 });
    // A win is persisted too, so the next page load starts at 9.
    recordBlitzOutcome(store, true, 'win');
    expect(readBlitzState(store)).toEqual({ level: 9, losses: 0 });

    expect(parseBlitzState(null)).toEqual(BLITZ_DEFAULT);
    expect(parseBlitzState('not json')).toEqual(BLITZ_DEFAULT);
    expect(parseBlitzState(JSON.stringify({ level: 12, losses: -3 }))).toEqual({ level: 9, losses: 0 });
    // Contradictory saved data can never keep the bot at 9 after two losses.
    expect(parseBlitzState(JSON.stringify({ level: 9, losses: 2 }))).toEqual({ level: 8, losses: 2 });
  });

  it('a game that is not a Blitz game never touches the Blitz key', () => {
    const { store, data } = fakeStore();
    expect(recordBlitzOutcome(store, false, 'loss')).toEqual(BLITZ_DEFAULT);
    expect(data.has(BLITZ_KEY)).toBe(false); // Easy / Medium / Hard never create it

    const seeded = fakeStore({ [BLITZ_KEY]: JSON.stringify({ level: 8, losses: 2 }) });
    recordBlitzOutcome(seeded.store, false, 'win');
    expect(JSON.parse(seeded.data.get(BLITZ_KEY)!)).toEqual({ level: 8, losses: 2 }); // untouched
  });

  it('leaves the three training tiers exactly as they were', () => {
    expect(DIFFICULTIES.map((tier) => tier.id)).toEqual(['easy', 'medium', 'hard']);
    expect(DIFFICULTIES.some((tier) => (tier.id as string) === 'pro')).toBe(false);
  });
});

// OWNER CHANGED THE RULES (0.82 Blitz remodel, 2026-11-06): "we set time to 21:00 (21 seconds but we're
// showing milliseconds too)"; at 00:00 "Turn ends, worst card thrown" (was: the match is lost). See
// docs/HANDOFF-0.82-BLITZ.md. The old timeout-loss state helpers stay for the online live duel's reason.
describe('Blitz clock', () => {
  it('is 21 seconds a turn, fresh each turn', () => {
    expect(BLITZ_TURN_MS).toBe(21_000);
    expect(blitzDeadlineAt(1_000)).toBe(22_000);
    expect(blitzRemainingMs(22_000, 10_000)).toBe(12_000);
    expect(blitzRemainingMs(22_000, 30_000)).toBe(0);
  });

  // OWNER CHANGED THE RULE (2026-11-06: "Change format of clock to 00:21 showing only seconds").
  it('reads minutes:seconds, whole seconds only (00:21 down to 00:00)', () => {
    expect(blitzClockText(21_000)).toBe('00:21');
    expect(blitzClockText(20_400)).toBe('00:21');
    expect(blitzClockText(20_000)).toBe('00:20');
    expect(blitzClockText(6_280)).toBe('00:07');
    expect(blitzClockText(999)).toBe('00:01');
    expect(blitzClockText(0)).toBe('00:00');
    expect(blitzClockText(-50)).toBe('00:00');
    expect(blitzClockText(60_000)).toBe('01:00');
  });

  // Owner, 2026-11-06: "Make sure the clock never lags never slows down and is super reliable". The clock
  // wakes exactly when the shown second changes (not every frame), and always reads a steady clock.
  it('wakes exactly when the shown second flips, never drifting', () => {
    expect(blitzNextFlipIn(21_000)).toBe(1_000);
    expect(blitzNextFlipIn(20_400)).toBe(400);
    expect(blitzNextFlipIn(1)).toBe(1);
    expect(blitzNextFlipIn(0)).toBeNull();
    expect(blitzNextFlipIn(-5)).toBeNull();
    // waking at that moment always shows the next second, whatever the start
    for (const left of [21_000, 20_999, 15_432, 5_001, 3_000, 999]) {
      const flip = blitzNextFlipIn(left)!;
      expect(blitzClockText(left - flip)).not.toBe(blitzClockText(left));
      expect(blitzClockText(left - flip + 1)).toBe(blitzClockText(left));
    }
  });

  it('pressure: calm, then amber from 5 s, red from 3 s; the last three seconds tick once each', () => {
    expect(blitzStage(21_000)).toBe('calm');
    expect(blitzStage(5_001)).toBe('calm');
    expect(blitzStage(5_000)).toBe('amber');
    expect(blitzStage(3_001)).toBe('amber');
    expect(blitzStage(3_000)).toBe('red');
    expect(blitzStage(0)).toBe('red');
    // the tick marks: one as each of 3, 2, 1 begins
    expect(blitzTick(3_100, 2_990)).toBe(3);
    expect(blitzTick(2_050, 1_990)).toBe(2);
    expect(blitzTick(1_020, 999)).toBe(1);
    expect(blitzTick(2_900, 2_100)).toBeNull();
    expect(blitzTick(5_100, 4_900)).toBeNull();
  });

  it('a timeout ends the turn: draw if needed, stop growing, throw the lowest card (a Bomb only if nothing else)', () => {
    const base = newMatch(4242);
    const c = (id: number, suit: Card['suit'], rank: number): Card => ({ id, suit, rank });
    const hand = [c(1, 0, 7), c(2, 1, 2), c(3, null, 0), c(4, 2, 5)];
    const withHand = (phase: State['phase'], cards: Card[]): State => ({ ...base, phase, actor: 0, turnPlayer: 0, hands: [cards, base.hands[1]] });
    // Draw phase: draw from the deck first
    expect(blitzTimeoutAction(viewFor(withHand('DRAW', hand), 0))).toEqual({ t: 'Draw', from: 'deck' });
    // Act phase: stop
    expect(blitzTimeoutAction(viewFor(withHand('ACT', hand), 0))).toEqual({ t: 'EndAct' });
    // Throw phase: the lowest numbered card, never the Bomb while a number card is there
    expect(blitzTimeoutAction(viewFor(withHand('DISCARD', hand), 0))).toEqual({ t: 'Discard', card: 2 });
    expect(blitzTimeoutAction(viewFor(withHand('DISCARD', [c(3, null, 0), c(5, null, 0)]), 0))).toEqual({ t: 'Discard', card: 3 });
    // Played to the end, the turn passes to the opponent and the match goes on
    let s = withHand('DRAW', hand);
    for (let i = 0; i < 5 && s.turnPlayer === 0 && s.phase !== 'GAME_OVER'; i++) s = apply(s, blitzTimeoutAction(viewFor(s, 0))!);
    expect(s.turnPlayer).toBe(1);
    expect(s.phase).not.toBe('GAME_OVER');
  });

  it('tempo: the time left at the end of each of my turns, averaged, and the fastest turn', () => {
    expect(blitzTempo([])).toBeNull();
    const t = blitzTempo([12_000, 18_500, 3_000])!;
    expect(t.turns).toBe(3);
    expect(t.averageLeftMs).toBe(11_167);
    expect(t.fastestMs).toBe(2_500); // 21 s - 18.5 s left
    expect(blitzTempoLine(t)).toBe('TEMPO 11.1 s left a turn · fastest 2.5 s');
  });

  it('the old loss-on-timeout state still exists for the online live duel (reason timeout)', () => {
    const state = newMatch(4242);
    const after = blitzTimeoutState(state);
    expect(after.phase).toBe('GAME_OVER');
    expect(after.result?.reason).toBe('timeout');
    expect(after.result?.scores).toEqual(blitzTimeoutResult(state).scores);
    expect(state.result ?? null).toBeNull();
  });
});

describe('Blitz boards come from campaign levels 30-70', () => {
  it('has the whole inclusive range, and nothing outside it', () => {
    expect(BLITZ_MAPS.length).toBe(41);
    expect(BLITZ_MAPS.map((level) => level.number)).toEqual(
      Array.from({ length: 41 }, (_, i) => 30 + i),
    );
    expect(BLITZ_MAPS[0]!.number).toBe(BLITZ_FIRST_MAP);
    expect(BLITZ_MAPS.at(-1)!.number).toBe(BLITZ_LAST_MAP);
    // Every one has an authored board, which is the map Blitz must play on.
    for (const level of BLITZ_MAPS) expect(level.config.board?.cells?.length ?? 0).toBeGreaterThan(20);
  });

  it('picks reproducibly from a seed, always inside the range, and can reach every board', () => {
    const picked = new Set<number>();
    for (let seed = 0; seed < 20_000; seed++) {
      const level = pickBlitzMap(seed);
      expect(level.number).toBeGreaterThanOrEqual(BLITZ_FIRST_MAP);
      expect(level.number).toBeLessThanOrEqual(BLITZ_LAST_MAP);
      expect(pickBlitzMap(seed).number).toBe(level.number); // same seed, same map
      picked.add(level.number);
    }
    expect(picked.size).toBe(BLITZ_MAPS.length); // no board is unreachable
  });
});
