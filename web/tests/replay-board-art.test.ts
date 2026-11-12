// THE REPLAY'S BOARD IS THE MATCH'S BOARD (owner, 2026-10-26: "the board should look just like in
// the game"). The replay used to construct the plain `BoardView`, so it painted flat coloured hexes
// with hairline edges — no stone, no sprite art, no grain — while the match painted the sculpted
// default skin. This pins the one thing that made the difference: the replay resolves the SAME
// `DefaultArtBoardView` module (a drop-in subclass of `BoardView`) the game uses, and waits on its
// already-decoded art. It must also resolve without ever rejecting, so a failed load cannot keep
// the replay shut.
import { describe, expect, it } from 'vitest';
import { BoardView } from '../src/ui/board.js';
import { loadReplayArt } from '../src/replay/player.js';

describe('the replay board', () => {
  it('is the default-art board the live match paints with, not the plain renderer', async () => {
    const mod = await loadReplayArt();
    expect(mod).not.toBeNull();
    // A drop-in: the same constructor, `setup` and `render`, with the sprite-art overrides.
    expect(typeof mod!.DefaultArtBoardView).toBe('function');
    expect(mod!.DefaultArtBoardView.prototype instanceof BoardView).toBe(true);
    // The board the replay paints waits on the same decoded pictures as the game's.
    expect(mod!.boardArtReady).toBeInstanceOf(Promise);
    await expect(mod!.boardArtReady).resolves.toBeUndefined();
  });
});

import { REPLAY_CSS } from '../src/replay/replay-css.js';

// THE BOARD'S SIZING RULE MUST NOT REACH ITS SPRITE WINDOWS (owner screenshot, 2026-10-26). Each
// strength stone and gold frame is a nested <svg> that crops one picture from an atlas with its own
// width/height and overflow="hidden". A descendant rule ("#replay .rp-board svg { width:100%;
// overflow:visible }") overrode both on every nested window, so the replay showed whole atlases:
// nine stones on every tile and strips of gold frames off the board.
describe('the replay board styling', () => {
  const rules = [...REPLAY_CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
    selectors: m[1]!.split(',').map((s) => s.trim()),
    body: m[2]!,
  }));

  it('sizes and un-clips only the board\'s own outer svg, never the stones and frames nested in it', () => {
    const reaches = rules.filter(
      (r) =>
        /\b(width|height|overflow)\s*:/.test(r.body) &&
        r.selectors.some((s) => /\.rp-board\s+svg\s*$/.test(s)),
    );
    expect(reaches.map((r) => r.selectors.join(', '))).toEqual([]);
    expect(rules.some((r) => r.selectors.includes('#replay .rp-board > svg') && /overflow\s*:\s*visible/.test(r.body))).toBe(true);
  });
});
