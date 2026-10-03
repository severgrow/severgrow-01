// UI overhaul item 20: the share card's layout: everything inside the card, nothing overlapping,
// long words cut cleanly, and never the word "bot".
import { describe, expect, it } from 'vitest';
import { newGame } from '../../src/engine/index.js';
import { SHARE_H, SHARE_W, fit, shareLayout } from '../src/logic/share.js';
import type { Box, ShareData } from '../src/logic/share.js';
import { overlaps } from '../src/logic/layout.js';
import { playGame } from './ui-helpers.js';

const data = (o: Partial<ShareData> = {}): ShareData => {
  const s = playGame(4);
  return {
    game: 'Severor',
    title: 'You beat Level 7!',
    sub: 'Level 7 · Sprout version',
    score: [24, 17],
    highlights: ['Biggest cut: you cut off 6 opponent tiles', 'Biggest single move: you changed 9 tiles in one move', 'Most tiles at once: you grew 5 tiles at once'],
    board: s.board,
    radius: s.config.boardRadius,
    me: 0,
    ...o,
  };
};

const inside = (b: Box) => b.x >= 0 && b.y >= 0 && b.x + b.w <= SHARE_W && b.y + b.h <= SHARE_H;

describe('the share card', () => {
  for (const [name, d] of [
    ['a normal result', data()],
    ['very long words', data({ title: 'X'.repeat(200), sub: 'Y'.repeat(300), highlights: ['Z'.repeat(400), 'W'.repeat(400), 'V'.repeat(400)] })],
    ['no highlights, big board', data({ highlights: [], radius: 4, board: newGame(1, { boardRadius: 4 }).board })],
    ['three-digit scores', data({ score: [123, 99] })],
  ] as const) {
    it(`${name}: every piece fits inside the card and nothing overlaps`, () => {
      const L = shareLayout(d);
      const boxes: Box[] = [...L.texts, L.score.you, L.score.dash, L.score.opp, L.board];
      for (const b of boxes) expect(inside(b), JSON.stringify(b)).toBe(true);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i]!, boxes[j]!), `${i} ${j}`).toBe(false);
      // every hex sits inside the board's box (a pointy-top hex is √3/2 of its size wide each side)
      const half = (L.board.hex * Math.sqrt(3)) / 2;
      for (const c of L.board.cells) {
        expect(c.x - half).toBeGreaterThanOrEqual(L.board.x - 1);
        expect(c.x + half).toBeLessThanOrEqual(L.board.x + L.board.w + 1);
        expect(c.y - L.board.hex).toBeGreaterThanOrEqual(L.board.y - 1);
        expect(c.y + L.board.hex).toBeLessThanOrEqual(L.board.y + L.board.h + 1);
      }
      expect(L.board.hex).toBeGreaterThan(20);
    });
  }

  it('cuts long lines cleanly', () => {
    expect(fit('short', 10)).toBe('short');
    expect(fit('a very long line of words', 10)).toBe('a very lo…');
    expect(fit('a very long line', 10).length).toBeLessThanOrEqual(10);
  });

  it('shows the real board and the real score', () => {
    const d = data();
    const L = shareLayout(d);
    for (const c of L.board.cells) expect(c.owner).toBe(d.board[c.key]?.owner ?? null);
    expect(L.score.you.text).toBe('24');
    expect(L.score.opp.text).toBe('17');
  });
});
