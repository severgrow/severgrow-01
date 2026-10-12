// One tutorial that teaches the whole game in about sixteen steps, plus separate lessons in How to.
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
  tutorialStateAt,
  tutorialTrackChapters,
  tutorialTrackFor,
  wordCount,
} from '../src/logic/tutorial-script.js';

const at = (id: string) => TUTORIAL_CHAPTER_IDS.indexOf(id as never);
const all = () => Array.from({ length: TUTORIAL_CHAPTER_COUNT }, (_, c) => tutorialLessons(c)).flat();
const lesson = (id: string) => all().find(l => l.id === id)!;
const coreSteps = () => TUTORIAL_CORE.flatMap(id => [...tutorialLessons(at(id))])
  .filter(l => !l.autoDiscard && l.action !== 'Opponent');

describe('the tutorial', () => {
  it('teaches Grow with Strengthen, take over and Bomb, then Bloom with the Throw pile and Blast, then the win, a free turn and the buttons', () => {
    expect([...TUTORIAL_CORE]).toEqual(['goal', 'turn', 'strengthen', 'cut', 'bomb', 'throw-pile', 'blast', 'win', 'free', 'buttons']);
  });

  it('every move of the game is in it except the last round (Skip comes with Grow)', () => {
    const actions = new Set(coreSteps().map(l => l.action));
    for (const a of ['Draw', 'Sprout', 'EndAct', 'Discard', 'Bloom', 'PlayFruit', 'MegaBomb', 'FreeTurn']) expect(actions.has(a as never), a).toBe(true);
    const ids = coreSteps().map(l => l.id);
    expect(ids).toEqual(expect.arrayContaining(['strength', 'cut', 'bomb', 'discard-draw', 'mega']));
    expect(TUTORIAL_CORE).not.toContain('skip');
    expect(TUTORIAL_CORE).not.toContain('final');
  });

  it('is about sixteen steps, with a short button tour after the free turn', () => {
    const steps = coreSteps();
    const free = steps.findIndex(l => l.action === 'FreeTurn');
    expect(free + 1, 'steps up to and including the free turn').toBeLessThanOrEqual(16);
    expect(steps.length).toBeLessThanOrEqual(19);
    expect(steps.slice(free + 1).every(l => l.focus === 'button')).toBe(true);
  });

  it('after the Bloom, the move is rewound and Skip is shown: Bloom is optional', () => {
    const ch = at('throw-pile');
    const ids = tutorialLessons(ch).map(l => l.id);
    const skip = ids.indexOf('bloom-skip');
    expect(skip).toBe(ids.indexOf('discard-bloom') + 1);
    expect(lesson('bloom-skip').rewind).toBe(true);
    expect(lesson('bloom-skip').action).toBe('EndAct');
    expect(lesson('bloom-skip').focus).toBe('context');
    // the rewound position is the one before the Bloom: same board, the cards back in hand
    const before = tutorialStateAt(ch, skip - 1);
    const rewound = tutorialStateAt(ch, skip);
    expect(rewound.board).toEqual(before.board);
    expect(rewound.hands[0]).toEqual(before.hands[0]);
    expect(rewound.phase).toBe('ACT');
  });

  it('no turn of theirs in the tutorial: it stays on your moves', () => {
    const beats = TUTORIAL_CORE.flatMap(id => [...tutorialLessons(at(id))]).filter(l => l.action === 'Opponent');
    expect(beats).toEqual([]);
  });

  it('throw pile is taught on a Draw, and Bloom is taught with it', () => {
    const ids = tutorialLessons(at('throw-pile')).map(l => l.id);
    expect(ids.indexOf('discard-draw')).toBeLessThan(ids.indexOf('discard-bloom'));
    expect(lesson('discard-draw').action).toBe('Draw');
    expect(lesson('discard-draw').why).toMatch(/glows gold/i);
    expect(lesson('discard-draw').why).not.toMatch(/instead of drawing/i);
    expect(tutorialLessons(at('throw-pile')).some(l => l.bloomDemo)).toBe(true);
  });

  it('moves through the chapters in order and ends after the button tour', () => {
    expect(nextTutorialChapter(at('goal'), 'core')).toBe(at('turn'));
    expect(nextTutorialChapter(at('turn'), 'core')).toBe(at('strengthen'));
    expect(nextTutorialChapter(at('bomb'), 'core')).toBe(at('throw-pile'));
    expect(nextTutorialChapter(at('throw-pile'), 'core')).toBe(at('blast'));
    expect(nextTutorialChapter(at('free'), 'core')).toBe(at('buttons'));
    expect(nextTutorialChapter(at('buttons'), 'core')).toBeNull();
    expect(previousTutorialChapter(at('cut'), 'core')).toBe(at('strengthen'));
    expect(previousTutorialChapter(at('goal'), 'core')).toBeNull();
  });
});

describe('separate lessons (How to)', () => {
  it('offers each topic on its own, plus Skip and the last round', () => {
    expect(TUTORIAL_EXTRAS.map(e => e.id)).toEqual(['grow', 'bombs', 'blooms', 'last-round', 'buttons']);
    const extra = TUTORIAL_EXTRAS.flatMap(e => [...e.chapters]);
    expect(new Set(extra).size).toBe(extra.length);
    for (const e of TUTORIAL_EXTRAS) expect(wordCount(e.title), e.id).toBeLessThanOrEqual(4);
  });

  it('an extra lesson plays only its own chapters, then ends', () => {
    expect(nextTutorialChapter(at('strengthen'), 'grow')).toBe(at('cut'));
    expect(nextTutorialChapter(at('cut'), 'grow')).toBeNull();
    expect(nextTutorialChapter(at('bomb'), 'bombs')).toBe(at('blast'));
    expect(nextTutorialChapter(at('blast'), 'bombs')).toBeNull();
    expect(previousTutorialChapter(at('bomb'), 'bombs')).toBeNull();
    expect(nextTutorialChapter(at('skip'), 'last-round')).toBe(at('final'));
  });

  it('a single chapter id is its own one-chapter track (How to play links)', () => {
    expect([...tutorialTrackChapters('bloom')]).toEqual(['bloom']);
    expect(nextTutorialChapter(at('bloom'), 'bloom')).toBeNull();
  });

  it('a chapter opened directly plays in the full tutorial when it is part of it', () => {
    expect(tutorialTrackFor(at('turn'))).toBe('core');
    expect(tutorialTrackFor(at('blast'))).toBe('core');
    expect(tutorialTrackFor(at('buttons'))).toBe('core');
    expect(tutorialTrackFor(at('skip'))).toBe('last-round');
    expect(tutorialTrackFor(at('bloom'))).toBe('bloom');
    expect([...tutorialTrackChapters(undefined)]).toEqual([...TUTORIAL_CORE]);
    expect([...tutorialTrackChapters('nonsense')]).toEqual([...TUTORIAL_CORE]);
  });
});

describe('tutorial words', () => {
  const text = () => all().map(l => `${l.instruction} ${l.why ?? ''} ${l.cta ?? ''}`).join('\n');

  it('uses one word list: Draw pile, Throw pile, Grow, Bloom, Bomb, Blast, points', () => {
    expect(text()).not.toMatch(/discard pile|\bdeck\b|sprout|fruit|mega|meld|consecutive same suit/i);
    expect(text()).not.toMatch(/most tiles/i);
  });

  it('Bloom is just Bloom: no "set" or "run"', () => {
    expect(text()).not.toMatch(/\b(sets?|runs?)\b(?! out)/i);
  });

  it('the win is a KO: surround their home on every side', () => {
    expect(lesson('win-place').instruction).toBe('KO');
    expect(lesson('win-place').why).toMatch(/every side/i);
    expect(lesson('win-place').why).toMatch(/instant win/i);
  });

  it('never names tile colours', () => {
    expect(text()).not.toMatch(/\b(green|red|colou?rs?)\b/i);
  });

  it('says the card number becomes the tile strength when you first Grow', () => {
    expect(lesson('grow').why).toMatch(/number/i);
    expect(lesson('grow').why).toMatch(/strength/i);
  });

  it('Strengthen, take over and Bomb are all ways to use your Grow', () => {
    expect(lesson('strength').why).toMatch(/higher/i);
    expect(lesson('cut').why).toMatch(/higher/i);
    expect(lesson('cut').why).toMatch(/take/i);
    expect(lesson('bomb').why).toMatch(/Grow/);
  });

  it('Blast is an extra move like Bloom', () => {
    expect(lesson('mega').why).toMatch(/Bloom/);
    expect(lesson('mega').why).toMatch(/extra/i);
  });

  it('scores in points, gold counting 2', () => {
    expect(lesson('rock-gold').why).toMatch(/2 points/i);
    expect(lesson('rock-gold').why).toMatch(/points wins/i);
  });

  it('names the real buttons', () => {
    expect(lesson('skip').why).toContain('»');
    expect(lesson('bloom-skip').why).toContain('»');
    expect(lesson('bloom-skip').why).toMatch(/skip Bloom/i);
    expect(lesson('btn-display').why).toMatch(/important info/i);
    expect(lesson('btn-display').why).not.toMatch(/[A-Z]{3,}/);
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
