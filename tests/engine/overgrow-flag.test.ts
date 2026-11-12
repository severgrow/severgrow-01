// allowOvergrow: the rule that says whether a stronger tile may take an enemy non-root tile.
// It is ON in every existing rule set and every existing mode; only a level that has not taught
// "taking their tile" yet (level 1) turns it off. These tests pin both halves: the default stays
// exactly as before, and off blocks every growth path (Sprout AND Bloom), not just the Grow button.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  apply,
  claimBlocker,
  coordKey,
  legalActions,
  newGame,
  planBloom,
  planSprout,
  resolveConfig,
  viewFor,
} from '../../src/engine/index.js';
import type { Card, Player, RulesConfig, State, Suit } from '../../src/engine/index.js';
import { card, chain, codeOf, fixture } from '../helpers.js';

const ENEMY = '-1,1';
const EMPTY = '-2,1';

/** A state at P1's ACT step with a hand-built board (real cards moved out of the deal). */
const stateWith = (o: {
  tiles: Record<string, [Player, number]>;
  hand: [Suit | null, number][];
  config?: Partial<RulesConfig>;
  patch?: Partial<State>;
}): State => {
  const g = newGame(7, o.config);
  const f = fixture({ tiles: o.tiles, ...(o.config ? { config: o.config } : {}) });
  const pool = [...g.hands[0], ...g.hands[1], ...g.deck];
  const hand: Card[] = [];
  for (const [suit, rank] of o.hand) {
    const i = pool.findIndex((c) => c.suit === suit && c.rank === rank);
    if (i < 0) throw new Error('no such card left');
    hand.push(pool.splice(i, 1)[0]!);
  }
  const other = pool.splice(0, g.config.handSize);
  return { ...g, board: f.board, terrain: f.terrain, hands: [hand, other], deck: pool, phase: 'ACT', ...o.patch };
};

const sproutOn = (s: State, key: string) =>
  legalActions(viewFor(s, 0)).filter((a) => a.t === 'Sprout' && coordKey(a.coord) === key);

describe('allowOvergrow', () => {
  it('defaults ON, so every existing mode and rules version keeps taking tiles exactly as before', () => {
    expect(DEFAULT_CONFIG.allowOvergrow).toBe(true);
    expect(resolveConfig().allowOvergrow).toBe(true);
    expect(resolveConfig({ allowOvergrow: false }).allowOvergrow).toBe(false);
    expect(codeOf(() => resolveConfig({ allowOvergrow: 'yes' as never }))).toBe('INVALID_BOOLEAN');
  });

  it('on: a stronger card may still overgrow a weaker enemy tile (the unchanged rule)', () => {
    const f = fixture({ tiles: { [ENEMY]: [1, 3] } });
    expect(claimBlocker(f, 0, { q: -1, r: 1 }, 9)).toBeNull();
    expect(claimBlocker(f, 0, { q: -1, r: 1 }, 2)).toBe('NOT_STRONGER');
  });

  it('a config saved before the key existed still overgrows: only an explicit false withholds it', () => {
    const f = fixture({ tiles: { [ENEMY]: [1, 3] } });
    const legacyConfig = { ...f.config } as Partial<RulesConfig>;
    delete legacyConfig.allowOvergrow;
    const legacy = { board: f.board, terrain: f.terrain, config: legacyConfig as RulesConfig };
    expect(claimBlocker(legacy, 0, { q: -1, r: 1 }, 9)).toBeNull();
  });

  it('off: their non-root tile is closed even to a stronger card, with its own reason', () => {
    const f = fixture({ tiles: { [ENEMY]: [1, 3] }, config: { allowOvergrow: false } });
    expect(claimBlocker(f, 0, { q: -1, r: 1 }, 9)).toBe('OVERGROW_FORBIDDEN');
  });

  it('off: Sprout cannot land on their tile, but still grows on empty ground and strengthens my own', () => {
    const off = fixture({ tiles: { [ENEMY]: [1, 3], '-1,2': [0, 2] }, config: { allowOvergrow: false } });
    const hand = [card(1, 0, 9)];
    expect(codeOf(() => planSprout(off, 0, hand, 1, { q: -1, r: 1 }))).toBe('OVERGROW_FORBIDDEN');
    // empty, touching my root: still a normal Grow
    expect(planSprout(off, 0, hand, 1, { q: -2, r: 1 }).tiles).toEqual([{ coord: { q: -2, r: 1 }, strength: 9 }]);
    // my own weaker tile: still a Strengthen
    expect(planSprout(off, 0, hand, 1, { q: -1, r: 2 }).strengthen).toEqual({ from: 2 });

    // The root and my own tiles are unaffected by the flag.
    expect(claimBlocker(off, 0, { q: 2, r: -2 }, 9)).toBe('ROOT_IMMUNE');
    expect(claimBlocker(off, 0, { q: -1, r: 2 }, 9)).toBe('OWN_TILE');
  });

  it('off: Bloom cannot take their ground either (the trap: this is not only the Grow button)', () => {
    const cards = [card(1, 0, 3), card(2, 0, 4), card(3, 0, 5)];
    const ids = cards.map((c) => c.id);
    const hexes = chain({ q: -1, r: 1 }, 1, 3); // -1,1 · 0,0 · 1,-1
    const tiles: Record<string, [Player, number]> = {
      '-1,1': [1, 1],
      '0,0': [1, 1],
      '1,-1': [1, 1],
      '0,1': [0, 9], // my anchor, so the cluster touches my network
    };
    expect(planBloom(fixture({ tiles }), 0, cards, ids, hexes).tiles).toHaveLength(3);
    expect(codeOf(() => planBloom(fixture({ tiles, config: { allowOvergrow: false } }), 0, cards, ids, hexes))).toBe('OVERGROW_FORBIDDEN');
  });

  it('off: legalActions lists no growth onto their tile, and apply refuses a forced one', () => {
    // P1 root -2,2; their 3 at -1,1 (touching my root), my 2 at -1,2.
    const s = stateWith({ tiles: { [ENEMY]: [1, 3], '-1,2': [0, 2] }, hand: [[0, 9], [1, 1]], config: { allowOvergrow: false } });
    expect(sproutOn(s, ENEMY)).toHaveLength(0);
    expect(sproutOn(s, EMPTY).length).toBeGreaterThan(0);
    expect(sproutOn(s, '-1,2').length).toBeGreaterThan(0); // Strengthen on mine
    const bloom = legalActions(viewFor(s, 0)).filter((a) => a.t === 'Bloom' && a.hexes.some((h) => coordKey(h) === ENEMY));
    expect(bloom).toHaveLength(0);
    expect(codeOf(() => apply(s, { t: 'Sprout', card: s.hands[0].find((c) => c.rank === 9)!.id, coord: { q: -1, r: 1 } }))).toBe('OVERGROW_FORBIDDEN');
    // The same position with the rule on DOES offer the take, so this is the flag and nothing else.
    const on = stateWith({ tiles: { [ENEMY]: [1, 3], '-1,2': [0, 2] }, hand: [[0, 9], [1, 1]] });
    expect(sproutOn(on, ENEMY).length).toBeGreaterThan(0);
  });
});
