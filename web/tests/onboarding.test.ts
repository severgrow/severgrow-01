// The campaign's first ten levels are the tutorial, so their guidance is a rule of its own: one
// action, said once, and less of it every level. These tests pin that curve and the silence that
// makes it fade — a guide that never stops talking is the thing the brief forbids.
import { describe, expect, it } from 'vitest';
import { ONBOARD } from '../../src/strings.js';
import {
  ONBOARDING_LEVELS,
  guideKey,
  intensityFor,
  onboardGuide,
  revealTierFor,
} from '../src/logic/onboarding.js';
import type { GuideInput } from '../src/logic/onboarding.js';

const base: GuideInput = {
  level: 1,
  turn: 1,
  mine: true,
  phase: 'DRAW',
  picked: false,
  targetCount: 0,
  availableCount: 3,
  fruitReady: false,
  bloomReady: false,
  grew: false,
  throwPending: false,
  theirOpen: 6,
  canWinNow: false,
};

const at = (patch: Partial<GuideInput>): GuideInput => ({ ...base, ...patch });
const say = (patch: Partial<GuideInput>) => onboardGuide(at(patch));

describe('the learning curve', () => {
  it('is very high for 1-3, medium for 4-7, targeted for 8-10, and stops at 11', () => {
    expect([1, 2, 3].map(intensityFor)).toEqual([1, 1, 1]);
    expect([4, 5, 6, 7].map(intensityFor)).toEqual([2, 2, 2, 2]);
    expect([8, 9, 10].map(intensityFor)).toEqual([3, 3, 3]);
    expect(ONBOARDING_LEVELS).toBe(10);
    expect(onboardGuide(at({ level: 11 }))).toBeNull();
    expect(onboardGuide(at({ level: 12, phase: 'ACT' }))).toBeNull();
  });

  it('reveals the interface in the same three steps, never removing a legal move', () => {
    expect([1, 2, 3].map(revealTierFor)).toEqual([1, 1, 1]);
    expect([4, 5, 6, 7].map(revealTierFor)).toEqual([2, 2, 2, 2]);
    expect([8, 9, 10, 11].map(revealTierFor)).toEqual([3, 3, 3, 3]);
  });
});

describe('the objective comes before the turn', () => {
  it('level 1 opens with the goal, and points at THEIR home while it says it', () => {
    // The pill teaches the concept; the Draw pile haloes itself at this step, so the next touch is
    // still obvious and nothing competes.
    expect(say({ level: 1, phase: 'DRAW' })).toEqual({
      title: ONBOARD.goal, line: ONBOARD.goalLine, focus: 'their-home',
    });
    // It is the opening beat only: once the player has drawn, the turn takes over.
    expect(say({ level: 1, phase: 'ACT' })?.title).toBe(ONBOARD.pick);
  });

  it('level 2 gives both routes to a win', () => {
    expect(say({ level: 2, phase: 'DRAW' })).toEqual({
      title: ONBOARD.howToWin, line: ONBOARD.howToWinLine, focus: 'their-home',
    });
  });

  it('says the goal once per level, not on every later draw', () => {
    for (const level of [1, 2]) {
      const later = say({ level, phase: 'DRAW', turn: 5 });
      expect(['THE GOAL', 'HOW TO WIN'], `L${level}`).not.toContain(later?.title);
    }
  });

  it('levels 3+ never spend a step on the goal', () => {
    for (const level of [3, 4, 8]) {
      expect(say({ level, phase: 'DRAW' })?.title, `L${level}`).not.toBe('THE GOAL');
      expect(say({ level, phase: 'DRAW' })?.title, `L${level}`).not.toBe('HOW TO WIN');
    }
  });

  it('states both real win conditions, in the engine terms', () => {
    // Surrounding the home ends the game (strangle); otherwise the higher score wins when the deck
    // runs out. The words must not promise anything the engine does not do.
    expect(ONBOARD.goalLine.toLowerCase()).toContain('surround');
    expect(ONBOARD.howToWinLine.toLowerCase()).toContain('surround');
    expect(ONBOARD.howToWinLine.toLowerCase()).toContain('more ground');
  });
});

describe('the win is taught where it is actionable', () => {
  it('says YOU CAN WIN only when one move really surrounds their home', () => {
    expect(say({ canWinNow: true, theirOpen: 1 })).toEqual({
      title: ONBOARD.oneMore, line: ONBOARD.oneMoreLine, focus: 'none',
    });
    // Sides left but no single move covers them: the ordinary guidance, never a taunt.
    expect(say({ canWinNow: false, theirOpen: 1 })?.title).not.toBe(ONBOARD.oneMore);
    expect(say({ canWinNow: false, theirOpen: 3 })?.title).not.toBe(ONBOARD.oneMore);
  });

  it('outranks every other line, because it is the win', () => {
    // Even mid-lesson, and even for a level that would otherwise be quiet.
    expect(say({ canWinNow: true, level: 4, phase: 'ACT', turn: 1, picked: true, targetCount: 2 })?.title).toBe(ONBOARD.oneMore);
    expect(say({ canWinNow: true, level: 9, phase: 'ACT', picked: true, targetCount: 3 })?.title).toBe(ONBOARD.oneMore);
  });

  it('never speaks over their turn', () => {
    expect(say({ canWinNow: true, mine: false })?.title).not.toBe(ONBOARD.oneMore);
  });
});

describe('level 1 says exactly one thing, and then the next', () => {
  it('opens on the Draw pile with the plainest words in the game', () => {
    // The opening beat now carries the objective (pointing at their home); the draw instruction
    // returns on the next turn, pointing at the pile.
    expect(say({})).toEqual({ title: ONBOARD.goal, line: ONBOARD.goalLine, focus: 'their-home' });
    expect(say({ turn: 3 })).toEqual({ title: ONBOARD.draw, line: ONBOARD.drawLine, focus: 'deck' });
  });

  it('offers one pile, not two, while the turn is being learned', () => {
    // The Throw pile's top card can be a Fruit card, which is not taught until level 8, so the
    // line names the Draw pile only. Levels 8-10 say nothing at the draw step at all.
    // Levels 2-3 guide every turn, so the line is checked on a later turn; 4-7 only on the opening.
    for (const level of [2, 3]) {
      expect(say({ level, phase: 'DRAW', turn: 3 }), `L${level}`).toEqual({
        title: ONBOARD.take, line: ONBOARD.takeLine, focus: 'deck',
      });
    }
    for (const level of [4, 7]) {
      expect(say({ level, phase: 'DRAW', turn: 2 }), `L${level}`).toEqual({
        title: ONBOARD.take, line: ONBOARD.takeLine, focus: 'deck',
      });
    }
    expect(ONBOARD.takeLine.toLowerCase()).not.toContain('throw pile');
    for (const level of [8, 9, 10]) expect(say({ level, phase: 'DRAW', turn: 3 }), `L${level}`).toBeNull();
  });

  it('asks for a card once the draw is done', () => {
    expect(say({ phase: 'ACT' })).toEqual({ title: ONBOARD.pick, line: ONBOARD.pickLine, focus: 'hand' });
  });

  it('points at the board once a card is picked', () => {
    expect(say({ phase: 'ACT', picked: true, targetCount: 3 }))
      .toEqual({ title: ONBOARD.grow, line: ONBOARD.growLine, focus: 'none' });
  });

  it('says nothing about a picked card that can use no tile (the tap explains itself)', () => {
    expect(say({ phase: 'ACT', picked: true, targetCount: 0 })).toBeNull();
  });

  it('moves to throwing when the board refuses a grow, and when the turn is spent', () => {
    expect(say({ phase: 'ACT', grew: true })).toEqual({ title: ONBOARD.throwTitle, line: ONBOARD.throwDone, focus: 'end' });
    expect(say({ phase: 'DISCARD' })).toEqual({ title: ONBOARD.throwTitle, line: ONBOARD.throwLine, focus: 'hand' });
    // A card is picked: the throw is the swipe up or the Throw pile, so the pile is pointed at.
    expect(say({ phase: 'DISCARD', throwPending: true })).toEqual({
      title: ONBOARD.throwTitle, line: ONBOARD.throwAgain, focus: 'discard',
    });
  });

  it('names the opponent turn on the opening turns, and only while the level is guided', () => {
    expect(say({ mine: false })).toEqual({ title: ONBOARD.theirTurn, line: ONBOARD.theirTurnLine, focus: 'none' });
    expect(say({ mine: false, turn: 6 })).toBeNull();
    // A level that opens with the bot's move still says so: 4, 5, 8 start that way.
    for (const level of [4, 5, 7]) {
      expect(say({ level, mine: false, turn: 2 }), `L${level}`).toEqual({
        title: ONBOARD.theirTurn, line: ONBOARD.theirTurnLine, focus: 'none',
      });
    }
    // The targeted levels need no caption for a waiting turn.
    for (const level of [8, 9, 10]) expect(say({ level, mine: false, turn: 2 }), `L${level}`).toBeNull();
  });

  it('never speaks over a finished game', () => {
    expect(say({ phase: 'GAME_OVER' })).toBeNull();
  });
});

describe('guidance fades as the levels rise', () => {
  it('4-7 guide the opening turns and then stop', () => {
    expect(say({ level: 5, phase: 'DRAW' })).not.toBeNull();
    expect(say({ level: 5, phase: 'DRAW', turn: 6 })).toBeNull();
    expect(say({ level: 5, phase: 'ACT', picked: true, targetCount: 2, turn: 6 })).toBeNull();
    expect(say({ level: 5, phase: 'DISCARD', turn: 6 })).toBeNull();
  });

  it('8-10 never explain drawing or throwing: only the new mechanic', () => {
    for (const level of [8, 9]) {
      expect(say({ level, phase: 'DRAW' }), `L${level} draw`).toBeNull();
      expect(say({ level, phase: 'DISCARD' }), `L${level} throw`).toBeNull();
      expect(say({ level, phase: 'ACT', picked: false }), `L${level} idle`).toBeNull();
      expect(say({ level, phase: 'ACT', picked: true, targetCount: 2 }), `L${level} grow`).toBeNull();
      expect(say({ level, mine: false }), `L${level} their turn`).toBeNull();
    }
    // 10 keeps its one gold line on the opening turn, and nothing else.
    expect(say({ level: 10, phase: 'ACT', turn: 1 })?.title).toBe('GOLD');
    expect(say({ level: 10, phase: 'ACT', turn: 1, picked: true, targetCount: 2 })?.title).toBe('GOLD');
    expect(say({ level: 10, phase: 'ACT', turn: 3 })).toBeNull();
    expect(say({ level: 10, phase: 'DRAW' })).toBeNull();
    expect(say({ level: 10, phase: 'DISCARD' })).toBeNull();
    expect(say({ level: 10, mine: false })).toBeNull();
  });

  it('8 speaks for Fruit only when a Fruit card can actually be played', () => {
    expect(say({ level: 8, phase: 'ACT', fruitReady: false })).toBeNull();
    expect(say({ level: 8, phase: 'ACT', fruitReady: true }))
      .toEqual({ title: ONBOARD.lessons[8]!.title, line: ONBOARD.lessons[8]!.line, focus: 'hand' });
  });

  it('9 speaks for Bloom only when a Bloom is legal', () => {
    expect(say({ level: 9, phase: 'ACT', bloomReady: false })).toBeNull();
    expect(say({ level: 9, phase: 'ACT', bloomReady: true }))
      .toEqual({ title: ONBOARD.lessons[9]!.title, line: ONBOARD.lessons[9]!.line, focus: 'hand' });
  });

  it('4-7 introduce their idea on their FIRST acting turn, whichever seat starts', () => {
    // A level the opponent opens starts that turn at 1 and mine at 2; keying the lesson to turn 1
    // silently skipped it on every one of those levels (level 4 was the reported case).
    for (const level of [4, 5, 6, 7]) {
      const mineAtTwo = say({ level, phase: 'ACT', turn: 2, mine: true });
      expect(mineAtTwo, `L${level}`).toEqual({
        title: ONBOARD.lessons[level]!.title,
        line: ONBOARD.lessons[level]!.line,
        focus: 'hand',
      });
      // ...and it is not repeated on a later turn.
      expect(say({ level, phase: 'ACT', turn: 5, mine: true }), `L${level} later`).toBeNull();
    }
  });

  it('each of 4-7 and 10 introduces its own idea on the first turn', () => {
    for (const level of [4, 5, 6, 7, 10]) {
      const guide = say({ level, phase: 'ACT', turn: 1 });
      expect(guide, `L${level}`).toEqual({
        title: ONBOARD.lessons[level]!.title,
        line: ONBOARD.lessons[level]!.line,
        focus: 'hand',
      });
    }
  });

  it('8 and 9 never describe a mechanic that is not on the table yet', () => {
    // Fruit and Bloom are taught at the moment they can be played, not before.
    expect(say({ level: 8, phase: 'ACT', turn: 1, fruitReady: false })).toBeNull();
    expect(say({ level: 9, phase: 'ACT', turn: 1, bloomReady: false })).toBeNull();
  });

  it('keeps every title short enough for the LED window', () => {
    const titles = [
      ONBOARD.draw, ONBOARD.take, ONBOARD.pick, ONBOARD.grow, ONBOARD.throwTitle, ONBOARD.theirTurn,
      ...Object.values(ONBOARD.lessons).map((l) => l.title),
    ];
    for (const title of titles) expect(title.length, title).toBeLessThanOrEqual(14);
    for (const line of [ONBOARD.drawLine, ONBOARD.takeLine, ONBOARD.pickLine, ONBOARD.growLine, ONBOARD.throwLine, ONBOARD.theirTurnLine]) {
      expect(line.split(/\s+/).length, line).toBeLessThanOrEqual(9);
    }
  });
});

describe('the first three levels are not one lesson repeated', () => {
  it('level 1 keeps guiding for the whole level', () => {
    expect(say({ level: 1, phase: 'ACT', turn: 9 })).not.toBeNull();
    expect(say({ level: 1, phase: 'ACT', turn: 9, picked: true, targetCount: 2 })).not.toBeNull();
  });

  it('levels 2-3 repeat the opening turns and then trust the player', () => {
    for (const level of [2, 3]) {
      expect(say({ level, phase: 'ACT', turn: 2, picked: true, targetCount: 2 }), `L${level} early`).not.toBeNull();
      expect(say({ level, phase: 'ACT', turn: 5, picked: true, targetCount: 2 }), `L${level} late grow`).toBeNull();
      expect(say({ level, phase: 'ACT', turn: 5 }), `L${level} late pick`).toBeNull();
      // Drawing and throwing stay named: they are the turn's frame, not a new idea.
      expect(say({ level, phase: 'DRAW', turn: 5 }), `L${level} draw`).not.toBeNull();
      expect(say({ level, phase: 'DISCARD', turn: 5 }), `L${level} throw`).not.toBeNull();
      // Ending a spent turn is always worth saying.
      expect(say({ level, phase: 'ACT', turn: 5, grew: true }), `L${level} done`).not.toBeNull();
    }
  });

  it('level 3 names the choice when more than one place works', () => {
    const two = say({ level: 3, phase: 'ACT', availableCount: 3 });
    expect(two).toEqual({ title: ONBOARD.twoWays, line: ONBOARD.twoWaysLine, focus: 'none' });
    // With one place there is no choice to point at, so the ordinary line stays.
    expect(say({ level: 3, phase: 'ACT', availableCount: 1 })?.title).toBe(ONBOARD.pick);
    // Level 1 and 2 never say it, and neither does a later turn of level 3.
    expect(say({ level: 1, phase: 'ACT', availableCount: 3 })?.title).toBe(ONBOARD.pick);
    expect(say({ level: 2, phase: 'ACT', availableCount: 3 })?.title).toBe(ONBOARD.pick);
    expect(say({ level: 3, phase: 'ACT', turn: 2, availableCount: 3 })?.title).toBe(ONBOARD.pick);
  });
});

describe('the key that decides when to repaint', () => {
  it('changes with the words, not with every frame', () => {
    const a = say({ phase: 'ACT' });
    const b = say({ phase: 'ACT' });
    expect(guideKey(1, 1, false, a)).toBe(guideKey(1, 1, false, b));
    expect(guideKey(1, 1, false, a)).not.toBe(guideKey(1, 2, false, a));
    expect(guideKey(1, 1, false, a)).not.toBe(guideKey(1, 1, true, a));
    expect(guideKey(1, 1, false, null)).toContain('quiet');
  });
});
