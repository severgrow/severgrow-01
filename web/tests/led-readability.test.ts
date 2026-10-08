import { describe, expect, it } from 'vitest';
import { ledMarqueeTravel, ledMessageWidth, ledStaticMessage } from '../src/player/led-cells.js';

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
