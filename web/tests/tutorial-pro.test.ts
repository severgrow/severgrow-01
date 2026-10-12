// Pro tutorial overhaul: behaviour locked by tests first (they fail until each phase lands).
import { describe, expect, it } from 'vitest';
import { apply, boardCoords, createCards, homeCoord, legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import {
  BLAST, BLOOM, FRUIT, GAME_TITLE, HOME, TUTORIAL, WELCOME,
} from '../../src/strings.js';
import {
  TUTORIAL_BOARD_RADIUS,
  TUTORIAL_CHAPTER_COUNT,
  TUTORIAL_CHAPTER_IDS,
  migrateTutorialProgress,
  TUTORIAL_CORE,
  previousTutorialChapter,
  resolveLessonTarget,
  tutorialAccepts,
  tutorialApplyLesson,
  tutorialChapter,
  tutorialFeedback,
  tutorialLesson,
  tutorialLessons,
  tutorialStateAt,
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

  it('uses a one-ring-smaller board than normal Play (radius 2 → 19 hexes)', () => {
    expect(TUTORIAL_BOARD_RADIUS).toBe(2);
    for (let chapter = 0; chapter < TUTORIAL_CHAPTER_COUNT; chapter++) {
      const state = tutorialChapter(chapter);
      expect(state.config.boardRadius, `chapter ${chapter}`).toBe(2);
      expect(boardCoords(state.config)).toHaveLength(19);
    }
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
        if (lesson.action === 'FreeTurn') continue;
        if (lesson.reseat) state = tutorialChapter(chapter, lesson.reseat);
        if (lesson.action === 'Opponent' || lesson.action === 'Next') {
          state = tutorialApplyLesson(state, lesson);
          continue;
        }
        // Confirm a legal intended move exists (Discard closes Grow first when needed).
        const ready = lesson.action === 'Discard'
          ? tutorialStateAt(chapter, step)
          : state;
        intended(ready, chapter, step);
        state = tutorialApplyLesson(state, lesson);
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

  it('throw lessons accept any Discard card and highlight hand + discard', () => {
    const throwStep = tutorialLessons(1).findIndex(l => l.id === 'throw');
    expect(throwStep).toBeGreaterThanOrEqual(0);
    const lesson = tutorialLesson(1, throwStep)!;
    expect(lesson.card).toBeUndefined();
    expect(lesson.focus).toBe('hand');
    const state = tutorialStateAt(1, throwStep);
    expect(state.phase).toBe('DISCARD');
    const discards = legalActions(viewFor(state, 0)).filter(a => a.t === 'Discard');
    expect(discards.length).toBeGreaterThan(1);
    for (const action of discards) {
      expect(tutorialAccepts(lesson, action, state), `card ${action.card}`).toBe(true);
    }
    const target = resolveLessonTarget(lesson, state);
    expect(target?.selector).toBe('#hand .card, #discard');
    expect(target?.kind).toBe('hand');
  });

  it('the first Grow moves on to Throw with the » step, which also teaches Skip', () => {
    const turn = TUTORIAL_CHAPTER_IDS.indexOf('turn');
    const done = tutorialLessons(turn).find(l => l.id === 'grow-done')!;
    expect(done.action).toBe('EndAct');
    expect(done.focus).toBe('context');
    const throwStep = tutorialLessons(turn).findIndex(l => l.id === 'throw');
    expect(tutorialStateAt(turn, throwStep).phase).toBe('DISCARD');
  });

  it('Strengthen, take over, Bomb and Blast are one move each; the next chapter starts fresh', () => {
    for (const id of ['strengthen', 'cut', 'bomb', 'blast'] as const) {
      const ch = TUTORIAL_CHAPTER_IDS.indexOf(id);
      expect(tutorialLessons(ch), id).toHaveLength(1);
      expect(tutorialLessons(ch)[0]!.action, id).not.toBe('Next');
    }
  });

  it('the tutorial shows their turn once, after the first Throw, so it stays short', () => {
    const beats = TUTORIAL_CORE.flatMap(id => [...tutorialLessons(TUTORIAL_CHAPTER_IDS.indexOf(id))])
      .filter(l => l.action === 'Opponent');
    expect(beats.map(l => l.id)).toEqual(['opponent']);
    expect(beats[0]!.instruction).toMatch(/THEIR/i);
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
      ...Array.from({ length: TUTORIAL_CHAPTER_COUNT }, (_, c) => tutorialLessons(c)).flat().flatMap(l => [l.instruction, l.why ?? '']),
    ].join('\n');
    expect(blob).not.toMatch(/Severor|Severgrow|15 moves|three or four|Three or four/i);
    expect(BLOOM.howto).toMatch(/3 to 6|3–6/);
    expect(WELCOME.tutorial).toMatch(/about 4 minutes|4 minutes/);
  });

  it('every title is a short label and every body line stays brief', () => {
    for (let chapter = 0; chapter < TUTORIAL_CHAPTER_COUNT; chapter++) {
      for (const lesson of tutorialLessons(chapter)) {
        const instruction = lesson.instruction ?? lesson.text;
        expect(instruction, `${lesson.id} needs instruction`).toBeTruthy();
        expect(wordCount(instruction), lesson.id).toBeLessThanOrEqual(4);
        if (lesson.why) expect(wordCount(lesson.why), `${lesson.id} why`).toBeLessThanOrEqual(18);
      }
    }
  });
});

describe('tutorial pro: seek / Previous rebuild', () => {
  it('rebuilds every step from authored openings without inventing or duplicating cards', () => {
    for (let chapter = 0; chapter < TUTORIAL_CHAPTER_COUNT; chapter++) {
      const lessons = tutorialLessons(chapter);
      for (let step = 0; step < lessons.length; step++) {
        const state = tutorialStateAt(chapter, step);
        const cards = [...state.hands[0], ...state.hands[1], ...state.deck, ...state.discard];
        expect(new Set(cards.map(c => c.id)).size, `${chapter}:${step}`).toBe(cards.length);
        // Spent Grow/Bloom cards leave the pools; never invent extras.
        expect(cards.length, `${chapter}:${step}`).toBeLessThanOrEqual(createCards(state.config).length);
      }
    }
  });

  it('after Grow, Previous lands on a board that still needs the Grow', () => {
    const afterGrow = tutorialStateAt(1, 2); // STAY JOINED — sprout already applied
    expect(afterGrow.board['-1,1']?.owner).toBe(0);
    const backToGrow = tutorialStateAt(1, 1);
    expect(backToGrow.phase).toBe('ACT');
    expect(backToGrow.board['-1,1']).toBeFalsy();
    const action = legalActions(viewFor(backToGrow, 0)).find(a =>
      tutorialAccepts(tutorialLesson(1, 1)!, a, backToGrow));
    expect(action?.t).toBe('Sprout');
  });

  it('Previous across the bloom lesson and into the free turn stays in range', () => {
    const bloom = TUTORIAL_CHAPTER_IDS.indexOf('bloom');
    const free = TUTORIAL_CHAPTER_IDS.indexOf('free');
    const setStep = tutorialLessons(bloom).findIndex(l => l.id === 'bloom-set');
    expect(tutorialStateAt(bloom, 0).phase).toBe('ACT');
    expect(tutorialStateAt(bloom, setStep).phase).toBe('ACT');
    // Seek to the free turn, then Previous into the tutorial's previous chapter (How you win).
    expect(() => tutorialStateAt(free, 0)).not.toThrow();
    const prevChapter = previousTutorialChapter(free, 'core')!;
    expect(prevChapter).toBe(TUTORIAL_CHAPTER_IDS.indexOf('win'));
    const last = tutorialLessons(prevChapter).length - 1;
    expect(() => tutorialStateAt(prevChapter, last)).not.toThrow();
  });
});

describe('tutorial pro: card strategy copy', () => {
  it('teaches bloom rules, 8/9 strength, and sets vs runs near bloom and before free play', () => {
    const bloom = tutorialLessons(TUTORIAL_CHAPTER_IDS.indexOf('bloom'));
    const free = tutorialLessons(TUTORIAL_CHAPTER_IDS.indexOf('free'));
    const explain = bloom.find(l => l.id === 'bloom-explain')!;
    const power = bloom.find(l => l.id === 'bloom-set-after')!;
    const set = bloom.find(l => l.id === 'bloom-set')!;
    const recap = free.find(l => l.id === 'free')!;
    expect(explain.instruction).toMatch(/^BLOOM$/i);
    expect(explain.why).toMatch(/Grow/i);
    expect(explain.why).toMatch(/same number|different suits/i);
    expect(explain.why).toMatch(/consecutive|run/i);
    expect(explain.why).toMatch(/3 to 6|3–6/i);
    expect(explain.why).not.toMatch(/meld/i);
    expect(explain.why).toMatch(/run/i);
    expect(power.why).toMatch(/8|9/);
    expect(set.why).toMatch(/set/i);
    expect(set.why).toMatch(/same number|different suits/i);
    expect(recap.action).toBe('FreeTurn');
    expect(recap.why).toMatch(/8|9/);
    expect(wordCount(explain.why!)).toBeLessThanOrEqual(18);
    expect(wordCount(power.why!)).toBeLessThanOrEqual(18);
    expect(wordCount(recap.why!)).toBeLessThanOrEqual(18);
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
