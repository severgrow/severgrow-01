import { describe, expect, it } from 'vitest';
import { ledMarqueeTravel, ledMessageWidth, ledStaticMessage, ledToken } from '../src/player/led-cells.js';

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
    expect(ledToken('Your opponent grew 2 tiles, taking 2 of yours')).toBe('-2');
    expect(ledToken('Your opponent grew 3 tiles')).toBe('OPP+3');
    expect(ledToken('Strengthened 5 → 9')).toBe('UP9');
    expect(ledToken('Mega Bomb cleared 5 tiles')).toBe('BOOM5');
    expect(ledToken('Fruited! Their 9 is gone')).toBe('FRUIT');
    expect(ledToken('Your tree is surrounded!')).toBe('CAUGHT');
    expect(ledToken('Home in danger')).toBe('WARN');
    expect(ledToken('Last turn')).toBe('LAST');
    expect(ledToken('The deck is running low')).toBe('LOW');
  });

  it('leaves unknown copy alone so it keeps its scroll/shorthand path', () => {
    expect(ledToken('THIS IS A LONG MESSAGE TO TEST THE MECHANICAL LED WINDOW')).toBeNull();
    expect(ledToken('+4')).toBeNull();
  });
});
