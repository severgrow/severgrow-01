// THE SHARE CARD (owner redesign, 2026-11-12): a 1080x1350 picture of the result, made to be
// downloaded into a phone's gallery / Instagram 4:5. The card carries MINIMAL text — the result, the
// score and the two names — plus the product's own brand words. Everything geometric is pure, so
// each of the three layouts is checked against a win, a loss, a draw, a very long name and a
// three-digit score before any picture is rendered.
import { describe, expect, it } from 'vitest';
import { RESULT } from '../../src/strings.js';
import { SHARE_H, SHARE_W, SHARE_LAYOUT, SHARE_LAYOUTS, fittedSize, fit, fitName, namesOf, resultOf, shareLayout, textWidth } from '../src/logic/share.js';
import type { Box, ShareData, ShareLayoutId } from '../src/logic/share.js';
import { overlaps } from '../src/logic/layout.js';
import { playGame } from './ui-helpers.js';

/** One real finished game, shared by every case (the layout copes with any board). */
const BASE = playGame(4);

const data = (o: Partial<ShareData> = {}): ShareData => ({
  game: 'Futasaku',
  title: RESULT.won,
  sub: 'vs WillowBirch',
  score: [24, 17],
  highlights: [],
  board: BASE.board,
  radius: BASE.config.boardRadius,
  me: 0,
  names: ['You', 'WillowBirch'],
  ...o,
});

const inside = (b: Box) => b.x >= 0 && b.y >= 0 && b.x + b.w <= SHARE_W && b.y + b.h <= SHARE_H;

/** Everything the layout paints, as boxes: every text, and the planet. */
const boxesOf = (id: ShareLayoutId, d: ShareData): Box[] => {
  const L = shareLayout(d, id);
  return [...L.texts, L.planet];
};

describe('the share card layouts', () => {
  it('ships a pick, and the pick is one of the three', () => {
    expect(SHARE_LAYOUTS).toEqual(['a', 'b', 'c']);
    expect(SHARE_LAYOUTS).toContain(SHARE_LAYOUT);
  });

  for (const id of SHARE_LAYOUTS) {
    for (const [name, d] of [
      ['a win', data()],
      ['a loss', data({ title: RESULT.lost })],
      ['a draw', data({ title: RESULT.draw, score: [18, 18] })],
      ['a very long name', data({ names: ['RYKTHEMAGNIFICENT', 'BartholomewQuicksilver'] })],
      ['a three-digit score', data({ score: [123, 99] })],
      ['an empty board', data({ board: {}, radius: 4 })],
    ] as const) {
      it(`${id}: ${name} — every piece fits inside 1080x1350 and nothing overlaps`, () => {
        const L = shareLayout(d, id);
        const boxes = boxesOf(id, d);
        for (const b of boxes) expect(inside(b), JSON.stringify(b)).toBe(true);
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            expect(overlaps(boxes[i]!, boxes[j]!), `${i} ${j}: ${JSON.stringify(boxes[i])} / ${JSON.stringify(boxes[j])}`).toBe(false);
          }
        }
        for (const rule of L.rules) expect(inside(rule)).toBe(true);
        if (L.frame) expect(inside(L.frame)).toBe(true);
      });
    }

    it(`${id}: the two names never spill out of their boxes, even at RYKTHEMAGNIFICENT length`, () => {
      const long = data({ names: ['RYKTHEMAGNIFICENT', 'BartholomewQuicksilver'] });
      const L = shareLayout(long, id);
      // The names are the last two text boxes of every layout.
      const names = L.texts.slice(-2);
      for (const t of names) {
        const size = fittedSize(t.text, t.w, t.size, t.min, t.family, t.tracking);
        expect(size).toBeGreaterThanOrEqual(t.min);
        expect(textWidth(t.text, size, t.family, t.tracking)).toBeLessThanOrEqual(t.w + 1);
      }
      // A short name is never cut.
      expect(fitName('You', 400, 30, 'ui')).toBe('You');
    });

    it(`${id}: the planet is a real board, small enough to sit inside its disc`, () => {
      const d = data();
      const L = shareLayout(d, id);
      expect(L.planet.cells.length).toBeGreaterThan(10);
      expect(L.planet.hex).toBeGreaterThan(4);
      for (const cell of L.planet.cells) {
        expect(Math.hypot(cell.x - L.planet.cx, cell.y - L.planet.cy) + L.planet.hex).toBeLessThanOrEqual(L.planet.r + 2);
      }
      expect(L.planet.y).toBeGreaterThanOrEqual(0);
      expect(L.planet.y + L.planet.h).toBeLessThanOrEqual(SHARE_H);
    });
  }

  it('each layout is a different composition, not a recolour', () => {
    const d = data();
    const centres = SHARE_LAYOUTS.map((id) => shareLayout(d, id).planet.cy);
    expect(new Set(centres).size).toBe(centres.length);
  });
});

describe('what the card says', () => {
  it('reads the result from the product’s own three titles', () => {
    expect(resultOf(data({ title: RESULT.won }))).toBe('win');
    expect(resultOf(data({ title: RESULT.lost }))).toBe('loss');
    expect(resultOf(data({ title: RESULT.draw }))).toBe('draw');
    // An explicit result wins (the caller already knows).
    expect(resultOf(data({ title: RESULT.won, result: 'loss' }))).toBe('loss');
  });

  it('prints the real score and the two names, never a highlight', () => {
    const d = data();
    const L = shareLayout(d, 'a');
    expect(L.score.you.text).toBe('24');
    expect(L.score.opp.text).toBe('17');
    expect(L.texts.some((t) => t.text === 'YOU WON')).toBe(true);
    expect(L.texts.some((t) => t.text === 'You')).toBe(true);
    expect(L.texts.some((t) => /Biggest cut/.test(t.text))).toBe(false);
  });

  it('falls back to the product’s words when no names are passed', () => {
    const none = data();
    delete (none as { names?: unknown }).names;
    expect(namesOf(none)).toEqual(['You', 'Opponent']);
    expect(namesOf(data({ names: ['  ', '  '] }))).toEqual(['You', 'Opponent']);
    expect(namesOf(data({ names: ['Me', 'Them'] }))).toEqual(['Me', 'Them']);
  });

  it('cuts long lines cleanly', () => {
    expect(fit('short', 10)).toBe('short');
    expect(fit('a very long line of words', 10)).toBe('a very lo…');
    expect(fit('a very long line', 10).length).toBeLessThanOrEqual(10);
  });
});
