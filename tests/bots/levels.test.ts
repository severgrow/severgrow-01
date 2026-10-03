// Bot levels 1-9 (v0.5). Level 7 is the original GreedyBot, unchanged.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RULES_VERSIONS, apply, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import { chooseLevelAction as chooseV05 } from '../../src/bots/v05/levels.js';
import type { Action, State, View } from '../../src/engine/index.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { LEVELS, LEVEL_CONFIGS, botSeed, chooseLevelAction } from '../../src/bots/levels.js';

/** Up to `n` positions (any actor) from GreedyBot games. */
const positions = (n: number): State[] => {
  const out: State[] = [];
  for (let seed = 1; out.length < n; seed++) {
    let s = newGame(seed);
    while (s.phase !== 'GAME_OVER' && out.length < n) {
      out.push(s);
      s = apply(s, GreedyBot.chooseAction(viewFor(s, s.actor)));
    }
  }
  return out;
};
const seedFor = (s: State, level: number) => botSeed(s.seed, level, s.turnNumber, s.history?.length ?? 0);

describe('bot levels: setup', () => {
  it('there are 9 levels, each a small config', () => {
    expect(LEVELS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const l of LEVELS) {
      const c = LEVEL_CONFIGS[l];
      for (const k of ['mistakeRate', 'topN', 'skipGrowth', 'dangerWeight', 'cardDenial', 'lookahead', 'searchIterations'] as const) expect(c, `${l}.${k}`).toHaveProperty(k);
      expect(c.mistakeRate).toBeGreaterThanOrEqual(0);
      expect(c.mistakeRate).toBeLessThanOrEqual(1);
    }
  });

  it('botSeed depends on every input and nothing else', () => {
    const a = botSeed(1, 5, 3, 10);
    expect(botSeed(1, 5, 3, 10)).toBe(a);
    for (const b of [botSeed(2, 5, 3, 10), botSeed(1, 6, 3, 10), botSeed(1, 5, 4, 10), botSeed(1, 5, 3, 11)]) expect(b).not.toBe(a);
    expect(Number.isInteger(a) && a >= 0 && a < 2 ** 32).toBe(true);
  });
});

describe('level 7 is the original bot, move for move', () => {
  it('same move as GreedyBot in 1,000 positions', () => {
    for (const s of positions(1000)) {
      const v = viewFor(s, s.actor);
      expect(chooseLevelAction(v, 7, seedFor(s, 7))).toEqual(GreedyBot.chooseAction(v));
    }
  }, 180_000); // about 60s of work on a busy CI runner: its own time limit, the checks unchanged

  it('the frozen bots-v0.5 level 7 replays the recorded v0.4 golden games exactly on rules v0.4-defaults-2', () => {
    const fixture = JSON.parse(readFileSync(new URL('../fixtures/golden-v04.json', import.meta.url), 'utf8')) as { games: { seed: number; actions: Action[] }[] };
    for (const g of fixture.games) {
      let s = newGame(g.seed, RULES_VERSIONS['v0.4-defaults-2']);
      for (const a of g.actions) {
        expect(chooseV05(viewFor(s, s.actor), 7, seedFor(s, 7))).toEqual(a);
        s = apply(s, a);
      }
    }
  });
});

describe('every level is legal and deterministic', () => {
  const states = positions(1000);
  for (const level of LEVELS) {
    // Level 9 searches, so it gets a smaller (but still large) sample to keep CI quick.
    const sample = level >= 8 ? states.filter((_, i) => i % 5 === 0) : states;
    it(`level ${level}: same inputs give the same legal action (${sample.length} positions)`, () => {
      for (const s of sample) {
        const v = viewFor(s, s.actor);
        const seed = seedFor(s, level);
        const a = chooseLevelAction(v, level, seed);
        expect(legalActions(v)).toContainEqual(a);
        expect(chooseLevelAction(v, level, seed)).toEqual(a);
      }
    }, 600_000);
  }

  it('the weaker levels really do vary with the seed (they make mistakes)', () => {
    const s = positions(400).filter((x) => x.phase === 'ACT' && legalActions(viewFor(x, x.actor)).length > 3);
    let differs = 0;
    for (const x of s.slice(0, 80)) {
      const v = viewFor(x, x.actor);
      if (JSON.stringify(chooseLevelAction(v, 1, 1)) !== JSON.stringify(chooseLevelAction(v, 1, 2))) differs++;
    }
    expect(differs).toBeGreaterThan(5);
  });
});

describe('bot levels: adversarial', () => {
  const at = (pred: (s: State) => boolean): State => positions(3000).find(pred)!;

  it('ADVERSARIAL 1: when the only legal move is a discard, every level discards', () => {
    const s = at((x) => x.phase === 'DISCARD' && legalActions(viewFor(x, x.actor)).length === 1);
    for (const l of LEVELS) expect(chooseLevelAction(viewFor(s, s.actor), l, 7)).toEqual(legalActions(viewFor(s, s.actor))[0]);
  });

  it('ADVERSARIAL 2: a bot with an empty hand ends its turn at every level', () => {
    const s = at((x) => x.phase === 'ACT');
    const empty: State = { ...s, hands: s.actor === 0 ? [[], s.hands[1]] : [s.hands[0], []] };
    const v = viewFor(empty, empty.actor);
    expect(legalActions(v)).toEqual([{ t: 'EndAct' }]);
    for (const l of LEVELS) expect(chooseLevelAction(v, l, 3)).toEqual({ t: 'EndAct' });
  });

  it('ADVERSARIAL 3: level 9 with one legal move returns it without searching', () => {
    const s = at((x) => legalActions(viewFor(x, x.actor)).length === 1);
    const v = viewFor(s, s.actor);
    expect(chooseLevelAction(v, 9, 1)).toEqual(legalActions(v)[0]);
  });

  it('ADVERSARIAL 4: a finished game has no move: a clear error, not a wrong move', () => {
    let s = newGame(2);
    while (s.phase !== 'GAME_OVER') s = apply(s, GreedyBot.chooseAction(viewFor(s, s.actor)));
    for (const l of LEVELS) expect(() => chooseLevelAction(viewFor(s, s.actor), l, 1)).toThrow(/no legal/);
  });

  it('ADVERSARIAL 5: levels 8 and 9 never read hidden cards (same view, different hidden cards, same move)', () => {
    // Only positions where the deck holds enough cards for a full swap (else the deck size changes).
    const states = positions(600)
      .filter((x) => x.phase === 'ACT' && x.turnNumber > 4 && x.deck.length >= x.hands[x.actor === 0 ? 1 : 0].length)
      .slice(0, 25);
    expect(states.length).toBe(25);
    for (const s of states) {
      const opp = s.actor === 0 ? 1 : 0;
      // Swap the opponent's hand with the top of the deck: the bot's view is identical.
      const n = s.hands[opp].length;
      const pool = [...s.hands[opp], ...s.deck];
      const swapped: State = { ...s, hands: opp === 0 ? [pool.slice(n, 2 * n), s.hands[1]] : [s.hands[0], pool.slice(n, 2 * n)], deck: [...pool.slice(0, n), ...pool.slice(2 * n)] };
      const v1: View = viewFor(s, s.actor);
      const v2: View = viewFor(swapped, s.actor);
      expect(v2).toEqual(v1);
      for (const l of [8, 9] as const) expect(chooseLevelAction(v2, l, 42)).toEqual(chooseLevelAction(v1, l, 42));
    }
  }, 600_000);
});
