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
