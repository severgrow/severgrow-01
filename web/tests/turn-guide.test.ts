// THE TURN GUIDE (owner, 2026-11-11): "?" lives in the context key for everyone, every turn. Pressed,
// it lights the rest of THAT turn one step at a time — no window, no words:
//   Draw → the piles you may draw from; Grow → the cards you can play (+ the Bloom key when a Bloom
//   is possible); a card picked → its legal tiles; Throw → the cards you may throw. Nothing to play
//   → Skip. Not your turn → nothing.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyAs, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, State, View } from '../../src/engine/index.js';
import { turnGuideStep } from '../src/logic/turn-guide';

const until = (seed: number, pred: (v: View, legal: Action[]) => boolean, max = 200): { s: State; v: View; legal: Action[] } => {
  let s = newGame(seed);
  for (let i = 0; i < max; i++) {
    const v = viewFor(s, s.actor);
    const legal = legalActions(v);
    if (pred(v, legal)) return { s, v, legal };
    const a = legal.find((x) => x.t === 'Draw' && x.from === 'deck') ?? legal.find((x) => x.t === 'Sprout')
      ?? legal.find((x) => x.t === 'EndAct') ?? legal.find((x) => x.t === 'Discard') ?? legal[0];
    if (!a) break;
    s = applyAs(s, s.actor, a);
  }
  throw new Error(`seed ${seed}: position not reached`);
};

describe('the turn guide lights one step at a time', () => {
  it('Draw: the piles you may draw from', () => {
    const { v, legal } = until(3, (vv) => vv.phase === 'DRAW');
    const step = turnGuideStep(v, legal, null)!;
    expect(step.piles).toContain('deck');
    expect(step.piles.includes('discard')).toBe(legal.some((a) => a.t === 'Draw' && a.from === 'discard'));
    expect(step.cards).toEqual([]);
    expect(step.hexes).toEqual([]);
  });

  it('Grow: the cards you can play, and the Bloom key only when a Bloom is possible', () => {
    const { v, legal } = until(5, (vv, l) => vv.phase === 'ACT' && l.some((a) => a.t === 'Sprout'));
    const step = turnGuideStep(v, legal, null)!;
    const playable = [...new Set(legal.flatMap((a) => (a.t === 'Sprout' || a.t === 'PlayFruit' ? [a.card] : a.t === 'MegaBomb' ? a.cards : [])))];
    expect(step.cards.sort()).toEqual(playable.sort());
    expect(step.bloom).toBe(legal.some((a) => a.t === 'Bloom'));
    expect(step.hexes).toEqual([]);
    expect(step.skip).toBe(false);
  });

  it('a card picked: exactly its legal tiles', () => {
    const { v, legal } = until(5, (vv, l) => vv.phase === 'ACT' && l.some((a) => a.t === 'Sprout'));
    const card = (legal.find((a) => a.t === 'Sprout') as Extract<Action, { t: 'Sprout' }>).card;
    const step = turnGuideStep(v, legal, card)!;
    const tiles = legal.flatMap((a) => (a.t === 'Sprout' && a.card === card ? [coordKey(a.coord)] : a.t === 'PlayFruit' && a.card === card ? [coordKey(a.target)] : []));
    expect(step.hexes.sort()).toEqual([...new Set(tiles)].sort());
    expect(step.cards).toEqual([]);
  });

  it('Throw: the cards you may throw', () => {
    const { v, legal } = until(5, (vv) => vv.phase === 'DISCARD');
    const step = turnGuideStep(v, legal, null)!;
    const throwable = [...new Set(legal.flatMap((a) => (a.t === 'Discard' ? [a.card] : [])))];
    expect(step.cards.sort()).toEqual(throwable.sort());
  });

  it('nothing to play: Skip is the step', () => {
    const { v, legal } = until(5, (vv, l) => vv.phase === 'ACT' && l.some((a) => a.t === 'EndAct'));
    const only = legal.filter((a) => a.t === 'EndAct');
    const step = turnGuideStep(v, only, null)!;
    expect(step.skip).toBe(true);
    expect(step.cards).toEqual([]);
  });

  it('not my turn, or no moves yet: nothing is lit', () => {
    const { s } = until(3, (vv) => vv.phase === 'DRAW');
    const other = viewFor(s, (1 - s.actor) as 0 | 1);
    expect(turnGuideStep(other, legalActions(other), null)).toBeNull();
    const { v } = until(3, (vv) => vv.phase === 'DRAW');
    expect(turnGuideStep(v, [], null)).toBeNull();
  });
});

// OWNER DIRECTION (2026-11-12): "i dont know why its showing ? guide icon since guide should not be
// available in blitz". The "?" was wired for every turn (2026-11-11) and nothing filtered it, so it
// rode into a timed mode that already drops Undo, Match Intel and Replay. The repo never said Blitz
// had a guide; this pins the decided rule so it cannot drift back. The browser proof is in
// web/e2e/blitz.ts (in a real Blitz match the key offers no guide, at Draw and at Grow).
describe('the guide is not offered in Blitz (owner, 2026-11-12)', () => {
  const source = readFileSync(new URL('../src/player/smart-cockpit.ts', import.meta.url), 'utf8');

  it('the cockpit collects "?" only outside a Blitz match', () => {
    // The gate must be on the collection itself, not a paint-time hide: the key's glyph comes from
    // the item list, so a filtered item is the only way it can never render a dead "?".
    expect(source).toMatch(/if \(!blitzMatchOn\(\) && options\.guide\?\.available\(\)\) items\.push\(guideSource\);/);
    // ... and Blitz's own rule is the page class the one clock (practice AND live duel) writes.
    expect(source).toMatch(/const blitzMatchOn = \(\): boolean => document\.documentElement\.classList\.contains\('blitz-match'\);/);
  });

  it('the clock turning on or off repaints the key on that frame', () => {
    expect(source).toContain("import { BLITZ_CLOCK_EVENT } from '../logic/blitz-clock-event.js';");
    expect(source).toMatch(/window\.addEventListener\(BLITZ_CLOCK_EVENT, \(\) => api\.sync\(\)\);/);
  });
});
