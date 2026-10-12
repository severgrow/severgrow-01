// Save / replay / determinism audit (Section 5). A Futasaku 0.4 match is fully reproducible from
// its versioned setup (rules version + seed + config + starting seat) plus the ordered actions.
// This also proves the presentation pipeline (animation steps, outcome light) never touches the
// authoritative state, so display randomness cannot change gameplay.
import { describe, expect, it } from 'vitest';
import {
  CURRENT_RULES_VERSION,
  apply,
  legalActions,
  matchSetup,
  mulberry32,
  replayMatch,
  viewFor,
} from '../../src/engine/index.js';
import type { Action, Player, State } from '../../src/engine/index.js';
import { Session } from '../../web/src/logic/session.js';
import { decodeSave, encodeSave } from '../../web/src/logic/persist.js';
import { buildSteps } from '../../web/src/logic/anim.js';
import { outcomeCue } from '../../web/src/player/outcome-light.js';

/** Canonical JSON (sorted object keys) so equal data always prints identically. */
const canonical = (x: unknown): string =>
  JSON.stringify(x, (_, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );

type Game = { seed: number; start: Player; setup: ReturnType<typeof matchSetup>; actions: Action[]; end: State; presentation: State };

/** Plays a full seeded-random match from the engine setup, optionally running the display pipeline. */
const playMatch = (seed: number, present = false): Game => {
  const setup = matchSetup(seed, CURRENT_RULES_VERSION);
  const rand = mulberry32(seed ^ 0x51ed);
  let s = replayMatch(setup, []);
  let presented = s;
  const actions: Action[] = [];
  for (let i = 0; i < 4000 && s.phase !== 'GAME_OVER'; i++) {
    const acts = legalActions(viewFor(s, s.actor));
    if (!acts.length) break;
    const a = acts[Math.floor(rand() * acts.length)]!;
    const before = s;
    s = apply(s, a);
    actions.push(a);
    if (present) {
      const steps = buildSteps(before, a, s, 0);
      outcomeCue(steps, 0);
      presented = s;
    }
  }
  return { seed, start: setup.startingPlayer, setup, actions, end: s, presentation: present ? presented : s };
};

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const GAMES = SEEDS.map((seed) => playMatch(seed));

describe('match determinism and replay (Section 5)', () => {
  it('setup + actions rebuilds the identical final state for 200 seeds, twice', () => {
    for (const g of GAMES) {
      const a = replayMatch(g.setup, g.actions);
      const b = replayMatch(g.setup, g.actions);
      expect(canonical(a)).toBe(canonical(g.end));
      expect(canonical(b)).toBe(canonical(a));
    }
  }, 120_000);

  it('covers both starting seats, the whole deck, and the major mechanics', () => {
    expect(GAMES.some((g) => g.start === 0)).toBe(true);
    expect(GAMES.some((g) => g.start === 1)).toBe(true);
    const seen = new Set<string>();
    for (const g of GAMES) for (const e of g.end.history ?? []) seen.add(e.t);
    for (const t of ['Bloom', 'Sprout', 'FruitCard', 'MegaBomb', 'Sever', 'Overgrow', 'Discard', 'GameEnd']) {
      expect(seen, `${t} must occur in the audit games`).toContain(t);
    }
    // Every game ends by deck exhaustion under random play, and the final turn is recorded.
    expect(GAMES.filter((g) => g.end.result?.reason === 'deck_exhaustion').length).toBeGreaterThan(0);
  });

  it('the display pipeline is read-only: presenting every move changes no authoritative state', () => {
    for (const seed of [1, 2, 3, 7, 13, 29]) {
      const plain = playMatch(seed, false).end;
      const presented = playMatch(seed, true);
      expect(canonical(presented.presentation)).toBe(canonical(presented.end));
      expect(canonical(presented.end)).toBe(canonical(plain));
    }
  });

  it('save/load round-trips the exact state for both starting seats', () => {
    const p0 = GAMES.find((g) => g.start === 0)!;
    const p1 = GAMES.find((g) => g.start === 1)!;
    // A player-0 start replays from the seed alone (`replay` is the neutral player-0 deal).
    const plain = decodeSave<null>(encodeSave({ seed: p0.seed, actions: p0.actions, coach: null, level: 7 }));
    expect(canonical(plain?.state)).toBe(canonical(p0.end));
    // A lottery (player 1) start keeps its authored opening as the base, as the browser does.
    const base = replayMatch(p1.setup, []);
    const based = decodeSave<null>(encodeSave({ seed: p1.seed, actions: p1.actions, coach: null, level: 7, base }));
    expect(canonical(based?.state)).toBe(canonical(p1.end));
  });

  it('Undo returns to the exact prior state', () => {
    const g = GAMES.find((c) => c.actions.length > 8)!;
    const session = new Session(replayMatch(g.setup, []));
    let before: State | null = null;
    let undoable = false;
    for (const a of g.actions) {
      const who = session.state.actor;
      const s = session.state;
      expect(session.play(a, who)).not.toBeNull();
      if (who === 0 && session.canUndo) {
        before = s;
        undoable = true;
        break;
      }
    }
    expect(undoable).toBe(true);
    expect(session.undo()).toBe(true);
    expect(canonical(session.state)).toBe(canonical(before!));
  });
});

describe('constructed endings replay identically (Section 5)', () => {
  const drawGame = (seed: number): State => {
    const base = replayMatch(matchSetup(seed, CURRENT_RULES_VERSION), []);
    const board = { ...base.board };
    board['-1,2'] = { owner: 0, strength: 3 };
    board['1,-2'] = { owner: 1, strength: 3 };
    return {
      ...base, board, deck: [], phase: 'ACT', startingPlayer: 0, turnPlayer: 0, actor: 0, turnNumber: 1,
      hands: [[{ id: 1, suit: 0, rank: 3 }], [{ id: 2, suit: 0, rank: 3 }]],
    };
  };
  it('a genuine score+strength draw is a real draw and replays byte-identically', () => {
    const moves: Action[] = [];
    let s = drawGame(101);
    let guard = 0;
    while (s.phase !== 'GAME_OVER' && guard++ < 8) {
      const act = apply(s, { t: 'EndAct' });
      moves.push({ t: 'EndAct' });
      s = act;
      if (s.phase === 'DISCARD') {
        const card = s.hands[s.turnPlayer][0]!.id;
        moves.push({ t: 'Discard', card });
        s = apply(s, { t: 'Discard', card });
      }
    }
    expect(s.phase).toBe('GAME_OVER');
    expect(s.result?.reason).toBe('deck_exhaustion');
    expect(s.result?.winner).toBeNull();
    expect(s.result?.scores).toEqual([1, 1]);
    // The same setup + the same ordered actions rebuild the same draw, twice.
    const again = moves.reduce((st, a) => apply(st, a), drawGame(101));
    expect(canonical(again)).toBe(canonical(s));
    expect(canonical(moves.reduce((st, a) => apply(st, a), drawGame(101)))).toBe(canonical(s));
  });

  it('a Strangle ending replays identically and names the loser', () => {
    // Same constructed surround as tests/engine/events.test.ts, replayed from scratch.
    const net = {
      '1,-1': [1, 1], '0,0': [1, 1], '-1,1': [1, 1], '-1,2': [1, 1],
      '-2,1': [1, 1], '-3,2': [1, 1], '-3,3': [1, 1], '-2,3': [1, 1],
    } as const;
    const opening = replayMatch(matchSetup(11, CURRENT_RULES_VERSION), []);
    const board = { ...opening.board };
    for (const [k, [owner, strength]] of Object.entries(net)) board[k] = { owner: owner as Player, strength };
    const card = opening.hands[1].find((c) => c.suit !== null)!;
    const s: State = {
      ...opening, board, phase: 'ACT', startingPlayer: 1, turnPlayer: 1, actor: 1, sproutsThisTurn: 0,
      hands: [opening.hands[0], [card]],
    };
    const action: Action = { t: 'Sprout', card: card.id, coord: { q: 2, r: -1 } };
    const played = apply(s, action);
    expect(played.result?.reason).toBe('strangle');
    const replayed = apply(s, action);
    expect(canonical(replayed)).toBe(canonical(played));
    expect(played.history!.filter((e) => e.t === 'Strangle')).toEqual([{ t: 'Strangle', player: 0 }]);
  });
});
