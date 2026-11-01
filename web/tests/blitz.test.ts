import { describe, expect, it } from 'vitest';
import {
  BLITZ_DEFAULT, BLITZ_DROP_BOT_LEVEL, BLITZ_FIRST_MAP, BLITZ_KEY, BLITZ_LAST_MAP, BLITZ_MAPS,
  BLITZ_TURN_MS, blitzAfterGame, blitzDeadlineAt, blitzRemainingMs, blitzTimeoutResult, blitzTimeoutState,
  parseBlitzState, pickBlitzMap, readBlitzState, recordBlitzOutcome,
} from '../src/logic/blitz.js';
import type { BlitzState, BlitzStore } from '../src/logic/blitz.js';
import { DIFFICULTIES } from '../src/logic/difficulty.js';
import { newMatch } from '../../src/engine/index.js';

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

describe('Blitz clock', () => {
  it('is 15 seconds a turn', () => {
    expect(BLITZ_TURN_MS).toBe(15_000);
    expect(blitzDeadlineAt(1_000)).toBe(16_000);
    expect(blitzRemainingMs(16_000, 10_000)).toBe(6_000);
    expect(blitzRemainingMs(16_000, 20_000)).toBe(0);
  });

  it('a timeout ends the match as the online live timer does (a loss, reason timeout)', () => {
    const state = newMatch(4242);
    const after = blitzTimeoutState(state);
    expect(after.phase).toBe('GAME_OVER');
    expect(after.result?.winner).toBe(1);
    expect(after.result?.reason).toBe('timeout');
    // The same final score the board had, and the original state is not mutated.
    expect(after.result?.scores).toEqual(blitzTimeoutResult(state).scores);
    expect(state.phase).not.toBe('GAME_OVER');
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
