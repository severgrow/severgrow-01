// The in-game guide's watcher (owner, 2026-11-09). Pure: which beat lights for which position.
import { describe, expect, it } from 'vitest';
import { applyAs, coordKey, homeCoord, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, State, View } from '../../src/engine/index.js';
import {
  EMPTY_GUIDE_PROGRESS, GUIDE_BEATS, GUIDE_LABEL_GAMES, GUIDE_LED_WORD, GUIDE_TRIMMED_LINES,
  contextShowsGuide, guideActive, guideLedWord, guideTap, guideWindow, markGuideSeen,
  mergeGuideProgress, nextGuideBeat, parseGuideProgress, possibleBeats, showGuideLabel,
} from '../src/logic/guide-watcher.js';
import type { GuideBeat } from '../src/logic/guide-watcher.js';
import { freeTurnGuide } from '../src/logic/tutorial-script.js';

/** Advance a real game until `pred` holds for the actor's view. */
const until = (seed: number, pred: (v: View, legal: Action[]) => boolean, max = 200): { s: State; v: View; legal: Action[] } => {
  let s = newGame(seed);
  for (let i = 0; i < max; i++) {
    const v = viewFor(s, s.actor);
    const legal = legalActions(v);
    if (pred(v, legal)) return { s, v, legal };
    const a = legal.find((x) => x.t === 'Draw' && x.from === 'deck') ?? legal.find((x) => x.t === 'Sprout')
      ?? legal.find((x) => x.t === 'EndAct') ?? legal.find((x) => x.t === 'Discard') ?? legal[0];
    if (!a) break;
    s = applyAs(s, s.actor, a);
  }
  throw new Error(`seed ${seed}: position not reached`);
};
const none = new Set<string>();
/** A Draw position with only the Draw pile on offer (the Throw pile choice removed). */
const deckOnlyDraw = (seed: number) => {
  const r = until(seed, (v) => v.phase === 'DRAW');
  return { ...r, legal: r.legal.filter((a) => !(a.t === 'Draw' && a.from === 'discard')) };
};

describe('which beat lights for which position', () => {
  it('the first Draw of a turn offers DRAW (and how to win), never a later move', () => {
    const { v, legal } = deckOnlyDraw(3);
    expect(possibleBeats(v, legal)).toEqual(['draw', 'win']);
    expect(nextGuideBeat(v, legal, none)).toBe('draw');
  });

  it('a Draw with a card on the Throw pile adds the Draw choice, after the plain Draw', () => {
    const { v, legal } = until(3, (v, l) => v.phase === 'DRAW' && l.some((a) => a.t === 'Draw' && a.from === 'discard'));
    expect(possibleBeats(v, legal)).toEqual(['draw', 'draw-choice', 'win']);
    expect(nextGuideBeat(v, legal, new Set(['draw']))).toBe('draw-choice');
  });

  it('Grow offers grow first, then Skip; Throw offers throw', () => {
    const act = until(5, (v) => v.phase === 'ACT');
    const beats = possibleBeats(act.v, act.legal);
    expect(beats[0]).toBe('grow');
    expect(beats).toContain('skip');
    expect(nextGuideBeat(act.v, act.legal, new Set(['grow']))).not.toBe('grow');
    const discard = until(5, (v) => v.phase === 'DISCARD');
    expect(nextGuideBeat(discard.v, discard.legal, none)).toBe('throw');
  });

  it('a Sprout onto my own tile is Strengthen, onto theirs is Cut', () => {
    const strong = until(11, (v, l) => v.phase === 'ACT' && l.some((a) => a.t === 'Sprout' && v.board[coordKey(a.coord)]?.owner === v.player), 400);
    expect(possibleBeats(strong.v, strong.legal)).toContain('strengthen');
    const cut = until(11, (v, l) => v.phase === 'ACT' && l.some((a) => a.t === 'Sprout' && v.board[coordKey(a.coord)] && v.board[coordKey(a.coord)]!.owner !== v.player), 600);
    expect(possibleBeats(cut.v, cut.legal)).toContain('cut');
  });

  it('Bloom, Bomb and Blast light only when the engine offers them', () => {
    const { v, legal } = until(5, (v) => v.phase === 'ACT');
    const fake = (extra: Action[]) => possibleBeats(v, [...legal.filter((a) => a.t !== 'Bloom' && a.t !== 'PlayFruit' && a.t !== 'MegaBomb'), ...extra]);
    expect(fake([])).not.toEqual(expect.arrayContaining(['bloom']));
    expect(fake([{ t: 'Bloom', cards: [1, 2, 3], hexes: [] }])).toContain('bloom');
    expect(fake([{ t: 'PlayFruit', card: 1, target: { q: 0, r: 0 } }])).toContain('bomb');
    expect(fake([{ t: 'MegaBomb', cards: [1, 2], target: { q: 0, r: 0 } }])).toContain('blast');
  });

  it("nothing lights on the opponent's turn or after the end", () => {
    const { s } = until(3, (v) => v.phase === 'DRAW');
    const waiting = viewFor(s, (1 - s.actor) as 0 | 1);
    expect(possibleBeats(waiting, [])).toEqual([]);
    expect(nextGuideBeat(waiting, [], none)).toBeNull();
  });

  it('once every possible beat is seen, nothing new is offered', () => {
    const { v, legal } = deckOnlyDraw(3);
    expect(nextGuideBeat(v, legal, new Set(['draw', 'win']))).toBeNull();
  });

  it('beats are offered in the turn order', () => {
    expect(GUIDE_BEATS.slice(0, 3)).toEqual(['draw', 'grow', 'throw']);
    expect(GUIDE_BEATS.at(-1)).toBe('win');
  });
});

describe('the "?" tap', () => {
  it('opens the new beat, glows when nothing is new, and opens Match Intel on their turn', () => {
    const { s, v, legal } = deckOnlyDraw(3);
    expect(guideTap({ active: true, view: v, legal, seen: none, tips: 0 })).toEqual({ kind: 'window', beat: 'draw' });
    expect(guideTap({ active: true, view: v, legal, seen: new Set(['draw', 'win']), tips: 0 })).toEqual({ kind: 'glow' });
    const theirs = viewFor(s, (1 - s.actor) as 0 | 1);
    expect(guideTap({ active: true, view: theirs, legal: [], seen: none, tips: 2 })).toEqual({ kind: 'intel', tab: 'tips' });
    expect(guideTap({ active: true, view: theirs, legal: [], seen: none, tips: 0 })).toEqual({ kind: 'intel', tab: 'rules' });
    expect(guideTap({ active: false, view: v, legal, seen: none, tips: 0 })).toEqual({ kind: 'none' });
  });
});

describe('the setting, Blitz and the context button', () => {
  it('runs only with the setting on, and never in Blitz', () => {
    expect(guideActive({ setting: true, blitz: false })).toBe(true);
    expect(guideActive({ setting: false, blitz: false })).toBe(false);
    expect(guideActive({ setting: true, blitz: true })).toBe(false);
  });
  it('a real context action beats "?"', () => {
    expect(contextShowsGuide({ active: true, contextHasAction: false })).toBe(true);
    expect(contextShowsGuide({ active: true, contextHasAction: true })).toBe(false);
    expect(contextShowsGuide({ active: false, contextHasAction: false })).toBe(false);
  });
  it('the LED points at "?" only while the guide is on and a beat is new', () => {
    expect(guideLedWord({ active: true, beat: 'grow' })).toBe(GUIDE_LED_WORD);
    expect(guideLedWord({ active: true, beat: null })).toBeNull();
    expect(guideLedWord({ active: false, beat: 'grow' })).toBeNull();
  });
  it('the HOW TO PLAY label shows for the first games only, and not once the lessons are done', () => {
    expect(GUIDE_LABEL_GAMES).toBe(3);
    expect(showGuideLabel({ active: true, gamesStarted: 1, lessonsDone: false })).toBe(true);
    expect(showGuideLabel({ active: true, gamesStarted: 3, lessonsDone: false })).toBe(true);
    expect(showGuideLabel({ active: true, gamesStarted: 4, lessonsDone: false })).toBe(false);
    expect(showGuideLabel({ active: true, gamesStarted: 1, lessonsDone: true })).toBe(false);
    expect(showGuideLabel({ active: false, gamesStarted: 1, lessonsDone: false })).toBe(false);
  });
});

describe('the windows', () => {
  it("every beat borrows an existing lesson's words, and lights something real on this board", () => {
    const act = until(5, (v) => v.phase === 'ACT');
    for (const beat of GUIDE_BEATS) {
      const w = guideWindow(beat as GuideBeat, act.v, act.legal);
      expect(w, beat).not.toBeNull();
      expect(w!.title.length, beat).toBeGreaterThan(0);
      expect(w!.why.length, beat).toBeGreaterThan(0);
    }
    const grow = guideWindow('grow', act.v, act.legal)!;
    expect(grow.lit.t).toBe('cards');
    const win = guideWindow('win', act.v, act.legal)!;
    expect(win.lit).toEqual({ t: 'hex', key: coordKey(homeCoord((1 - act.v.player) as 0 | 1, act.v.config)) });
  });
  it('only the listed lines are trimmed, and the Draw choice reuses the turn guide line', () => {
    expect(Object.keys(GUIDE_TRIMMED_LINES).sort()).toEqual(['cut', 'draw-choice']);
    expect(GUIDE_TRIMMED_LINES['draw-choice']!.why).toBe(freeTurnGuide({ phase: 'DRAW', mine: true, picked: false, grew: false, bloomReady: false }).line);
  });
  it('a window closes on the move it teaches', () => {
    const act = until(5, (v) => v.phase === 'ACT');
    expect(guideWindow('skip', act.v, act.legal)!.closesOn).toEqual(['EndAct']);
    expect(guideWindow('draw', act.v, act.legal)!.closesOn).toEqual(['Draw']);
  });
});

describe('what is remembered', () => {
  it('seen only grows; two copies join to everything either has seen and the higher count', () => {
    const a = markGuideSeen({ ...EMPTY_GUIDE_PROGRESS, games: 2 }, 'grow');
    const b = { seen: ['draw', 'grow'] as GuideBeat[], games: 1 };
    expect(mergeGuideProgress(a, b)).toEqual({ seen: ['draw', 'grow'], games: 2 });
    expect(markGuideSeen(a, 'grow')).toBe(a);
  });
  it('reads stored values defensively', () => {
    expect(parseGuideProgress(null)).toEqual(EMPTY_GUIDE_PROGRESS);
    expect(parseGuideProgress({ seen: ['grow', 'nope', 'grow', 7], games: -3 })).toEqual({ seen: ['grow'], games: 0 });
    expect(parseGuideProgress({ seen: ['win', 'draw'], games: 2.7 })).toEqual({ seen: ['draw', 'win'], games: 2 });
  });
});
