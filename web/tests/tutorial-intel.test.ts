import { describe, expect, it } from 'vitest';
import { apply, createCards, legalActions, score, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { matchIntel, openingPublicDiscard, publicDiscardHistory } from '../src/logic/match-intel.js';
import { Session } from '../src/logic/session.js';
import {
  TUTORIAL_CHAPTER_COUNT, TUTORIAL_CHAPTER_IDS, tutorialAccepts, tutorialApplyLesson,
  tutorialChapter, tutorialChapterById, tutorialLesson, tutorialLessons,
  tutorialOpponentAction, tutorialStateAt,
} from '../src/logic/tutorial-script.js';

const intended = (state: State, chapter: number, step: number): Action => {
  const lesson = tutorialLesson(chapter, step)!;
  const action = legalActions(viewFor(state, 0)).find(candidate => tutorialAccepts(lesson, candidate, state));
  expect(action, `chapter ${chapter + 1}, ${lesson.id}`).toBeDefined();
  return action!;
};

describe('authored tutorial uses the current engine', () => {
  it('introduces turn rhythm, impassable rock and double-scoring gold after the first Grow', () => {
    expect(tutorialLessons(0).map(lesson => lesson.id)).toEqual(['goal-mine', 'goal-turn-rhythm']);
    const turn = TUTORIAL_CHAPTER_IDS.indexOf('turn');
    expect(tutorialLessons(turn).slice(0, 5).map(lesson => lesson.id)).toEqual(['draw', 'grow', 'rock-gold', 'grow-done', 'throw']);
    const state = tutorialChapter(turn);
    expect(state.terrain['-2,0']).toBe('rock');
    expect(state.terrain['0,0']).toBe('rich');
    expect(legalActions(viewFor(apply(state, { t: 'Draw', from: 'deck' }), 0))
      .some(action => action.t === 'Sprout' && action.coord.q === -2 && action.coord.r === 0)).toBe(false);
    const withGold = { ...state, board: { ...state.board, '0,0': { owner: 0 as const, strength: 4 } } };
    expect(score(withGold, 0) - score(state, 0)).toBe(2);
  });

  it('keeps only three Throw lessons requiring another player tap', () => {
    const throws = Array.from({ length: TUTORIAL_CHAPTER_COUNT }, (_, chapter) => tutorialLessons(chapter))
      .flat().filter(lesson => lesson.action === 'Discard');
    // Strengthen, take over, Bomb, Blast and Bloom on the Throw pile end on their move: no routine throws
    expect(throws).toHaveLength(4);
    expect(throws.filter(lesson => !lesson.autoDiscard).map(lesson => lesson.id))
      .toEqual(['throw', 'skip-throw', 'final-throw']);
  });
  it('offers a legal action at every guided step without changing card identities', () => {
    expect(TUTORIAL_CHAPTER_COUNT).toBe(13);
    for (let chapter = 0; chapter < TUTORIAL_CHAPTER_COUNT - 1; chapter++) {
      let state = tutorialChapter(chapter);
      const cards = [...state.hands[0], ...state.hands[1], ...state.deck, ...state.discard];
      expect(cards).toHaveLength(createCards(state.config).length);
      expect(new Set(cards.map(card => card.id)).size).toBe(cards.length);
      for (const [step, lesson] of tutorialLessons(chapter).entries()) {
        if (lesson.action === 'FreeTurn') continue;
        if (lesson.reseat) state = tutorialChapter(chapter, lesson.reseat);
        if (lesson.action === 'Opponent' || lesson.action === 'Next') {
          state = tutorialApplyLesson(state, lesson);
          continue;
        }
        const ready = lesson.action === 'Discard' ? tutorialStateAt(chapter, step) : state;
        intended(ready, chapter, step);
        state = tutorialApplyLesson(state, lesson);
      }
    }
  });

  it('guides the opening without accepting unrelated legal actions', () => {
    const turn = TUTORIAL_CHAPTER_IDS.indexOf('turn');
    const state = tutorialChapter(turn);
    const draw = tutorialLesson(turn, 0)!;
    expect(tutorialAccepts(draw, { t: 'Draw', from: 'deck' }, state)).toBe(true);
    expect(tutorialAccepts(draw, { t: 'Draw', from: 'discard' }, state)).toBe(false);
    const after = apply(state, { t: 'Draw', from: 'deck' });
    const grow = tutorialLesson(turn, 1)!;
    expect(tutorialAccepts(grow, { t: 'EndAct' }, after)).toBe(false);
    expect(legalActions(viewFor(after, 0)).some(action => tutorialAccepts(grow, action, after))).toBe(true);
  });

  it('the Cut lesson actually removes separated enemy territory', () => {
    const cut = TUTORIAL_CHAPTER_IDS.indexOf('cut');
    let state = tutorialChapter(cut);
    state = apply(state, intended(state, cut, 0));
    expect(state.board['1,-1']?.owner).toBe(0);
    expect(state.board['0,-1']).toBeNull();
    expect(state.lastResolution?.severed.some(group => group.player === 1 && group.coords.some(c => c.q === 0 && c.r === -1))).toBe(true);
  });

  it('the Bomb and Mega Bomb lessons use distinct legal actions and protect both homes', () => {
    const bombCh = TUTORIAL_CHAPTER_IDS.indexOf('bomb');
    const blastCh = TUTORIAL_CHAPTER_IDS.indexOf('blast');
    const bomb = tutorialChapter(bombCh);
    const mega = tutorialChapter(blastCh);
    expect(intended(bomb, bombCh, 0).t).toBe('PlayFruit');
    const action = intended(mega, blastCh, 0);
    expect(action.t).toBe('MegaBomb');
    const after = apply(mega, action);
    expect(after.board['2,-2']?.root).toBe(true);
    expect(after.board['-2,2']?.root).toBe(true);
    expect(after.board['0,0']?.owner).toBe(0);
    expect(after.lastResolution?.megaBomb?.destroyed.length).toBeGreaterThanOrEqual(3);
  });

  it('the final-turn lesson gives the scripted opponent the equalising Grow-first turn', () => {
    const final = TUTORIAL_CHAPTER_IDS.indexOf('final');
    let state = tutorialChapter(final);
    expect(state.phase).toBe('ACT');
    expect(state.deck).toHaveLength(0);
    state = apply(state, intended(state, final, 0));
    state = apply(state, intended(state, final, 1));
    expect(state.actor).toBe(1);
    expect(state.phase).toBe('ACT');
    while (state.phase !== 'GAME_OVER') {
      const action = tutorialOpponentAction(legalActions(viewFor(state, 1)));
      expect(action).not.toBeNull();
      state = apply(state, action!);
    }
    expect(state.result?.reason).toBe('deck_exhaustion');
  });
});

describe('Match Intel and replay boundaries', () => {
  it('uses public discard events and retains cards seen before they were picked up', () => {
    const state = tutorialChapterById('throw-pile');
    const view = viewFor(state, 0);
    const opening = openingPublicDiscard(state, state);
    const card = opening.at(-1)!;
    const history = [{ t: 'Discard' as const, player: 1 as const, card: card.id }];
    const seen = publicDiscardHistory(view, history, opening);
    expect(seen.map(item => item.id)).toEqual([card.id, card.id]);
    const intel = matchIntel(view, history, opening);
    expect(intel.discarded).toEqual(seen);
    expect(intel.score).toEqual([view.score, view.opponentScore]);
    expect(intel.moves.at(-1)).toEqual({ who: 'opp', verb: 'THREW', detail: card.suit === null ? 'BOMB' : String(card.rank) });
    expect(intel.deckCount).toBe(view.deckCount);
    expect(intel.oppHand).toBe(view.opponentHandCount);
    expect(intel.fruitUnseen).toBe(view.fruitUnseen);
  });

  it('reconstructs the last opponent turn from a saved log without changing state', () => {
    const turn = TUTORIAL_CHAPTER_IDS.indexOf('turn');
    const base = tutorialChapter(turn);
    const live = new Session(base, 0, [], base);
    let state = base;
    // draw, grow, » to Throw, throw (the Next explainers between them play nothing)
    const upToThrow = tutorialLessons(turn).findIndex(lesson => lesson.id === 'throw');
    for (let step = 0; step <= upToThrow; step++) {
      if (tutorialLessons(turn)[step]!.action === 'Next') continue;
      const action = intended(state, turn, step);
      expect(live.play(action)).not.toBeNull();
      state = live.state;
    }
    while (state.turnPlayer === 1 && state.phase !== 'GAME_OVER') {
      const action = tutorialOpponentAction(legalActions(viewFor(state, 1)))!;
      expect(live.play(action, 1)).not.toBeNull();
      state = live.state;
    }
    expect(live.canReplayOpponent).toBe(true);
    const restored = new Session(state, 0, live.log, base);
    const snapshot = JSON.stringify(restored.state);
    const last = restored.lastTurnOf(1);
    expect(last.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(restored.state)).toBe(snapshot);
    expect(last.at(-1)?.after).toEqual(state);
  });
});
