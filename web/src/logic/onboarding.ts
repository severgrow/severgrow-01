// ONBOARDING — the campaign's first ten levels are the game's tutorial.
//
// This module answers one question, from the game's OWN state: *what is the one thing to do next?*
// It is pure (no DOM, no clock, no random) so the same position always gives the same line, and the
// tests can pin every branch. The campaign screen renders the answer in the tutorial's own top
// window; nothing here draws anything.
//
// The learning structure (owner brief 2026-10-17):
//   levels 1-3  DISCOVER   very high guidance: every step, one action, minimum clutter
//   levels 4-7  CONNECT    medium: the new idea once, then only where a player stalls
//   levels 8-10 COMBINE    targeted: Fruit, Bloom and gold only
// Later levels (11+) are not this module's business and get no campaign guidance.
import { ONBOARD } from '../../../src/strings.js';

/** Levels 1-10 are the guided stretch. Level 11 is where the board grows and guidance stops. */
export const ONBOARDING_LEVELS = 10;

/** 1 = very high guidance, 2 = medium, 3 = targeted. */
export type GuidanceIntensity = 1 | 2 | 3;

export const intensityFor = (level: number): GuidanceIntensity =>
  level <= 3 ? 1 : level <= 7 ? 2 : 3;

/** Which controls the interface shows plainly. 1 = fewest, 3 = everything, as in a normal game. */
export type RevealTier = 1 | 2 | 3;

/**
 * The interface reveals itself by level, not by hiding legal moves: tier 1 keeps the cockpit but
 * quiets the secondary tools (sort, replay, history), tier 2 brings sort back, tier 3 is the normal
 * game. Nothing a player may legally need is ever removed.
 */
export const revealTierFor = (level: number): RevealTier => (level <= 3 ? 1 : level <= 7 ? 2 : 3);

export type GuideFocus = 'deck' | 'discard' | 'hand' | 'their-home' | 'end' | 'none';

export type OnboardGuide = {
  /** The LED title in the top window (short, caps). */
  title: string;
  /** One line under it: the same instruction in plain words. */
  line: string;
  /** What the window's pill points at, when it points at anything. */
  focus: GuideFocus;
};

/** Everything the guide may look at — all of it comes from the live game, never from a script. */
export type GuideInput = {
  level: number;
  /** 1-based turn number of the whole match. */
  turn: number;
  mine: boolean;
  phase: 'DRAW' | 'ACT' | 'DISCARD' | 'GAME_OVER' | 'KNOCK' | 'ROT_PICK';
  /** A card (or a move kind) is picked, so the next touch is a tile. */
  picked: boolean;
  /** How many tiles the picked card could legally use right now. */
  targetCount: number;
  /** How many tiles could be grown on if nothing were picked (the lit places on the board). */
  availableCount: number;
  /** A Fruit card is in hand and can be played now. */
  fruitReady: boolean;
  /** A Bloom is legal right now. */
  bloomReady: boolean;
  /** I have already grown this turn, so the only move left is to throw. */
  grew: boolean;
  /** A card is picked and waiting for its second tap to be thrown. */
  throwPending: boolean;
  /** How many sides of THEIR home are still takeable (on the board, not rock, empty). */
  theirOpen: number;
  /** A legal move right now would take their last open side — the win. */
  canWinNow: boolean;
};

/**
 * The next thing to do, or null when the guide should stay quiet. Silence is a feature: the brief
 * asks guidance to fade, so a null answer means "nothing to say — play".
 */
export const onboardGuide = (s: GuideInput): OnboardGuide | null => {
  if (s.level < 1 || s.level > ONBOARDING_LEVELS) return null;
  if (s.phase === 'GAME_OVER') return null;
  const intensity = intensityFor(s.level);
  const lesson = ONBOARD.lessons[s.level];
  // Whose turn it is alternates strictly, so the match's first two turns are exactly MY first
  // acting turn — whether I start (turn 1) or the opponent does (turn 2). Keying a lesson to
  // "turn 1" silently skipped it on every level the opponent opens.
  const opening = s.turn <= 2;
  const firstTurn = opening;

  // Their turn: the guided levels say what is happening, so an inert board is never a mystery.
  // Levels 8-10 stay quiet — by then a waiting turn needs no caption.
  if (!s.mine) {
    return intensity <= 2 && opening
      ? { title: ONBOARD.theirTurn, line: ONBOARD.theirTurnLine, focus: 'none' }
      : null;
  }

  // The win, the moment it is one move away. Highest priority of anything the guide can say: it is
  // the objective itself, made concrete. Offered on every guided level, at any turn.
  if (s.canWinNow) return { title: ONBOARD.oneMore, line: ONBOARD.oneMoreLine, focus: 'none' };

  // A new mechanic, said once, at the moment it is actually usable. This is the whole of levels
  // 8-10's guidance: Fruit when a Fruit card can be played, Bloom when a Bloom is legal.
  if (s.phase === 'ACT') {
    if (s.level === 8 && s.fruitReady) return { title: ONBOARD.lessons[8]!.title, line: ONBOARD.lessons[8]!.line, focus: 'hand' };
    if (s.level === 9 && s.bloomReady) return { title: ONBOARD.lessons[9]!.title, line: ONBOARD.lessons[9]!.line, focus: 'hand' };
    // Fruit and Bloom are never described hypothetically: if the moment is not here, say nothing.
    if (s.level === 8 || s.level === 9) return null;
    // Gold is on the board from the first turn, so its one line belongs there.
    if (s.level === 10 && opening) {
      return { title: ONBOARD.lessons[10]!.title, line: ONBOARD.lessons[10]!.line, focus: s.picked ? 'none' : 'hand' };
    }
  }
  // Levels 4-7 introduce their idea on my opening turn, then leave the player alone.
  if (lesson && s.phase === 'ACT' && opening) {
    return { title: lesson.title, line: lesson.line, focus: s.picked ? 'none' : 'hand' };
  }

  if (s.phase === 'DRAW') {
    // The objective comes first: a player who does not know what winning is cannot use any of the
    // rest. Levels 1 and 2 spend their opening draw on it (level 1 one route, level 2 both), and the
    // window points at THEIR home while it says it — the word "home" is useless until the player can
    // see which thing it is. The Draw pile still haloes itself at this step, so nothing competes:
    // the pill teaches the goal, the pile shows the touch.
    if (opening && s.level <= 2) {
      return s.level === 1
        ? { title: ONBOARD.goal, line: ONBOARD.goalLine, focus: 'their-home' }
        : { title: ONBOARD.howToWin, line: ONBOARD.howToWinLine, focus: 'their-home' };
    }
    // 1-3: always. 4-7: the first turns. 8-10: not at all — by now drawing is automatic.
    if (intensity === 3) return null;
    if (intensity === 2 && !firstTurn) return null;
    // The very first action a player ever takes gets the plainest possible words.
    if (s.level === 1) return { title: ONBOARD.draw, line: ONBOARD.drawLine, focus: 'deck' };
    // One option while the turn is still being learned (see ONBOARD.takeLine).
    return { title: ONBOARD.take, line: ONBOARD.takeLine, focus: 'deck' };
  }

  if (s.phase === 'ACT') {
    // Grown and still holding the turn: the only thing left is to end it. The window points at the
    // end-turn control, because "done" is the exact moment a beginner stops and wonders what now.
    if (s.grew && !s.picked) return { title: ONBOARD.throwTitle, line: ONBOARD.throwDone, focus: 'end' };
    // Levels 2-3 repeat the turn with fewer prompts: the opening turns are guided, then the player
    // is trusted with the same steps they have just taken. Level 1 keeps guiding throughout.
    const soft = s.level >= 2 && s.turn > 2;
    if (s.picked) {
      if (s.targetCount === 0) return null; // nothing can use this card: the tap feedback explains it
      if (intensity >= 2 || soft) {
        // Later levels say it only on the opening turns.
        if (intensity >= 2 && !firstTurn) return null;
        if (soft) return null;
      }
      return { title: ONBOARD.grow, line: ONBOARD.growLine, focus: 'none' };
    }
    // Level 3's own lesson: there is more than one place to go, and choosing is the point.
    if (s.level === 3 && s.turn === 1 && s.availableCount >= 2) {
      return { title: ONBOARD.twoWays, line: ONBOARD.twoWaysLine, focus: 'none' };
    }
    if (soft) return null;
    if (intensity === 1) return { title: ONBOARD.pick, line: ONBOARD.pickLine, focus: 'hand' };
    if (intensity === 2 && firstTurn) return { title: ONBOARD.pick, line: ONBOARD.pickLine, focus: 'hand' };
    return null;
  }

  if (s.phase === 'DISCARD') {
    if (intensity === 3) return null;
    if (intensity === 2 && !firstTurn) return null;
    // The line says "tap a card twice", so the window points at the HAND, not the pile. Once a card
    // is waiting for its second tap, the next touch is the same card again.
    return s.throwPending
      ? { title: ONBOARD.throwTitle, line: ONBOARD.throwAgain, focus: 'hand' }
      : { title: ONBOARD.throwTitle, line: ONBOARD.throwLine, focus: 'hand' };
  }

  return null;
};

/** A stable key for the current guide, so the window only repaints when the words change. */
export const guideKey = (level: number, turn: number, picked: boolean, guide: OnboardGuide | null): string =>
  guide ? `${level}:${turn}:${picked ? 1 : 0}:${guide.title}:${guide.line}` : `${level}:${turn}:quiet`;
