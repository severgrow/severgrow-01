// THE REPLAY TIMELINE (owner brief, 2026-10-25).
//
// One pure function turns a recorded match into a list of FRAMES with durations, so playback is
// data-driven and testable without a browser. There is no clock in here and no DOM: the player
// only reads `frames` and paints `frame.board`.
//
// A frame is ONE BEAT the eye can follow, not one action: a Sprout is one beat, a Bloom of four
// tiles is one beat that lasts longer, a cut that severs six tiles lasts longer still, and the turn
// hand-over is its own quiet beat. The engine is deterministic, so the whole match is rebuilt from
// `{seed, config, startingPlayer, actions}` (or a set opening, for a campaign lesson) with `apply`;
// each action's beats come from the SAME `buildSteps` the live game animates, so a Bloom looks like
// a Bloom and a cut looks like the cut the player watched.
//
// Pacing (the table below, `REPLAY_PACING`): every beat has a WEIGHT, and the whole match is scaled
// as ONE block to a target length DERIVED FROM THE BEAT COUNT (owner, 2026-10-30: "the length should
// depend on the amount of moves… just much faster"). A typical fifty-second replay was 62-73 beats;
// the curve below turns 50 beats into ~30 s. Clamps keep a tiny game from being compressed into a
// blur and a very long match under a sensible ceiling, and the relative weighting is never
// flattened — a cut or a Blast is still held longer than an ordinary Grow at every scale.
import { apply, coordKey, mirror, parseKey, scores, stateFromSetup } from '../../../src/engine/index.js';
import type { Action, Player, RulesConfig, State, Terrain, Tile } from '../../../src/engine/index.js';
import { CURRENT_RULES_VERSION } from '../../../src/engine/versions.js';
import { applyStep, buildSteps } from '../logic/anim.js';
import type { Board, Step } from '../logic/anim.js';

/** The one pacing table. Durations are milliseconds. */
export const REPLAY_PACING = Object.freeze({
  /** A quiet beat (one single-tile Grow) at natural speed: the scale is fitted against this. */
  unit: 1700,
  /**
   * The duration curve (owner, 2026-10-30): the whole match follows how many beats it has.
   *
   *   target = clamp(endHold + perBeat * beats, minTotal, maxTotal)
   *
   * The numbers: 50 beats = 1.4 s + 50 × 0.57 s = 29.9 s (a 50-second replay is now about 30 s);
   * 10 beats would be 7.1 s, so the 9 s floor holds it up instead of blurring it; past ~53 beats
   * the 32 s cap ends the growth, so a 200-beat game is still 32 s and not a blur. Monotonic.
   */
  perBeat: 570,
  /** The floor a very short match is held at ("not compressed into a blur"). */
  minTotal: 9_000,
  /** The sensible ceiling for a very long match. */
  maxTotal: 32_000,
  /** Never stretch further than this: four moves must not become a two-minute crawl. */
  maxScale: 2.2,
  /** Never compress further than this (a 200-beat match at the cap needs ~0.09). */
  minScale: 0.06,
  /** No single beat is ever shorter than this (a blur floor) or longer than this (a crawl cap). */
  minFrame: 140,
  maxFrame: 4_200,
  /** The final board rests on screen this long (the result is the point). */
  endHold: 1_400,
});

/**
 * How many "quiet beats" one step is worth. A multi-tile Bloom costs more than a single Grow, an
 * overgrow adds the flip, a chain of cuts costs more, and the turn hand-over is a short beat of its
 * own. Draws, discards and EndAct never reach here: they change no tile, and the owner's rule is
 * "no cards", so they take no screen time.
 */
export const weightOf = (step: Step): number => {
  switch (step.k) {
    case 'grow':
      // An ordinary grow is the quickest picture on screen; a multi-tile Bloom adds a beat per tile,
      // and an overgrow adds the flip. The owner's "much faster" is most visible here.
      return 0.85 + 0.5 * (step.tiles.length - 1) + (step.tiles.some((t) => t.replaced) ? 0.3 : 0);
    case 'sever':
      // A cut is a big moment: held longer than a grow, and longer again per link it severs.
      return 1.3 + 0.14 * step.keys.length;
    case 'megaBomb':
      // The Blast is the biggest single picture: a base beat plus every tile it clears.
      return 1.6 + 0.3 * step.destroyed.length;
    case 'fruit':
      return 1.2;
    case 'strengthen':
      return 0.6;
    case 'remove':
      return 0.9 + 0.09 * step.keys.length;
    case 'strangle':
      return 1.5;
    case 'turn':
      // The quiet hand-over: the shortest beat, so the eye resets without waiting.
      return 0.35;
    case 'end':
      return 1.2;
    // A Draw/Discard has no picture on a board-only replay.
    default:
      return 0;
  }
};

/** The kinds a frame can be. Kept explicit so the player and the tests share one vocabulary. */
export type ReplayBeat = 'grow' | 'sever' | 'strengthen' | 'fruit' | 'blast' | 'rot' | 'strangle' | 'turn' | 'end';

export type ReplayFrame = {
  /** Position in the frame list (0-based). */
  index: number;
  kind: ReplayBeat;
  /** Index into the match's action list that produced this beat. */
  action: number;
  /** The seat that acted, in screen seats (0 = the phone's owner). */
  seat: Player;
  /** Which step of `buildSteps` for this action this beat is (for seeking the exact position). */
  step: number;
  /** Whose turn it is while this beat is on screen. Changes exactly on a `turn` beat. */
  turn: Player;
  /** True on the beat that hands the turn over (`turn`), and on the last one (`end`). */
  boundary: boolean;
  /** The beat's raw weight (before scaling) — what makes one beat longer than another. */
  weight: number;
  /** Start time from the first frame, in ms. */
  at: number;
  /** How long this beat is held, in ms. */
  duration: number;
  /** The board AFTER this beat, in screen coordinates (seat 0 = me, bottom). */
  board: Board;
  /** The score read-out after this beat, in screen order [me, opponent]. */
  scores: [number, number];
  /** Tiles this beat changed (for the one short crossfade). */
  changed: string[];
  /** Tiles this beat removed (for the quiet ghost fade). */
  removed: string[];
};

export type ReplayResult = {
  /** Winner in SCREEN seats (0 = the phone's owner), or null for a draw. */
  winner: Player | null;
  scores: [number, number];
  /** "RYK wins", "Draw", "RYK wins by resignation". */
  title: string;
};

export type ReplayInput = {
  seed: number;
  rulesVersion?: string;
  config: RulesConfig;
  startingPlayer?: Player;
  /** A set opening (a campaign lesson, a tutorial chapter). When present the deal is not re-derived. */
  base?: State | null;
  actions: readonly Action[];
  /** Display names by ENGINE seat. Offline: ['You', 'Opponent']. */
  names: readonly [string, string];
  /** Whose phone this is (the board is painted from their side). 0 for every offline match. */
  me?: Player;
  /**
   * The recorded result, for a match that ended WITHOUT a `GameEnd` event (a resignation, a
   * timeout). An engine result on the final state always wins over this. `reason` is the server's
   * own word for how it ended, so the replay never calls a timeout a resignation.
   */
  result?: { winner: Player | null; scores: [number, number]; reason?: string } | null;
};

/**
 * THE TURNING POINT (owner brief, 2026-10-26): the play that cut off the most tiles, in the same
 * words `logic/session.ts` uses for the game review (`biggestCut`). It is DATA computed from the
 * match's own steps, never a heuristic: `tiles` is the sum of the sever steps' keys in that play,
 * `frame` is the first cut beat of that play (the moment the eye should land on), and `seat` is the
 * seat that made the cut in SCREEN seats. Null when the match never cut anything, or when there is
 * only one beat to watch.
 */
export type ReplayTurningPoint = {
  frame: number;
  tiles: number;
  seat: Player;
  action: number;
};

/**
 * THE BIGGEST MOMENTS (owner, 2026-10-26): "include 2-4 biggest actions on timeline rather than
 * more". One play's weight in the match, measured from its own frames, never a heuristic:
 * `swing` is how far it moved the score gap between the two players (|Δ(me − opponent)|), `cut` the
 * tiles it cut off, and `impact` their sum. `frame` is the play's first visible beat (where a tap on
 * the bar lands); `seat` the seat that made it, in SCREEN seats.
 */
export type ReplayHighlight = {
  frame: number;
  action: number;
  seat: Player;
  swing: number;
  cut: number;
  impact: number;
};

/** The most moments the scrub bar ever marks. */
export const MAX_HIGHLIGHTS = 4;
/** A play must weigh at least this share of the match's biggest play to earn a mark. */
const HIGHLIGHT_SHARE = 0.35;

/**
 * Two to four plays, in time order. The turning point (the biggest cut) is always one of them. Plays
 * that barely moved the match are left off even if that leaves fewer than four — but never fewer than
 * two when two plays moved it at all, so the bar always tells a story when there is one.
 */
export const pickHighlights = (
  frames: readonly ReplayFrame[],
  from: readonly [number, number],
  cutByAction: ReadonlyMap<number, number>,
  turningAction: number | null,
): ReplayHighlight[] => {
  const byAction = new Map<number, ReplayFrame[]>();
  for (const frame of frames) {
    const list = byAction.get(frame.action);
    if (list) list.push(frame);
    else byAction.set(frame.action, [frame]);
  }
  const all: ReplayHighlight[] = [];
  for (const [action, own] of byAction) {
    const shown = own.find((f) => f.kind !== 'turn' && f.kind !== 'end');
    if (!shown) continue;
    const before = frames[own[0]!.index - 1]?.scores ?? from;
    const after = own.at(-1)!.scores;
    const swing = Math.abs(after[0] - after[1] - (before[0] - before[1]));
    const cut = cutByAction.get(action) ?? 0;
    const impact = swing + cut;
    if (impact <= 0) continue;
    all.push({ frame: shown.index, action, seat: shown.seat, swing, cut, impact });
  }
  // Biggest first; a tie goes to the earlier play (the same rule the turning point keeps).
  all.sort((a, b) => b.impact - a.impact || a.frame - b.frame);
  const top = all[0]?.impact ?? 0;
  const picked = all.filter((h, i) => i < MAX_HIGHLIGHTS && (i < 2 || h.impact >= top * HIGHLIGHT_SHARE));
  if (turningAction !== null && !picked.some((h) => h.action === turningAction)) {
    const tp = all.find((h) => h.action === turningAction);
    if (tp) {
      if (picked.length >= MAX_HIGHLIGHTS) picked.pop();
      picked.push(tp);
    }
  }
  return picked.sort((a, b) => a.frame - b.frame);
};

export type ReplayModel = {
  frames: ReplayFrame[];
  /** The whole match's playback length, including the final hold, in ms. */
  totalMs: number;
  /** The scale the weights were multiplied by (1 = natural speed). */
  scale: number;
  /** The first paint: the opening board before any action. */
  from: { board: Board; scores: [number, number]; turn: Player };
  config: RulesConfig;
  terrain: Record<string, Terrain>;
  /** Display names in SCREEN order: [me, opponent]. */
  names: readonly [string, string];
  me: Player;
  result: ReplayResult | null;
  /**
   * The match's biggest cut (the game review's `biggestCut`, computed from the same steps), or
   * null when nothing was cut or there is only one beat. The replay's own story.
   */
  turningPoint: ReplayTurningPoint | null;
  /** The two to four plays that moved the match most (empty on a match too short for a story). */
  highlights: ReplayHighlight[];
  /** How long the final board rests before "Replay again". */
  endHold: number;
  /**
   * The exact input the frames were built from. Seeking uses it to rebuild a position from the
   * action log independently of the precomputed frames — that is what makes a drag a real seek.
   */
  input: ReplayInput;
};

const copyBoard = (b: Board): Board => Object.fromEntries(Object.entries(b).map(([k, t]) => [k, t ? { ...t } : null]));

const mapKeyOf = (key: string, me: Player): string => (me === 0 ? key : coordKey(mirror(parseKey(key))));
const mapSeat = (seat: Player, me: Player): Player => (me === 0 ? seat : ((seat === 0 ? 1 : 0) as Player));

/**
 * The one step-shaped mapping the replay needs: screen coords + display owners, for a seat-1
 * viewer. It is the same 180° rule `online/perspective.ts` (`createPerspective`) applies; the
 * replay keeps its own six lines so the pure timeline never imports a DOM module.
 */
export const mapStepToScreen = (step: Step, me: Player): Step => {
  if (me === 0) return step;
  const k = (key: string) => mapKeyOf(key, me);
  const p = (seat: Player) => mapSeat(seat, me);
  switch (step.k) {
    case 'grow':
      return { ...step, player: p(step.player), tiles: step.tiles.map((t) => ({ ...t, key: k(t.key) })) };
    case 'sever':
      return { ...step, player: p(step.player), by: p(step.by), keys: step.keys.map(k), origin: k(step.origin) };
    case 'strengthen':
      return { ...step, player: p(step.player), key: k(step.key) };
    case 'fruit':
      return { ...step, player: p(step.player), target: k(step.target) };
    case 'megaBomb':
      return { ...step, player: p(step.player), target: k(step.target), destroyed: step.destroyed.map(k) };
    case 'remove':
      return { ...step, keys: step.keys.map(k) };
    case 'strangle':
      return { ...step, loser: p(step.loser) };
    case 'turn':
    case 'draw':
    case 'discard':
      return { ...step, player: p(step.player) };
    default:
      return step;
  }
};

/** A board in the viewer's coordinates: seat 1 gets the 180° rotation the online board uses. */
export const screenBoard = (board: Record<string, Tile | null>, me: Player): Board => {
  if (me === 0) return copyBoard(board);
  const out: Board = {};
  for (const [key, tile] of Object.entries(board)) {
    out[mapKeyOf(key, me)] = tile ? { ...tile, owner: mapSeat(tile.owner, me) } : null;
  }
  return out;
};

const screenTerrain = (terrain: Record<string, Terrain>, me: Player): Record<string, Terrain> => {
  if (me === 0) return terrain;
  const out: Record<string, Terrain> = {};
  for (const [key, t] of Object.entries(terrain)) out[mapKeyOf(key, me)] = t;
  return out;
};

/** A tile's identity for the "what changed" diff: owner + strength + root. */
const signature = (t: Tile | null | undefined): string => (t ? `${t.owner}:${t.strength}:${t.root ? 1 : 0}` : '');

const diff = (before: Board, after: Board): { changed: string[]; removed: string[] } => {
  const changed: string[] = [];
  const removed: string[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[key];
    const b = after[key];
    if (signature(a) === signature(b)) continue;
    if (a && !b) removed.push(key);
    else changed.push(key);
  }
  return { changed, removed };
};

/** `changed`, with the step's own tiles first and in its order; anything else keeps its place after. */
export const revealOrder = (changed: readonly string[], order: readonly string[]): string[] => {
  const at = new Map(order.map((key, i) => [key, i]));
  return [...changed].sort((a, b) => (at.get(a) ?? order.length) - (at.get(b) ?? order.length));
};

/**
 * The scale that lands a match on the beat-count curve while keeping every beat's relative weight.
 *
 *   target = clamp(endHold + perBeat * beats, 9 s, 32 s)      (REPLAY_PACING)
 *   scale  = the s where Σ clamp(unit*w*s) + endHold == target   (bisection)
 *            inside [minScale, maxScale] and per-beat [minFrame, maxFrame]
 *
 * Because every beat is multiplied by the SAME s, a four-tile Bloom is 2.8× a Sprout at every
 * scale. The clamps are what a short or a very long match bumps into instead of distorting that.
 */
export const fitScale = (weights: readonly number[]): { scale: number; total: number } => {
  const { unit, perBeat, minTotal, maxTotal, minScale, maxScale, minFrame, maxFrame, endHold } = REPLAY_PACING;
  const target = Math.min(Math.max(endHold + perBeat * weights.length, minTotal), maxTotal);
  const totalAt = (s: number): number => {
    let sum = endHold;
    for (const w of weights) sum += Math.min(Math.max(unit * w * s, minFrame), maxFrame);
    return sum;
  };
  let lo: number = minScale;
  let hi: number = maxScale;
  if (totalAt(lo) >= target) return { scale: lo, total: totalAt(lo) };
  if (totalAt(hi) <= target) return { scale: hi, total: totalAt(hi) };
  // totalAt() is non-decreasing in s, so a bisection finds the closest reachable scale.
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (totalAt(mid) < target) lo = mid;
    else hi = mid;
  }
  const a = { scale: lo, total: totalAt(lo) };
  const b = { scale: hi, total: totalAt(hi) };
  return Math.abs(a.total - target) <= Math.abs(b.total - target) ? a : b;
};

const beatOf = (step: Step): ReplayBeat => {
  switch (step.k) {
    case 'grow':
      return 'grow';
    case 'sever':
      return 'sever';
    case 'strengthen':
      return 'strengthen';
    case 'fruit':
      return 'fruit';
    case 'megaBomb':
      return 'blast';
    case 'remove':
      return 'rot';
    case 'strangle':
      return 'strangle';
    case 'turn':
      return 'turn';
    case 'end':
      return 'end';
    default:
      return 'grow';
  }
};

/** Which ENGINE seat made this beat (a cut's `player` is the victim, so the cutter is `by`). */
const actorOf = (step: Step, previous: Player): Player => {
  switch (step.k) {
    case 'sever':
      return step.by;
    case 'strangle':
      return (step.loser === 0 ? 1 : 0) as Player;
    case 'draw':
    case 'discard':
    case 'grow':
    case 'strengthen':
    case 'fruit':
    case 'megaBomb':
    case 'turn':
      return step.player;
    default:
      return previous;
  }
};

type Pending = {
  kind: ReplayBeat;
  action: number;
  step: number;
  seat: Player;
  turn: Player;
  boundary: boolean;
  weight: number;
  board: Board;
  scores: [number, number];
  /** A Grow's tiles in reveal order (screen keys): the wave the live board shows. */
  order?: string[];
};

/**
 * The opening position a replay starts from: the recorded set position (a campaign lesson), or the
 * engine's own deal for the seed. Exported because seeking rebuilds a position from it independently
 * (the proof that a frame's board is the real one).
 */
export const openingOf = (input: ReplayInput): State =>
  input.base ??
  stateFromSetup({
    seed: input.seed,
    rulesVersion: input.rulesVersion ?? CURRENT_RULES_VERSION,
    config: input.config,
    startingPlayer: input.startingPlayer ?? 0,
  });

/**
 * Build the whole replay. Throws when the action log is not a legal match from that opening — the
 * callers (the finish screen and the replay route) only ever pass a log the engine itself produced.
 */
export const buildReplay = (input: ReplayInput): ReplayModel => {
  const me: Player = input.me ?? 0;
  const opening = openingOf(input);

  const firstTurn = opening.turnPlayer ?? opening.startingPlayer ?? 0;
  const pending: Pending[] = [];
  let board: Board = screenBoard(opening.board, me);
  let state = opening;
  let turn = firstTurn;
  let actor = firstTurn;
  /** The tiles each ACTION cut off (the same count `Session.biggestCut` keeps). */
  const cutByAction = new Map<number, number>();

  input.actions.forEach((action, index) => {
    const before = state;
    state = apply(before, action);
    const steps = buildSteps(before, action, state, 0);
    const firstPending = pending.length;
    steps.forEach((step, stepIndex) => {
      const weight = weightOf(step);
      if (weight <= 0) return; // Draw / Discard / the per-action sync: no picture, no time
      if (step.k === 'sever') cutByAction.set(index, (cutByAction.get(index) ?? 0) + step.keys.length);
      actor = actorOf(step, actor);
      if (step.k === 'turn') turn = step.player;
      const shownStep = me === 0 ? step : mapStepToScreen(step, me);
      board = applyStep(board, shownStep);
      const sc = scores(state);
      pending.push({
        kind: beatOf(step),
        action: index,
        step: stepIndex,
        seat: mapSeat(actor, me),
        turn: mapSeat(turn, me),
        boundary: step.k === 'turn' || step.k === 'end',
        weight,
        board,
        scores: me === 0 ? [sc[0], sc[1]] : [sc[1], sc[0]],
        ...(shownStep.k === 'grow' ? { order: shownStep.tiles.map((t) => t.key) } : {}),
      });
    });
    // The last beat of an action ends on the engine's own board (the step accumulation can differ
    // mid-action — a tile can be grown and cut inside one move — but never at the end of it).
    const last = pending.at(-1);
    if (last && pending.length > firstPending) {
      board = screenBoard(state.board, me);
      last.board = board;
    }
  });

  const fitted = fitScale(pending.map((p) => p.weight));
  const frames: ReplayFrame[] = [];
  let at = 0;
  let previous: Board = screenBoard(opening.board, me);
  pending.forEach((p, index) => {
    const duration = Math.round(
      Math.min(Math.max(REPLAY_PACING.unit * p.weight * fitted.scale, REPLAY_PACING.minFrame), REPLAY_PACING.maxFrame),
    );
    const { changed: raw, removed } = diff(previous, p.board);
    // A Grow's tiles change in its own reveal order (outward from the hex it grows from).
    const changed = p.order ? revealOrder(raw, p.order) : raw;
    frames.push({
      index,
      kind: p.kind,
      action: p.action,
      step: p.step,
      seat: p.seat,
      turn: p.turn,
      boundary: p.boundary,
      weight: p.weight,
      at,
      duration,
      board: p.board,
      scores: p.scores,
      changed,
      removed,
    });
    previous = p.board;
    at += duration;
  });

  const engineResult = state.result ?? null;
  const recorded = input.result ?? null;
  const engineScores: [number, number] | null = engineResult
    ? [engineResult.scores[0], engineResult.scores[1]]
    : recorded
      ? [recorded.scores[0], recorded.scores[1]]
      : null;
  const winner = engineResult?.winner ?? recorded?.winner ?? null;
  const known = !!engineResult || !!recorded;
  const screenScores: [number, number] = engineScores
    ? me === 0
      ? engineScores
      : [engineScores[1], engineScores[0]]
    : (frames.at(-1)?.scores ?? [0, 0]);
  const screenNames: readonly [string, string] = me === 0 ? input.names : [input.names[1], input.names[0]];
  const screenWinner = winner === null ? null : mapSeat(winner, me);
  // How a match that ended WITHOUT a GameEnd reads. The server's reason is the only honest source:
  // a timeout is not a resignation (the finish card already makes that distinction).
  const recordedSuffix =
    recorded?.reason === 'resigned'
      ? ' wins by resignation'
      : recorded?.reason === 'timeout'
        ? ' wins on time'
        : ' wins';
  const result: ReplayResult | null = known
    ? {
        winner: screenWinner,
        scores: screenScores,
        title:
          screenWinner === null
            ? 'Draw'
            : screenNames[screenWinner] + (engineResult ? ' wins' : recordedSuffix),
      }
    : null;

  // THE TURNING POINT: the biggest cut in the match, at the beat where it lands. Ties go to the
  // earlier play (Map iteration follows action order), exactly as `Session.biggestCut` keeps the
  // first. A match with no cut, or a single-beat replay, has no turning point to jump to.
  let turningPoint: ReplayTurningPoint | null = null;
  if (frames.length > 1) {
    let bestAction = -1;
    let bestCut = 0;
    for (const [action, tiles] of cutByAction) {
      if (tiles > bestCut) {
        bestCut = tiles;
        bestAction = action;
      }
    }
    const cutFrame = bestAction < 0 ? undefined : frames.find((frame) => frame.action === bestAction && frame.kind === 'sever');
    if (cutFrame) turningPoint = { frame: cutFrame.index, tiles: bestCut, seat: cutFrame.seat, action: bestAction };
  }

  const startScores = scores(opening);
  const fromScores: [number, number] = me === 0 ? [startScores[0], startScores[1]] : [startScores[1], startScores[0]];
  const highlights = frames.length > 1 ? pickHighlights(frames, fromScores, cutByAction, turningPoint?.action ?? null) : [];
  return {
    frames,
    totalMs: at + REPLAY_PACING.endHold,
    scale: fitted.scale,
    from: {
      board: screenBoard(opening.board, me),
      scores: fromScores,
      turn: mapSeat(firstTurn, me),
    },
    config: opening.config,
    terrain: screenTerrain(opening.terrain, me),
    names: screenNames,
    me,
    result,
    turningPoint,
    highlights,
    endHold: REPLAY_PACING.endHold,
    input,
  };
};
