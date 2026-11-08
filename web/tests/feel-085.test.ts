// 0.85 FEEL PASS (owner, 2026-11-08: "find another 5 things like that and improve to 2028 lvl").
// Five small moments that each had one flat beat; each now has a give and a settle. All transform /
// opacity, each one finite, each one silent under Reduce motion.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DENY_SHAKE, DENY_SHAKE_MS, DRAW_PILE_GIVE, drawFrames } from '../src/ui/feel.js';

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const main = read('../src/main.ts');
const board = read('../src/ui/board.ts');
const ritual = read('../src/player/starter-ritual.ts');
const px = (t: unknown) => Number(/translateX\((-?[\d.]+)px\)/.exec(String(t))?.[1] ?? 0);

describe('3. the opponent\'s throw lands with the same pile thud as mine', () => {
  it('wraps the opponent throw\'s landing in the thud', () => {
    const at = main.indexOf("const ms = oppThrow(step.card, seat, $('discard')"); const opp = main.slice(at, at + 400);
    expect(opp).toContain('thudPile');
  });
});

describe('4. the throw is felt at the catch, not after the card has faded', () => {
  it('vibrates inside the catch', () => {
    const c = main.slice(main.indexOf('const catchAndThud = () => {'), main.indexOf('const flightMs = throwBoomerang('));
    expect(c).toContain("hapticFor('throw', settings)");
  });
});

describe('5. a drawn card leaves the pile with a tilt that unwinds, and the pile gives', () => {
  it('tilts out of the pile and lands square, with the old overshoot kept', () => {
    const f = drawFrames(-120, 300, 1.3);
    const rot = f.map((k) => Number(/(-?[\d.]+)deg/.exec(String(k.rotate ?? '0deg'))?.[1] ?? 0));
    expect(Math.abs(rot[0]!)).toBeGreaterThan(0);
    expect(rot.at(-1)).toBe(0);
    expect(f.some((k) => k.scale === '1.04')).toBe(true);
    for (const k of f) expect(Object.keys(k).filter((x) => !['translate', 'scale', 'rotate', 'opacity', 'offset'].includes(x))).toEqual([]);
  });
  it('the pile it left gives a little (transform only), and main plays it', () => {
    expect(Math.min(...DRAW_PILE_GIVE.map((k) => Number(/scale\(([\d.]+)\)/.exec(String(k.transform))?.[1] ?? 1)))).toBeGreaterThan(0.95);
    expect(main).toContain('drawFrames(');
    expect(main).toContain('DRAW_PILE_GIVE');
  });
  it('the opponent\'s draw makes the same pile give (one rule for both seats)', () => {
    expect(main.split('DRAW_PILE_GIVE, {').length - 1).toBeGreaterThanOrEqual(2);
  });
});

describe('6. "not allowed" is a short head-shake that settles, not one nudge', () => {
  it('three shrinking beats, ending still', () => {
    const xs = DENY_SHAKE.map((k) => px(k.transform));
    expect(xs.at(-1)).toBe(0);
    const peaks = xs.filter((x) => x !== 0).map(Math.abs);
    expect(peaks.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < peaks.length; i++) expect(peaks[i]!).toBeLessThan(peaks[i - 1]!);
    expect(peaks[0]!).toBeLessThanOrEqual(6);
    expect(DENY_SHAKE_MS).toBeLessThanOrEqual(280);
    expect(board).toContain('DENY_SHAKE');
  });
});

describe('7. the draw pile thuds as the ritual\'s cards land on it', () => {
  it('the ritual tells the page when the deck is filed; the page thuds the pile', () => {
    expect(ritual).toContain('onFiled');
    expect(main).toMatch(/onFiled: \(\) => thudPile\(/);
  });
});

describe('the Bomb card is shown once (owner, 2026-11-08: "it shows the bomb card twice")', () => {
  it('the opponent\'s Bomb flies from their seat; the strike that follows shows the glow, not a second card', () => {
    const at = main.indexOf("case 'fruit': {");
    const fruit = main.slice(at, main.indexOf("case 'discard': {", at));
    expect(fruit).toContain('oppThrow(step.card, seat, hex');
    expect(fruit).toMatch(/showLiveStrike\([^;]*\{ cards: false \}\)/);
    const strike = read('../src/ui/live-strike.ts');
    expect(strike).toMatch(/opts\.cards !== false/);
  });
  it('the Blast keeps its two strike cards: they are the only place its cards appear', () => {
    const at = main.indexOf("case 'megaBomb': {");
    const blast = main.slice(at, at + 3000);
    expect(blast).not.toMatch(/showLiveStrike\([^;]*cards: false/);
  });
});

describe('a light dip covers the whole screen (owner, 2026-11-08: "only left half of the screen is affected ... cuts off ugly")', () => {
  it('the impact dim is a full-viewport layer in the game, not a child of the board box', () => {
    const effects = read('../src/ui/effects.ts');
    const fn = effects.slice(effects.indexOf('function impactDim('), effects.indexOf('function spark('));
    expect(fn).not.toContain("$('board-wrap')");
    expect(fn).toContain("document.getElementById('game')");
    const css = read('../src/style.css');
    expect(css).toMatch(/\.impact-dim \{[^}]*position:\s*fixed;[^}]*inset:\s*0;/);
  });
});
