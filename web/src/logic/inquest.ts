// THE INQUEST (surprise brief, 2026-10-29): ONE line on the finish card that names the moment this
// match was actually decided — the real turn and the real event, read out of the public history the
// game already keeps. It is not a statistic and not an achievement: the card already says who won
// and by how much; this says HOW.
//
// THE RULE (the one rule this module keeps, and the one its test pins):
//
//   1. A HOME WAS CLOSED (`strangle`, `double_strangle`). The decisive moment is the turn whose move
//      sealed it, and the move named is the largest placement in that turn (Bloom by hexes, then
//      Sprout, then Overgrow). Whatever ended the match is the story of the match.
//   2. OTHERWISE, THE BIGGEST SINGLE SEVER decides it: the most tiles cut in one Sever event, a tie
//      going to the EARLIEST turn. A one-tile sever is not a moment — it is the ordinary tidy-up of
//      a turn — so a match whose largest cut is a single tile falls through to rule 3.
//   3. A MATCH WITH NO SUCH CUT is decided by its tally: the deck running out, the turn limit, or
//      (archived rules) the knock. The tally is cited at the final turn.
//   4. A RESIGNATION OR A TIMEOUT is decided by the ending itself: the last turn that was played.
//
// PUBLIC INFORMATION ONLY. The input is the event log the server already hands a seat (the
// opponent's deck draws already stripped by `hidePrivateEvents`) plus the recorded result. Nothing
// here reads a hand, a deck order or a card that was not played face up, and no sentence can be
// produced for a reason the history cannot explain — the caller simply renders nothing.
//
// TURNS. `groupTurns` (the same public-history grouping the opponent-turn replay proves) turns the
// flat event list into one group per player-turn, and an event's turn is `group index + 1`. A
// sentence's "turn" is the ROUND both players share (`ceil(turn / 2)`) — the unit Match Intel shows.
// When the log is trimmed, pruned or simply absent, the grouping cannot be trusted to line up with
// the result, so nothing is said (`null`).
import type { Event, Player } from '../../../src/engine/index.js';
import { INQUEST } from '../../../src/strings.js';
import { groupTurns } from '../online/opponent-turn-replay.js';
import type { FinishResult } from './log.js';

export type InquestKind = 'close' | 'double' | 'cut' | 'tally' | 'knock' | 'resigned' | 'timeout';

/** The one line, plus the facts it was built from (the test reads these; the card reads `text`). */
export type Inquest = { kind: InquestKind; turn: number; text: string };

const other = (p: Player): Player => (p === 0 ? 1 : 0);
const roundOf = (turn: number): number => Math.ceil(turn / 2);
/** The name of a placement in the game's own player-facing words (Grow / Bomb / Blast). */
const moveName = (e: Event): string | null => {
  switch (e.t) {
    case 'Bloom':
      return `${e.hexes.length}-tile Bloom`;
    case 'Sprout':
      return 'Grow';
    case 'Overgrow':
      return 'Overgrow';
    case 'MegaBomb':
      return 'Blast';
    case 'FruitCard':
      return 'Bomb';
    default:
      return null;
  }
};

/** The largest placement in one turn's events before `until` (the move that closed a home). */
const closingMove = (events: readonly Event[], until: number): string | null => {
  let best: { n: number; text: string } | null = null;
  for (let i = 0; i < until; i++) {
    const e = events[i]!;
    const name = moveName(e);
    if (!name) continue;
    const n = e.t === 'Bloom' ? e.hexes.length : e.t === 'MegaBomb' ? e.destroyed.length : 1;
    if (!best || n > best.n) best = { n, text: name };
  }
  return best?.text ?? null;
};

/**
 * The one line for this match, or null when the history cannot carry it.
 *
 * `result` is the recorded result (engine seats), `viewer` the seat reading the card, `history` the
 * public events in ENGINE seat order (`eventsFor(state, viewer)`, or the online server's list).
 */
export const inquest = (history: readonly Event[], result: FinishResult | null, viewer: Player): Inquest | null => {
  if (!result) return null;
  const groups = groupTurns(history);
  if (groups.length === 0) return null;
  const turnAt = (index: number): number => roundOf(index + 1);
  const lastTurn = turnAt(groups.length - 1);
  const mine: [number, number] = [result.scores[viewer], result.scores[other(viewer)]];

  switch (result.reason) {
    case 'strangle':
    case 'double_strangle': {
      const index = groups.findIndex((g) => g.events.some((e) => e.t === 'Strangle'));
      if (index < 0) return null; // the log does not carry the ending: say nothing
      const turn = turnAt(index);
      if (result.reason === 'double_strangle') return { kind: 'double', turn, text: INQUEST.double(turn) };
      const group = groups[index]!;
      const at = group.events.findIndex((e) => e.t === 'Strangle');
      const move = closingMove(group.events, at);
      // The mover of the sealing turn is the winner of a strangle (see engine/phases.ts).
      const won = result.winner === viewer;
      const mover: 'your' | 'their' = won ? 'your' : 'their';
      const home: 'your' | 'their' = won ? 'their' : 'your';
      return {
        kind: 'close',
        turn,
        text: move ? INQUEST.closed(turn, mover, move, home) : INQUEST.sealed(turn, home),
      };
    }
    case 'deck_exhaustion':
    case 'turn_limit': {
      const cut = biggestCut(groups);
      // Rule 3: the tally. A draw is its own sentence.
      if (!cut || cut.n < 2) {
        if (result.winner === null) return { kind: 'tally', turn: lastTurn, text: INQUEST.draw(lastTurn, mine) };
        const text = result.reason === 'deck_exhaustion' ? INQUEST.deckEnd(lastTurn, mine) : INQUEST.turnLimit(lastTurn, mine);
        return { kind: 'tally', turn: lastTurn, text };
      }
      const moverIsViewer = cut.player === viewer;
      const mover: 'you' | 'they' = moverIsViewer ? 'you' : 'they';
      const victim: 'you' | 'they' = moverIsViewer ? 'they' : 'you';
      const victimSeat: Player = moverIsViewer ? other(viewer) : viewer;
      // "Never grew again" is a fact of the log: the victim placed nothing after the cut.
      const grew = groups.slice(cut.groupIndex + 1).some((g) =>
        g.events.some((e) => (e.t === 'Bloom' || e.t === 'Sprout' || e.t === 'Overgrow') && e.player === victimSeat),
      );
      return {
        kind: 'cut',
        turn: cut.turn,
        text: grew ? INQUEST.cutScore(cut.turn, mover, cut.n, victim, mine) : INQUEST.cutLasting(cut.turn, mover, cut.n, victim),
      };
    }
    case 'knock': {
      const index = groups.findIndex((g) => g.events.some((e) => e.t === 'Knock'));
      if (index < 0) return null;
      const turn = turnAt(index);
      const group = groups[index]!;
      return {
        kind: 'knock',
        turn,
        text: INQUEST.knock(turn, group.player === viewer ? 'your' : 'their', mine),
      };
    }
    case 'resigned':
    case 'timeout': {
      // The server records these without an engine ending, so the last turn played is the moment.
      const who: Player = result.winner === null ? other(viewer) : other(result.winner);
      const byViewer = who === viewer;
      return {
        kind: result.reason,
        turn: lastTurn,
        text:
          result.reason === 'resigned'
            ? INQUEST.resigned(lastTurn, byViewer ? 'you' : 'they', mine)
            : INQUEST.timeout(lastTurn, byViewer ? 'your' : 'their', mine),
      };
    }
    default:
      // A reason this module cannot explain from public history: say nothing rather than guess.
      return null;
  }
};

type BiggestCut = { n: number; groupIndex: number; turn: number; player: Player };

/** Rule 2: the most tiles cut in one Sever event; a tie goes to the earliest turn. */
const biggestCut = (groups: ReturnType<typeof groupTurns>): BiggestCut | null => {
  let best: BiggestCut | null = null;
  groups.forEach((group, groupIndex) => {
    for (const e of group.events) {
      if (e.t !== 'Sever') continue;
      const n = e.coords.length;
      if (n === 0) continue;
      if (!best || n > best.n) best = { n, groupIndex, turn: roundOf(groupIndex + 1), player: group.player };
    }
  });
  return best;
};
