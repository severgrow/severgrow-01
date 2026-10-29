// THE INQUEST (surprise brief, 2026-10-29): one line on the finish card naming the turn the match
// was decided on. These tests pin THE RULE (see `web/src/logic/inquest.ts`): a closed home first,
// then the biggest single sever (ties to the earliest turn, one tile never counts), then the tally,
// then the ending itself — and nothing at all when the record cannot explain the result.
//
// They are hand-built histories, so every sentence below is the exact one the card would show.
import { describe, expect, it } from 'vitest';
import { applyAs, eventsFor, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Event, GameResult, Player, State } from '../../src/engine/index.js';
import { groupTurns } from '../src/online/opponent-turn-replay.js';
import { inquest } from '../src/logic/inquest.js';
import type { FinishResult } from '../src/logic/log.js';

// ---------- hand-built public histories ----------

/** A turn exists in the public log because its draw does: one Draw per player-turn. */
const draw = (player: Player): Event => ({ t: 'Draw', player, from: 'deck' });
const discard = (player: Player, card = 1): Event => ({ t: 'Discard', player, card });
const bloom = (player: Player, n: number): Event => ({
  t: 'Bloom',
  player,
  cards: [],
  hexes: Array.from({ length: n }, (_, i) => ({ q: i, r: 0 })),
});
const sprout = (player: Player): Event => ({ t: 'Sprout', player, card: 1, coord: { q: 0, r: 0 } });
const overgrow = (player: Player): Event => ({
  t: 'Overgrow',
  player,
  coord: { q: 0, r: 0 },
  oldOwner: (1 - player) as Player,
  oldStrength: 2,
  newStrength: 7,
});
/** `player` is the seat whose tiles were cut: that is what the Sever event records. */
const sever = (player: Player, n: number): Event => ({
  t: 'Sever',
  player,
  coords: Array.from({ length: n }, (_, i) => ({ q: i, r: 0 })),
});
/** `player` is the seat that was surrounded: that is what the Strangle event records. */
const strangle = (player: Player): Event => ({ t: 'Strangle', player });
const end = (result: FinishResult): Event => ({ t: 'GameEnd', result: result as GameResult });

/** `n` player-turns, alternating from `start`; the last one is the turn anything appended joins. */
const turns = (n: number, start: Player = 0): Event[] =>
  Array.from({ length: n }, (_, i) => draw(((start + i) % 2) as Player));

const score = (over: Partial<FinishResult> = {}): FinishResult => ({
  winner: 0,
  reason: 'deck_exhaustion',
  scores: [18, 9],
  ...over,
});

// ---------- the rule, in order ----------

describe('rule 1: a closed home is the moment, whatever else happened', () => {
  it('names the turn and the move that took the last side (a win)', () => {
    // 23 player-turns: the event sits on turn 23, which is round 12 for both players.
    const history = [...turns(22), draw(0), bloom(0, 3), strangle(1), end(score({ reason: 'strangle', scores: [20, 4] }))];
    const line = inquest(history, score({ reason: 'strangle', scores: [20, 4] }), 0);
    expect(line).toEqual({ kind: 'close', turn: 12, text: 'Turn 12: your 3-tile Bloom took the last side of their home.' });
  });

  it('says it from the losing seat too', () => {
    const history = [...turns(11), draw(1), bloom(1, 4), strangle(0), end(score({ reason: 'strangle', winner: 1 }))];
    expect(inquest(history, score({ reason: 'strangle', winner: 1 }), 0)?.text).toBe(
      'Turn 6: their 4-tile Bloom took the last side of your home.',
    );
  });

  it('picks the LARGEST placement of the closing turn, not the first', () => {
    const history = [...turns(11), draw(1), sprout(1), bloom(1, 4), strangle(0), end(score({ reason: 'strangle', winner: 1 }))];
    expect(inquest(history, score({ reason: 'strangle', winner: 1 }), 0)?.text).toBe(
      'Turn 6: their 4-tile Bloom took the last side of your home.',
    );
  });

  it('names an Overgrow when that is what took the side', () => {
    const history = [...turns(11), draw(1), overgrow(1), strangle(0), end(score({ reason: 'strangle', winner: 1 }))];
    expect(inquest(history, score({ reason: 'strangle', winner: 1 }), 0)?.text).toBe(
      'Turn 6: their Overgrow took the last side of your home.',
    );
  });

  it('uses the player-facing words (Grow / Bomb / Blast), never an engine id', () => {
    // The engine ids stay Sprout / PlayFruit / MegaBomb for compatibility; the card speaks the
    // product's own names (CLAUDE.md), so no sentence may contain an engine id.
    const grow = [...turns(11), draw(1), sprout(1), strangle(0), end(score({ reason: 'strangle', winner: 1 }))];
    expect(inquest(grow, score({ reason: 'strangle', winner: 1 }), 0)?.text).toBe(
      'Turn 6: their Grow took the last side of your home.',
    );
    const blast = [
      ...turns(11),
      draw(1),
      { t: 'MegaBomb', player: 1, cards: [1, 2], target: { q: 0, r: 0 }, destroyed: [{ q: 0, r: 0 }] } as Event,
      strangle(0),
      end(score({ reason: 'strangle', winner: 1 })),
    ];
    expect(inquest(blast, score({ reason: 'strangle', winner: 1 }), 0)?.text).toBe(
      'Turn 6: their Blast took the last side of your home.',
    );
  });

  it('both homes sealed in one turn is a draw, and says so', () => {
    const result = score({ reason: 'double_strangle', winner: null, scores: [11, 11] });
    const history = [...turns(11), draw(1), bloom(1, 2), strangle(0), strangle(1), end(result)];
    expect(inquest(history, result, 0)).toEqual({ kind: 'double', turn: 6, text: 'A draw. Both homes were sealed on turn 6.' });
  });

  it('a strangle the log does not contain is not invented', () => {
    // A pruned tail: the result says strangle, the events stop before the closing turn.
    const history = [...turns(8)];
    expect(inquest(history, score({ reason: 'strangle' }), 0)).toBeNull();
  });
});

describe('rule 2: otherwise the biggest single sever decides it', () => {
  const cutGame = (): Event[] => [
    ...turns(5),
    bloom(0, 3),
    sever(1, 6),
    discard(0),
    ...turns(14, 1),
  ];

  it('names the cut, and that the victim never grew again', () => {
    const line = inquest(cutGame(), score(), 0);
    expect(line).toEqual({ kind: 'cut', turn: 3, text: 'Turn 3: you cut 6 of their links, and they never grew again.' });
  });

  it('falls back to the score when the victim did grow back', () => {
    const history = [...turns(5), bloom(0, 3), sever(1, 6), discard(0), ...turns(6, 1), sprout(1), ...turns(8, 0)];
    expect(inquest(history, score(), 0)?.text).toBe('Turn 3: you cut 6 of their links. The score finished 18 to 9.');
  });

  it('reads from the losing seat too', () => {
    const history = [...turns(4), bloom(1, 6), sever(0, 4), discard(1), ...turns(15, 0)];
    expect(inquest(history, score({ winner: 1, scores: [9, 18] }), 0)?.text).toBe(
      'Turn 2: they cut 4 of your links, and you never grew again.',
    );
  });

  it('a tie goes to the EARLIEST turn', () => {
    // Turn 3 (player 0) cuts 3; turn 7 (player 1) also cuts 3. The earlier one is the moment.
    const history = [
      ...turns(2),
      bloom(0, 2),
      sever(1, 3),
      discard(0),
      ...turns(4, 1),
      bloom(1, 2),
      sever(0, 3),
      discard(1),
      ...turns(2, 0),
    ];
    // The later cut is also a placement by the victim, so the tail is the score, not "never grew".
    expect(inquest(history, score(), 0)?.text).toBe('Turn 2: you cut 3 of their links. The score finished 18 to 9.');
  });

  it('a bigger cut later beats a smaller one earlier', () => {
    const history = [
      ...turns(2),
      bloom(0, 2),
      sever(1, 2),
      discard(0),
      ...turns(4, 1),
      bloom(1, 3),
      sever(0, 5),
      discard(1),
      ...turns(2, 0),
    ];
    const line = inquest(history, score({ winner: 1, scores: [9, 18] }), 0);
    expect(line?.turn).toBe(4);
    expect(line?.text).toBe('Turn 4: they cut 5 of your links, and you never grew again.');
  });

  it('a single tile is not a moment: one-tile sever falls through to the tally', () => {
    const history = [...turns(2), bloom(0, 2), sever(1, 1), discard(0), ...turns(7, 1)];
    expect(inquest(history, score({ reason: 'turn_limit', scores: [20, 11] }), 0)?.text).toBe(
      'The turn limit came on turn 5: 20 to 11.',
    );
  });
});

describe('rule 3: a match with no such cut is decided by its tally', () => {
  it('the deck end', () => {
    expect(inquest(turns(20), score(), 0)?.text).toBe('The deck ran out on turn 10: 18 to 9.');
  });

  it('the turn limit', () => {
    expect(inquest(turns(60), score({ reason: 'turn_limit', scores: [30, 24] }), 0)?.text).toBe(
      'The turn limit came on turn 30: 30 to 24.',
    );
  });

  it('a true draw', () => {
    expect(inquest(turns(24), score({ winner: null, scores: [13, 13] }), 0)?.text).toBe(
      'A draw on turn 12: 13 each.',
    );
  });

  it('the archived knock', () => {
    const history = [...turns(5), { t: 'Knock', player: 1 } as Event];
    expect(inquest(history, score({ reason: 'knock', winner: 0, undercut: true, scores: [10, 8] }), 0)?.text).toBe(
      'Turn 3: their knock was counted at 10 to 8.',
    );
  });
});

describe('rule 4: a resignation or a timeout is decided by the ending itself', () => {
  it('you resigned', () => {
    const result = score({ reason: 'resigned', winner: 1, scores: [6, 9] });
    expect(inquest(turns(8), result, 0)?.text).toBe('Turn 4: you resigned with the score at 6 to 9.');
  });

  it('they resigned, read from the winning seat', () => {
    const result = score({ reason: 'resigned', winner: 0, scores: [9, 6] });
    expect(inquest(turns(8), result, 0)?.text).toBe('Turn 4: they resigned with the score at 9 to 6.');
  });

  it('your clock ran out', () => {
    const result = score({ reason: 'timeout', winner: 1, scores: [6, 9] });
    expect(inquest(turns(8), result, 0)?.text).toBe('Turn 4: your clock ran out with the score at 6 to 9.');
  });

  it('their clock ran out', () => {
    const result = score({ reason: 'timeout', winner: 0, scores: [9, 6] });
    expect(inquest(turns(8), result, 1)?.text).toBe('Turn 4: your clock ran out with the score at 6 to 9.');
    expect(inquest(turns(8), result, 0)?.text).toBe('Turn 4: their clock ran out with the score at 9 to 6.');
  });
});

describe('when the record cannot carry the line, it says nothing', () => {
  it('no history at all (a pruned duel)', () => {
    expect(inquest([], score(), 0)).toBeNull();
    expect(inquest([], score({ reason: 'strangle' }), 0)).toBeNull();
  });

  it('no result', () => {
    expect(inquest(turns(10), null, 0)).toBeNull();
  });

  it('a reason this module cannot explain (a future one) is never guessed', () => {
    const unknown = score({ reason: 'abandoned' as FinishResult['reason'] });
    expect(inquest(turns(10), unknown, 0)).toBeNull();
  });

  it('a knock without its event is not invented', () => {
    expect(inquest(turns(6), score({ reason: 'knock', winner: 0, scores: [1, 0] }), 0)).toBeNull();
  });
});

// ---------- turns, and the hidden-information rule ----------

/** Play a whole seeded match with real legal moves for both seats. */
const playOut = (seed: number): State => {
  let s = newGame(seed);
  for (let i = 0; i < 3000 && s.phase !== 'GAME_OVER'; i++) {
    const legal: Action[] = legalActions(viewFor(s, s.actor));
    if (!legal.length) break;
    const order: Action['t'][] = s.phase === 'DRAW' ? ['Draw'] : ['Bloom', 'Sprout', 'PlayFruit', 'MegaBomb', 'EndAct', 'Discard'];
    const pick = order.map((t) => legal.find((a) => a.t === t)).find((a): a is Action => !!a) ?? legal[0]!;
    s = applyAs(s, s.actor as Player, pick);
  }
  return s;
};

describe('the turn a sentence cites is the real one', () => {
  it('the public grouping is exactly one group per player-turn', () => {
    // The whole rule rests on this: `groupTurns` + 1 IS the engine's `turnNumber`. If this ever
    // drifts, every sentence would cite the wrong turn, so it is pinned against real games.
    for (const seed of [1, 7, 42, 219682080, 96001]) {
      const st = playOut(seed);
      expect(st.phase).toBe('GAME_OVER');
      expect(groupTurns(eventsFor(st, 0)).length).toBe(st.turnNumber);
    }
  });

  it('a real match produces a line whose turn is inside the match', () => {
    const st = playOut(219682080);
    const line = inquest(eventsFor(st, 0), st.result, 0);
    expect(line).not.toBeNull();
    expect(line!.turn).toBeGreaterThan(0);
    expect(line!.turn).toBeLessThanOrEqual(Math.ceil(st.turnNumber / 2));
    expect(line!.text.length).toBeGreaterThan(20);
  });
});

describe('the line never reads the other seat\'s hidden cards', () => {
  /** The event list with every opponent deck draw filled in, as a leaky caller would hand it over. */
  const leaky = (events: readonly Event[], player: Player): Event[] =>
    events.map((e) => (e.t === 'Draw' && e.from === 'deck' && e.player !== player ? { ...e, card: 999 } : e));

  it('hidden draw cards change nothing, because nothing reads them', () => {
    const st = playOut(7);
    const publicEvents = eventsFor(st, 0);
    const withHidden = leaky(publicEvents, 0);
    expect(inquest(withHidden, st.result, 0)).toEqual(inquest(publicEvents, st.result, 0));
    // And a second, completely different hidden hand cannot change it either.
    const other = withHidden.map((e) => (e.t === 'Draw' && e.card === 999 ? { ...e, card: 1 } : e));
    expect(inquest(other, st.result, 0)).toEqual(inquest(publicEvents, st.result, 0));
  });

  it('a hand-built history against a whole deck cannot name a card', () => {
    const line = inquest([...turns(5), bloom(0, 3), sever(1, 6), discard(0), ...turns(14, 1)], score(), 0);
    expect(line!.text).not.toMatch(/[♠♥♦♣]|suit|deck order/i);
  });
});
