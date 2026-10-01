// Real game positions for the browser test and the screenshots, found by letting
// GreedyBot play itself (deterministic: same seeds, same positions every time).
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { moveCards } from '../../src/playtest/names.js';
import { selFor } from '../src/logic/interaction.js';
import { previewMove } from '../src/logic/preview.js';
import { playGame } from '../tests/ui-helpers.js';

const count = (s: State, p: number) => Object.values(s.board).filter((t) => t && t.owner === p).length;

export type CutDemo = { state: State; action: Action; card: number; hex: string; option: number; cuts: number };

/** Mid-game (10+ tiles a side), the player to act, with a move that cuts 3+ bot tiles. */
export const cutDemo = (): CutDemo => {
  for (let seed = 1; seed <= 400; seed++) {
    let found: CutDemo | null = null;
    playGame(seed, ({ after }) => {
      if (found || after.actor !== 0 || after.phase !== 'ACT' || count(after, 0) < 10 || count(after, 1) < 10) return;
      const v = viewFor(after, 0);
      const legal = legalActions(v);
      for (const a of legal) {
        const pv = previewMove(v, a);
        if (pv && pv.cuts >= 3 && !pv.wins) {
          const sel = selFor(v, legal, a);
          found = { state: after, action: a, card: moveCards(a)[0]!, hex: sel.hex!, option: sel.option, cuts: pv.cuts };
          return;
        }
      }
    });
    if (found) return found;
  }
  throw new Error('no cut demo found');
};

/** The player's last draw of a whole game (a few taps from the game-over screen). */
export const endgame = (seed = 20): State => {
  let last: State | null = null;
  playGame(seed, ({ before }) => {
    if (before.actor === 0 && before.phase === 'DRAW') last = before;
  });
  return last!;
};

/** The start of a bot turn in which the bot cuts off 4+ of the player's tiles. */
export const botCut = (): { state: State; cut: number } => {
  for (let seed = 1; seed <= 200; seed++) {
    let start: State | null = null;
    let found: { state: State; cut: number } | null = null;
    playGame(seed, ({ before, after }) => {
      if (found) return;
      if (before.actor === 1 && before.phase === 'DRAW') start = before;
      if (before.actor !== 1 || after.lastResolution === before.lastResolution) return;
      const cut = (after.lastResolution?.severed ?? []).find((c) => c.player === 0);
      if (cut && cut.coords.length >= 4 && start) found = { state: start, cut: cut.coords.length };
    });
    if (found) return found;
  }
  throw new Error('no bot cut found');
};

/** Mid-game at the player's Draw step, with one empty gold hex and one gold hex under a tile. */
export const goldDemo = (): { state: State; empty: string; covered: string } => {
  for (let seed = 1; seed <= 400; seed++) {
    let found: { state: State; empty: string; covered: string } | null = null;
    playGame(seed, ({ after }) => {
      if (found || after.actor !== 0 || after.phase !== 'DRAW' || count(after, 0) < 8 || count(after, 1) < 8) return;
      const rich = Object.keys(after.terrain).filter((k) => after.terrain[k] === 'rich');
      const empty = rich.find((k) => !after.board[k]);
      const covered = rich.find((k) => after.board[k]);
      if (empty && covered) found = { state: after, empty, covered };
    });
    if (found) return found;
  }
  throw new Error('no gold demo found');
};

/** The first position (seeds 1-400) where the player can make a move matching `want`. */
const findMove = (want: (v: ReturnType<typeof viewFor>, a: Action, after: State) => boolean): CutDemo => {
  for (let seed = 1; seed <= 400; seed++) {
    let found: CutDemo | null = null;
    playGame(seed, ({ after }) => {
      if (found || after.actor !== 0 || after.phase !== 'ACT' || count(after, 0) < 6) return;
      const v = viewFor(after, 0);
      const legal = legalActions(v);
      for (const a of legal) {
        const pv = previewMove(v, a);
        if (pv && !pv.wins && want(v, a, after)) {
          const sel = selFor(v, legal, a);
          if (sel.hex === null) continue;
          found = { state: after, action: a, card: moveCards(a)[0]!, hex: sel.hex, option: sel.option, cuts: pv.cuts };
          return;
        }
      }
    });
    if (found) return found;
  }
  throw new Error('no such move found');
};

/** A cut that removes a bot tile standing on a gold hex. */
export const goldCutDemo = () =>
  findMove((v, a, s) => (previewMove(v, a)?.cutKeys ?? []).some((k) => s.terrain[k] === 'rich'));

/** One move with three effects: tiles grow (one on gold or replacing a bot tile), then a cut. */
export const tripleDemo = () =>
  findMove((v, a, s) => {
    const pv = previewMove(v, a)!;
    return pv.cuts >= 1 && pv.ghosts.length >= 3 && pv.ghosts.some((g) => g.replaces || s.terrain[g.key] === 'rich');
  });

/** A big cut (4 or more bot tiles). */
export const bigCutDemo = () => findMove((v, a) => (previewMove(v, a)?.cuts ?? 0) >= 4);
