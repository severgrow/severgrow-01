// THE UNDO NUDGE: each rule fires on a position that really is that mistake, and — the important
// half — stays silent on the near-misses around it. A nudge that cries wolf is worse than none, so
// every class has at least two negative cases, and the guards (the throw deadline, lessons, the
// per-match cap, the severity bar) are each proved on their own.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { allNeighbors, apply, coordKey, homeCoord, newGame, onBoard, parseKey, viewFor } from '../../src/engine/index.js';
import type { Action, Card, State, Tile } from '../../src/engine/index.js';
import { coachAdvice } from '../../src/playtest/coach.js';
import { cutLoss } from '../src/analysis.js';
import {
  MISTAKE_BIG_CUT,
  MISTAKE_MAX_PER_MATCH,
  MISTAKE_MIN_SEVERITY,
  mistakeNudge,
  mistakePlan,
  undoNudge,
} from '../src/logic/mistakes.js';

const SEED = 1;

const allCards = (s: State): Card[] => [...s.deck, ...s.hands[0], ...s.hands[1]];
const rank = (s: State, r: number): Card => allCards(s).find((c) => c.suit !== null && c.rank === r)!;
const fruit = (s: State): Card => allCards(s).find((c) => c.suit === null)!;
const mine = (strength = 5): Tile => ({ owner: 0, strength });
const theirs = (strength = 5): Tile => ({ owner: 1, strength });

/** Player 0 to act in the Grow step, holding exactly `hand`, over `board`. */
const acting = (s: State, hand: Card[], board: Record<string, Tile | null> = s.board, sproutsThisTurn = 0): State => {
  const ids = new Set(hand.map((c) => c.id));
  return {
    ...s,
    board,
    hands: [hand, s.hands[1].filter((c) => !ids.has(c.id))],
    deck: s.deck.filter((c) => !ids.has(c.id)),
    phase: 'ACT',
    turnPlayer: 0,
    actor: 0,
    sproutsThisTurn,
  };
};

const ended = (s: State): State => ({ ...s, phase: 'DISCARD' });
const view = (s: State) => viewFor(s, 0);
const endAct: Action = { t: 'EndAct' };
const plan = (before: State, action: Action = endAct, auto = false) =>
  mistakePlan({ before: view(before), after: view(ended(before)), action, auto });

/** A worked copy of the dealt board with my own and the rival's tiles painted on it. */
const painted = (s: State, paint: (board: Record<string, Tile | null>) => void): Record<string, Tile | null> => {
  const board = { ...s.board };
  paint(board);
  return board;
};

// ---------- the win: their home one claim from being surrounded ----------

/**
 * Their home is surrounded except for one empty door (1,-1): five of MY tiles close the rest, all
 * joined back to my home along (-1,2) -> (-1,1) -> (0,0) -> (1,0) -> (2,-1), so the door legally
 * touches my network and the claim would really strangle them. The hand holds one low card:
 * nothing else on this board can be overgrown, so the only mistake in it is the one under test.
 */
const winPosition = () => {
  const s = newGame(SEED);
  const theirHome = homeCoord(1, s.config);
  const doors = allNeighbors(theirHome).filter((n) => onBoard(n, s.config) && s.terrain[coordKey(n)] !== 'rock');
  expect(doors).toHaveLength(6); // the fixture is about a home with six open doors
  const door = parseKey('1,-1');
  const mineKeys = [...doors.filter((d) => coordKey(d) !== coordKey(door)).map(coordKey), '-1,2', '-1,1', '0,0', '1,0'];
  const board = painted(s, (b) => {
    for (const k of mineKeys) {
      expect(s.terrain[k]).not.toBe('rock');
      b[k] = mine();
    }
  });
  return { state: acting(s, [rank(s, 1)], board), door, theirHome, doors };
};

describe('a win was on the table', () => {
  it('ends the Grow step while one Grow would surround their home', () => {
    const { state } = winPosition();
    expect(plan(state)).toMatchObject({ kind: 'win-skipped', severity: 3 });
  });

  it('really wins: the claim the nudge points at strangles them', () => {
    const { state, door } = winPosition();
    const card = state.hands[0][0]!;
    const after = apply(state, { t: 'Sprout', card: card.id, coord: door });
    expect(after.result?.reason).toBe('strangle');
    expect(after.result?.winner).toBe(0);
  });

  it('says nothing when a second door is still open (two moves from a surround)', () => {
    const { state } = winPosition();
    const board = { ...state.board };
    board[coordKey(parseKey('2,-1'))] = null; // one rival door opens again
    expect(plan({ ...state, board })).toBeNull();
  });

  it('says nothing when the last door does not touch my network', () => {
    const { state } = winPosition();
    const board = { ...state.board };
    for (const k of ['2,-1', '1,-2', '0,0', '1,0']) board[k] = null; // nothing of mine reaches the door
    expect(plan({ ...state, board })).toBeNull();
  });

  it('says nothing when this turn\u2019s Grow is already spent', () => {
    const { state } = winPosition();
    expect(plan({ ...state, sproutsThisTurn: 1 })).toBeNull();
  });

  it('says nothing when the hand has no numbered card to Grow with', () => {
    const { state } = winPosition();
    const s = newGame(SEED);
    expect(plan({ ...state, hands: [[fruit(s)], state.hands[1]] })).toBeNull();
  });

  it('says nothing about a move that is not the end of the Grow step', () => {
    const { state, door } = winPosition();
    const card = state.hands[0][0]!;
    expect(plan(state, { t: 'Sprout', card: card.id, coord: door })).toBeNull();
  });

  it('says nothing about the app\u2019s own auto-skip (not a move the player made)', () => {
    const { state } = winPosition();
    expect(plan(state, endAct, true)).toBeNull();
  });

  it('agrees with the coach: it names the win, and taking it is never a mistake', () => {
    const { state } = winPosition();
    const v = view(state);
    const advice = coachAdvice({ view: v, step: 0, enabled: true, taught: [], known: [] });
    expect(advice).not.toBeNull();
    expect(advice!.action.t).toBe('Sprout');
    const after = apply(state, advice!.action);
    expect(after.result?.reason).toBe('strangle');
    expect(mistakePlan({ before: v, after: viewFor(after, 0), action: advice!.action })).toBeNull();
  });
});

// ---------- the loss: my home one empty door from being surrounded ----------

/**
 * My home has five rival tiles around it and one empty door (-1,2), with a rival tile at (0,2)
 * touching that door. I hold one low card, so nothing of theirs can be overgrown: the only mistake
 * in the position is ending the Grow step instead of filling the door.
 */
const doorPosition = () => {
  const s = newGame(SEED);
  const myHome = homeCoord(0, s.config);
  const doors = allNeighbors(myHome).filter((n) => onBoard(n, s.config) && s.terrain[coordKey(n)] !== 'rock');
  expect(doors).toHaveLength(6);
  const door = parseKey('-1,2');
  const board = painted(s, (b) => {
    for (const d of doors) if (coordKey(d) !== coordKey(door)) b[coordKey(d)] = theirs();
    expect(s.terrain['0,2']).not.toBe('rock');
    b['0,2'] = theirs(); // a rival tile can step into the door
  });
  return { state: acting(s, [rank(s, 1)], board), door, doors };
};

describe('the loss was on the table', () => {
  it('ends the Grow step with my home one empty door from a surround', () => {
    const { state } = doorPosition();
    expect(plan(state)).toMatchObject({ kind: 'door-open', severity: 2 });
  });

  it('really blocks: filling the door keeps the game going', () => {
    const { state, door } = doorPosition();
    const card = state.hands[0][0]!;
    const after = apply(state, { t: 'Sprout', card: card.id, coord: door });
    expect(after.result).toBeNull();
    const v = viewFor(after, 0);
    // the door is mine now, and the surround count has not fallen to zero
    expect(v.board[coordKey(door)]?.owner).toBe(0);
  });

  it('says nothing when no Grow can enter the door at all (Sprouts are off)', () => {
    const { state } = doorPosition();
    const config = { ...state.config, sproutsPerTurn: 0 };
    expect(plan({ ...state, config, sproutsThisTurn: 0 })).toBeNull();
  });

  it('says nothing with two doors open (two moves from a surround)', () => {
    const { state } = doorPosition();
    const board = { ...state.board };
    board['-1,1'] = null;
    expect(plan({ ...state, board })).toBeNull();
  });

  it('says nothing when the Grow is already spent', () => {
    const { state } = doorPosition();
    expect(plan({ ...state, sproutsThisTurn: 1 })).toBeNull();
  });

  it('says nothing when the last door already holds my tile (no claim can fill it)', () => {
    const { state } = doorPosition();
    const board = { ...state.board };
    board['-1,2'] = mine(); // one overgrow away, not one Grow away: stay quiet
    expect(plan({ ...state, board })).toBeNull();
  });
});

// ---------- the cut: one claim severs four or more of theirs ----------

/**
 * Their home (-2,2 seat) has a bridge tile at (1,-1) with a tail hanging off it, and my tile at
 * (0,0) touches the bridge with a 9 in hand. Overgrowing the bridge severs the whole tail.
 */
const cutPosition = (tail: number) => {
  const s = newGame(SEED);
  const tailKeys = ['1,0', '2,0', '1,1', '2,1'].slice(0, tail);
  const board = painted(s, (b) => {
    b['1,-1'] = theirs(3);
    for (const k of tailKeys) {
      expect(s.terrain[k]).not.toBe('rock');
      b[k] = theirs(3);
    }
    expect(s.terrain['0,0']).not.toBe('rock');
    b['0,0'] = mine();
  });
  return { state: acting(s, [rank(s, 9)], board), tailKeys };
};

describe('a big cut was on the table', () => {
  it('the fixture really is a cut of MISTAKE_BIG_CUT tiles', () => {
    const { state } = cutPosition(MISTAKE_BIG_CUT);
    const ctx = { config: state.config, board: state.board, terrain: state.terrain };
    expect(cutLoss(ctx, '1,-1').length - 1).toBe(MISTAKE_BIG_CUT);
  });

  it('ends the Grow step while a cut of MISTAKE_BIG_CUT tiles is unplayed', () => {
    const { state } = cutPosition(MISTAKE_BIG_CUT);
    expect(plan(state)).toMatchObject({ kind: 'cut-skipped', severity: 1 });
  });

  it('says nothing one tile short of the bar', () => {
    const { state } = cutPosition(MISTAKE_BIG_CUT - 1);
    expect(plan(state)).toBeNull();
  });

  it('says nothing when the bridge cannot be overgrown (a 9 cannot take a 9)', () => {
    const { state } = cutPosition(MISTAKE_BIG_CUT);
    const board = { ...state.board, '1,-1': theirs(9) };
    expect(plan({ ...state, board })).toBeNull();
  });

  it('says nothing when the bridge does not touch my network', () => {
    const { state } = cutPosition(MISTAKE_BIG_CUT);
    const board = { ...state.board, '0,0': null };
    expect(plan({ ...state, board })).toBeNull();
  });

  it('says nothing when the Grow is already spent and no Bomb can make the cut', () => {
    const { state } = cutPosition(MISTAKE_BIG_CUT);
    expect(plan({ ...state, sproutsThisTurn: 1 })).toBeNull();
  });
});

// ---------- the guards ----------

describe('the guards', () => {
  const found = () => {
    const { state } = winPosition();
    const m = plan(state);
    expect(m).not.toBeNull();
    return m!;
  };

  it('is silent once the throw has closed the undo window', () => {
    expect(undoNudge(found(), { canUndo: false, lesson: false, shownThisMatch: 0 })).toBeNull();
  });

  it('is silent while a lesson or the coach owns guidance', () => {
    expect(undoNudge(found(), { canUndo: true, lesson: true, shownThisMatch: 0 })).toBeNull();
  });

  it('is silent once the match has spent its nudges', () => {
    expect(undoNudge(found(), { canUndo: true, lesson: false, shownThisMatch: MISTAKE_MAX_PER_MATCH })).toBeNull();
    expect(undoNudge(found(), { canUndo: true, lesson: false, shownThisMatch: MISTAKE_MAX_PER_MATCH - 1 })).not.toBeNull();
  });

  it('lets all three classes through the default bar', () => {
    expect(MISTAKE_MIN_SEVERITY).toBeLessThanOrEqual(1);
    expect(undoNudge(found(), { canUndo: true, lesson: false, shownThisMatch: 0 })).not.toBeNull();
  });

  it('honours a raised bar (the one number that turns classes off)', () => {
    expect(undoNudge(found(), { canUndo: true, lesson: false, shownThisMatch: 0, minSeverity: 4 })).toBeNull();
  });

  it('carries plain words for the undo key', () => {
    const n = undoNudge(found(), { canUndo: true, lesson: false, shownThisMatch: 0 })!;
    expect(n.label).toContain('Undo');
    expect(n.detail).toBe('the win was on the table');
  });
});

// ---------- a clean position ----------

describe('a clean position', () => {
  it('says nothing when the Grow step is simply over', () => {
    const s = newGame(SEED);
    expect(plan(acting(s, [rank(s, 1)]))).toBeNull();
  });

  it('answers through the one pure call the page uses', () => {
    const { state } = winPosition();
    const input = { before: view(state), after: view(ended(state)), action: endAct, canUndo: true, lesson: false, shownThisMatch: 0 };
    expect(mistakeNudge(input)?.kind).toBe('win-skipped');
  });
});

// ---------- the visual contract ----------
//
// WHAT CANNOT BE PROVED IN THIS CHANNEL (found 2026-11-20): `main.ts` builds settings with
// `parseSettings(..., IS_FUTA04)`, and the Futasaku product keeps ESSENTIAL_SETTINGS only — `effects`
// is fixed to 'normal'. So on a `CHANNEL=futa04` build the "Effects Low" half of the nudge is
// unreachable, and a browser suite that seeds `effects:'low'` can never see it (the old e2e asserted
// exactly that and failed). The quiet variant still exists for the classic/live line; these pins keep
// it honest without claiming the 0.4 product can reach it.
describe('the glow is compositor-only, and its quiet variant is still defined', () => {
  const css = readFileSync(fileURLToPath(new URL('../src/style.css', import.meta.url)), 'utf8');
  const rule = (selector: string): string => {
    const at = css.indexOf(selector);
    expect(at).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf('}', at) + 1);
  };

  it('the halo animates opacity only — no filter, no animated box-shadow', () => {
    const pulse = css.slice(css.indexOf('@keyframes undo-nudge-pulse'), css.indexOf('}', css.indexOf('@keyframes undo-nudge-pulse')) + 1);
    expect(pulse).toContain('opacity');
    expect(pulse).toContain('transform');
    expect(pulse).not.toContain('filter');
    expect(pulse).not.toContain('box-shadow');
  });

  it('the quiet variant is half strength, never removed', () => {
    const quiet = rule('.undo-slot.mistake-nudge-quiet {');
    expect(quiet).toContain('--nudge-lo: 0.18');
    expect(quiet).toContain('--nudge-hi: 0.5');
    expect(rule('.undo-slot.mistake-nudge {')).toContain('--nudge-hi: 0.92');
  });

  it('Reduce motion stops the animation but keeps the glow visible', () => {
    const reduced = css.slice(css.indexOf('html.reduce-motion .undo-slot.mistake-nudge .nudge-halo'));
    expect(reduced).toContain('animation: none');
    expect(reduced).toContain('opacity: var(--nudge-hi, 0.92)');
  });
});
