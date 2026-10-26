// THE REPLAY POSTER (owner brief, 2026-10-26): what the shared picture is allowed to contain.
// The poster is the finished match and nothing else: the two display names, the score, the board's
// final position and the FUTASAKU mark. No ids, tokens, emails or hidden records — this suite pins
// that, and pins the file name a player sends.
import { describe, expect, it } from 'vitest';
import type { Action } from '../../src/engine/index.js';
import { CURRENT_RULES_VERSION, rulesConfig } from '../../src/engine/versions.js';
import { buildReplay } from '../src/replay/timeline.js';
import type { ReplayInput } from '../src/replay/timeline.js';
import { posterFileName, posterFor, posterLayout } from '../src/replay/poster.js';

const CONFIG = rulesConfig(CURRENT_RULES_VERSION)!;
const REAL_ACTIONS: Action[] = [
  { t: 'Draw', from: 'deck' },
  { t: 'Sprout', card: 69, coord: { q: -1, r: 1 } },
  { t: 'EndAct' },
  { t: 'Discard', card: 18 },
  { t: 'Draw', from: 'deck' },
  { t: 'Sprout', card: 7, coord: { q: 1, r: -2 } },
  { t: 'EndAct' },
  { t: 'Discard', card: 1 },
  { t: 'Draw', from: 'deck' },
  { t: 'Bloom', cards: [13, 49, 66], hexes: [{ q: 0, r: 0 }, { q: 1, r: -2 }, { q: 1, r: -1 }] },
  { t: 'Bloom', cards: [39, 41, 42], hexes: [{ q: 2, r: -3 }, { q: 3, r: -3 }, { q: 3, r: -2 }] },
  { t: 'Sprout', card: 9, coord: { q: 2, r: -1 } },
];
const input = (over: Partial<ReplayInput> = {}): ReplayInput => ({
  seed: 234_649_283,
  rulesVersion: CURRENT_RULES_VERSION,
  config: CONFIG,
  startingPlayer: 0,
  actions: REAL_ACTIONS,
  names: ['RYK', 'JadeBadger'],
  ...over,
});

describe('the replay poster', () => {
  it('carries the two names, the score, the final board and the mark — and nothing else', () => {
    const model = buildReplay(input());
    const data = posterFor(model);
    const layout = posterLayout(data);
    const texts = [layout.names[0].text, layout.names[1].text, layout.score.you.text, layout.score.dash.text, layout.score.opp.text, layout.mark.text];
    expect(texts).toEqual(['RYK', 'JADEBADGER', '9', '–', '0', 'FUTASAKU']);
    // Six pieces of text: the names, the score pair and the mark. No title, no timestamp, no id.
    expect(texts).toHaveLength(6);
    // The board is the match's last position, not the opening one.
    const final = model.frames.at(-1)!.board;
    const cells = new Map(layout.board.cells.map((cell) => [cell.key, cell]));
    for (const [key, tile] of Object.entries(final)) {
      if (!tile) continue;
      const cell = cells.get(key);
      expect(cell, `board cell ${key}`).toBeDefined();
      expect(cell!.owner).toBe(tile.owner);
      expect(cell!.strength).toBe(tile.strength);
      expect(cell!.root).toBe(!!tile.root);
    }
    // Nothing private: the layout is the names, score, mark and board coordinates only.
    const serialized = JSON.stringify(layout);
    expect(serialized).not.toMatch(/token|playerId|identity|email|eyJ|@/i);
  });

  it('draws the same final board from seat 1 (screen coordinates, turned with the seat)', () => {
    const model = buildReplay(input({ me: 1 }));
    const layout = posterLayout(posterFor(model));
    const keys = new Set(layout.board.cells.map((cell) => cell.key));
    for (const key of Object.keys(model.frames.at(-1)!.board)) expect(keys.has(key), `seat-1 cell ${key}`).toBe(true);
    // The seat-1 poster's names are in screen order too.
    expect(layout.names.map((n) => n.text)).toEqual(['JADEBADGER', 'RYK']);
  });

  it('names the file after the winner and the score', () => {
    const model = buildReplay(input());
    expect(posterFileName(posterFor(model))).toBe('futasaku-ryk-9-0.png');
  });

  it('names a draw honestly and keeps a file-safe name for a decorated display name', () => {
    const model = buildReplay(input({ actions: REAL_ACTIONS.slice(0, 5), result: { winner: null, scores: [4, 4] } }));
    expect(posterFileName(posterFor(model))).toBe('futasaku-draw-4-4.png');
    const other = buildReplay(input({ names: ['  RYK ✦ #12  ', 'Jade/Badger'] }));
    expect(posterFileName(posterFor(other))).toMatch(/^futasaku-[a-z0-9-]+-9-0\.png$/);
  });
});
