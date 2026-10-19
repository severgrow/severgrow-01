// A dead tap answers at the hex. These tests pin the ANSWER to the engine's own state, so the
// feedback can never invent a rule: a rock says rock, the draw phase says draw, a hex no legal move
// can use says why it cannot be used (connection), and a hex that IS playable says nothing at all.
import { describe, expect, it } from 'vitest';
import { campaignOpening, CAMPAIGN_LEVELS } from '../../src/campaign/index.js';
import { apply, hexDistance, legalActions, parseKey, viewFor } from '../../src/engine/index.js';
import type { Action, View } from '../../src/engine/index.js';
import { TAP_WHY } from '../../src/strings.js';
import { EMPTY_SEL } from '../src/logic/interaction.js';
import type { Sel } from '../src/logic/interaction.js';
import { whyNotTap } from '../src/logic/tap-why.js';
import { playGame } from './ui-helpers.js';

const sel = (card: number | null = null, kind: string | null = null): Sel => ({ ...EMPTY_SEL, card, kind });

/** An ACT view of mine, with the legal list read from the engine. */
const actView = (): { v: View; legal: Action[] } => {
  let out: { v: View; legal: Action[] } | null = null;
  for (let seed = 1; seed < 40 && !out; seed++) {
    playGame(seed, ({ after }) => {
      if (out || after.phase !== 'ACT' || after.actor !== 0) return;
      const v = viewFor(after, 0);
      out = { v, legal: legalActions(v) };
    });
  }
  if (!out) throw new Error('no ACT position found');
  return out;
};

/** The first campaign level, opened and drawn from: my home on the board, phase ACT, my turn. */
const openingAfterDraw = (): { v: View; home: string; ring: string | null } => {
  const level = CAMPAIGN_LEVELS[0]!;
  let s = campaignOpening(level);
  const draw = legalActions(viewFor(s, s.actor)).find((a) => a.t === 'Draw' && a.from === 'deck');
  if (!draw) throw new Error('level 1 opens without a draw');
  s = apply(s, draw);
  const v = viewFor(s, 0);
  expect(v.phase).toBe('ACT');
  const home = Object.entries(v.board).find(([, t]) => t?.root && t.owner === 0)?.[0];
  if (!home) throw new Error('no home on the board');
  const [hq, hr] = home.split(',').map(Number) as [number, number];
  const DIRS: readonly (readonly [number, number])[] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const ring = DIRS
    .map(([dq, dr]) => `${hq + dq},${hr + dr}`)
    .find((k) => k in v.board && !v.board[k] && v.terrain[k] !== 'rock') ?? null;
  return { v, home, ring };
};

describe('a tap that can do nothing says why', () => {
  it('a rock says BLOCKED BY ROCK, whatever is picked', () => {
    const level = CAMPAIGN_LEVELS.find((l) => l.number === 3)!; // one authored rock
    const rock = level.config.board!.rock[0]!;
    const v = viewFor(campaignOpening(level), 0);
    expect(whyNotTap(v, legalActions(v), EMPTY_SEL, rock)).toBe(TAP_WHY.rock);
    expect(whyNotTap(v, legalActions(v), sel(42), rock)).toBe(TAP_WHY.rock);
  });

  it('the board before the draw says DRAW FIRST, not "pick a card"', () => {
    const level = CAMPAIGN_LEVELS.find((l) => l.number === 1)!;
    const v = viewFor(campaignOpening(level), 0);
    expect(v.phase).toBe('DRAW');
    const empty = Object.keys(v.board).find((k) => k !== '0,0' && !v.board[k])!;
    expect(whyNotTap(v, legalActions(v), EMPTY_SEL, empty)).toBe(TAP_WHY.draw);
  });

  it('a hex no legal move can use, away from my network, says CONNECT TO YOUR TREE', () => {
    const { v, home } = openingAfterDraw();
    const mine = Object.entries(v.board)
      .filter(([, t]) => t?.owner === 0)
      .map(([k]) => parseKey(k));
    const far = Object.keys(v.board).find((k) =>
      !v.board[k] && v.terrain[k] !== 'rock' && mine.every((m) => hexDistance(m, parseKey(k)) > 1));
    expect(far, 'the opening board has a hex away from my tree').toBeTruthy();
    expect(whyNotTap(v, [], EMPTY_SEL, far!)).toBe(TAP_WHY.connect);
    expect(home).toBeTruthy();
  });

  it('next to my own tree says which thing to pick, not "connect"', () => {
    const { v, ring } = openingAfterDraw();
    expect(ring, 'the opening home has an empty neighbour').toBeTruthy();
    expect(whyNotTap(v, [], EMPTY_SEL, ring!)).toBe(TAP_WHY.pick);
    expect(whyNotTap(v, [], sel(42), ring!)).toBe(TAP_WHY.target);
  });

  it('a hex a legal move CAN use says nothing, so the tap is never talked over', () => {
    const { v, legal } = actView();
    const target = legal.find((a) => a.t === 'Sprout');
    expect(target).toBeTruthy();
    if (target?.t !== 'Sprout') return;
    expect(whyNotTap(v, legal, EMPTY_SEL, `${target.coord.q},${target.coord.r}`)).toBeNull();
  });

  it('a tile is tapped to inspect it, never scolded', () => {
    const { v, legal } = actView();
    const tile = Object.entries(v.board).find(([, t]) => !!t)?.[0];
    expect(tile).toBeTruthy();
    expect(whyNotTap(v, legal, EMPTY_SEL, tile!)).toBeNull();
  });

  it('painting a Bloom has its own undo gesture: a stray tap is not lectured', () => {
    const { v, legal } = actView();
    const empty = Object.keys(v.board).find((k) => !v.board[k] && v.terrain[k] !== 'rock')!;
    expect(whyNotTap(v, legal, sel(null, 'bloom-3-4.9.17'), empty)).toBeNull();
  });
});
