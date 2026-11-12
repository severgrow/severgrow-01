// THE SHARE CARD (owner redesign, 2026-11-12): a 1080x1350 picture of the result, made to be
// downloaded into a phone's gallery / Instagram 4:5. The card carries MINIMAL text — the result, the
// score and the two names — plus the product's own brand words. Everything geometric is pure, so
// each layout is checked against a win, a loss, a draw, a very long name and a three-digit score
// before any picture is rendered.
//
// The owner's four corrections (2026-11-12) are pinned here, not just in the picture:
//   · the page is an explicit GRID, and every box is a span of it (sums re-derived below);
//   · each name's centre x EQUALS its own score's centre x (layout A);
//   · layout A draws NO circle round the board (`planet.ring === false`, and the painter's disc/rim
//     are guarded by `ring`);
//   · only the product's two approved faces, with Fragment Mono at its one shipped weight.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RESULT } from '../../src/strings.js';
import {
  SHARE_CONTENT, SHARE_FONTS, SHARE_FONT_WEIGHTS, SHARE_GRID, SHARE_H, SHARE_LAYOUT, SHARE_LAYOUTS, SHARE_W,
  colSpan, colX, fittedSize, fit, fitName, namesOf, resultOf, rowSpan, rowY, shareLayout, textWidth,
} from '../src/logic/share.js';
import type { Box, ShareData } from '../src/logic/share.js';
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

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const inside = (b: Box) => b.x >= 0 && b.y >= 0 && b.x + b.w <= SHARE_W && b.y + b.h <= SHARE_H;
const centreX = (b: Box) => b.x + b.w / 2;

describe('the page grid (owner: "create a grid for it first")', () => {
  it('is 12 x 9 of 54 x 110, 84 px margin, 24 px gutter — and it exactly fills 1080 x 1350', () => {
    expect(SHARE_GRID).toEqual({ margin: 84, columns: 12, column: 54, rows: 9, row: 110, gutter: 24 });
    expect(SHARE_GRID.columns * SHARE_GRID.column + (SHARE_GRID.columns - 1) * SHARE_GRID.gutter + 2 * SHARE_GRID.margin).toBe(SHARE_W);
    expect(SHARE_GRID.rows * SHARE_GRID.row + (SHARE_GRID.rows - 1) * SHARE_GRID.gutter + 2 * SHARE_GRID.margin).toBe(SHARE_H);
    expect(SHARE_CONTENT).toEqual({ x: 84, y: 84, w: 912, h: 1182 });
  });

  it('column and row lines step by the column + gutter, and stay inside the content box', () => {
    expect(colX(0)).toBe(84);
    expect(colX(11) + SHARE_GRID.column).toBe(996);
    expect(rowY(0)).toBe(84);
    expect(rowY(8) + SHARE_GRID.row).toBe(1266);
    expect(colSpan(1, 4)).toEqual({ x: 162, w: 288 });
    expect(rowSpan(2, 2)).toEqual({ y: 352, h: 244 });
  });
});

describe('the share card layouts', () => {
  it('ships a pick, and the pick is one of the three', () => {
    expect(SHARE_LAYOUTS).toEqual(['a', 'b', 'c']);
    expect(SHARE_LAYOUTS).toContain(SHARE_LAYOUT);
    expect(SHARE_LAYOUT).toBe('a'); // the owner's pick, 2026-11-12
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
        const boxes: Box[] = [...L.texts, L.planet];
        for (const b of boxes) expect(inside(b), JSON.stringify(b)).toBe(true);
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            expect(overlaps(boxes[i]!, boxes[j]!), `${i} ${j}: ${JSON.stringify(boxes[i])} / ${JSON.stringify(boxes[j])}`).toBe(false);
          }
        }
        for (const rule of L.rules) expect(inside(rule)).toBe(true);
        if (L.frame) expect(inside(L.frame)).toBe(true);
        // Nothing spills out of its own box either: the painted size fits the box's width.
        for (const t of L.texts) {
          const size = fittedSize(t.text, t.w, t.size, t.min, t.family, t.tracking);
          expect(textWidth(t.text, size, t.family, t.tracking)).toBeLessThanOrEqual(t.w + 1);
        }
      });
    }

    it(`${id}: the two names never spill out of their boxes, even at RYKTHEMAGNIFICENT length`, () => {
      const long = data({ names: ['RYKTHEMAGNIFICENT', 'BartholomewQuicksilver'] });
      const L = shareLayout(long, id);
      for (const t of [L.names.you, L.names.opp]) {
        const size = fittedSize(t.text, t.w, t.size, t.min, t.family, t.tracking);
        expect(size).toBeGreaterThanOrEqual(t.min);
        expect(textWidth(t.text, size, t.family, t.tracking)).toBeLessThanOrEqual(t.w + 1);
      }
      expect(fitName('You', 400, 30, 'ui')).toBe('You');
    });

    it(`${id}: the planet is a real board, small enough to sit inside its fit radius`, () => {
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

describe('layout A: each name sits directly under its own score', () => {
  // The owner's most important correction (2026-11-12): the score reads 9 – 4, so the reader's own
  // name is centred under the 9 and the opponent's under the 4 — same column, same centre line.
  for (const [name, d] of [
    ['a win', data()],
    ['a loss', data({ title: RESULT.lost, score: [9, 21] })],
    ['a draw', data({ title: RESULT.draw, score: [16, 16] })],
    ['the longest name', data({ names: ['RYKTHEMAGNIFICENT', 'BartholomewQuicksilver'] })],
    ['a three-digit score', data({ score: [123, 99] })],
  ] as const) {
    it(`${name}: name centre x === own score centre x, on both sides`, () => {
      const L = shareLayout(d, 'a');
      expect(centreX(L.names.you)).toBe(centreX(L.score.you));
      expect(centreX(L.names.opp)).toBe(centreX(L.score.opp));
      // …and they really are different columns, i.e. the two sides are the two sides.
      expect(centreX(L.names.you)).toBeLessThan(centreX(L.score.dash));
      expect(centreX(L.names.opp)).toBeGreaterThan(centreX(L.score.dash));
      // The lockup is symmetric about the page's centre line.
      expect(Math.round(centreX(L.score.you) + centreX(L.score.opp))).toBe(SHARE_W);
    });
  }

  it('the scorecard uses the grid: 4 | 2 | 4 columns, one gutter under the number', () => {
    const L = shareLayout(data(), 'a');
    expect(L.score.you.x).toBe(colX(1));
    expect(L.score.you.w).toBe(colSpan(1, 4).w);
    expect(L.score.opp.x).toBe(colX(7));
    expect(L.score.dash.x).toBe(colX(5));
    // The name box is one grid gutter below the number's box, on the same columns.
    expect(L.names.you.y).toBe(L.score.you.y + L.score.you.h + SHARE_GRID.gutter);
    expect(L.names.you.x).toBe(L.score.you.x);
    expect(L.names.opp.x).toBe(L.score.opp.x);
  });
});

describe('layout A: no circle round the board (owner, 2026-11-12)', () => {
  it('the layout asks for no ring; B and C keep the disc they shipped with', () => {
    const d = data();
    expect(shareLayout(d, 'a').planet.ring).toBe(false);
    expect(shareLayout(d, 'b').planet.ring).toBe(true);
    expect(shareLayout(d, 'c').planet.ring).toBe(true);
  });

  it('the painter draws every DISC-LEVEL arc INSIDE `if (p.ring)` — no unconditional circle', () => {
    const source = read('../src/ui/sharecard.ts');
    const body = source.slice(source.indexOf('const paintPlanet'), source.indexOf('/** Paint one line of type'));
    // The disc, its clip, the rim and the halo are the four circles round the board; each is
    // inside a ring guard. Any arc at the planet's centre outside one would be a drawn circle.
    expect((body.match(/g\.arc\(p\.cx/g) ?? []).length).toBe(4);
    expect((body.match(/if \(p\.ring\)/g) ?? []).length).toBe(4);
    // And the clipped disc edge (the thing that read as a line) only exists while a ring is drawn.
    expect(body).toMatch(/if \(p\.ring\) \{\n\s+g\.beginPath\(\);\n\s+g\.arc\(p\.cx, p\.cy, p\.r - 1\.5/);
  });
});

describe('the approved faces only (owner, 2026-11-12)', () => {
  const tokens = read('../src/fonts-futa04.css');

  it('the fallback stacks are the product’s own tokens, verbatim', () => {
    expect(tokens).toContain('--font-display: \'Besley\', Georgia, serif;');
    expect(tokens).toContain('--font-ui: \'Fragment Mono\', ui-monospace, monospace;');
    expect(SHARE_FONTS.display).toBe("'Besley', Georgia, serif");
    expect(SHARE_FONTS.ui).toBe("'Fragment Mono', ui-monospace, monospace");
  });

  it('every text asks for one of the two families, and Fragment Mono only at its shipped weight', () => {
    for (const id of SHARE_LAYOUTS) {
      for (const t of shareLayout(data(), id).texts) {
        expect(['display', 'ui']).toContain(t.family);
        if (t.family === 'ui') expect(SHARE_FONT_WEIGHTS.ui).toContain(t.weight);
        else expect(SHARE_FONT_WEIGHTS.display).toContain(t.weight);
      }
    }
    // The painter also enforces it, so a layout cannot smuggle in a synthesized bold.
    expect(read('../src/ui/sharecard.ts')).toMatch(/const weight = t\.family === 'ui' \? 400 : t\.weight;/);
  });

  it('the card awaits the real faces before painting, and fails loudly if one never loads', () => {
    const source = read('../src/ui/sharecard.ts');
    expect(source).toMatch(/export const ensureShareFonts = async \(\): Promise<void> => \{/);
    expect(source).toMatch(/fonts\.load\(`\$\{face\.weight\} \$\{face\.size\}px "\$\{face\.family\}"`\)/);
    expect(source).toMatch(/await fonts\.ready/);
    expect(source).toMatch(/if \(missing\.length\) throw new Error/);
    expect(source).toMatch(/export const drawShareCard = async \([\s\S]*?await ensureShareFonts\(\);/);
    // The families come from the product's tokens, never from a string typed into this module.
    expect(source).toMatch(/css\('--font-display', SHARE_FONTS\.display\)/);
    expect(source).toMatch(/css\('--font-ui', SHARE_FONTS\.ui\)/);
  });
});

describe('what the card says', () => {
  it('reads the result from the product’s own three titles', () => {
    expect(resultOf(data({ title: RESULT.won }))).toBe('win');
    expect(resultOf(data({ title: RESULT.lost }))).toBe('loss');
    expect(resultOf(data({ title: RESULT.draw }))).toBe('draw');
    expect(resultOf(data({ title: RESULT.won, result: 'loss' }))).toBe('loss');
  });

  it('prints the real score and the two names, never a highlight', () => {
    const L = shareLayout(data(), 'a');
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
