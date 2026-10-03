// The 8 adversarial tests of the v0.5 task (Fruit, Strengthen, fair deal), with Fruit now played
// as a v0.6 Fruit card. Each names the trap it sets. (7) also has a UI half in web/tests/interaction.test.ts.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { apply, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Player, RulesConfig, State, Suit } from '../../src/engine/index.js';
import { rankActions } from '../../src/bots/GreedyBot.js';
import { LEVELS, decideLevelAction } from '../../src/bots/levels.js';
import { fixture } from '../helpers.js';

const stateWith = (o: { tiles: Record<string, [Player, number]>; hand: [Suit | null, number][]; config?: Partial<RulesConfig>; rich?: string[]; patch?: Partial<State>; player?: Player }): State => {
  const g = newGame(11, o.config);
  const f = fixture({ tiles: o.tiles, ...(o.config ? { config: o.config } : {}), ...(o.rich ? { rich: o.rich } : {}) });
  const pool = [...g.hands[0], ...g.hands[1], ...g.deck];
  const hand: Card[] = [];
  for (const [suit, rank] of o.hand) hand.push(pool.splice(pool.findIndex((c) => c.suit === suit && c.rank === rank), 1)[0]!);
  const p = o.player ?? 0;
  const otherHand = pool.splice(0, g.config.handSize);
  const hands: [Card[], Card[]] = p === 0 ? [hand, otherHand] : [otherHand, hand];
  return { ...g, board: f.board, terrain: f.terrain, hands, deck: pool, phase: 'ACT', turnPlayer: p, actor: p, ...o.patch };
};
const FRUIT: [null, number] = [null, 0];
const fruitOf = (s: State) => s.hands[s.turnPlayer].find((c) => c.suit === null)!.id;
const idOf = (s: State, suit: Suit, rank: number) => s.hands[s.turnPlayer].find((c) => c.suit === suit && c.rank === rank)!.id;

describe('v0.5 adversarial tests', () => {
  it('ADVERSARIAL 1: the old Fruit gave up my link tiles; a Fruit card gives up nothing: my whole network stays', () => {
    // P1: root (-2,2) - (-1,1) - (0,1) - (0,0); (1,1) and (1,2) hang beyond (0,1).
    const tiles: Record<string, [Player, number]> = { '-1,1': [0, 2], '0,1': [0, 2], '0,0': [0, 2], '1,1': [0, 2], '1,2': [0, 2], '1,-1': [1, 3], '1,0': [1, 3] };
    const s = stateWith({ tiles, hand: [FRUIT] });
    const fruit: Action = { t: 'PlayFruit', card: fruitOf(s), target: { q: 1, r: 0 } };
    expect(legalActions(viewFor(s, 0))).toContainEqual(fruit);
    const after = apply(s, fruit);
    for (const k of ['-1,1', '0,1', '0,0', '1,1', '1,2']) expect(after.board[k], k).toEqual({ owner: 0, strength: 2 });
    expect(after.lastResolution!.severed.some((x) => x.player === 0)).toBe(false);
    // and every level still picks a legal move, the same one each time
    for (const lv of LEVELS) expect(decideLevelAction(viewFor(s, 0), lv, 1)).toEqual(decideLevelAction(viewFor(s, 0), lv, 1));
  });

  it('ADVERSARIAL 2: the target is a top-rank tile with a long chain behind it: one Fruit removes the whole chain', () => {
    const tiles: Record<string, [Player, number]> = {
      '-1,1': [0, 2], '0,1': [0, 2], '0,0': [0, 2],
      '1,-1': [1, 9], '0,-1': [1, 5], '-1,0': [1, 5], '-2,0': [1, 5], '-3,0': [1, 5], '-1,-1': [1, 5],
    };
    // P2's chain runs (1,-1)=9 -> (0,-1) -> (-1,0) -> (-2,0) -> (-3,0) and (-1,-1); all of it hangs on the 9
    const s = stateWith({ tiles, hand: [FRUIT] });
    const after = apply(s, { t: 'PlayFruit', card: fruitOf(s), target: { q: 1, r: -1 } });
    for (const k of ['1,-1', '0,-1', '-1,0', '-2,0', '-3,0', '-1,-1']) expect(after.board[k], k).toBeNull();
    // and the full-evaluation bot rates it well: it removes a 9 and the 5 tiles behind it
    const ranked = rankActions(viewFor(s, 0));
    const fr = ranked.findIndex((x) => x.action.t === 'PlayFruit' && coordKey(x.action.target) === '1,-1');
    expect(fr).toBeLessThanOrEqual(1);
    expect(ranked[fr]!.score).toBeGreaterThan(1);
  });

  it('ADVERSARIAL 3: Fruit cannot cause a Strangle by itself (it only empties hexes), but it can free my own nearly strangled root', () => {
    // Their root (2,-2): five ring hexes are mine, the sixth (2,-1) holds their own tile.
    const ring: Record<string, [Player, number]> = { '3,-2': [0, 2], '3,-3': [0, 2], '2,-3': [0, 2], '1,-2': [0, 2], '1,-1': [0, 2], '2,-1': [1, 3] };
    const trio: Record<string, [Player, number]> = { '0,-1': [0, 2], '0,0': [0, 2], '-1,1': [0, 2], '1,0': [0, 2] };
    const s = stateWith({ tiles: { ...ring, ...trio }, hand: [FRUIT] });
    // remove their ring tile (2,-1)
    const fr: Action = { t: 'PlayFruit', card: fruitOf(s), target: { q: 2, r: -1 } };
    expect(legalActions(viewFor(s, 0))).toContainEqual(fr);
    const after = apply(s, fr);
    expect(after.board['2,-1']).toBeNull();
    // the hex is now empty, not blocked: no Strangle, the game goes on
    expect(after.phase).toBe('ACT');
    expect(after.result).toBeNull();

    // My root (-2,2) has five of its six neighbours held by their chain; one more and I lose.
    const chain: Record<string, [Player, number]> = {
      '1,-1': [1, 9], '0,-1': [1, 9], '-1,0': [1, 9], '-2,1': [1, 9], '-3,2': [1, 9], '-3,3': [1, 9], '-2,3': [1, 9], '-1,2': [1, 9],
    };
    const mine = stateWith({ tiles: { '-1,1': [0, 2], '0,1': [0, 2], '0,0': [0, 2], ...chain }, hand: [FRUIT] });
    const free = apply(mine, { t: 'PlayFruit', card: fruitOf(mine), target: { q: -2, r: 1 } });
    // removing my strangler's link cuts off the four 9s round my root as well
    for (const k of ['-2,1', '-3,2', '-3,3', '-2,3', '-1,2']) expect(free.board[k], k).toBeNull();
    expect(free.phase).toBe('ACT');
  });

  it('ADVERSARIAL 4: Fruit on the last turn before the deck runs out: it resolves, then the game ends on the refill', () => {
    const tiles: Record<string, [Player, number]> = { '-1,1': [0, 2], '0,1': [0, 2], '0,0': [0, 2], '1,1': [0, 2], '1,-1': [1, 9], '1,0': [1, 9], '2,0': [1, 5], '3,-1': [1, 5] };
    const base = stateWith({ tiles, hand: [FRUIT, [1, 1]] });
    const s: State = { ...base, discard: [...base.discard, ...base.deck.slice(1)], deck: base.deck.slice(0, 1) };
    let g = apply(s, { t: 'PlayFruit', card: fruitOf(s), target: { q: 1, r: 0 } });
    expect(g.board['1,0']).toBeNull();
    g = apply(g, { t: 'EndAct' });
    g = apply(g, { t: 'Discard', card: g.hands[0][0]!.id });
    expect(g.phase).toBe('GAME_OVER');
    expect(g.result!.reason).toBe('deck_exhaustion');
    // the Fruit card's result counts in the final score
    expect(g.result!.scores[1]).toBe(1); // only (1,-1) is left of theirs
  });

  it('ADVERSARIAL 5: upgrading the last tile of a chain just before the bot can overgrow it: afterwards no card of theirs can', () => {
    // my chain ends at (1,0)=5, touching their (2,-1)
    const tiles: Record<string, [Player, number]> = { '-1,1': [0, 4], '0,0': [0, 4], '1,0': [0, 5], '2,-1': [1, 3] };
    const s = stateWith({ tiles, hand: [[0, 9]] });
    // before: their 6, 7, 8 or 9 could take it
    const theirs = stateWith({ tiles, hand: [[1, 8], [2, 6]], player: 1 });
    expect(legalActions(viewFor(theirs, 1)).some((a) => a.t === 'Sprout' && coordKey(a.coord) === '1,0')).toBe(true);
    const after = apply(s, { t: 'Sprout', card: idOf(s, 0, 9), coord: { q: 1, r: 0 } });
    const next: State = { ...theirs, board: after.board };
    expect(legalActions(viewFor(next, 1)).some((a) => a.t === 'Sprout' && coordKey(a.coord) === '1,0')).toBe(false);
    // and the full-evaluation bot sees the threat: it strengthens the exposed tile
    const r = rankActions(viewFor(s, 0)).find((x) => x.facts.kind === 'strengthen' && coordKey((x.action as { coord: { q: number; r: number } }).coord) === '1,0')!;
    expect(r.score).toBeGreaterThan(0);
  });

  it('ADVERSARIAL 6: a Strengthen followed by a Fruit on that tile: the 9 still falls, and Strengthen did not count as protection', () => {
    const tiles: Record<string, [Player, number]> = { '-1,1': [0, 2], '0,1': [0, 2], '0,0': [0, 2], '1,-1': [1, 5], '1,0': [1, 3] };
    // the bot (P2) strengthens (1,0) from 3 to 9 ...
    const bot = stateWith({ tiles, hand: [[0, 9]], player: 1 });
    const strong = apply(bot, { t: 'Sprout', card: idOf(bot, 0, 9), coord: { q: 1, r: 0 } });
    expect(strong.board['1,0']).toEqual({ owner: 1, strength: 9 });
    // ... and on my turn my Fruit card removes it anyway
    const card = [...strong.deck, ...strong.discard].find((c) => c.suit === null)!;
    const me: State = { ...strong, hands: [[card, ...strong.hands[0]], strong.hands[1]], turnPlayer: 0, actor: 0, phase: 'ACT', sproutsThisTurn: 0 };
    const after = apply(me, { t: 'PlayFruit', card: card.id, target: { q: 1, r: 0 } });
    expect(after.board['1,0']).toBeNull();
  });

  it('ADVERSARIAL 7: a card that is both a legal new Sprout and a legal Strengthen: both are listed separately and every bot level chooses deliberately (the same choice every time)', () => {
    const tiles: Record<string, [Player, number]> = { '-1,1': [0, 3], '0,0': [0, 3], '1,-1': [1, 6], '1,0': [1, 2] };
    const s = stateWith({ tiles, hand: [[0, 8]] });
    const id = idOf(s, 0, 8);
    const legal = legalActions(viewFor(s, 0));
    expect(legal).toContainEqual({ t: 'Sprout', card: id, coord: { q: 0, r: 0 } }); // Strengthen my 3
    expect(legal).toContainEqual({ t: 'Sprout', card: id, coord: { q: 1, r: 0 } }); // take their 2
    expect(legal).toContainEqual({ t: 'Sprout', card: id, coord: { q: -1, r: 0 } }); // grow on empty
    for (const lv of LEVELS) {
      const a = decideLevelAction(viewFor(s, 0), lv, 42);
      const b = decideLevelAction(viewFor(s, 0), lv, 42);
      expect(a).toEqual(b);
    }
    // the full evaluation scores each use on its merits: taking their 6 (a blocker) comes
    // first, the Strengthen is scored separately with a reason, and every level is consistent
    const ranked = rankActions(viewFor(s, 0));
    expect(ranked[0]!.action).toEqual({ t: 'Sprout', card: id, coord: { q: 1, r: -1 } });
    const st = ranked.find((x) => x.facts.kind === 'strengthen' && coordKey((x.action as { coord: { q: number; r: number } }).coord) === '0,0')!;
    expect(st.facts.kind === 'strengthen' && st.facts.reason.length > 0).toBe(true);
  });

  it('ADVERSARIAL 8: the same seed gives an identical deal in a separate process, and the statistical shuffle test passes', () => {
    const out = execFileSync('npx', ['tsx', 'tests/fixtures/make-deals.ts', '--print'], { encoding: 'utf8' });
    const separate = JSON.parse(out.trim().split('\n').at(-1)!) as string[];
    const recorded = (JSON.parse(readFileSync(new URL('../fixtures/deals.json', import.meta.url), 'utf8')) as { deals: string[] }).deals;
    expect(separate).toEqual(recorded);
    // the 120,000-shuffle uniformity test lives in fairness.test.ts ("(b) ...") and runs in the same suite
  }, 60_000);
});
