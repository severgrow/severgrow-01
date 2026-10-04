// v0.7 Step 9: the adversarial tests that live in the page logic (8, 9, 11, 12 of the 12;
// 1-7 are in tests/engine/bloom-adversarial.test.ts; 10, rotating mid-paint, is a browser test).
import { describe, expect, it } from 'vitest';
import { DIRECTIONS, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Card, Player, State, Suit } from '../../src/engine/index.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { EMPTY_SEL, kindOf, tapKind } from '../src/logic/interaction.js';
import { comboFor, hexesAlong, paintEnter, pixelOf } from '../src/logic/draw.js';
import { MAX_HAND, MIN_SLICE, computeLayout, overlaps } from '../src/logic/layout.js';
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
  it('9a. the largest hand (Fruit cards included) on a 360x640 phone held upright', () => fullHandFits(360, 640));
  // KNOWN FAIL (reported): sideways, 640x360 cannot hold 7 tiles of 44pt (about 308pt) next to a
  // hand of 8 with 36pt of each card showing (about 360pt). Measured: tiles 37.8pt, card slices
  // 33pt; every card still shows and nothing overlaps. Kept failing on purpose, not loosened.
  it.fails('9b. the same hand on a 360x640 phone turned sideways (640x360)', () => fullHandFits(640, 360));
  it('9c. sideways, the hand still shows every card and nothing overlaps (what does hold)', () => {
    const l = computeLayout({ w: 640, h: 360 });
    expect(l.card.w + (MAX_HAND - 1) * l.card.slice).toBeLessThanOrEqual(l.dock.w);
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
