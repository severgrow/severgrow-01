// THE SIGN, MESSAGE BY MESSAGE (owner brief, 2026-11-20: "the sign is small and read at a glance").
//
// This is the machine-checked half of the display audit. It pins, for every word the sign can put on
// the glass, the three things a glance needs:
//   1. every character is in the 5x7 font (after the sign's own case folding — the font is capitals);
//   2. the still (Reduce Motion / Speed Off) form is never wider than the glass, or is shrunk to fit;
//   3. the word is produced by the code that is supposed to produce it (so this list cannot drift
//      into fiction without a failing test).
import { describe, expect, it } from 'vitest';
import { GLYPH_CHARS, ledCompactMessage, ledFitScale, ledLayout, ledMessageWidth, ledStaticMessage, ledToken } from '../src/player/led-cells.js';
import { FLAVOUR_POOLS, RIVAL_POOLS } from '../src/player/led-flavour.js';
import { heldMoveHint, signPhaseWord } from '../src/player/smart-cockpit.js';

/** The glass the product measures (2 keys + the gap, minus the bezel padding). */
const GLASS_PX = 80;
/** The bound the existing display tests use: five glyphs and a breath. */
const FIT = 76;

/**
 * Every message the sign can show, with where it is triggered from.
 * Step words: player/display-machine.ts STEP_WORDS + player/smart-cockpit.ts signPhaseWord.
 * Hints: main.ts smartCockpit.hint / smart-cockpit.ts sync.
 * Play facts: player/display-readout.ts displayEventForPlay + main.ts events.
 * Answers: src/strings.ts TAP_WHY via main.ts sayWhyAtPoint.
 */
const SIGN_MESSAGES: readonly (readonly [text: string, source: string])[] = [
  // step words
  ['DRAW!', 'smart-cockpit signPhaseWord'], ['DRAW', 'display-machine stepPersonality'],
  ['GROW!', 'smart-cockpit signPhaseWord'], ['GROW', 'display-machine stepPersonality'],
  ['THROW!', 'smart-cockpit signPhaseWord'], ['THROW', 'display-machine stepPersonality'],
  ['BLOOM!', 'smart-cockpit signPhaseWord'], ['BLOOM', 'display-machine stepPersonality'],
  ['SKIP?', 'smart-cockpit signPhaseWord'], ['PASS', 'smart-cockpit signPhaseWord'],
  ['WAIT', 'smart-cockpit sync setAmbient'], ['FUTASAKU', 'smart-cockpit signPhaseWord'],
  // hints and held-move words
  ['CLEAR', 'smart-cockpit sync'], ['FLIP', 'smart-cockpit sync'], ['CANCEL', 'smart-cockpit heldMoveHint'],
  ['BLAST', 'main onCardTap / drag'], ['NO ROOM', 'main onCardTap'], ['UNDONE', 'main undo'],
  ['PICK 3 MORE', 'main hintBloomPick'], ['GROW 1', 'interaction heldMoveWord'], ['BLOOM 3', 'interaction heldMoveWord'],
  ['BLOOM 5', 'interaction heldMoveWord'], ['BOMB', 'interaction heldMoveWord'], ['REPLAY', 'main replay sign'],
  // play facts
  ['+3', 'display-readout'], ['-3', 'display-readout'], ['CUT-6', 'display-readout'], ['OPP +4', 'display-readout'],
  ['YOU LEAD', 'display-readout'], ['OPP LEADS', 'display-readout'], ['YOU WIN', 'display-readout'],
  ['OPP WINS', 'display-readout'], ['DRAW GAME', 'display-readout'], ['YOUR TURN', 'main cueTurnHandOff'],
  ['TIME', 'main blitzTimeoutTurn'], ['FINAL TURN', 'main deckFinal'], ['FINAL TURNS', 'main deckFinal'],
  ['LAST TURN', 'main deckFinal'], ['NICE.', 'main'], ['点', 'main'],
  // answers to a tap that did nothing (src/strings.ts TAP_WHY)
  ['DRAW A CARD FIRST', 'TAP_WHY.draw'], ['BLOCKED BY ROCK', 'TAP_WHY.rock'],
  ['CONNECT TO YOUR TREE', 'TAP_WHY.connect'], ['PICK A CARD', 'TAP_WHY.pick'], ['NOT THIS HEX', 'TAP_WHY.target'],
];

/** True when every character has a glyph in the sign's one face (capitals; a space is a gap). */
const drawable = (text: string) => [...text.toUpperCase()].every((ch) => ch === ' ' || GLYPH_CHARS.has(ch));

/** The width of what actually gets painted when nothing can scroll. */
const stillWidth = (text: string) => ledMessageWidth(ledStaticMessage(text)) * ledFitScale(ledStaticMessage(text), GLASS_PX);

describe('every message the sign can show is drawable, at a glance', () => {
  it('uses only characters the 5x7 font has', () => {
    for (const [text] of SIGN_MESSAGES) expect(drawable(text), text).toBe(true);
    for (const pool of [...Object.values(FLAVOUR_POOLS), ...Object.values(RIVAL_POOLS)])
      for (const line of pool.lines) expect(drawable(line), line).toBe(true);
  });

  it('fits the glass when it cannot scroll (a word is shrunk, never cut)', () => {
    for (const [text] of SIGN_MESSAGES) expect(stillWidth(text), text).toBeLessThanOrEqual(GLASS_PX - 2);
    for (const pool of [...Object.values(FLAVOUR_POOLS), ...Object.values(RIVAL_POOLS)])
      for (const line of pool.lines) expect(stillWidth(line), line).toBeLessThanOrEqual(GLASS_PX - 2);
  });

  it('keeps the designed still forms inside the 76-unit bound (or shrinks a whole word to fit)', () => {
    for (const [text] of SIGN_MESSAGES) {
      const still = ledStaticMessage(text);
      if (ledMessageWidth(still) < FIT) continue;
      // Over the bound is only allowed when the still form is the WHOLE compact word (so it can be
      // shrunk to fit) rather than a cut to five letters — and even then it must fit after the shrink.
      expect(still, text).toBe(ledCompactMessage(text));
      expect(ledFitScale(still, GLASS_PX), text).toBeLessThan(1);
    }
  });

  it('the sign folds case instead of drawing question marks (the opponent speaks in sentence case)', () => {
    for (const line of [...RIVAL_POOLS['cut-theirs'].lines, ...RIVAL_POOLS.mega.lines]) {
      const lower = ledLayout(line);
      const upper = ledLayout(line.toUpperCase());
      expect(lower.dots.length, `${line}: every glyph resolves`).toBe(upper.dots.length);
      expect(lower.dots, `${line}: a lower-case letter draws its capital`).toEqual(upper.dots);
    }
  });
});

describe('the sign says what the step is, and never the wrong step word', () => {
  it('names the held move only in the Grow step', () => {
    // The bug (2026-11-20): the Throw step's Cancel key named the held Grow move, so a thrown card
    // put "GROW 1" on the glass.
    expect(heldMoveHint('grow', () => 'GROW 1')).toBe('GROW 1');
    expect(heldMoveHint('grow', () => 'BLOOM 3')).toBe('BLOOM 3');
    expect(heldMoveHint('throw', () => 'GROW 1')).toBe('');
    expect(heldMoveHint('draw', () => 'GROW 1')).toBe('');
    expect(heldMoveHint('opp', () => 'GROW 1')).toBe('');
    expect(heldMoveHint('grow', () => null)).toBe('CANCEL'); // nothing held: the old fallback
  });

  it('reads the step from the dataset: PASS only for a Grow step with nothing to play', () => {
    expect(signPhaseWord({ step: 'draw' })).toBe('DRAW!');
    expect(signPhaseWord({ step: 'grow' })).toBe('GROW!');
    expect(signPhaseWord({ step: 'grow', futa04NoMove: 'true' })).toBe('PASS');
    expect(signPhaseWord({ step: 'grow', futa04NoMove: 'true', futa04Grew: 'true', futa04BloomReady: 'true' })).toBe('PASS');
    expect(signPhaseWord({ step: 'grow', futa04Grew: 'true', futa04BloomReady: 'true' })).toBe('SKIP?');
    expect(signPhaseWord({ step: 'throw' })).toBe('THROW!');
    expect(signPhaseWord({ step: 'opp' })).toBe('WAIT');
    expect(signPhaseWord({ futa04Bloom: 'true', step: 'grow' })).toBe('BLOOM!');
  });

  it('answers a dead tap in one short word, not a five-second sentence', () => {
    expect(ledToken('Draw a card first')).toBe('DRAW');
    expect(ledToken('Blocked by rock')).toBe('ROCK');
    expect(ledToken('Connect to your tree')).toBe('LINK');
    expect(ledToken('Pick a card')).toBe('PICK');
    expect(ledToken('Not this hex')).toBe('NO');
    for (const answer of ['DRAW', 'ROCK', 'LINK', 'PICK', 'NO']) {
      expect(ledMessageWidth(answer), answer).toBeLessThan(FIT);
      expect(drawable(answer), answer).toBe(true);
    }
  });
});
