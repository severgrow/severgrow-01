// CHARCOAL, NOT BLACK (owner, 2026-11-06: "wherever we have complete black color, change it to slightly
// charcoal black, just a bit off from pure black"; answer: between #0b0c0d and #121315 -> #0e0f10).
// Every solid ground the player sees as black — the space behind the planet, the first paint, the
// tutorial's fade, the hand-off veil, the planet's canvas — is charcoal. Shadows, masks and
// darkening overlays (black at an opacity) are not a colour and stay as they are.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHARCOAL } from '../src/logic/charcoal.js';

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const lum = (hex: string) => Math.max(...[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));

describe('charcoal', () => {
  it('is #0e0f10: just off black, between the two shades the owner pointed at', () => {
    expect(CHARCOAL).toBe('#0e0f10');
    expect(lum(CHARCOAL)).toBeGreaterThan(lum('#0b0c0d'));
    expect(lum(CHARCOAL)).toBeLessThan(lum('#121315'));
  });

  it('no solid ground is near-black any more', () => {
    const files = ['../index.html', '../src/style.css', '../src/player/space-backdrop.ts', '../src/online/challenge-handoff.ts', '../src/online/world-planet.ts', '../src/online/endgame-planet.ts'];
    for (const f of files) {
      const src = read(f);
      for (const hex of ['#030404', '#050606', '#050708', '#07090a']) expect(src.includes(hex), `${f} still uses ${hex}`).toBe(false);
      expect(/background(-color)?:\s*(#000\b|#000000\b|black\b)/.test(src), `${f} has a pure black background`).toBe(false);
    }
  });

  it('the first paint, the space behind the planet and the boot cover are the same charcoal (no step when the cover lifts)', () => {
    const html = read('../index.html');
    expect(html).toMatch(/html:where\(\.space-first\)\{background:#0e0f10\}/);
    expect(html).toMatch(/html\.space-first #boot-cover \{[^}]*background: #0e0f10/);
    expect(read('../src/player/space-backdrop.ts')).toContain('background: #0e0f10');
    // After data-startup lifts, main CSS must keep charcoal on the shell (not soil --c-bg).
    // Specificity without :where() so it beats `html { background: var(--c-bg) }` (H5).
    const style = read('../src/style.css');
    expect(style).toMatch(/html\.space-first,\s*\nhtml\.space-first body \{\s*\n\s*background:\s*#0e0f10;/);
  });

  it("the space shader's deepest sky is charcoal too, never below it", () => {
    const space = read('../src/sphere/space.ts');
    const far = space.match(/smoothstep\(\.9, 3\.2, d\)/) ? space.match(/vec3 sky = mix\(vec3\(([^)]*)\), vec3\(([^)]*)\)/) : null;
    expect(far).toBeTruthy();
    for (const v of [far![1]!, far![2]!]) for (const c of v.split(',').map(Number)) expect(c * 255).toBeGreaterThanOrEqual(13.5);
  });
});
