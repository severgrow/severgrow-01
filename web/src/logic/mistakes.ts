// THE UNDO NUDGE — "the turn you just ended was obviously wrong, and Undo is still open".
//
// THERE IS NO REDO. The key this glow lands on is `#tool-undo` ("Take back your last move"), and
// the same slot holds Replay when nothing can be undone. The owner asked for a pulse "on the redo
// button"; the honest reading is the undo affordance, because that is the only thing that can take
// a move back. This module is written for that key.
//
// THE DEADLINE IS THE WHOLE DESIGN. `Session.play` keeps an undo stack only for the Grow step:
// Bloom / Bomb / Blast / Grow / Strengthen / "done growing" (EndAct) each push a checkpoint, and
// ANY other action (the draw that opens a turn, the throw that closes it) empties it. So Undo is
// live exactly while the player is still inside their own Grow step. A bad move noticed after the
// throw cannot be taken back — a glow then would be a lie about what the key does. Every rule here
// therefore judges the Grow step at the moment the player ENDS it: the last instant at which Undo
// is both useful and possible. If the same mistake is noticed later, we say nothing.
//
// WHAT COUNTS AS "OBVIOUSLY WRONG" is objective loss, never style: a win on the table, a one-move
// loss, a cut of four or more tiles left unplayed. Each is a legal alternative that is strictly
// better than passing, on rules alone. "Suboptimal" choices (which card to keep, where to grow,
// whether to Bloom now) are deliberately NOT here: a nudge that cries wolf teaches players to
// ignore it.
//
// COST: once per Grow step the player ends (so a handful of times per match), over the View
// already in hand. The work is the six doors of each home plus a few candidate tiles, with one
// `cutLoss` per overgrowable/Bomb-able rival tile (never a full move search, never a rank, never a
// network read). Pure: no DOM, no timers, no randomness.
import {
  allNeighbors,
  claimBlocker,
  coordKey,
  fruitTargetBlocker,
  homeCoord,
  onBoard,
  parseKey,
  strangleOutcome,
} from '../../../src/engine/index.js';
import type { Action, Coord, Player, View } from '../../../src/engine/index.js';
import { cutLoss } from '../analysis.js';

const other = (p: Player): Player => (p === 0 ? 1 : 0);

/** The three mistakes this nudge is allowed to name, worst first. */
export type MistakeKind = 'win-skipped' | 'door-open' | 'cut-skipped';

/** 3 = a win was on the table, 2 = the loss was, 1 = a big cut was. */
export type MistakeSeverity = 1 | 2 | 3;

/**
 * THE ONE NUMBER. Every nudge must be at least this severe, so raising or lowering the bar is a
 * single edit here and nothing else moves. It starts at 1: all three classes ship on, because each
 * one is proved by its tests to be objective loss rather than taste.
 */
export const MISTAKE_MIN_SEVERITY = 1;

/**
 * A cut this large (tiles severed, the same count the game's own "Cut off 4!" moment uses) is a
 * material swing, not a preference: four of the rival's tiles leave the board for one card.
 */
export const MISTAKE_BIG_CUT = 4;

/**
 * How many nudges one match may spend. Rare enough to mean something: the first one or two teach
 * the pattern, and a match that keeps producing blunders is a match where a pulse stops being
 * information. (At most one per turn anyway: the nudge only speaks about the Grow step's end.)
 */
export const MISTAKE_MAX_PER_MATCH = 3;

const SEVERITY: Readonly<Record<MistakeKind, MistakeSeverity>> = {
  'win-skipped': 3,
  'door-open': 2,
  'cut-skipped': 1,
};

/** Plain words for the key's own tooltip/label while it glows (no blame, no lesson). */
const DETAIL: Readonly<Record<MistakeKind, string>> = {
  'win-skipped': 'the win was on the table',
  'door-open': 'your home was one tile from being surrounded',
  'cut-skipped': `a cut of ${MISTAKE_BIG_CUT} tiles was on the table`,
};

export type Mistake = { kind: MistakeKind; severity: MistakeSeverity; detail: string };

export type MistakeInput = {
  /** My view of the position the committed move was played from (the Grow step it ended). */
  before: View;
  /** My view of the position after it. */
  after: View;
  /** The move that was committed. */
  action: Action;
  /** True when the app played it on the player's behalf (an auto-skip): never the player's move. */
  auto?: boolean;
};

export type NudgeGate = {
  /** Undo can still take the move back (the throw has not happened). */
  canUndo: boolean;
  /** A lesson, tutorial or the coach already owns guidance on this position. */
  lesson: boolean;
  /** Undo nudges already shown this match (`MISTAKE_MAX_PER_MATCH`). */
  shownThisMatch: number;
  /** Raise the bar for this call without editing the classes (tests, future tuning). */
  minSeverity?: number;
};

export type UndoNudge = {
  kind: MistakeKind;
  severity: MistakeSeverity;
  detail: string;
  /** The undo key's accessible label while it glows. */
  label: string;
};

// ---------- reading the board ----------

/**
 * The neighbours of a home that are still passable for a strangle: on the board, not rock, and not
 * already held by the rival. A strangle needs every one of them to hold a rival tile, so an empty
 * list means the home is surrounded and a list of one means "one tile from it".
 */
const openDoors = (v: View, home: Coord, defender: Player): Coord[] => {
  const rival = other(defender);
  return allNeighbors(home).filter((n) => {
    if (!onBoard(n, v.config)) return false;
    const key = coordKey(n);
    if (v.terrain[key] === 'rock') return false;
    return v.board[key]?.owner !== rival;
  });
};

/** A Grow is still available this turn: one not yet spent, and a numbered card to spend on it. */
const growLeft = (v: View): boolean =>
  v.sproutsThisTurn < v.config.sproutsPerTurn && v.hand.some((c) => c.suit !== null);

/** Does the hex touch one of my tiles (my home counts)? Growth must join the network. */
const touchesMine = (v: View, coord: Coord): boolean =>
  allNeighbors(coord).some((n) => v.board[coordKey(n)]?.owner === v.player);

// ---------- §1: a win was on the table ----------

/**
 * The empty hex whose claim would surround their home THIS move, or null.
 *
 * Exact, not a search: a strangle needs every passable neighbour of their home to hold my tile, so
 * there is only ever one hex worth asking about — the single door that is not already theirs. It
 * must be empty, touch my network, and my Sim of the claim must end the game in my favour (never a
 * double strangle, which is a draw).
 */
const winningClaim = (v: View): Coord | null => {
  if (!growLeft(v)) return null;
  const them = other(v.player);
  const doors = openDoors(v, homeCoord(them, v.config), them);
  if (doors.length !== 1) return null;
  const door = doors[0]!;
  const key = coordKey(door);
  if (v.board[key]) return null; // my own tile there: nothing left to claim
  if (!allNeighbors(door).some((n) => v.board[coordKey(n)]?.owner === v.player)) return null; // must join my network
  const board = { ...v.board, [key]: { owner: v.player, strength: 1 } };
  const outcome = strangleOutcome({ config: v.config, board, terrain: v.terrain });
  return outcome?.reason === 'strangle' && outcome.loser === them ? door : null;
};

// ---------- §2: the loss was on the table ----------

/**
 * The empty hex I could still block with, or null: my home has exactly one door left open, a rival
 * tile touches that door (so their next Grow there surrounds me), and I still have a Grow and a
 * card to fill it. Blocking is strictly better than passing even when they can overgrow the block
 * later: passing loses now, blocking costs them a stronger card first.
 *
 * This is rare ON PURPOSE, and the board's own rule is why: any tile of mine beside my home already
 * keeps that door from closing, so "one empty door" means my home has no tile of mine beside it at
 * all — the one position where ending the Grow step loses the game outright. That is exactly when
 * a nudge is worth spending.
 */
const blockableDoor = (v: View): Coord | null => {
  if (!growLeft(v)) return null;
  const me = v.player;
  const doors = openDoors(v, homeCoord(me, v.config), me);
  if (doors.length !== 1) return null;
  const door = doors[0]!;
  const key = coordKey(door);
  if (v.board[key]) return null; // already mine (an overgrow blocked it): no empty door to fill
  if (v.config.sproutsPerTurn < 1) return null; // nobody can Grow into it, so nothing is lost
  if (!allNeighbors(door).some((n) => v.board[coordKey(n)]?.owner === other(me))) return null; // nobody can step in
  const board = { ...v.board, [key]: { owner: me, strength: 1 } };
  // Filling it must actually save me: the whole point of the nudge.
  return strangleOutcome({ config: v.config, board, terrain: v.terrain }) ? null : door;
};

// ---------- §3: a big cut was on the table ----------

/**
 * The most rival tiles one legal claim could cut off right now (0 when none can).
 *
 * Only the Grow and the Bomb can remove a rival tile, so this walks my reachable rival tiles once:
 * a Strengthen only raises my own tile, a Bloom only adds mine, a Blast is two scarce cards and is
 * never the only way to cut four. `cutLoss` is the game's own answer ("what does this tile hold
 * up?"), not a re-derivation of the sever rule.
 */
const biggestCut = (v: View): number => {
  const me = v.player;
  const rival = other(me);
  const ctx = { config: v.config, board: v.board, terrain: v.terrain };
  const grow = v.sproutsThisTurn < v.config.sproutsPerTurn;
  const topRank = Math.max(0, ...v.hand.filter((c) => c.suit !== null).map((c) => c.rank));
  // A Bomb uses the Grow when the rules say so; when it does not, it is available either way.
  const bomb = v.hand.some((c) => c.suit === null) && (grow || !v.config.fruitUsesSprout);
  let best = 0;
  for (const [key, tile] of Object.entries(v.board)) {
    if (!tile || tile.owner !== rival || tile.root) continue;
    const coord = parseKey(key);
    const hit =
      (grow && topRank > 0 && touchesMine(v, coord) && claimBlocker(ctx, me, coord, topRank) === null) ||
      (bomb && fruitTargetBlocker(ctx, me, coord) === null);
    if (!hit) continue;
    best = Math.max(best, cutLoss(ctx, key).length - 1); // the tile itself is taken, not cut
  }
  return best;
};

// ---------- the plan ----------

const mistake = (kind: MistakeKind): Mistake => ({ kind, severity: SEVERITY[kind], detail: DETAIL[kind] });

/**
 * The obvious mistake in the Grow step the player just ended, or null.
 *
 * Only the END of a Grow step can be wrong in a way Undo can still fix: while the player is still
 * acting they can simply act, and after the throw Undo is gone. So the check runs on `before` (the
 * last state where the Grow step was open) and only for a deliberate EndAct — never for the app's
 * own auto-skip, which is not a move the player made.
 *
 * Worst first: one nudge at a time, and the win outranks the defence, which outranks the cut.
 */
export const mistakePlan = ({ before, after, action, auto = false }: MistakeInput): Mistake | null => {
  if (auto || action.t !== 'EndAct') return null;
  if (before.phase !== 'ACT' || before.actor !== before.player) return null;
  if (after.phase === 'GAME_OVER') return null;
  if (winningClaim(before)) return mistake('win-skipped');
  if (blockableDoor(before)) return mistake('door-open');
  if (biggestCut(before) >= MISTAKE_BIG_CUT) return mistake('cut-skipped');
  return null;
};

/**
 * The nudge the Undo key may show, or null. Every guard is a reason a pulse would be a lie, not a
 * style choice: no undo left (the window closed), guidance already owns the screen, the bar was
 * raised above this class, or the match has spent its handful.
 */
export const undoNudge = (found: Mistake | null, gate: NudgeGate): UndoNudge | null => {
  if (!found) return null;
  if (!gate.canUndo) return null;
  if (gate.lesson) return null;
  if (found.severity < (gate.minSeverity ?? MISTAKE_MIN_SEVERITY)) return null;
  if (gate.shownThisMatch >= MISTAKE_MAX_PER_MATCH) return null;
  return {
    kind: found.kind,
    severity: found.severity,
    detail: found.detail,
    label: `Undo: take back your last move — ${found.detail}`,
  };
};

/** Detection and every guard, in one pure call (what the page uses). */
export const mistakeNudge = (input: MistakeInput & NudgeGate): UndoNudge | null => undoNudge(mistakePlan(input), input);
