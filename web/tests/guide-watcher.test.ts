// The in-game guide's watcher (owner, 2026-11-09). Pure: which beat lights for which position.
import { describe, expect, it } from 'vitest';
import { applyAs, coordKey, homeCoord, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, State, View } from '../../src/engine/index.js';
import {
  EMPTY_GUIDE_PROGRESS, GUIDE_BEATS, GUIDE_FRESH_GAMES, GUIDE_HINT_BEATS, GUIDE_TRIMMED_LINES,
  guideActive, guideFresh, guideHintBeat, guideTap, guideWindow, markGuideSeen,
  mergeGuideProgress, nextGuideBeat, parseGuideProgress, possibleBeats,
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

  it('nothing while my turn has no moves yet (the opponent\'s turn still replaying on screen)', () => {
    const { v } = deckOnlyDraw(3);
    expect(possibleBeats(v, [])).toEqual([]);
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

// OWNER CHANGED THE RULE (2026-11-10, final): the studio version - zero unsolicited text, one key.
// The bulb is the help key. While the player is new it is slightly brighter (no pulse); the first
// time Grow, Strengthen, Cut, Bloom, Bomb or Blast becomes possible it gets ONE 1.5 s edge light; a
// tap opens that exact action's lesson window on the real board. Nothing ever opens by itself.
describe('who gets the brighter help key', () => {
  const base = { setting: true, blitz: false, signedIn: false, finishedGames: 0, gamesStarted: 1, hinted: none as ReadonlySet<string>, reenabled: false };
  it('a guest or a first-ever game: yes', () => {
    expect(guideFresh(base)).toBe(true);
    expect(guideFresh({ ...base, signedIn: true })).toBe(true); // signed in, nothing finished yet
  });
  it('a signed-in player who has finished a game: never (unless they turn the guide back on)', () => {
    expect(guideFresh({ ...base, signedIn: true, finishedGames: 1 })).toBe(false);
    expect(guideFresh({ ...base, signedIn: true, finishedGames: 1, reenabled: true })).toBe(true);
  });
  it('ends after the first few games, or once every action has had its light', () => {
    expect(GUIDE_FRESH_GAMES).toBe(3);
    expect(guideFresh({ ...base, gamesStarted: 3 })).toBe(true);
    expect(guideFresh({ ...base, gamesStarted: 4 })).toBe(false);
    expect(guideFresh({ ...base, hinted: new Set(GUIDE_HINT_BEATS) })).toBe(false);
  });
  it('never with the setting off, and never in Blitz', () => {
    expect(guideFresh({ ...base, setting: false })).toBe(false);
    expect(guideFresh({ ...base, blitz: true })).toBe(false);
  });
});

describe('the one-time edge light', () => {
  it('names the six actions the owner listed', () => {
    expect([...GUIDE_HINT_BEATS].sort()).toEqual(['blast', 'bloom', 'bomb', 'cut', 'grow', 'strengthen']);
  });
  it('fires the first time an action is possible, once ever per action', () => {
    const act = until(5, (v) => v.phase === 'ACT');
    const plain = act.legal.filter((a) => a.t !== 'Bloom' && a.t !== 'PlayFruit' && a.t !== 'MegaBomb');
    expect(guideHintBeat({ fresh: true, view: act.v, legal: plain, hinted: none })).toBe('grow');
    expect(guideHintBeat({ fresh: true, view: act.v, legal: plain, hinted: new Set(['grow', 'strengthen', 'cut']) })).toBeNull();
    expect(guideHintBeat({ fresh: false, view: act.v, legal: plain, hinted: none })).toBeNull();
  });
  it('a rarer action outranks Grow when both are new (Bloom first)', () => {
    const act = until(5, (v) => v.phase === 'ACT');
    const withBloom = [...act.legal, { t: 'Bloom', cards: [1, 2, 3], hexes: [] } as Action];
    expect(guideHintBeat({ fresh: true, view: act.v, legal: withBloom, hinted: none })).toBe('bloom');
  });
  it('nothing on Draw or Throw (the display already says DRAW! / THROW!), nor on their turn', () => {
    const { s, v, legal } = deckOnlyDraw(3);
    expect(guideHintBeat({ fresh: true, view: v, legal, hinted: none })).toBeNull();
    const theirs = viewFor(s, (1 - s.actor) as 0 | 1);
    expect(guideHintBeat({ fresh: true, view: theirs, legal: [], hinted: none })).toBeNull();
  });
});

describe('a tap on the help key', () => {
  // OWNER CHANGED THE RULE (2026-11-10, iPhone: "it just opens match intel"): for a new player the
  // "?" ("How to play") ALWAYS answers with a lesson — Draw while drawing, Throw while throwing, and
  // how a match is won on the opponent's turn. Match Intel is the bulb's, for regular players.
  it('opens the lesson for the action possible right now (the new one first); never Match Intel while new', () => {
    const act = until(5, (v) => v.phase === 'ACT');
    const withBloom = [...act.legal, { t: 'Bloom', cards: [1, 2, 3], hexes: [] } as Action];
    expect(guideTap({ fresh: true, view: act.v, legal: withBloom, seen: none })).toEqual({ kind: 'window', beat: 'bloom' });
    expect(guideTap({ fresh: true, view: act.v, legal: withBloom, seen: new Set(['bloom']) })).toEqual({ kind: 'window', beat: 'grow' });
    // seen everything possible: it still answers with the most useful lesson for this moment
    expect(guideTap({ fresh: true, view: act.v, legal: withBloom, seen: new Set(GUIDE_BEATS) })).toEqual({ kind: 'window', beat: 'bloom' });
    expect(guideTap({ fresh: false, view: act.v, legal: withBloom, seen: none })).toEqual({ kind: 'intel' });
    const { s, v, legal } = deckOnlyDraw(3);
    expect(guideTap({ fresh: true, view: v, legal, seen: none })).toEqual({ kind: 'window', beat: 'draw' }); // Draw: the Draw lesson
    expect(guideTap({ fresh: true, view: viewFor(s, (1 - s.actor) as 0 | 1), legal: [], seen: none })).toEqual({ kind: 'window', beat: 'win' });
    expect(guideTap({ fresh: false, view: v, legal, seen: none })).toEqual({ kind: 'intel' });
    const discard = until(5, (dv) => dv.phase === 'DISCARD');
    expect(guideTap({ fresh: true, view: discard.v, legal: discard.legal, seen: none })).toEqual({ kind: 'window', beat: 'throw' });
  });
});

describe('the setting and Blitz', () => {
  it('runs only with the setting on, and never in Blitz', () => {
    expect(guideActive({ setting: true, blitz: false })).toBe(true);
    expect(guideActive({ setting: false, blitz: false })).toBe(false);
    expect(guideActive({ setting: true, blitz: true })).toBe(false);
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
