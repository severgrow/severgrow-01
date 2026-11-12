// THE LIVING MAP'S COLOUR IS ONE TRACK, AND ITS TWO BEATS ARE TOKENS (owner, 2026-11-02, the same
// evening as the "tiles must not move" brief): "for territory transition, make it the color of tiles
// fade in in like 1 second or so, and 0.3s when going back to main menu - so it's truly smooth and
// organic how you change screens".
//
// The colour of the tiles is NOT a per-tile property: every hex's fill is multiplied by the ONE
// opacity of the map SVG, which is what the menu already dims (`MENU_MAP_OPACITY`). So the arrival
// and the retreat are a single composited animation on that layer. The browser suite measures the
// climb frame by frame (`web/e2e/living-territory.ts`); this file guards the source so a stray
// literal, a per-tile loop or a lost reduce-motion path fails `npm run check` first.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INTERFACE_MOTION } from '../src/ui/interface-motion.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const territory = read('../src/online/living-territory.ts');
const territoryCss = read('../src/online/living-territory-css.ts');

describe('the tiles’ colours rise and fall on the tokens, never on literals', () => {
  it('the arrival is the colour-in token and the retreat is the colour-out token', () => {
    // The two beats that own the map's opacity.
    expect(territory).toMatch(/out\.id\s*=\s*'living-colour-out'/);
    expect(territory).toMatch(/light\.id\s*=\s*'living-colour-in'/);
    expect(territory).toMatch(/duration:\s*INTERFACE_MOTION\.colourIn/);
    expect(territory).toMatch(/duration:\s*INTERFACE_MOTION\.colourOut/);
    // No duration in this file may be a hand-picked number: the colour pair for the map, `open`
    // for a genuine handoff (sub-pixel only), `beat.duration` from the retreat's caller, and the
    // one explicit 0 that makes a settled surface instant.
    const durations = [...territory.matchAll(/duration:\s*(INTERFACE_MOTION\.[A-Za-z]+|beat\.duration|\d+)/g)].map((m) => m[1]!);
    expect(durations.length, 'the file really declares its beats').toBeGreaterThan(0);
    for (const value of durations) {
      expect(['INTERFACE_MOTION.colourIn', 'INTERFACE_MOTION.colourOut', 'INTERFACE_MOTION.open', 'beat.duration', '0']).toContain(value);
    }
  });

  it('the colour beats are the owner’s, not `open`/`close` stretched', () => {
    expect(INTERFACE_MOTION.colourIn).toBe(1000);
    expect(INTERFACE_MOTION.colourOut).toBe(300);
    // The surface vocabulary is untouched by this feature.
    expect(INTERFACE_MOTION.open).toBe(150);
    expect(INTERFACE_MOTION.close).toBe(100);
    expect(territory, 'the living map is the only reader of the colour pair').toMatch(/INTERFACE_MOTION\.colourIn/);
    expect(territory).toMatch(/INTERFACE_MOTION\.colourOut/);
  });

  it('the dip stays inside the 150ms geometry handoff, derived from the two tokens', () => {
    // The crop may never be lit, so the dip is tied to the handoff; the climb starts there and
    // spends the rest of the owner's second.
    expect(territory).toMatch(/const COLOUR_DIP_AT\s*=\s*0\.3\s*\*\s*\(INTERFACE_MOTION\.open\s*\/\s*INTERFACE_MOTION\.colourIn\)/);
    const at = /const COLOUR_DIP_AT\s*=\s*([^;]+);/.exec(territory)?.[1] ?? '';
    expect(at, 'the dip offset is a fraction of the colour-in, not a new duration').not.toMatch(/\d+ms|\b\d{3,}\b/);
  });
});

describe('ONE layer carries the colour — never N tiles', () => {
  it('the beats animate the map SVG, the layer whose opacity multiplies every fill', () => {
    expect(territory).toContain("#online-world-grid .world-map-svg");
    // The keyframes are opacity-only: no per-tile write, no fill/saturation, no filter.
    const beats = [...territory.matchAll(/(?:light|out)=map\.animate\(\[([\s\S]*?)\],\s*\{/g)].map((m) => m[1]!);
    expect(beats.length, 'the arrival and the retreat are the two colour beats').toBe(2);
    for (const frames of beats) {
      expect(frames).toMatch(/opacity/);
      expect(frames, 'only opacity may be animated on the map layer').not.toMatch(/transform|fill|filter|saturat/);
    }
    expect(territory, 'no per-tile animation may replace the one layer').not.toMatch(/world-hex/);
    expect(territoryCss, 'no filter may ride the moving map').not.toMatch(/filter\s*:/);
  });

  it('the retreat’s frame skin shares the same 300ms, from the token', () => {
    expect(territoryCss).toMatch(/#online-world-screen\.living-leaving[\s\S]*?transition-duration:\$\{motion\.colourOut\}ms/);
    // The arrival's skin keeps its own short beat; only the retreat was given the longer colour.
    expect(territoryCss).toMatch(/const SKIN = motion\.close \+ 30/);
  });
});

describe('an interrupted journey can never leave a half-faded map', () => {
  it('the retreat starts at the colour the tiles actually have', () => {
    // Cancelling the arrival first would snap the map back to full light; the read happens BEFORE
    // `clearBeats()`, so the fade continues from the brightness the player is looking at.
    const before = territory.slice(territory.indexOf('const leave=(done'), territory.indexOf('out.finished'));
    expect(before).toMatch(/const from=map\?Number\(getComputedStyle\(map\)\.opacity\)/);
    expect(before.indexOf('getComputedStyle(map)')).toBeLessThan(before.indexOf('clearBeats()'));
  });

  it('a Back at the menu’s own light completes in one frame instead of waiting out a fade', () => {
    expect(territory).toMatch(/from<=MENU_MAP_OPACITY\+0\.02/);
  });

  it('the return cancels anything still on the map, so it rests at the menu’s own light', () => {
    expect(territory).toMatch(/const settleMap=\(\)=>\{[\s\S]*?map\.getAnimations\(\)[\s\S]*?\.cancel\(\)/);
    expect(territory).toMatch(/if\(returning\)settleMap\(\);/);
  });

  it('reduce motion is instant: every transition on the map, skin and screen is switched off', () => {
    expect(territoryCss).toMatch(/html\.reduce-motion #online-world-screen\[data-living-territory\] \.world-map-svg \{ transition:none; transform:none; \}/);
    expect(territoryCss).toMatch(/@media\(prefers-reduced-motion:reduce\) \{[\s\S]*?#online-world-screen\[data-living-territory\] \.world-map-svg \{ transition:none; transform:none; \}/);
    expect(territoryCss).toMatch(/html\.reduce-motion #online-world-screen \.world-grid::before,[\s\S]*?transition:none;/);
    // And the JS never starts a beat when motion is off.
    expect(territory).toMatch(/if\(reduce\)return;/);
    expect(territory).toMatch(/interfaceMotionAllowed\(\)\?\{duration:INTERFACE_MOTION\.colourOut/);
  });
});
