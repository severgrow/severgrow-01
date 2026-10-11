// Pro tutorial overhaul: behaviour locked by tests first (they fail until each phase lands).
import { describe, expect, it } from 'vitest';
import { apply, createCards, homeCoord, legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import {
  BLAST, BLOOM, FRUIT, GAME_TITLE, HOME, TUTORIAL, WELCOME,
} from '../../src/strings.js';
import {
  TUTORIAL_CHAPTER_COUNT,
  TUTORIAL_CHAPTER_IDS,
  migrateTutorialProgress,
  resolveLessonTarget,
  tutorialAccepts,
  tutorialChapter,
  tutorialFeedback,
  tutorialLesson,
  tutorialLessons,
  wordCount,
} from '../src/logic/tutorial-script.js';
import { bloomHintGroups } from '../src/logic/tips.js';

const intended = (state: State, chapter: number, step: number): Action => {
  const lesson = tutorialLesson(chapter, step)!;
  const action = legalActions(viewFor(state, 0)).find(candidate => tutorialAccepts(lesson, candidate, state));
  expect(action, `chapter ${chapter + 1}, ${lesson.id}`).toBeDefined();
  return action!;
};

describe('tutorial pro: chapter shape', () => {
  it('has thirteen chapters with stable lesson ids', () => {
    expect(TUTORIAL_CHAPTER_COUNT).toBe(13);
    expect([...TUTORIAL_CHAPTER_IDS]).toEqual([
      'goal', 'turn', 'bloom', 'strengthen', 'cut', 'skip', 'buttons',
      'bomb', 'blast', 'throw-pile', 'win', 'final', 'free',
    ]);
  });

  it('every lesson has exactly one resolvable target; a named card finds exactly one card', () => {
    for (let chapter = 0; chapter < TUTORIAL_CHAPTER_COUNT; chapter++) {
      const state = tutorialChapter(chapter);
      for (const [step, lesson] of tutorialLessons(chapter).entries()) {
        const target = resolveLessonTarget(lesson, state);
        expect(target, `${lesson.id} needs one target`).not.toBeNull();
        expect(target!.kind === 'none' || target!.selector.length > 0, lesson.id).toBe(true);
        if (lesson.card) {
          const matches = state.hands[0].filter(c => c.suit === lesson.card![0] && c.rank === lesson.card![1]);
          expect(matches, `${lesson.id} card`).toHaveLength(1);
        }
        if (lesson.cardId != null) {
          expect(state.hands[0].filter(c => c.id === lesson.cardId), `${lesson.id} cardId`).toHaveLength(1);
        }
        void step;
      }
    }
  });

  it('every chapter places only real cards, never invents or duplicates, and has a legal guided step', () => {
    for (let chapter = 0; chapter < TUTORIAL_CHAPTER_COUNT; chapter++) {
      let state = tutorialChapter(chapter);
      const cards = [...state.hands[0], ...state.hands[1], ...state.deck, ...state.discard];
      expect(cards).toHaveLength(createCards(state.config).length);
      expect(new Set(cards.map(c => c.id)).size).toBe(cards.length);
      for (const [step, lesson] of tutorialLessons(chapter).entries()) {
        if (lesson.action === 'Opponent' || lesson.action === 'FreeTurn' || lesson.action === 'Next') continue;
        if (lesson.reseat === 'bloom-run') state = tutorialChapter(chapter, 'bloom-run');
        const action = intended(state, chapter, step);
        state = apply(state, action);
      }
    }
  });
});

describe('tutorial pro: gating and feedback', () => {
  it('accepts only the intended move and wrong moves produce one feedback message', () => {
    const state = tutorialChapter(1); // YOUR TURN — Draw
    const draw = tutorialLesson(1, 0)!;
    expect(tutorialAccepts(draw, { t: 'Draw', from: 'deck' }, state)).toBe(true);
    expect(tutorialAccepts(draw, { t: 'Draw', from: 'discard' }, state)).toBe(false);
    expect(tutorialFeedback('wrong', draw).length).toBeGreaterThan(0);
    expect(tutorialFeedback('wrong', draw)).toMatch(/glowing|Not that|Other side|Close/i);
  });
});

describe('tutorial pro: progress migration', () => {
  it('maps every old (chapter, step) to a valid new place; garbage restarts safely', () => {
    for (let chapter = 0; chapter < 10; chapter++) {
      for (let step = 0; step < 6; step++) {
        const next = migrateTutorialProgress({ chapter, step });
        expect(next.chapter).toBeGreaterThanOrEqual(0);
        expect(next.chapter).toBeLessThan(TUTORIAL_CHAPTER_COUNT);
        expect(next.step).toBe(0);
        expect(tutorialLesson(next.chapter, next.step)).not.toBeNull();
      }
    }
    expect(migrateTutorialProgress({ chapter: 99, step: 0 })).toEqual({ chapter: 0, step: 0 });
    expect(migrateTutorialProgress({ chapter: -1, step: 2 })).toEqual({ chapter: 0, step: 0 });
    expect(migrateTutorialProgress(null)).toEqual({ chapter: 0, step: 0 });
    expect(migrateTutorialProgress({ chapter: 'x' as unknown as number, step: 1 })).toEqual({ chapter: 0, step: 0 });
  });
});

describe('tutorial pro: how you win', () => {
  it('the scripted last move ends the game with a Strangle win for the player', () => {
    const winChapter = TUTORIAL_CHAPTER_IDS.indexOf('win');
    expect(winChapter).toBeGreaterThanOrEqual(0);
    let state = tutorialChapter(winChapter);
    const home = homeCoord(1, state.config);
    const lessons = tutorialLessons(winChapter);
    const playSteps = lessons.filter(l => l.action !== 'Next' && l.action !== 'Opponent' && l.action !== 'FreeTurn');
    for (const [i, lesson] of lessons.entries()) {
      if (lesson.action === 'Next') continue;
      if (lesson.action === 'Opponent' || lesson.action === 'FreeTurn') break;
      const action = intended(state, winChapter, i);
      state = apply(state, action);
    }
    expect(playSteps.length).toBeGreaterThan(0);
    expect(state.phase).toBe('GAME_OVER');
    expect(state.result?.reason).toBe('strangle');
    expect(state.result?.winner).toBe(0);
    expect(state.board[`${home.q},${home.r}`]?.root).toBe(true);
  });
});

describe('tutorial pro: strings', () => {
  it('forbids old product names and wrong bloom / tutorial counts in player-facing text', () => {
    const blob = [
      GAME_TITLE, WELCOME.title, WELCOME.tutorial, WELCOME.goal,
      BLOOM.howto, BLOOM.hint, FRUIT.howto, FRUIT.tip, BLAST.howto,
      HOME.mine, HOME.theirs, HOME.surround,
      TUTORIAL.recap.join(' '),
      ...Object.values(TUTORIAL.praise),
      ...Object.values(TUTORIAL.wrong),
      ...TUTORIAL.chapters.flatMap(c => c.lessons.flatMap(l => [l.instruction, 'why' in l ? (l.why ?? '') : ''])),
    ].join('\n');
    expect(blob).not.toMatch(/Severor|Severgrow|15 moves|three or four|Three or four/i);
    expect(BLOOM.howto).toMatch(/3 to 6|3–6/);
    expect(WELCOME.tutorial).toMatch(/about 4 minutes|4 minutes/);
  });

  it('every instruction is at most 6 words and every why line at most 12', () => {
    for (let chapter = 0; chapter < TUTORIAL_CHAPTER_COUNT; chapter++) {
      for (const lesson of tutorialLessons(chapter)) {
        const instruction = lesson.instruction ?? lesson.text;
        expect(instruction, `${lesson.id} needs instruction`).toBeTruthy();
        expect(wordCount(instruction), lesson.id).toBeLessThanOrEqual(6);
        if (lesson.why) expect(wordCount(lesson.why), `${lesson.id} why`).toBeLessThanOrEqual(12);
      }
    }
  });
});

describe('tutorial pro: bloom hint', () => {
  it('shows only for groups the engine says can bloom', () => {
    const state = tutorialChapter(TUTORIAL_CHAPTER_IDS.indexOf('bloom'));
    const view = viewFor(state, 0);
    const legal = legalActions(view);
    const groups = bloomHintGroups(view, legal);
    for (const group of groups) {
      expect(legal.some(a => a.t === 'Bloom' && group.every(id => a.cards.includes(id)))).toBe(true);
    }
    const fake = bloomHintGroups(view, legal.filter(a => a.t !== 'Bloom'));
    expect(fake).toHaveLength(0);
  });
});
