import { describe, expect, it } from 'vitest';
import { apply, legalActions, mulberry32, newGame, resolveConfig, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Player, RulesConfig, State, View } from '../../src/engine/index.js';
import { COACH_STEPS, TIP_ORDER, TUTORIAL_SEED, coachAdvice, coachSummary } from '../../src/playtest/coach.js';
import type { Advice, TipId } from '../../src/playtest/coach.js';
import { LEGACY_V03 } from '../legacy.js';
import { createGreedyBot, rankActions, scoreBoardMove } from '../../src/bots/GreedyBot.js';
import { chain, fixture } from '../helpers.js';

const key = (a: Action) => JSON.stringify(a);
const card = (id: number, suit: 0 | 1 | 2 | 3, rank: number): Card => ({ id, suit, rank });
const input = (view: View, extra: Partial<Parameters<typeof coachAdvice>[0]> = {}) => ({
  view,
  step: 0,
  enabled: true,
  taught: [] as TipId[],
  known: [] as string[],
  ...extra,
});

/** Human-to-act states (player 1) from seeded random play with the given config. */
const humanStates = (config: Partial<RulesConfig>, count: number): State[] => {
  const out: State[] = [];
  for (let seed = 1; out.length < count && seed < 2000; seed++) {
    const rand = mulberry32(seed * 7 + 1);
    let s = newGame(seed, config);
    for (let i = 0; i < 400 && s.phase !== 'GAME_OVER' && out.length < count; i++) {
      if (s.actor === 0 && i % 3 === 0) out.push(s);
      const acts = legalActions(viewFor(s, s.actor));
      s = apply(s, acts[Math.floor(rand() * acts.length)]!);
    }
  }
  return out;
};

const texts = (a: Advice): string[] => [a.suggested, ...a.why, a.tip?.text ?? ''];

describe('coach: suggestions', () => {
  // The one game (parked rules off), and the parked rules switched on.
  const lite = humanStates({}, 500);
  const classic = humanStates(LEGACY_V03, 500);

  it('always suggests a move from the engine’s legal-actions list (1,000 states)', () => {
    expect(lite.length + classic.length).toBe(1000);
    for (const [core, states] of [[true, lite], [false, classic]] as const) {
      for (const s of states) {
        const v = viewFor(s, 0);
        const adv = coachAdvice(input(v))!;
        expect(adv).not.toBeNull();
        expect(legalActions(v).map(key)).toContain(key(adv.action));
        // v0.5: Fruit is part of the one game; the parked rules (Knock, Rot) never show up
        if (core) expect(['Knock', 'Continue', 'RotPick']).not.toContain(adv.action.t);
      }
    }
  }, 300_000);

  it('the same state always gives the same suggestion (and survives a JSON round trip)', () => {
    for (const s of lite.slice(0, 120)) {
      const v = viewFor(s, 0);
      const a = coachAdvice(input(v));
      expect(coachAdvice(input(v))).toEqual(a);
      expect(coachAdvice(input(JSON.parse(JSON.stringify(v)) as View))).toEqual(a);
    }
  }, 120_000);

  it('never reads the bot’s hidden cards: it only gets a View, and hidden changes do not matter', () => {
    for (const s of classic.slice(0, 120)) {
      const hidden: State = { ...s, deck: [...s.deck].reverse(), hands: [s.hands[0], s.hands[1].map((c) => ({ ...c, rank: 10 - c.rank }))] };
      expect(coachAdvice(input(viewFor(hidden, 0)))).toEqual(coachAdvice(input(viewFor(s, 0))));
    }
    // What it is given: a View has no opponent hand and no deck.
    const v = viewFor(classic[0]!, 0) as unknown as Record<string, unknown>;
    expect(v.hands).toBeUndefined();
    expect(v.deck).toBeUndefined();
  }, 120_000);

  it('"show another" walks down the ranking and wraps around', () => {
    const s = lite.find((x) => x.phase === 'ACT' && legalActions(viewFor(x, 0)).length > 3)!;
    const v = viewFor(s, 0);
    const ranked = rankActions(v, { allowKnock: false });
    for (let i = 0; i < ranked.length + 2; i++) {
      const adv = coachAdvice(input(v), i)!;
      expect(adv.action).toEqual(ranked[i % ranked.length]!.action);
      expect(adv.choice).toBe(i % ranked.length);
      expect(adv.choices).toBe(ranked.length);
    }
  });

  it('explains with at most 2 short sentences and highlights the move’s cards and hexes', () => {
    for (const s of lite.slice(0, 200)) {
      const adv = coachAdvice(input(viewFor(s, 0)))!;
      expect(adv.why.length).toBeGreaterThanOrEqual(1);
      expect(adv.why.length).toBeLessThanOrEqual(2);
      for (const w of adv.why) expect(w.length).toBeLessThan(160);
      if (adv.action.t === 'Bloom') {
        expect(adv.cards).toEqual(adv.action.cards);
        expect(adv.hexes.length).toBe(adv.action.cards.length);
      }
    }
  }, 120_000);
});

describe('coach: on and off', () => {
  const v = viewFor(newGame(4), 0);

  it(`is active for the first ${COACH_STEPS} steps only`, () => {
    expect(COACH_STEPS).toBe(15);
    expect(coachAdvice(input(v, { step: 0 }))).not.toBeNull();
    expect(coachAdvice(input(v, { step: COACH_STEPS - 1 }))).not.toBeNull();
    expect(coachAdvice(input(v, { step: COACH_STEPS }))).toBeNull();
  });

  it('gives nothing when the toggle is off, and hints again when it is turned back on', () => {
    expect(coachAdvice(input(v, { enabled: false }))).toBeNull();
    expect(coachAdvice(input(v, { enabled: true }))).not.toBeNull();
  });

  it('gives nothing when it is not the player’s move or the game is over', () => {
    const s = apply(newGame(4), { t: 'Draw', from: 'deck' }); // player 1 is acting
    expect(coachAdvice(input(viewFor(s, 1)))).toBeNull();
    const over: State = { ...s, phase: 'GAME_OVER', result: { winner: 0, reason: 'strangle', scores: [1, 0] } };
    expect(coachAdvice(input(viewFor(over, 0)))).toBeNull();
  });
});

describe('coach: tactic tips and words', () => {
  it('teaches one new idea at a time, in order, and never repeats one', () => {
    let s = newGame(TUTORIAL_SEED);
    const taught: TipId[] = [];
    let known: string[] = [];
    const bot = createGreedyBot({ allowKnock: false });
    for (let step = 0; step < COACH_STEPS && s.phase !== 'GAME_OVER'; ) {
      if (s.actor === 1) {
        s = apply(s, bot.chooseAction(viewFor(s, 1)));
        continue;
      }
      const adv = coachAdvice(input(viewFor(s, 0), { step, taught, known }))!;
      if (adv.tip) {
        expect(taught).not.toContain(adv.tip.id);
        taught.push(adv.tip.id);
      }
      known = adv.known;
      s = apply(s, adv.action);
      step++;
    }
    expect(taught[0]).toBe('goal');
    expect(new Set(taught).size).toBe(taught.length);
    expect(taught.length).toBeGreaterThanOrEqual(5);
  });

  it('explains a game word the first time it is used, then not again', () => {
    const v = viewFor(newGame(4), 0);
    const first = coachAdvice(input(v))!;
    expect(texts(first).join(' ')).toMatch(/\(/); // some word explained in brackets
    const again = coachAdvice(input(v, { known: first.known, taught: first.tip ? [first.tip.id] : [] }))!;
    for (const word of first.known) {
      const explained = new RegExp(`${word} \\(`, 'i');
      expect(texts(again).some((t) => explained.test(t))).toBe(false);
    }
  });

  it('with the parked rules off it never mentions Rot, Knock or leftover points; with Fruit off, never Fruit', () => {
    const bad = /\brot\b|rotted|knock|deadwood|leftover/i;
    for (const s of humanStates({ fruitCardCount: 0 }, 100)) {
      const v = viewFor(s, 0);
      for (let choice = 0; choice < 3; choice++) {
        const adv = coachAdvice(input(v, { taught: TIP_ORDER.slice(0, s.turnNumber % TIP_ORDER.length) }), choice)!;
        for (const t of texts(adv)) expect(t).not.toMatch(/fruit/i);
      }
    }
    for (const s of humanStates({}, 300)) {
      const v = viewFor(s, 0);
      for (let choice = 0; choice < 3; choice++) {
        const adv = coachAdvice(input(v, { taught: TIP_ORDER.slice(0, s.turnNumber % TIP_ORDER.length) }), choice)!;
        for (const t of texts(adv)) expect(t).not.toMatch(bad);
      }
    }
    for (const t of coachSummary(TIP_ORDER, resolveConfig()).bullets) expect(t).not.toMatch(bad);
  }, 120_000);

  it('teaches Sprout when it is on, and only then', () => {
    const states = humanStates({}, 200).filter((s) => s.phase === 'ACT' && legalActions(viewFor(s, 0)).some((a) => a.t === 'Sprout'));
    expect(states.length).toBeGreaterThan(0);
    const tip = coachAdvice(input(viewFor(states[0]!, 0), { taught: ['goal', 'draw', 'combos'] }))!.tip;
    expect(tip?.id).toBe('sprout');
    const off = humanStates({ sproutsPerTurn: 0 }, 100);
    for (const s of off) expect(coachAdvice(input(viewFor(s, 0), { taught: ['goal', 'draw', 'combos'] }))!.tip?.id).not.toBe('sprout');
  });

  it('the summary at the end lists 3 things to remember', () => {
    const sum = coachSummary(['goal', 'draw', 'combos', 'connection', 'cutting'], resolveConfig());
    expect(sum.title).toBe("You're on your own now. Here's what to remember:");
    expect(sum.bullets).toHaveLength(3);
  });

  it('the tutorial seed’s first 15 steps are always the same', () => {
    const run = () => {
      let s = newGame(TUTORIAL_SEED);
      const out: string[] = [];
      const bot = createGreedyBot({ allowKnock: false });
      for (let step = 0; step < COACH_STEPS && s.phase !== 'GAME_OVER'; ) {
        if (s.actor === 1) {
          s = apply(s, bot.chooseAction(viewFor(s, 1)));
          continue;
        }
        const adv = coachAdvice(input(viewFor(s, 0), { step }))!;
        out.push(adv.suggested);
        s = apply(s, adv.action);
        step++;
      }
      return out;
    };
    const a = run();
    expect(a).toHaveLength(COACH_STEPS);
    expect(run()).toEqual(a);
  });
});

// ---------- adversarial: never walk into a big cut when a safe move is about as good ----------

const actState = (tiles: Record<string, [Player, number]>, hand: Card[]): View => {
  const f = fixture({ tiles });
  const base = newGame(1);
  return viewFor({ ...base, board: f.board, terrain: f.terrain, hands: [hand, base.hands[1]], phase: 'ACT' }, 0);
};
const sixes = [card(11, 1, 6), card(12, 2, 6), card(13, 3, 6)];
const run345 = [card(1, 0, 3), card(2, 0, 4), card(3, 0, 5)];
// (a move off the bot's Bloom shortlist is scored on its own)
const factsOf = (v: View, a: Action) => (rankActions(v, { allowKnock: false }).find((r) => key(r.action) === key(a)) ?? scoreBoardMove(v, a as never)).facts;

describe('coach: adversarial safety', () => {
  it('ADV-1: does not hang a new bloom off a weak tile near the bot when a safe +3 exists', () => {
    // Weak strength-1 tile at (-1,1). A run bloom from (0,0) eastward would hang 4 tiles off it.
    const v = actState({ '-1,1': [0, 1] }, [...run345, ...sixes, card(20, 3, 9)]);
    const risky: Action = { t: 'Bloom', cards: [1, 2, 3], hexes: chain({ q: 0, r: 0 }, 0, 3) };
    const rf = factsOf(v, risky);
    expect(rf.kind === 'bloom' && rf.move.exposureAfter).toBe(4);
    const adv = coachAdvice(input(v))!;
    expect(key(adv.action)).not.toBe(key(risky));
    const f = factsOf(v, adv.action);
    expect(f.kind === 'bloom' ? f.move.exposureAfter : 0).toBeLessThan(4);
  });

  it('ADV-2: does not take a bot tile if that leaves 4 tiles on a thin link, when a safe +3 exists', () => {
    // Bot: (0,0) strength 2 linked to its root through (1,-1) strength 7.
    const v = actState({ '-1,1': [0, 1], '0,0': [1, 2], '1,-1': [1, 7] }, [...run345, ...sixes, card(20, 3, 9)]);
    const greedyTake: Action = { t: 'Bloom', cards: [1, 2, 3], hexes: chain({ q: 0, r: 0 }, 0, 3) };
    const rf = factsOf(v, greedyTake);
    expect(rf.kind === 'bloom' && rf.move.taken).toBe(1);
    expect(rf.kind === 'bloom' && rf.move.exposureAfter).toBeGreaterThanOrEqual(4);
    const adv = coachAdvice(input(v))!;
    const f = factsOf(v, adv.action);
    expect(f.kind === 'bloom' ? f.move.exposureAfter : 0).toBeLessThan(4);
  });

  it('ADV-3: prefers a move that protects an existing thin link over an equal move that does not', () => {
    // Chain root-(-1,1)s1-(0,0)-(1,0)-(2,0): cutting (-1,1) loses 4 tiles.
    const v = actState({ '-1,1': [0, 1], '0,0': [0, 5], '1,0': [0, 5], '2,0': [0, 5] }, [...run345, ...sixes, card(20, 3, 9)]);
    const protect: Action = { t: 'Bloom', cards: [11, 12, 13], hexes: [{ q: -1, r: 2 }, { q: 0, r: 1 }, { q: 1, r: 1 }] };
    const pf = factsOf(v, protect);
    expect(pf.kind === 'bloom' && pf.move.exposureBefore).toBe(4);
    expect(pf.kind === 'bloom' && pf.move.exposureAfter).toBeLessThan(4);
    const adv = coachAdvice(input(v))!;
    const f = factsOf(v, adv.action);
    expect(f.kind === 'bloom' ? f.move.exposureAfter : 4).toBeLessThan(4);
    expect(adv.why.join(' ')).toMatch(/weak spot/i);
  });
});
