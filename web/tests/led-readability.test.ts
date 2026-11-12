import { describe, expect, it } from 'vitest';
import { ledCompactMessage, ledMarqueeTravel, ledMessageWidth, ledStaticMessage, ledToken } from '../src/player/led-cells.js';
import { readFileSync } from 'node:fs';

// A WORD THAT DOES NOT FIT SCROLLS (owner, 2026-11-12: "whenever display is showing a word that doesn't
// fit in the display - it always scrolls"). With motion on, the display never cuts a word to its first
// five letters: a designed shorthand (WIN, FINAL, 30:12) is kept, anything else is shown whole and the
// marquee runs whenever it is wider than the glass. Reduce Motion keeps the static short form.
describe('a word that does not fit scrolls, it is never cut', () => {
  it('keeps the designed shorthands for compact readouts', () => {
    expect(ledCompactMessage('YOU WIN')).toBe('WIN');
    expect(ledCompactMessage('FINAL TURNS')).toBe('FINALS');
    expect(ledCompactMessage('YOU 30 • 12 OPP')).toBe('30:12');
    expect(ledCompactMessage('+16 TILES')).toBe('+16');
  });

  it('shows any other compact word whole (it scrolls if wider than the glass), never its first five letters', () => {
    expect(ledCompactMessage('STRANGLED')).toBe('STRANGLED');
    expect(ledCompactMessage('SURROUNDED')).toBe('SURROUNDED');
    expect(ledCompactMessage('NICE MOVE')).toBe('NICE MOVE');
    // Reduce Motion has no marquee, so its static form is still the short one.
    expect(ledStaticMessage('STRANGLED')).toBe('STRAN');
  });

  it('the cockpit scrolls on width alone, whatever the frame (compact included)', () => {
    const src = readFileSync(new URL('../src/player/smart-cockpit.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/reduced \? ledStaticMessage\(value\) : frame\.compact \? ledCompactMessage\(value\) : value/);
    expect(src).toMatch(/const scrolling = animated && !frame\.motif && mode !== 'score' && ledMessageWidth\(shown\) > windowEl\.clientWidth - 2/);
  });
});

describe('compact LED readouts', () => {
  it('keeps event numbers readable within the physical display', () => {
    expect(ledStaticMessage('+16 TILES')).toBe('+16');
    expect(ledStaticMessage('CUT -7')).toBe('CUT-7');
    expect(ledStaticMessage('BLOOM +4')).toBe('B+4');
    expect(ledStaticMessage('YOU 30 • 12 OPP')).toBe('30:12');
    expect(ledStaticMessage('FINAL TURNS')).toBe('FINALS');
  });

  it('uses a close separator so the next phrase follows the prior one', () => {
    const message='GROW OR SKIP';
    const gap=ledMarqueeTravel(message)-ledMessageWidth(message);
    expect(gap).toBeLessThan(ledMessageWidth('    '));
    expect(gap).toBeGreaterThan(0);
  });
});

describe('long game copy is shortened for the physical window', () => {
  it('maps known captions and banners to short tokens', () => {
    expect(ledToken('You cut off 3 opponent tiles!')).toBe('CUT+3');
    expect(ledToken('Your opponent cut off 4 of your tiles')).toBe('CUT-4');
    expect(ledToken('You overgrew 2 opponent spots')).toBe('+2');
    expect(ledToken('Your opponent overgrew 2 of your spots')).toBe('-2');
    expect(ledToken('Your opponent grew 3 tiles')).toBe('OPP+3');
    expect(ledToken('Strengthened 5 → 9')).toBe('UP9');
    expect(ledToken('Blast cleared 5 tiles')).toBe('BOOM5');
    expect(ledToken('Boom! Their 9 is gone')).toBe('BOMB');
    expect(ledToken('Your tree is surrounded!')).toBe('CAUGHT');
    expect(ledToken('Home in danger')).toBe('WARN');
    expect(ledToken('Last turn')).toBe('LAST');
    expect(ledToken('Draw pile running low')).toBe('LOW');
  });

  it('leaves unknown copy alone so it keeps its scroll/shorthand path', () => {
    expect(ledToken('THIS IS A LONG MESSAGE TO TEST THE MECHANICAL LED WINDOW')).toBeNull();
    expect(ledToken('+4')).toBeNull();
  });
});
