// OWNER, 2026-11-20: "also add a small addition of the whole pile feeling small impact of the card
// landing on it".
//
// There was already a pile thud (PILE_THUD, played by thudPile at the catch), but it only scaled the
// pile BUTTON — which also carries the step's glow, the count and the Throw swell's transform
// transition — so it read as a small flicker of the whole control rather than the stack taking a
// hit. Now the pile's own body takes the landing: a press + settle (transform only) plus a short
// contact shade at the top of the stack (opacity only, removed when it ends). Nothing here runs
// under Reduce motion, and nothing lengthens the turn: the press is a fire-and-forget one-shot that
// overlaps the catch that already happens.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { motionAllowed } from '../src/logic/motion.js';
import { PILE_THUD, PILE_THUD_MS } from '../src/ui/throw-boomerang.js';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const feel = read('../src/ui/feel.ts');
const css = read('../src/style.css');
const main = read('../src/main.ts');

const scaleOf = (t: Keyframe['transform']) => Number(/scale\(([\d.]+)\)/.exec(String(t))?.[1] ?? 1);
const pressOf = (t: Keyframe['transform']) => Number(/translateY\((-?[\d.]+)px\)/.exec(String(t))?.[1] ?? 0);

describe('the pile takes the card landing (small, local, one shot)', () => {
  it('presses down and settles back: 2-5% smaller, a couple of px, then exactly still', () => {
    expect(PILE_THUD.length).toBeGreaterThanOrEqual(4);
    const deepest = Math.min(...PILE_THUD.map((k) => scaleOf(k.transform)));
    expect(1 - deepest).toBeGreaterThan(0.02);
    expect(1 - deepest).toBeLessThan(0.05);
    const press = Math.max(...PILE_THUD.map((k) => pressOf(k.transform)));
    expect(press).toBeGreaterThan(1.5);
    expect(press).toBeLessThan(4);
    // it ends exactly where it started (a settle, not a drift)
    expect(scaleOf(PILE_THUD.at(-1)!.transform)).toBe(1);
    expect(pressOf(PILE_THUD.at(-1)!.transform)).toBe(0);
    // short enough to overlap the catch, never a second beat of its own
    expect(PILE_THUD_MS).toBeLessThanOrEqual(220);
  });

  it('is transform only: no filter, no box-shadow, no layout property moves', () => {
    for (const k of PILE_THUD) {
      expect(Object.keys(k).filter((x) => !['transform', 'offset'].includes(x))).toEqual([]);
      expect(String(k.transform)).not.toMatch(/rotate|filter|box-shadow|width|height|top|left/);
    }
  });

  it('plays on the pile body, so the glow, the count and the swell transition do not move', () => {
    const fn = feel.slice(feel.indexOf('export const thudPile'), feel.indexOf('/** The pile a card is drawn from'));
    expect(fn).toContain("el.querySelector<HTMLElement>(':scope > .pile-card')");
    expect(fn).toContain('target.animate(PILE_THUD');
    expect(fn).toContain('pile-impact');
    // the shade is a child of the pile body and animates opacity only
    expect(fn).toContain('body.appendChild(shade)');
    expect(fn).toMatch(/\[\{ opacity: 0 \}, \{ opacity: 0\.\d+, offset: [\d.]+ \}, \{ opacity: 0 \}\]/);
    expect(fn).not.toContain('boxShadow');
    expect(fn).not.toContain('filter');
  });

  it('Reduce motion / Speed Off skips all of it, with no DOM and no animation', () => {
    expect(motionAllowed(true, 1)).toBe(false);
    expect(motionAllowed(false, 0)).toBe(false);
    const fn = feel.slice(feel.indexOf('export const thudPile'), feel.indexOf('/** The pile a card is drawn from'));
    expect(fn).toMatch(/if \(!el \|\| !motionOn\) return;/);
    // every caller feeds it the one motion gate
    expect(main).toContain('thudPile(pileEl, f, motionOn(),');
    expect(main).toContain('thudPile($(\'discard\'), f, motionOn() && !quickShow,');
  });

  it('the contact shade is a short opacity layer at the top of the stack, nothing else', () => {
    const rule = /\.pile-impact \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('position: absolute');
    expect(rule).toContain('inset: 0');
    expect(rule).toContain('pointer-events: none');
    expect(rule).toContain('opacity: 0');
    expect(rule).toContain('linear-gradient(180deg');
    expect(rule).not.toMatch(/filter|box-shadow|animation/);
  });

  it('is still the beat both catches call: mine and the opponent\'s', () => {
    expect(main).toContain('thudPile(pileEl, f, motionOn()');
    expect(main).toMatch(/const ms = oppThrow\([\s\S]{0,400}thudPile\(\$\('discard'\)/);
  });
});
