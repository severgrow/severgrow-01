// The tutorial is a short core run plus separate extra lessons, with one word list throughout.
import { describe, expect, it } from 'vitest';
import {
  TUTORIAL_CHAPTER_COUNT,
  TUTORIAL_CHAPTER_IDS,
  TUTORIAL_CORE,
  TUTORIAL_EXTRAS,
  freeTurnGuide,
  nextTutorialChapter,
  previousTutorialChapter,
  tutorialLessons,
  tutorialTrackChapters,
  tutorialTrackFor,
  wordCount,
} from '../src/logic/tutorial-script.js';

const at = (id: string) => TUTORIAL_CHAPTER_IDS.indexOf(id as never);
const all = () => Array.from({ length: TUTORIAL_CHAPTER_COUNT }, (_, c) => tutorialLessons(c)).flat();
const lesson = (id: string) => all().find(l => l.id === id)!;

describe('tutorial tracks', () => {
  it('the core run teaches the basics, then a free turn', () => {
    expect([...TUTORIAL_CORE]).toEqual(['goal', 'turn', 'bloom', 'cut', 'win', 'free']);
  });

  it('every other chapter belongs to exactly one extra lesson', () => {
    expect(TUTORIAL_EXTRAS.map(e => e.id)).toEqual(['strengthen', 'bombs', 'throw-pile', 'last-round', 'buttons']);
    const extra = TUTORIAL_EXTRAS.flatMap(e => [...e.chapters]);
    expect(new Set(extra).size).toBe(extra.length);
    expect(extra.filter(id => (TUTORIAL_CORE as readonly string[]).includes(id))).toEqual([]);
    expect([...TUTORIAL_CORE, ...extra].sort()).toEqual([...TUTORIAL_CHAPTER_IDS].sort());
    for (const e of TUTORIAL_EXTRAS) expect(wordCount(e.title), e.id).toBeLessThanOrEqual(4);
  });

  it('the core run is short: at most 18 steps that ask something of the player', () => {
    const steps = TUTORIAL_CORE.flatMap(id => [...tutorialLessons(at(id))])
      .filter(l => !l.autoDiscard && l.action !== 'Opponent');
    expect(steps.length).toBeLessThanOrEqual(18);
  });

  it('moves through the core in order and ends after the free turn', () => {
    expect(nextTutorialChapter(at('goal'), 'core')).toBe(at('turn'));
    expect(nextTutorialChapter(at('bloom'), 'core')).toBe(at('cut'));
    expect(nextTutorialChapter(at('cut'), 'core')).toBe(at('win'));
    expect(nextTutorialChapter(at('win'), 'core')).toBe(at('free'));
    expect(nextTutorialChapter(at('free'), 'core')).toBeNull();
    expect(previousTutorialChapter(at('cut'), 'core')).toBe(at('bloom'));
    expect(previousTutorialChapter(at('goal'), 'core')).toBeNull();
  });

  it('an extra lesson plays only its own chapters, then ends', () => {
    expect(nextTutorialChapter(at('strengthen'), 'strengthen')).toBeNull();
    expect(nextTutorialChapter(at('bomb'), 'bombs')).toBe(at('blast'));
    expect(nextTutorialChapter(at('blast'), 'bombs')).toBeNull();
    expect(previousTutorialChapter(at('blast'), 'bombs')).toBe(at('bomb'));
    expect(previousTutorialChapter(at('bomb'), 'bombs')).toBeNull();
    expect(nextTutorialChapter(at('skip'), 'last-round')).toBe(at('final'));
  });

  it('a single chapter id is its own one-chapter track (How to play links)', () => {
    expect([...tutorialTrackChapters('bloom')]).toEqual(['bloom']);
    expect(nextTutorialChapter(at('bloom'), 'bloom')).toBeNull();
  });

  it('finds the track for any chapter (links and old saves)', () => {
    expect(tutorialTrackFor(at('turn'))).toBe('core');
    expect(tutorialTrackFor(at('free'))).toBe('core');
    expect(tutorialTrackFor(at('strengthen'))).toBe('strengthen');
    expect(tutorialTrackFor(at('blast'))).toBe('bombs');
    expect(tutorialTrackFor(at('buttons'))).toBe('buttons');
    expect([...tutorialTrackChapters(undefined)]).toEqual([...TUTORIAL_CORE]);
    expect([...tutorialTrackChapters('nonsense')]).toEqual([...TUTORIAL_CORE]);
  });

  it('the core shows one Bloom (the examples show the run)', () => {
    expect(tutorialLessons(at('bloom')).filter(l => l.action === 'Bloom')).toHaveLength(1);
  });
});

describe('tutorial words', () => {
  const text = () => all().map(l => `${l.instruction} ${l.why ?? ''} ${l.cta ?? ''}`).join('\n');

  it('uses one word list: Draw pile, Throw pile, Grow, Bloom, Bomb, Blast, points', () => {
    expect(text()).not.toMatch(/discard pile|\bdeck\b|sprout|fruit|mega|meld|consecutive same suit/i);
    expect(text()).not.toMatch(/most tiles/i);
  });

  it('says which tiles are whose', () => {
    expect(lesson('goal-mine').why).toMatch(/green/i);
    expect(lesson('goal-theirs').why).toMatch(/red/i);
  });

  it('says the card number becomes the tile strength when you first Grow', () => {
    expect(lesson('grow').why).toMatch(/number/i);
    expect(lesson('grow').why).toMatch(/strength/i);
  });

  it('says how to take an enemy tile', () => {
    expect(lesson('cut').why).toMatch(/higher/i);
    expect(lesson('cut').why).toMatch(/take/i);
  });

  it('scores in points, gold counting 2', () => {
    expect(lesson('gold').why).toMatch(/2 points/i);
    expect(lesson('win-explain').why).toMatch(/points/i);
    expect(lesson('btn-score').why).toMatch(/points/i);
  });

  it('names the real buttons', () => {
    expect(lesson('skip').why).toContain('»');
    expect(lesson('btn-display').why).not.toMatch(/respect/i);
    expect(lesson('btn-display').why).toMatch(/GROW|THROW|DRAW/);
    expect(lesson('btn-history').instruction).toMatch(/BULB/);
  });

  it('every opponent beat says something under its title', () => {
    for (const l of all().filter(x => x.action === 'Opponent')) expect(l.why, l.id).toBeTruthy();
  });

  it('button labels stay short enough to fit the phone glass', () => {
    for (const l of all()) if (l.cta) expect(l.cta.length, l.id).toBeLessThanOrEqual(12);
  });
});

describe('free turn guide', () => {
  const base = { mine: true, picked: false, grew: false, bloomReady: false } as const;

  it('keeps one line for every step of the turn', () => {
    expect(freeTurnGuide({ ...base, phase: 'DRAW' })).toEqual({ title: 'DRAW', line: expect.stringMatching(/Draw pile/) });
    const grow = freeTurnGuide({ ...base, phase: 'ACT' });
    expect(grow.title).toBe('GROW');
    expect(grow.line).toMatch(/card/i);
    expect(grow.line).toContain('»');
    expect(freeTurnGuide({ ...base, phase: 'ACT', picked: true }).line).toMatch(/lit tile/i);
    const bloom = freeTurnGuide({ ...base, phase: 'ACT', grew: true, bloomReady: true });
    expect(bloom.title).toBe('BLOOM?');
    expect(bloom.line).toContain('»');
    const throwStep = freeTurnGuide({ ...base, phase: 'DISCARD' });
    expect(throwStep.title).toBe('THROW');
    expect(throwStep.line).toMatch(/Throw pile/);
    expect(freeTurnGuide({ ...base, mine: false, phase: 'ACT' }).title).toBe('THEIR TURN');
  });

  it('every line stays brief', () => {
    for (const phase of ['DRAW', 'ACT', 'DISCARD'] as const)
      for (const picked of [false, true])
        for (const grew of [false, true])
          expect(wordCount(freeTurnGuide({ ...base, phase, picked, grew, bloomReady: grew }).line)).toBeLessThanOrEqual(14);
  });
});
