import { describe, expect, it } from 'vitest';
import {
  ConfigError,
  DEFAULT_CONFIG,
  allCoords,
  coordKey,
  createCards,
  generateTerrain,
  newGame,
  resolveConfig,
  shuffleDeck,
} from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';
import { LEGACY_V03 } from '../legacy.js';

const allCards = (s: State) => [...s.hands[0], ...s.hands[1], ...s.deck, ...s.discard];

describe('newGame', () => {
  const s = newGame(42);

  it('starts with P1 to draw on turn 1', () => {
    expect(s.phase).toBe('DRAW');
    expect(s.turnPlayer).toBe(0);
    expect(s.actor).toBe(0);
    expect(s.turnNumber).toBe(1);
    expect(s.drawnFromDiscard).toBeNull();
    expect(s.fruitUsed).toEqual([0, 0]);
    expect(s.finalTurn).toBeNull();
    expect(s.rotPick).toBeNull();
    expect(s.result).toBeNull();
    expect(s.lastResolution).toBeNull();
    expect(s.seed).toBe(42);
  });

  it('stores the resolved config', () => {
    expect(s.config).toEqual(DEFAULT_CONFIG);
    expect(newGame(1, { rotThreshold: 18 }).config.rotThreshold).toBe(18);
  });

  it('deals handSize to P1 then P2, flips one discard, rest is the deck (first deal, legacy deck)', () => {
    const l = newGame(42, LEGACY_V03);
    const shuffled = shuffleDeck(createCards(l.config), 42);
    expect(l.hands[0]).toEqual(shuffled.slice(0, 7));
    expect(l.hands[1]).toEqual(shuffled.slice(7, 14));
    expect(l.discard).toEqual([shuffled[14]]);
    expect(l.deck).toEqual(shuffled.slice(15));
    expect(l.deck).toHaveLength(72 - 15);
  });

  it('the dealt cards come from the one shuffle of the game seed', () => {
    const shuffled = shuffleDeck(createCards(s.config), 42);
    expect(s.hands[0]).toEqual(shuffled.slice(0, 7));
    expect(s.deck).toEqual(shuffled.slice(15));
    expect(s.deck).toHaveLength(4 * s.config.maxRank * 2 - 15);
  });

  it('conserves every card exactly once', () => {
    const ids = allCards(s).map((c) => c.id).sort((a, b) => a - b);
    expect(ids).toEqual(Array.from({ length: createCards(s.config).length }, (_, i) => i));
  });

  it('uses the generated terrain', () => {
    expect(s.terrain).toEqual(generateTerrain(42, s.config));
  });

  it('has every board hex as a key, empty except both roots', () => {
    expect(Object.keys(s.board).sort()).toEqual(allCoords(3).map(coordKey).sort());
    expect(s.board['-2,2']).toEqual({ owner: 0, strength: 0, root: true });
    expect(s.board['2,-2']).toEqual({ owner: 1, strength: 0, root: true });
    const occupied = Object.entries(s.board).filter(([, t]) => t !== null);
    expect(occupied).toHaveLength(2);
  });

  it('places corner roots when configured', () => {
    const c = newGame(42, { rootStyle: 'corner' });
    expect(c.board['-3,3']).toEqual({ owner: 0, strength: 0, root: true });
    expect(c.board['3,-3']).toEqual({ owner: 1, strength: 0, root: true });
    expect(c.board['-2,2']).toBeNull();
  });

  it('roots sit on normal terrain', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const rootStyle of ['ring2', 'corner'] as const) {
        const g = newGame(seed, { rootStyle });
        for (const [k, t] of Object.entries(g.board)) {
          if (t?.root) expect(g.terrain[k]).toBe('normal');
        }
      }
    }
  });

  it('honours handSize and copiesPerCard', () => {
    const g = newGame(7, { handSize: 5, copiesPerCard: 1 });
    expect(g.hands[0]).toHaveLength(5);
    expect(g.hands[1]).toHaveLength(5);
    expect(g.discard).toHaveLength(1);
    expect(g.deck).toHaveLength(4 * g.config.maxRank * 1 - 11);
  });

  it('is deterministic: same seed gives byte-identical state', () => {
    expect(JSON.stringify(newGame(2024))).toBe(JSON.stringify(newGame(2024)));
  });

  it('differs across seeds', () => {
    expect(JSON.stringify(newGame(1))).not.toBe(JSON.stringify(newGame(2)));
  });

  it('is plain JSON (survives a round-trip unchanged)', () => {
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    const walk = (v: unknown): void => {
      if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v !== null && typeof v === 'object') {
        expect(Object.getPrototypeOf(v)).toBe(Object.prototype);
        Object.values(v).forEach(walk);
      } else expect(['string', 'boolean', 'object']).toContain(typeof v);
    };
    walk(s);
  });

  it('shares no references between games or with the defaults', () => {
    const a = newGame(3);
    const b = newGame(3);
    expect(a.config).not.toBe(DEFAULT_CONFIG);
    expect(a.config).not.toBe(b.config);
    expect(a.board['-2,2']).not.toBe(b.board['-2,2']);
  });

  it('does not mutate the config overrides', () => {
    const o = { rotStep: 6 };
    newGame(1, o);
    expect(o).toEqual({ rotStep: 6 });
  });

  it('validates the config', () => {
    expect(() => newGame(1, { richCount: 4 })).toThrow(ConfigError);
    expect(() => newGame(1, { rockCount: 3 })).toThrow(ConfigError);
    expect(() => newGame(1, { handSize: 2 })).toThrow(ConfigError);
  });

  it('rejects non-integer seeds', () => {
    expect(() => newGame(1.5)).toThrow(ConfigError);
    expect(() => newGame(Number.NaN)).toThrow(ConfigError);
  });

  it('accepts any 32-bit integer seed, including negatives', () => {
    expect(() => newGame(-7)).not.toThrow();
    expect(() => newGame(0xffffffff)).not.toThrow();
  });

  it('terrain and deck use independent streams', () => {
    const a = newGame(10);
    const b = newGame(10, { handSize: 6 });
    expect(a.terrain).toEqual(b.terrain);
    expect(a.config).toEqual(resolveConfig());
  });
});
