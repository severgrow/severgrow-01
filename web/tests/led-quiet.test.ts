import { describe, expect, it } from 'vitest';
import {
  LED_ADVANCE,
  ledLayout,
  ledMarqueeSpan,
  ledMarqueeSteps,
  ledMarqueeTravel,
  ledMessageWidth,
} from '../src/player/led-cells.js';
import { SMART_COCKPIT_CSS } from '../src/player/smart-cockpit.js';

/**
 * THE DISPLAY IS A WINDOW, NOT A SCROLL OF THE MESSAGE.
 *
 * These tests pin the architecture the 2026-10-29 pass measured, so a later edit cannot quietly
 * put the cost back:
 *   - a marquee bakes one period plus the glass, never the message three times over (the bitmap
 *     used to grow with the message and would overflow the maximum canvas width on a long line);
 *   - the pixels behind the glass are the SAME pixels a full bake would put there;
 *   - an opacity cue is never applied to a canvas (Chrome refuses to composite that: it was 180
 *     main-thread frames/s for a 1 Hz blink);
 *   - the display stops when nobody can see it.
 */

const LONG = 'THIS IS A LONG MESSAGE TO TEST THE MECHANICAL LED WINDOW';
const GLASS = 80; // the phone cockpit's window, in CSS px

describe('the marquee is baked for the window, not the message', () => {
  it('holds one period plus the glass, whatever the message is', () => {
    const travel = ledMarqueeTravel(LONG);
    const span = ledMarqueeSpan(LONG, GLASS);
    expect(span).toBe(Math.ceil(travel + GLASS));
    // The old sprite was three periods; the bounded one is one period plus the glass.
    expect(span).toBeLessThan(ledMessageWidth(`${LONG} • ${LONG} • ${LONG}`));
    // And the ratio is bounded: a longer message cannot make the sprite grow faster than one
    // period (it is the message that scrolls past, so one period is the minimum).
    expect(ledMarqueeSpan(`${LONG} ${LONG}`, GLASS) - ledMarqueeSpan(LONG, GLASS)).toBeLessThanOrEqual(
      ledMarqueeTravel(`${LONG} ${LONG}`) - travel + 1,
    );
  });

  it('clips the baked strip at the span instead of growing the bitmap', () => {
    const span = ledMarqueeSpan(LONG, GLASS);
    const windowed = ledLayout(LONG, true, 'amber', 1, span);
    const full = ledLayout(LONG, true, 'amber', 1);
    expect(windowed.width).toBe(span);
    expect(full.width).toBeGreaterThan(span);
    // Fewer dots are generated, which is the saving: the picture is bounded by the glass.
    expect(windowed.dots.length).toBeLessThan(full.dots.length);
  });

  it('puts the SAME dots behind the glass as a full bake would', () => {
    const span = ledMarqueeSpan(LONG, GLASS);
    const windowed = ledLayout(LONG, true, 'amber', 1, span);
    const full = ledLayout(LONG, true, 'amber', 1);
    // At the end of its travel the glass shows strip [period, period + glass]: that is the last
    // pixel the bounded sprite has to hold, so it is the one worth comparing.
    const visible = (dots: typeof full.dots) =>
      dots.filter((dot) => dot.x >= 0 && dot.x <= ledMarqueeTravel(LONG) + GLASS + 1)
        .map((dot) => `${dot.x.toFixed(3)}:${dot.y.toFixed(3)}:${dot.r}:${dot.tone}`);
    expect(visible(windowed.dots)).toEqual(visible(full.dots));
  });

  it('loops seamlessly: the strip repeats exactly once per travel', () => {
    const span = ledMarqueeSpan(LONG, GLASS);
    const layout = ledLayout(LONG, true, 'amber', 1, span);
    const period = ledMarqueeTravel(LONG);
    const at = (from: number, to: number) =>
      layout.dots.filter((dot) => dot.x >= from && dot.x < to).map((dot) => `${(dot.x - from).toFixed(3)}:${dot.y.toFixed(3)}:${dot.tone}`);
    // Dot columns are on a whole advance, so one advance of travel shifts the ink by exactly one
    // character: the second period is the first period again.
    expect(at(period, period + 60)).toEqual(at(0, 60));
  });

  it('leaves a static message exactly as it was', () => {
    const layout = ledLayout('GROW', false, 'amber', 1);
    expect(layout.width).toBe(ledMessageWidth('GROW'));
    // A span is ignored when the message is not repeated: a short message is its own size.
    expect(ledLayout('GROW', false, 'amber', 1, 400).width).toBe(layout.width);
    expect(ledLayout('GROW', false, 'amber', 1, 400).dots.length).toBe(layout.dots.length);
  });

  it('steps on whole dot advances, so the loop seam is exact', () => {
    // A dot-matrix sign steps column by column. The period is N advances, not "N advances minus
    // the 1 px the glyph-width formula insets", so the wrap lands on the same column it left.
    for (const message of ['GROW', LONG]) {
      const travel = ledMarqueeTravel(message);
      expect(ledMarqueeSteps(message) * LED_ADVANCE).toBe(travel);
      expect(travel % LED_ADVANCE).toBe(0);
      expect(travel).toBeGreaterThanOrEqual(ledMessageWidth(`${message} •`));
    }
  });
});

describe('an opacity cue never runs on a canvas', () => {
  // Chrome refuses to composite an opacity animation whose target is directly-composited canvas
  // content, so the animation falls back to the main thread: measured 2026-10-29, the 1 Hz idle
  // blink alone was 540 begin-main-frames per 3 s (0 with it disabled). The same animation on a
  // plain box around the canvas is composited for free (0 begin-main frames).
  const rule = (selector: string) => {
    const at = SMART_COCKPIT_CSS.indexOf(selector);
    expect(at, `${selector} exists`).toBeGreaterThanOrEqual(0);
    return SMART_COCKPIT_CSS.slice(at, SMART_COCKPIT_CSS.indexOf('}', at));
  };

  it('blinks the ink BOX, never the glyph canvas', () => {
    expect(SMART_COCKPIT_CSS).not.toMatch(/#smart-led\.led-alarm #smart-led-cells\s*\{[^}]*animation/);
    expect(rule('#smart-led.led-alarm #smart-led-ink')).toMatch(/animation:smart-led-alarm/);
  });

  it('pulses the brightness BOX, never the hot canvas', () => {
    expect(SMART_COCKPIT_CSS).not.toMatch(/#smart-led-window\.led-pulse #smart-led-hot\s*\{[^}]*animation/);
    expect(rule('#smart-led-window.led-pulse #smart-led-pulse')).toMatch(/animation:smart-led-pulse/);
    // The sprite itself only becomes visible for the pulse; its own opacity is still a STATE.
    expect(rule('#smart-led-window.led-pulse #smart-led-hot')).toMatch(/opacity:1/);
  });

  it('never promotes a layer for its whole life', () => {
    // A permanent will-change costs GPU memory and battery forever, including while the display
    // rests. Nothing on the display may carry one.
    expect(SMART_COCKPIT_CSS).not.toMatch(/#smart-led-(bloom|cells|hot|ink|pulse)\s*\{[^}]*will-change/);
    expect(SMART_COCKPIT_CSS).not.toMatch(/#smart-led-bloom-clip\s*\{[^}]*will-change/);
  });

  it('keeps the blink a discrete state, not an interpolation', () => {
    // A dot-matrix sign switches its dots OFF; the 20 ms ramp the old linear timing drew was one
    // frame of the same picture. `steps(1,end)` also means two compositor updates a second.
    expect(rule('#smart-led.led-alarm #smart-led-ink')).toMatch(/steps\(1,end\)/);
    expect(rule('#smart-led.led-alarm #smart-led-bloom')).toMatch(/steps\(1,end\)/);
  });
});

describe('nothing runs when it cannot be seen', () => {
  it('pauses every display animation while the tab is hidden or the page is paused', () => {
    const gate = SMART_COCKPIT_CSS.slice(SMART_COCKPIT_CSS.indexOf('html.led-hidden #smart-led'));
    expect(gate).toMatch(/#smart-led-ink/);
    expect(gate).toMatch(/#smart-led-cells/);
    expect(gate).toMatch(/#smart-led-bloom/);
    expect(gate).toMatch(/animation-play-state:paused !important/);
    expect(gate).toMatch(/body\.paused #smart-led/);
  });

  it('stops the marquee and the blink under reduce motion', () => {
    expect(SMART_COCKPIT_CSS).toMatch(/\.reduce-motion #smart-led\.led-alarm :is\(#smart-led-ink,#smart-led-bloom\) \{ animation:none !important; \}/);
  });
});
