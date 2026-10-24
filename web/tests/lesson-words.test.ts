// The lessons' words: an action on the display, an explanation in the info box, one word list.
import { describe, expect, it } from 'vitest';
import { LESSON } from '../../src/strings.js';

const words = (t: string) => t.replace(/[»:]/g, ' ').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
const entries = Object.entries(LESSON).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as const] : []));

/**
 * The DISPLAY carries the action: a short line, never a lone word. The INFO BOX carries an
 * explanation: one full sentence (the `…Line` keys), shown once. Answers and finish titles are
 * short labels of their own.
 */
const DISPLAY = [
  'tapDraw', 'tapThrowPile', 'chooseCard', 'tapTile', 'tapTiles', 'throwCard', 'tapThrow',
  'tapBloom', 'tapBlast', 'chooseBomb', 'bombTile', 'tapTheirTile', 'tapLastSide',
  'bloomHello', 'bombHello', 'theirTurn', 'lastCards', 'lastTurn', 'welcome',
] as const;

const FINISH_LINES = new Set(['wonOnPoints', 'wonByKo', 'goldDecided']);

describe('lesson words', () => {
  it('the lesson explanations are the owner’s sentences, exactly', () => {
    // The owner's wording, verbatim (owner, 2026-10-22, replacing the 2026-10-19 sentences). The two
    // piles are the Draw pile and the Throw pile everywhere, as on the board (2026-10-20). The final
    // sign-off (2026-10-22) capitalises the three steps everywhere and pairs Bloom with Blast.
    expect(LESSON.yourHomeLine).toBe('This is your home. Place cards on the tiles that connect to your home to Grow.');
    expect(LESSON.theirHomeLine).toBe('TO WIN: surround opponent’s home tile, or have more tiles on the board when the Draw pile runs out.');
    expect(LESSON.tapDrawLine).toBe('Every turn has 3 steps – Draw, Grow and Throw. You start by drawing 1 card from the top of the Draw pile or the Throw pile.');
    expect(LESSON.growLine).toBe('Grow: drag one of your cards from your hand onto the board, or tap it to select and then place it on the board.');
    expect(LESSON.youGrewLine).toBe('Tiles keep the rank of the card used. Higher ranks are harder to cut.');
    expect(LESSON.throwLine).toBe('Throw: swipe up, drag it to the Throw pile, or double tap to Throw a card. This ends your turn.');
    expect(LESSON.biggerWinsLine).toBe('Strengthen: a stronger card can replace your own tile.');
    // Owner, 2026-10-24: "Take", so the word Cut belongs to level 4 alone.
    expect(LESSON.takeTileLine).toBe('Take: a higher card can take an opponent’s tile.');
    expect(LESSON.rocksBlockLine).toBe('Nothing can Grow on a rock.');
    expect(LESSON.goldDoubleLine).toBe('A gold tile counts double, so it is worth two points.');
    expect(LESSON.cutLinkLine).toBe('Cut a tile to break the chain behind it.');
    expect(LESSON.witheredLine).toBe('Tiles cut off from their home disappear.');
    expect(LESSON.bloomedLine).toBe('Bloom grows several tiles at once and does NOT use your Grow.');
    expect(LESSON.surroundLine).toBe('Surround: fill every tile around their home for an instant win.');
    expect(LESSON.bombLine).toBe('Bomb: removes one enemy tile, even a 9. Uses your Grow.');
    expect(LESSON.blastLine).toBe('Blast: two Bombs clear a large area. Homes are safe.');
    expect(LESSON.freeGrowLine).toBe('Blast clears several tiles at once and does NOT use your Grow.');
    expect(LESSON.pileGoldLine).toBe('The Throw pile glows gold when its top card completes a Bloom in your hand.');
    expect(LESSON.optionalLine).toBe('Tap » to skip Grow/Bloom and keep your cards for later.');
    // Owner, 2026-10-22: the last-turn line is short, and Undo is taught straight after the skip.
    expect(LESSON.lastTurnLine).toBe('The Draw pile is empty – this is your last turn.');
    expect(LESSON.theirTurnLine).toBe('They Draw, Grow and Throw too.');
    expect(LESSON.undoLine).toBe('You are able to undo your previous moves until you Throw a card at the end of your turn.');
  });

  it('the three steps are always Draw, Grow and Throw, capital first letter (owner, 2026-10-22)', () => {
    for (const [k, v] of entries.filter(([k]) => k.endsWith('Line'))) {
      expect(v, `${k}: ${v}`).not.toMatch(/\b(?:draw|grow|throw)\b/);
      // ...and never shouted in a sentence: GROW, DRAW, THROW belong on the display.
      expect(v, `${k}: ${v}`).not.toMatch(/\b(?:DRAW|GROW|THROW)\b/);
    }
  });

  it('Bloom and Blast say the same thing the same way: they do NOT use your Grow', () => {
    expect(LESSON.bloomedLine.startsWith('Bloom ')).toBe(true);
    expect(LESSON.freeGrowLine.startsWith('Blast ')).toBe(true);
    for (const line of [LESSON.bloomedLine, LESSON.freeGrowLine]) expect(line).toMatch(/does NOT use your Grow\.$/);
  });

  it('two piles, two names: the Draw pile and the Throw pile, never "discard" (owner, 2026-10-20)', () => {
    for (const [k, v] of entries) {
      expect(v, `${k}: ${v}`).not.toMatch(/discard/i);
      // a pile is always named in full and capitalised, as on the board
      expect(v, `${k}: ${v}`).not.toMatch(/\b(?:draw|throw) pile\b/);
    }
  });

  it('the Bloom explanation says three in order in one suit', () => {
    // Owner copy (2026-10-20): "three in order in one suit", never "in a row".
    expect(LESSON.cardsThatBloomLine).toBe('BLOOM: three cards with the same number, or three in order in one suit.');
    expect(LESSON.cardsThatBloomLine).not.toMatch(/\bin a row\b/i);
    // Owner, 2026-10-20: the end-turn key is » alone; the display never spends words on "to throw".
    expect(LESSON.tapThrow).toBe('TAP »');
  });

  it('level 1 opens with a welcome on the display, drawn in the display’s own glyphs', () => {
    // Owner, 2026-10-22: HELLO ❤️ WELCOME ❤️ while the first three sentences are read. The sign's
    // 5x7 alphabet has the heart as ♥ (led-cells.ts), so that is the character used.
    expect(LESSON.welcome).toBe('HELLO ♥ WELCOME ♥');
  });

  it('the display labels use the game’s own names: Draw pile and Throw pile', () => {
    // Owner, 2026-10-20: at most three words on the display.
    expect(LESSON.tapDraw).toBe('TAP DRAW PILE');
    expect(LESSON.tapThrowPile).toBe('TAP THROW PILE');
    for (const k of DISPLAY) {
      expect(LESSON[k], `${k}: ${LESSON[k]}`).not.toMatch(/discard pile/i);
      // If a label names a pile, it is the game's name: DRAW PILE / THROW PILE.
      const piles = LESSON[k].match(/\b(?:DRAW|THROW|draw|throw) PILE\b/gi) ?? [];
      expect(piles.every((p) => p === p.toUpperCase()), `${k}: ${LESSON[k]}`).toBe(true);
    }
  });

  it('the display says what to do in at most three words', () => {
    // Owner, 2026-10-20: the LED is read at a glance, so every action line is <= 3 words. A lone
    // WORD is still not a line — except » itself, which is the key's own name ("TAP »").
    for (const k of DISPLAY) {
      const n = words(LESSON[k]).length;
      expect(n, `${k}: ${LESSON[k]}`).toBeGreaterThanOrEqual(1);
      expect(n, `${k}: ${LESSON[k]}`).toBeLessThanOrEqual(3);
    }
    expect(words(LESSON.tapThrow)).toEqual(['TAP']);
    expect(LESSON.tapThrow).toBe('TAP »');
  });

  it('answers and finish titles are 6 words or fewer', () => {
    const short = entries.filter(([k]) => !k.endsWith('Line') && !FINISH_LINES.has(k) && !(DISPLAY as readonly string[]).includes(k));
    for (const [k, v] of short) expect(words(v).length, `${k}: ${v}`).toBeLessThanOrEqual(6);
    expect(words(LESSON.tooWeak(9, 9)).length).toBeLessThanOrEqual(6);
  });

  // The box has room for a full sentence (the owner's four are 100-140 characters). Four lines at
  // 12.5 px on a 320 px phone is the layout budget; web/e2e/lessons-3.ts measures the real box.
  it('explanations are full sentences that fit four lines on the smallest phone', () => {
    for (const [k, v] of entries.filter(([k]) => k.endsWith('Line'))) {
      expect(v.length, `${k}: ${v}`).toBeLessThanOrEqual(160);
      expect(words(v).length, `${k}: ${v}`).toBeLessThanOrEqual(28);
      expect(v.endsWith('.'), `${k}: ${v}`).toBe(true);
      expect(/^[A-Z]/.test(v), `${k}: ${v}`).toBe(true);
    }
  });

  it('finish lines are 12 words or fewer', () => {
    for (const [k, v] of entries.filter(([k]) => FINISH_LINES.has(k))) expect(words(v).length, `${k}: ${v}`).toBeLessThanOrEqual(12);
  });

  it('never "set" or "run" for a Bloom, never Fruit, Campaign, bot, tree or take over, never a tile colour', () => {
    // "runs out" / "ran out" is the Draw pile's clock (SPEC), not the Bloom word.
    // Owner, 2026-10-19: it is your HOME, never your tree; never "take over" (cut / disconnect).
    const banned = /\b(sets?|fruit|campaign|bots?|green|red|blue|yellow|tree)\b|\bruns?\b(?!\s+out)|\btakes?\s+over\b/i;
    for (const [k, v] of entries) expect(banned.test(v), `${k}: ${v}`).toBe(false);
  });
});
