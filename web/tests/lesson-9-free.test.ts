// LEVEL 9 IS A FULL GAME (owner, 2026-11-01)
//
// The Throw-pile lesson used to be a scripted opening with a forced Bloom. It is now a real match
// from scratch on the small map: the engine's own deal, the real bot, every legal move, a real
// result — and the live display keeps coaching each action as it happens.
//
// These tests pin the decisions the change rests on:
//   * the opening is the campaign level's real `newMatch`, on radius 2 (19 hexes), resumable;
//   * the game is winnable AND losable, and its finish is a real GAME_OVER result;
//   * the cue chooser speaks the LESSON words for DRAW / choose / throw / their turn from the live
//     state, and mastery may soften that light but never silence the line;
//   * a finished lesson 9 counts in the offline record, completes the level and unlocks 10; a loss
//     takes nothing away.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { apply, legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { mulberry32 } from '../../src/engine/prng.js';
import { botSeed, chooseLevelAction } from '../../src/bots/levels.js';
import { CAMPAIGN_LEVELS, campaignDeal, campaignOpening, currentLevel } from '../../src/campaign/index.js';
import type { CampaignProgress } from '../../src/campaign/index.js';
import { SMALL_BOARD_RADIUS } from '../../src/campaign/small-board.js';
import { LESSON } from '../../src/strings.js';
import {
  lessonBeat, lessonFor, lessonIsFree, lessonLocked, lessonOpening, presentedLessonBeat, suggestMove,
} from '../src/lessons/lessons.js';
import type { Beat, BeatCtx } from '../src/lessons/lessons.js';
import { lessonResumable } from '../src/lessons/lesson-save.js';
import { throwPileCompletesBloom } from '../src/logic/pile-glow.js';
import { decodeSave, encodeSave } from '../src/logic/persist.js';
import { countsTowardRecord } from '../src/logic/stats.js';
import { progressAfterMatch } from '../src/logic/campaign.js';
import { playsStarterRitual } from '../src/logic/starter-ritual.js';

const LEVEL = CAMPAIGN_LEVELS.find((l) => l.number === 9)!;
const L9 = lessonFor(9)!;

const mainSource = readFileSync(fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8');

/** One honest turn by the strongest chooser the bots expose — my side of the test game. */
const choose = (s: State): Action => {
  const v = viewFor(s, 0);
  return chooseLevelAction(v, 9, botSeed(s.seed, 9, s.turnNumber, s.history?.length ?? 0));
};

/** The opponent is the level's own bot, exactly as the page asks it. */
const opponent = (s: State): Action => {
  const v = viewFor(s, 1);
  return chooseLevelAction(v, LEVEL.botLevel, botSeed(s.seed, LEVEL.botLevel, s.turnNumber, s.history?.length ?? 0));
};

/** A deliberately poor but legal player: draw, end the Grow, throw a card. Never Grow. */
const neverGrow = (s: State): Action => {
  const legal = legalActions(viewFor(s, 0));
  if (s.phase === 'DRAW') return legal.find((a) => a.t === 'Draw' && a.from === 'deck') ?? legal.find((a) => a.t === 'Draw') ?? legal[0]!;
  if (s.phase === 'ACT') return legal.find((a) => a.t === 'EndAct') ?? legal[0]!;
  return legal.find((a) => a.t === 'Discard') ?? legal[0]!;
};

const play = (me: (s: State) => Action): State => {
  let s = lessonOpening(L9);
  for (let i = 0; i < 800 && s.phase !== 'GAME_OVER'; i++) s = apply(s, s.actor === 0 ? me(s) : opponent(s));
  return s;
};

/**
 * The walk the screen takes when the player follows the light: every beat read from the live state,
 * with the position it was read at. The same chooser the cockpit shows (`suggestMove`), the level's
 * real bot on their turn.
 */
const walkBeats = (): { beat: Beat | null; state: State }[] => {
  const out: { beat: Beat | null; state: State }[] = [];
  const seen = new Set<string>();
  let s = lessonOpening(L9);
  for (let i = 0; i < 800 && s.phase !== 'GAME_OVER'; i++) {
    const beat = lessonBeat(L9, s, { card: null, placing: null, throwPending: null, seen });
    out.push({ beat, state: s });
    if (beat?.explain) seen.add(beat.id);
    const move = s.actor === 0 ? suggestMove(L9, s) ?? legalActions(viewFor(s, 0))[0]! : opponent(s);
    s = apply(s, move);
  }
  return out;
};

/** The live cue's context: the one line this level still says is already read, and every power
 *  hello is remembered, so the chooser is judged on the action, not on a one-time notification. */
const ctx = (over: Partial<BeatCtx> = {}): BeatCtx => ({
  card: null,
  placing: null,
  throwPending: null,
  seen: new Set(['9:intro:pile-gold']),
  powerSeen: new Set(['bloom', 'bomb', 'blast']),
  ...over,
});

/**
 * The real deal holds four 2s, so a Bloom is legal on the first turn. These cue tests are about the
 * plain Grow/Throw words, so this drops the 2s from the hand (a hand is not validated by the
 * engine's legal-move reader) and every move played below is still a real legal move.
 */
const afterDrawWithoutBloom = (): State => {
  const drawn = apply(lessonOpening(L9), { t: 'Draw', from: 'deck' });
  const s: State = { ...drawn, hands: [drawn.hands[0].filter((c) => c.rank !== 2), drawn.hands[1]] };
  expect(legalActions(viewFor(s, 0)).some((a) => a.t === 'Bloom')).toBe(false);
  return s;
};

describe('lesson 9 is a full game on the small map', () => {
  it('is a free lesson: no authored position, a real deal, the campaign board and bot', () => {
    expect(lessonIsFree(L9)).toBe(true);
    expect(L9.position, 'no scripted opening').toBeUndefined();
    expect(L9.goals, 'nothing is forced').toEqual([]);
    expect(L9.locked, 'every legal tap is the player’s').toBe(false);
    expect(L9.opponent).toEqual({ bot: LEVEL.botLevel });

    const s = lessonOpening(L9);
    expect(s.config.boardRadius).toBe(SMALL_BOARD_RADIUS);
    expect(Object.keys(s.board)).toHaveLength(19);
    expect(lessonLocked(L9, s), 'the guided input gate is not in this game').toBe(false);
    expect(s.phase).toBe('DRAW');
    // ONE FIXED DEAL (owner, 2026-11-12): still a real campaign deal on the campaign level's own
    // board and rules — pinned to a seed whose Throw-pile top really completes a Bloom in hand.
    // Levels 1-9 pay no Seeds, so there is no proof to replay; the game itself is unchanged.
    expect(s).toEqual(campaignDeal(LEVEL, s.seed));
    expect(s.terrain).toEqual(campaignOpening(LEVEL).terrain);
    expect(s.config).toEqual(campaignOpening(LEVEL).config);
    expect(lessonOpening(L9)).toEqual(s);
    expect(s.deck.length).toBeGreaterThan(30);
  });

  /**
   * THE INVARIANT (owner, 2026-11-12): level 9 says "The Throw pile glows gold when its top card
   * completes a Bloom in your hand." before the first draw. That sentence must be TRUE when it is
   * said, and it is judged by the product's OWN glow rule (`logic/pile-glow.ts`, the function
   * main.ts paints the gold light from) — never a second definition of "completes a Bloom".
   */
  it('the Throw-pile sentence is true when it is said: the glow rule fires at 9:intro:pile-gold', () => {
    const at = walkBeats().find((x) => x.beat?.id === '9:intro:pile-gold');
    expect(at, 'the sentence is shown once, before the first draw').toBeDefined();
    expect(at!.state.phase).toBe('DRAW');
    expect(at!.state.actor).toBe(0);
    const top = at!.state.discard.at(-1);
    expect(top, 'the Throw pile has a top card to talk about').toBeDefined();
    // THE INVARIANT: the light's own rule is true at this exact moment.
    expect(throwPileCompletesBloom(at!.state.hands[0], top, at!.state.config.expandedBloom !== false)).toBe(true);
    // ...and the card is one the player may really take: a legal Draw from the Throw pile.
    expect(legalActions(viewFor(at!.state, 0)).some((a) => a.t === 'Draw' && a.from === 'discard')).toBe(true);
  });

  it('still deals a legal, playable opening: both piles can be drawn, a real game follows', () => {
    const s = lessonOpening(L9);
    const legal = legalActions(viewFor(s, 0));
    expect(legal.some((a) => a.t === 'Draw' && a.from === 'deck'), 'the Draw pile is open').toBe(true);
    expect(legal.some((a) => a.t === 'Draw' && a.from === 'discard'), 'the Throw pile is open').toBe(true);
    // Nothing in the pinned deal blocks the opening: a Grow is legal right after the draw.
    const drawn = apply(s, { t: 'Draw', from: 'deck' });
    expect(legalActions(viewFor(drawn, 0)).some((a) => a.t === 'Sprout' || a.t === 'Bloom')).toBe(true);
  });

  it('is resumable like a real match, and an old scripted save restarts instead', () => {
    expect(lessonResumable({ level: 9, version: L9.version, seen: [] }, L9)).toBe(true);
    // Version 3 was the scripted authored position; resuming it would drop the player onto a
    // position this level no longer has.
    expect(lessonResumable({ level: 9, version: 3, seen: [] }, L9)).toBe(false);
    expect(lessonResumable({ level: 8, version: L9.version, seen: [] }, L9)).toBe(false);

    // Resuming a real match goes through the SAME save the campaign writes: the opening is kept as
    // the replay base, the actions are replayed, and the position comes back byte for byte. A
    // scripted lesson never needed this; level 9's game is long enough that it must.
    const opening = lessonOpening(L9);
    const actions: Action[] = [];
    let s = opening;
    for (let i = 0; i < 12 && s.phase !== 'GAME_OVER'; i++) {
      const a = s.actor === 0 ? choose(s) : opponent(s);
      actions.push(a);
      s = apply(s, a);
    }
    expect(actions.length).toBeGreaterThan(3);
    const raw = encodeSave({ seed: opening.seed, actions, coach: null, level: LEVEL.botLevel, base: opening });
    const loaded = decodeSave<null>(raw);
    expect(loaded?.state).toEqual(s);
    expect(loaded?.state.history).toEqual(s.history);
    expect(loaded?.base).toEqual(opening);
  });

  it('opens with the Who-starts ritual (the first real game in the campaign)', () => {
    expect(playsStarterRitual(true, 9)).toBe(true);
    expect(playsStarterRitual(true, 8)).toBe(false);
    // The starter is the engine's decision, and a real opening names it.
    const s = lessonOpening(L9);
    expect(s.startingPlayer).toBeDefined();
    expect(s.actor).toBe(s.startingPlayer);
  });

  it('plays to a real GAME_OVER: winnable with good play, losable with a legal bad line', () => {
    const won = play(choose);
    expect(won.phase).toBe('GAME_OVER');
    expect(won.result).toBeTruthy();
    expect(won.result!.winner).toBe(0);
    expect(['strangle', 'deck_exhaustion', 'turn_limit']).toContain(won.result!.reason);
    expect(won.result!.scores).toHaveLength(2);

    const lost = play(neverGrow);
    expect(lost.phase).toBe('GAME_OVER');
    expect(lost.result!.winner).toBe(1);
    expect(['strangle', 'deck_exhaustion', 'turn_limit']).toContain(lost.result!.reason);
    expect(lost.result!.scores).toHaveLength(2);
  });

  it('never deadlocks: 25 random legal lines all reach a real GAME_OVER', () => {
    // The same guarantee `lessons.test.ts` gives every hand-held lesson, on this level's own terms:
    // random legal moves for the player, the level's real bot answering, a real result every time.
    for (let seed = 1; seed <= 25; seed++) {
      const rand = mulberry32(seed * 7919 + 9);
      let s = lessonOpening(L9);
      for (let i = 0; i < 800 && s.phase !== 'GAME_OVER'; i++) {
        if (s.actor === 0) {
          const legal = legalActions(viewFor(s, 0));
          expect(legal.length, `seed ${seed}: the player always has a move`).toBeGreaterThan(0);
          s = apply(s, legal[Math.floor(rand() * legal.length)]!);
        } else {
          s = apply(s, opponent(s));
        }
      }
      expect(s.phase, `seed ${seed}`).toBe('GAME_OVER');
      expect(s.result?.scores, `seed ${seed}`).toHaveLength(2);
    }
  }, 180_000);
});

describe('the live cue chooser (the same LESSON words, from the live state)', () => {
  it('DRAW: "TAP DRAW PILE" at the Draw step, with the Draw pile lit', () => {
    const beat = lessonBeat(L9, lessonOpening(L9), ctx())!;
    expect(beat.say).toBe(LESSON.tapDraw);
    expect(beat.lit).toEqual({ t: 'deck' });
    expect(beat.always, 'a live cue, never an idle wait').toBe(true);
    expect(beat.idleOnly).toBeUndefined();
    // The mastery fade may soften the light, but a real game's cue is never silenced.
    expect(presentedLessonBeat(beat, 'silent')).toEqual(beat);
  });

  it('CHOOSE A CARD: the display asks for the card, then names the lit tile', () => {
    const s = afterDrawWithoutBloom();
    const move = suggestMove(L9, s)!;
    expect(move.t).toBe('Sprout');
    const pick = lessonBeat(L9, s, ctx())!;
    expect(pick.say).toBe(LESSON.chooseCard);
    expect(pick.lit).toEqual({ t: 'card', id: (move as Extract<Action, { t: 'Sprout' }>).card });

    const place = lessonBeat(L9, s, ctx({ card: (move as Extract<Action, { t: 'Sprout' }>).card }))!;
    expect([LESSON.tapTile, LESSON.tapTheirTile]).toContain(place.say);
    expect(place.lit.t).toBe('hex');
    expect(presentedLessonBeat(place, 'silent'), 'the cue survives a silent mastery tier').toEqual(place);
  });

  it('THROW A CARD → TAP THROW PILE, then WAIT on their turn', () => {
    // Follow the light for one whole turn: draw, Grow, end the Grow, throw.
    let s: State = afterDrawWithoutBloom();
    const grow = suggestMove(L9, s);
    expect(grow?.t).toBe('Sprout');
    s = apply(s, grow!);
    const end = lessonBeat(L9, s, ctx())!;
    expect(end.say).toBe(LESSON.tapThrow);
    expect(end.lit).toEqual({ t: 'end' });
    s = apply(s, legalActions(viewFor(s, 0)).find((a) => a.t === 'EndAct')!);

    const pickThrow = lessonBeat(L9, s, ctx())!;
    expect(pickThrow.say).toBe(LESSON.throwCard);
    expect(pickThrow.lit.t).toBe('card');
    const card = pickThrow.lit.t === 'card' ? pickThrow.lit.id : -1;
    const toPile = lessonBeat(L9, s, ctx({ throwPending: card }))!;
    expect(toPile.say).toBe(LESSON.tapThrowPile);
    expect(toPile.lit).toEqual({ t: 'discard' });
    s = apply(s, { t: 'Discard', card });

    const theirs = lessonBeat(L9, s, ctx())!;
    expect(theirs.say).toBe(LESSON.theirTurn);
    expect(theirs.status).toBe(true);
    expect(theirs.always, 'a live cue, not an idle wait').toBe(true);
    expect(theirs.lit).toEqual({ t: 'none' });
  });

  it('WAIT is the one steady cue on their turn in every phase, and mastery cannot silence it', () => {
    // The chooser's opponent branch must not depend on the phase it is asked in: their turn is a
    // status line from the live state, not a step of the player's. This is the branch whose
    // painted form regressed in the level-9 browser suite.
    const afterThrow = apply(afterDrawWithoutBloom(), { t: 'EndAct' });
    const thrown = apply(afterThrow, { t: 'Discard', card: afterThrow.hands[0][0]!.id });
    for (const phase of ['DRAW', 'ACT', 'DISCARD', 'GAME_OVER'] as const) {
      const theirs: State = { ...thrown, phase, actor: 1 };
      const beat = phase === 'GAME_OVER' ? null : lessonBeat(L9, theirs, ctx());
      if (phase === 'GAME_OVER') {
        expect(beat, 'the finish card owns a finished game').toBeNull();
        continue;
      }
      expect(beat?.id, phase).toBe('their-turn');
      expect(beat?.say, phase).toBe(LESSON.theirTurn);
      expect(beat?.status, phase).toBe(true);
      expect(beat?.always, phase).toBe(true);
      expect(beat?.lit, phase).toEqual({ t: 'none' });
      // A silent mastery tier still shows the live status line.
      expect(presentedLessonBeat(beat!, 'silent'), phase).toEqual(beat);
    }
  });
});

describe('the teaching the old lesson carried is still reachable', () => {
  it('the skip and Undo sentences still appear after a real Throw-pile draw and a Bloom', () => {
    // A real legal sequence, not a hand-made history: draw from the Throw pile, then play any Bloom
    // this turn. That is exactly the moment the old scripted lesson taught, and it now hangs off
    // the live state instead of a step counter.
    const drawn = apply(lessonOpening(L9), { t: 'Draw', from: 'discard' });
    const bloom = legalActions(viewFor(drawn, 0)).find((a) => a.t === 'Bloom');
    expect(bloom, 'the real deal offers a Bloom after a Throw-pile draw').toBeDefined();
    const after = apply(drawn, bloom!);
    expect(after.phase, 'a Bloom is an extra move: the turn continues').toBe('ACT');
    expect(after.actor).toBe(0);
    const seen = new Set(['9:intro:pile-gold']);
    const optional = lessonBeat(L9, after, ctx({ seen }))!;
    expect(optional.id).toBe('9:optional');
    expect(optional.explain).toBe(true);
    expect(optional.line).toBe(LESSON.optionalLine);
    seen.add('9:optional');
    const undo = lessonBeat(L9, after, ctx({ seen }))!;
    expect(undo.id).toBe('9:undo');
    expect(undo.explain).toBe(true);
    expect(undo.line).toBe(LESSON.undoLine);
    expect(undo.lit).toEqual({ t: 'undo' });
  });
});

describe('the record, the completion and the unlock (owner, 2026-11-01)', () => {
  /** A player who has won 1-8; level 9 is the place. */
  const before: CampaignProgress = {
    version: 1,
    unlocked: 9,
    completed: CAMPAIGN_LEVELS.slice(0, 8).map((l) => l.id),
    best: {},
  };

  it('a finished lesson 9 counts in the offline record, like every campaign game', () => {
    // The page reports the old guided tutorial and the Lab's watch mode as `tutorial`/`watching`;
    // a campaign lesson is a real game and is NOT excluded by the guided-lesson guard.
    expect(countsTowardRecord({ watching: false, tutorial: false, campaign: true, replay: false })).toBe(true);
    expect(countsTowardRecord({ watching: false, tutorial: true, campaign: true, replay: false })).toBe(true);
    // Only a replay and the old guided step are excluded.
    expect(countsTowardRecord({ watching: false, tutorial: false, campaign: true, replay: true })).toBe(false);
    expect(countsTowardRecord({ watching: false, tutorial: true, campaign: false, replay: false })).toBe(false);
    expect(countsTowardRecord({ watching: true, tutorial: false, campaign: true, replay: false })).toBe(false);
    // The finish handler passes the campaign level itself, so no lesson guard can drop it.
    expect(mainSource).toMatch(/countsTowardRecord\(\{[\s\S]{0,220}campaign: campaignLevel !== null/);
  });

  it('a win completes level 9 and unlocks level 10', () => {
    const after = progressAfterMatch(before, 'campaign', LEVEL, { won: true, score: 12, turns: 12 });
    expect(after.completed).toContain('c1-09');
    expect(after.unlocked).toBe(10);
    expect(currentLevel(after).number).toBe(10);
  });

  it('a loss takes nothing away and leaves level 9 as the place', () => {
    const after = progressAfterMatch(before, 'campaign', LEVEL, { won: false, score: 2, turns: 12 });
    expect(after.completed).toEqual(before.completed);
    expect(after.unlocked).toBe(9);
    expect(currentLevel(after).number).toBe(9);
  });
});
