// THE MIST'S HAND-OFF, locked at the source (owner, 2026-10-28: "the way the empty tiles around the
// 'discovered' is changing colors, shading --- i like that, but make it smooth more transition like
// rather than sudden changes"). The map is rebuilt wholesale on every paint, so the old fog nodes
// cannot animate out; the view remembers the last fog snapshot and repaints the diff as one short
// overlay. These tests guard the pieces that make that work, and the two rules that keep it
// harmless: it is paused while the map moves, and Reduce motion gets the settled map instantly.
//
// `web/e2e/territory-fog.ts` measures the same thing in a real browser, mid-transition.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const onlineCss = read('../src/online/online-css.ts');
const worldView = read('../src/online/world-view.ts');

/** The selector list of every flat rule, so a rule can be looked up by an EXACT selector. */
const rules = (css: string): { prelude: string; body: string }[] =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({
      prelude: (m[1] ?? '').slice((m[1] ?? '').lastIndexOf('*/') + 2).replace(/\s+/g, ' ').trim(),
      body: m[2] ?? '',
    }))
    .filter((r) => !r.prelude.startsWith('@') && r.prelude !== '');

const bodyOf = (css: string, selector: string): string | null =>
  rules(css).find((r) => r.prelude.split(',').map((s) => s.replace(/\s+/g, ' ').trim()).includes(selector))?.body ?? null;

/** A whole at-rule, brace-balanced (the keyframes bodies contain their own braces). */
const atRule = (css: string, prelude: string): string => {
  const at = css.indexOf(prelude);
  if (at < 0) return '';
  let depth = 0;
  for (let i = at + prelude.length - 1; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(at, i + 1);
  }
  return '';
};

describe('the mist lifts instead of being cut', () => {
  it('the view remembers the fog of the last paint and diffs it against the new one', () => {
    expect(worldView, 'the last fog snapshot must live on the view, not in the DOM').toMatch(
      /private fogCells: Map<string, FogRing> \| null = null;/,
    );
    expect(worldView, 'the shift is computed from that snapshot and the Reduce-motion gate').toContain(
      'fogShift(fogAtLastLook(this.fogCells, inFlight), fogNow, interfaceMotionAllowed())',
    );
    expect(worldView, 'and the snapshot moves on with the paint').toContain('this.fogCells = fogNow');
  });

  it('a repaint inside the hand-off carries the mist that is already lifting (no jump to full)', () => {
    expect(worldView, 'the hand-off in flight is remembered with its own clock').toMatch(
      /private mistShift: FogShift \| null = null;/,
    );
    expect(worldView, 'an unfinished hand-off is folded into the next paint').toContain(
      'fogAtLastLook(this.fogCells, inFlight)',
    );
    expect(worldView, 'and its animation resumes where it was, not from the start').toMatch(
      /shiftWas\.style\.animationDelay = `-\$\{resume\}ms`/,
    );
  });

  it('draws the outgoing mist ABOVE the new face and BELOW the tile edges', () => {
    expect(worldView, 'the fill must be under the hand-off').toContain("faces.classList.add('world-faces')");
    expect(worldView, 'the hand-off sits between the fills and the edges').toContain('svg.insertBefore(fogShiftLayer, lines)');
    expect(worldView, 'the old mist is drawn again, cell by cell').toMatch(/for \(const cell of shown\.lift\) shiftWas\.append/);
    expect(worldView, 'the deepened shade arrives under it').toMatch(/for \(const cell of shown\.deepen\) shiftNow\.append/);
    expect(worldView, 'a repaint with no new fog keeps the running hand-off instead of snapping it').toContain(
      'const shown = shift.lift.length || shift.deepen.length || shift.arrive.length ? shift : inFlight;',
    );
  });

  it('is decoration only: hidden from assistive tech and never a tap target', () => {
    expect(worldView).toMatch(/fogShiftLayer\.setAttribute\('aria-hidden', 'true'\)/);
    expect(bodyOf(onlineCss, '.world-fog-shift') ?? '', '.world-fog-shift must be a rule').toContain('pointer-events: none');
    for (const half of ['.world-fog-shift-was', '.world-fog-shift-now']) {
      expect(bodyOf(onlineCss, half) ?? '', `${half} must ignore pointers`).toContain('pointer-events: none');
    }
  });

  it('animates opacity only — never the Gaussian blur or any geometry', () => {
    const lift = atRule(onlineCss, '@keyframes world-fog-lift');
    const settle = atRule(onlineCss, '@keyframes world-fog-settle');
    expect(lift, 'world-fog-lift must exist').not.toBe('');
    expect(settle, 'world-fog-settle must exist').not.toBe('');
    for (const [name, block] of [['lift', lift], ['settle', settle]] as const) {
      expect(block, `${name} must not animate a filter or a blur`).not.toMatch(/filter|stdDeviation/);
      expect(block, `${name} must animate opacity alone`).toMatch(/^(?:(?!\b(?:transform|translate|scale)\b).)*$/s);
    }
  });
});

describe('the hand-off respects the map’s motion budget', () => {
  it('is paused while the map is moving (the SVG blur is the expensive part)', () => {
    expect(onlineCss, 'the moving rule must hold the shift layers still with the fog').toMatch(
      /\.world-grid\.moving \.world-map-svg :is\(\.world-fog-ring, \.world-fog-shift-was, \.world-fog-shift-now,/,
    );
  });

  it('Reduce motion: both halves are in BOTH of the existing fog lists', () => {
    expect(onlineCss, 'the media query list').toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.world-fog-ring, \.world-fog-shift-was, \.world-fog-shift-now,/,
    );
    expect(onlineCss, 'the game’s own Reduce motion list').toMatch(
      /html\.reduce-motion :is\(\.world-fog-ring, \.world-fog-shift-was, \.world-fog-shift-now,/,
    );
    // With no animation the outgoing half simply stays at its base 0 and the incoming half at 1:
    // the map is already in its landing state.
    expect(onlineCss).toMatch(/\.world-fog-shift-was \{ opacity: 0; animation: world-fog-lift /);
    expect(onlineCss).toMatch(/\.world-fog-shift-now \{ opacity: 1; animation: world-fog-settle /);
  });
});

describe('the fog’s slow breath survives a rebuild', () => {
  it('the view reads the phase off the ring that is already on screen', () => {
    expect(worldView, 'the phase comes from the live ring, never from a page clock').toContain(
      'private fogPhase(ring: FogRing, period: number): number',
    );
    expect(worldView, 'ring 1 keeps its 9 s phase').toContain('this.fogPhase(1, 9000)');
    expect(worldView, 'ring 2 keeps its own 13 s phase').toContain('this.fogPhase(2, 13000)');
    // The old trap: a page clock (`Date.now() - firstPaint`) that knew nothing about when the
    // animation actually started. It made the first repaint snap by the hidden-startup gap.
    expect(worldView, 'no page clock may drive the breath again').not.toMatch(/mistAt|mistElapsed/);
  });

  it('reads the animation’s own currentTime and the delay it was born with', () => {
    expect(worldView, 'the old ring is the reference').toContain('.world-fog-ring.ring-${ring}');
    expect(worldView, 'the browser’s animation clock, not a timestamp').toContain('getAnimations()');
    expect(worldView, 'the delay is the effect’s own computed timing').toContain('getComputedTiming().delay');
    // Null/NaN currentTime means the loop has not started: the eye is on the resting 0 % frame.
    expect(worldView, 'an animation that has not started reads as phase zero').toMatch(/animation\.currentTime/);
  });

  it('the outgoing mist starts at the shade it was actually showing, not at the resting value', () => {
    expect(worldView, 'read the old ring opacity before the map is replaced').toContain('private mistShades()');
    expect(worldView, 'the lift copies carry that measured shade').toContain('path.style.opacity = String(mist[ring - 1])');
  });
});

describe('nothing is filtered at runtime', () => {
  it('the fog layer and both halves of the hand-off carry no SVG filter', () => {
    // MEASURED (2026-10-30): a `filter` on the layer whose CHILD opacity animates forces the whole
    // Gaussian to be re-rasterised every frame. At 4x CPU throttle that was 80.3 ms of GPU render
    // pass time per 1.5 s of breathing versus 33.3 ms with the filter removed, plus two extra raster
    // queues per frame - the owner's "choppy and laggy". The softness is baked into the paint now
    // (the paths' own fill and hairline stroke), so the breath is a composited opacity only.
    expect(worldView, 'the fog layer must not be filtered').not.toContain("filter', 'url(#world-blur-mist)'");
    expect(worldView, 'no ghost of the mist blur in the defs').not.toMatch(/world-blur-mist/);
  });

  it('the mist still breathes on opacity alone, on the compositor', () => {
    expect(bodyOf(onlineCss, '.world-fog-ring.ring-1') ?? '').toContain('animation: world-mist 9s');
    expect(bodyOf(onlineCss, '.world-fog-ring.ring-2') ?? '').toContain('animation: world-mist-far 13s');
    expect(atRule(onlineCss, '@keyframes world-mist'), 'opacity only').not.toMatch(/filter|transform|translate|scale/);
    expect(atRule(onlineCss, '@keyframes world-mist-far'), 'opacity only').not.toMatch(/filter|transform|translate|scale/);
    // No rule may put a filter back on the fog.
    const fogRules = rules(onlineCss).filter((r) => /world-fog/.test(r.prelude));
    for (const rule of fogRules) expect(rule.body, `${rule.prelude} must stay filter-free`).not.toMatch(/(^|;)\s*filter\s*:/);
  });

  it('Reduce motion stills the layer: no animation, so no compositor work at all', () => {
    expect(onlineCss, 'the OS query').toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.world-fog-ring,/);
    expect(onlineCss, 'the game setting').toMatch(/html\.reduce-motion :is\(\.world-fog-ring,/);
    // `animation: none` on the group means its opacity is the static resting value.
    expect(bodyOf(onlineCss, '.world-fog-ring.ring-1') ?? '', 'the resting shade is the inline value').toContain('opacity: .42');
    expect(bodyOf(onlineCss, '.world-fog-ring.ring-2') ?? '', 'the far ring rests lighter').toContain('opacity: .16');
  });
});
