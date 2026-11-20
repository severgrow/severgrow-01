// v0.7 Step 9: the adversarial tests that live in the page logic (8, 9, 11, 12 of the 12;
// 1-7 are in tests/engine/bloom-adversarial.test.ts; 10, rotating mid-paint, is a browser test).
import { describe, expect, it } from 'vitest';
import { DIRECTIONS, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Card, Player, State, Suit } from '../../src/engine/index.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { EMPTY_SEL, kindOf, tapKind } from '../src/logic/interaction.js';
import { comboFor, hexesAlong, paintEnter, pixelOf } from '../src/logic/draw.js';
import { MAX_HAND, MIN_SLICE, TOUCH_MIN, computeLayout, overlaps } from '../src/logic/layout.js';
import { landmarkBox } from '../src/logic/landmark.js';
import type { LandmarkKind } from '../src/logic/landmark.js';
import { setOrient } from '../src/logic/orient.js';
import type { Orient } from '../src/logic/orient.js';
import { centerOf } from '../src/ui/geom.js';
import { decodeSave, encodeSave } from '../src/logic/persist.js';
import { Session } from '../src/logic/session.js';
import { fixture } from '../../tests/helpers.js';

const stateWith = (tiles: Record<string, [Player, number]>, hand: [Suit, number][], rock: string[] = []): State => {
  const g = newGame(5);
  const f = fixture({ tiles, rock });
  const pool = [...g.hands[0], ...g.hands[1], ...g.deck].filter((c) => c.suit !== null);
  const h: Card[] = [];
  for (const [su, r] of hand) h.push(pool.splice(pool.findIndex((c) => c.suit === su && c.rank === r), 1)[0]!);
  return { ...g, board: f.board, terrain: f.terrain, hands: [h, pool.splice(0, 7)], deck: pool, phase: 'ACT', turnPlayer: 0, actor: 0 };
};

describe('ADVERSARIAL (v0.7 page)', () => {
  it('8. a very fast swipe that crosses hexes not touching the shape: those are skipped, the drag goes on', () => {
    const s = stateWith({}, [[0, 6], [1, 6], [2, 6]], ['0,1']);
    const v = viewFor(s, 0);
    const legal = legalActions(v);
    const a = legal.find((x) => x.t === 'Bloom')!;
    const combo = comboFor(v, legal, tapKind(EMPTY_SEL, kindOf(a)!))!;
    const keys = new Set(Object.keys(s.board));
    // one pointer move from (-1,1) to (2,1): it crosses a rock and two hexes far from the shape
    const crossed = hexesAlong(pixelOf('-1,1'), pixelOf('2,1'), keys);
    expect(crossed).toEqual(['-1,1', '0,1', '1,1', '2,1']);
    const shape = crossed.reduce<string[]>((sh, k) => paintEnter(combo, sh, k), []);
    expect(shape).toEqual(['-1,1']);
    // the drag carries on: the next touching hexes are still added
    const more = ['-1,2', '-2,1'].reduce<string[]>((sh, k) => paintEnter(combo, sh, k), shape);
    expect(more).toEqual(['-1,1', '-1,2', '-2,1']);
  });

  /** The largest hand (8, Fruit cards included) fits, nothing overlaps, and tiles stay at least 44pt. */
  const fullHandFits = (w: number, h: number) => {
    const l = computeLayout({ w, h });
    const width = l.mode === 'side' ? l.dock.w : w;
    expect(l.card.slice, `${w}x${h} card slice`).toBeGreaterThanOrEqual(MIN_SLICE);
    expect(l.card.w + (MAX_HAND - 1) * l.card.slice).toBeLessThanOrEqual(width);
    expect(overlaps(l.board, l.dock)).toBe(false);
    expect(overlaps(l.header, l.board)).toBe(false);
    expect(l.hexPx, `${w}x${h} tile`).toBeGreaterThanOrEqual(44);
  };
  /**
   * SHORT LANDSCAPE (owner, 2026-11-20): a phone held sideways wraps its hand into two rows of
   * four — the one-row fan could only show a ~33pt strip of each card in a 340pt cockpit — so every
   * card keeps its whole box (and a strip wider than 44pt), every tile keeps the map's own size,
   * and nothing overlaps: not the next card, not a tile, not Undo/Sort.
   */
  const wrappedHandFits = (w: number, h: number) => {
    const l = computeLayout({ w, h });
    const hand = l.hand;
    expect(hand, `${w}x${h} wraps the hand into rows`).toBeTruthy();
    // the 44pt promise: the card's own box, the strip it exposes, and a tile
    expect(l.card.w, `${w}x${h} card width`).toBeGreaterThanOrEqual(TOUCH_MIN);
    expect(l.card.slice, `${w}x${h} card strip`).toBeGreaterThanOrEqual(TOUCH_MIN);
    expect(l.hexPx, `${w}x${h} tile`).toBeGreaterThanOrEqual(TOUCH_MIN);
    // the cockpit and the map stay separate, so no control or card can cover a tile
    expect(overlaps(l.board, l.dock), `${w}x${h} board/dock overlap`).toBe(false);
    // per row: four whole cards (no overlap), each row inside the cockpit's width
    const perRow = hand!.perRow;
    expect(perRow).toBe(Math.ceil(MAX_HAND / 2));
    expect(perRow * l.card.w, `${w}x${h} row width`).toBeLessThanOrEqual(l.parts.fan.w + 1e-9);
    expect(l.parts.fan.w).toBeLessThanOrEqual(l.dock.w);
    expect(l.parts.fan.x).toBeGreaterThanOrEqual(l.dock.x);
    expect(l.parts.fan.x + l.parts.fan.w).toBeLessThanOrEqual(l.dock.x + l.dock.w);
    // the rows: both inside the cockpit, apart (a real gutter), and the row holds both of them
    const rowTop = (i: number) => l.parts.fan.y + i * (l.card.h + hand!.gap);
    for (const i of [0, 1]) {
      expect(rowTop(i), `${w}x${h} row ${i + 1} top`).toBeGreaterThanOrEqual(l.dock.y);
      expect(rowTop(i) + l.card.h, `${w}x${h} row ${i + 1} bottom`).toBeLessThanOrEqual(l.dock.y + l.dock.h);
    }
    expect(hand!.gap, `${w}x${h} gutter`).toBeGreaterThanOrEqual(2);
    expect(rowTop(1) - (rowTop(0) + l.card.h), `${w}x${h} rows do not overlap`).toBe(hand!.gap);
    expect(l.rows.hand, `${w}x${h} hand row holds both rows`).toBeGreaterThanOrEqual(2 * l.card.h + hand!.gap);
    // the keys sit beside the hand, never on a card
    expect(overlaps(l.parts.undo, l.parts.fan), `${w}x${h} Undo over a card`).toBe(false);
    expect(overlaps(l.parts.sort, l.parts.fan), `${w}x${h} Sort over a card`).toBe(false);
    // and the taller cockpit still starts under the header and ends on screen
    expect(l.dock.y, `${w}x${h} cockpit under the header`).toBeGreaterThanOrEqual(l.header.y + l.header.h - 0.5);
    expect(l.dock.y + l.dock.h, `${w}x${h} cockpit on screen`).toBeLessThanOrEqual(h + 0.5);
  };
  it('9a. the largest hand (Fruit cards included) on a 360x640 phone held upright', () => fullHandFits(360, 640));
  // 9b was an expected failure while the one-row fan could only give 33pt strips sideways; the
  // wrap (the owner's option 1) makes both promises hold, so it is a real gate now. Two short
  // landscape sizes are checked: the reported 640x360 and a taller phone. (568x320 still cannot
  // pass the TILE promise: a 340pt cockpit leaves the map 216pt, about 33.6pt tiles. That is the
  // map's width, not the hand's height — reported, not asserted away.)
  for (const [w, h] of [[640, 360], [844, 390]] as const)
    it(`9b. the same hand on a phone turned sideways (${w}x${h}): two rows of four, every target 44pt`, () => wrappedHandFits(w, h));
  it('9c. sideways, the hand still shows every card and nothing overlaps (what does hold)', () => {
    const l = computeLayout({ w: 640, h: 360 });
    // two rows of whole cards inside the hand's own slot (the one-row fan's width no longer applies)
    expect(l.hand?.rows).toBe(2);
    expect((l.hand?.perRow ?? 0) * l.card.w).toBeLessThanOrEqual(l.parts.fan.w + 1e-9);
    expect(l.card.slice).toBeGreaterThanOrEqual(30);
    expect(overlaps(l.board, l.dock)).toBe(false);
  });

  it("11. a home landmark next to a Bloom ghost: the ghost's number is never covered", () => {
    // ghost numbers are drawn at the tile centre (1 unit low), 17 units high, one digit wide
    const GHOST = { dy: 1, halfW: 0.6 * 17 * 0.5, halfH: 0.75 * 17 * 0.5 };
    for (const o of ['flat', 'pointy'] as Orient[]) {
      setOrient(o);
      for (const kind of ['tree', 'volcano'] as LandmarkKind[]) {
        const b = landmarkBox(kind, o, 30);
        const c = centerOf('0,0');
        for (const d of DIRECTIONS) {
          const n = centerOf(coordKey(d));
          const g = { x0: n.x - c.x - GHOST.halfW, x1: n.x - c.x + GHOST.halfW, y0: n.y - c.y + GHOST.dy - GHOST.halfH, y1: n.y - c.y + GHOST.dy + GHOST.halfH };
          const hit = g.x0 < b.x1 && b.x0 < g.x1 && g.y0 < b.y1 && b.y0 < g.y1;
          expect(hit, `${o} ${kind} ghost at ${coordKey(d)}`).toBe(false);
        }
      }
    }
    setOrient('flat');
  });

  it('12. refreshing mid-turn resumes the exact position; a save from another version starts fresh', () => {
    const s = new Session(newGame(21), 0);
    // play until I have made a move inside my Grow step (mid-turn, before the throw)
    for (let i = 0; i < 400 && s.state.phase !== 'GAME_OVER'; i++) {
      const who = s.state.actor;
      if (who === 0 && s.state.phase === 'ACT' && s.log.length > 0 && s.log.at(-1)!.t !== 'Draw' && s.log.at(-1)!.t !== 'EndAct') break;
      s.play(GreedyBot.chooseAction(viewFor(s.state, who)), who);
    }
    expect(s.state.phase).toBe('ACT');
    const raw = encodeSave({ seed: s.state.seed, actions: s.log, coach: null, level: 6 });
    const back = decodeSave(raw)!;
    expect(JSON.stringify(back.state)).toBe(JSON.stringify(s.state));
    expect(back.level).toBe(6);
    // another rules version: refused (the menu then offers a new game, not Continue)
    expect(decodeSave(raw.replace(/"rules":"[^"]+"/, '"rules":"v0.6-fruit-cards"'))).toBeNull();
  });
});
