// SIX SMALL BEAUTIFIERS (owner, 2026-11-20: "add another 6 small cheap beautifiers to existing
// animations/shadows/effects to make everything feel even more modern/polished/premium/smooth").
//
// Each one refines something that ALREADY exists; none adds a feature, an asset or a dependency.
// Every assertion here is written to FAIL if the refinement is reverted to the crude value it
// replaced — a timing, an easing token, or the presence of the easing at all — rather than merely
// checking that a rule exists.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLAYER_CSS } from '../src/player/player-css.js';
import { INTERFACE_MOTION } from '../src/ui/interface-motion.js';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const css = read('../src/style.css');
const main = read('../src/main.ts');
const tip = read('../src/ui/card-tip.ts');

/** The body of the first rule that starts at `anchor`. */
const bodyAfter = (src: string, anchor: string): string => {
  const start = src.indexOf(anchor);
  expect(start, `the stylesheet has ${anchor}`).toBeGreaterThanOrEqual(0);
  const open = src.indexOf('{', start);
  return src.slice(open + 1, src.indexOf('}', open)).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ');
};

describe('1. a key RETURNS from its press on the shared beat', () => {
  // The delegated press (logic/press.ts) owns translate/scale while held; on release the key falls
  // back to the shared transition list. That list used to name only `transform`, so every key in
  // the game snapped home in one frame.
  const shared = bodyAfter(css, '.btn,\n.chip,\n.icon-only,\n.gm-lead,\n.gm-act,\n.gm-key,\n.gm-tool,\n.ctool,\n.seg-btn,\n.moves .btn,\n[data-ix-press] {');

  it('the shared key transition eases translate and scale, not just transform', () => {
    expect(shared).toContain(`translate var(--ix-press) var(--ix-ease-open)`);
    expect(shared).toContain(`scale var(--ix-press) var(--ix-ease-open)`);
  });

  it('the suggested keys answer too: their halo stays static, their press returns', () => {
    const key = bodyAfter(css, '#menu .menu-buttons > .btn.suggest,\n#play-menu .menu-buttons > .btn.suggest {');
    expect(key).toContain('animation: none');
    expect(key).toContain(`translate var(--ix-press) var(--ix-ease-open)`);
    expect(key).toContain(`scale var(--ix-press) var(--ix-ease-open)`);
    // The halo is still painted once: no transition on its own box, no animation.
    const halo = bodyAfter(css, '#menu .menu-buttons > .btn.suggest::after,');
    expect(halo).toContain('animation: none');
    expect(halo).not.toMatch(/transition:/);
  });

  it('Reduce motion stays perfectly still, in the class and in the media query', () => {
    expect(css).toMatch(/\.reduce-motion #menu \.menu-buttons > \.btn\.suggest[\s\S]{0,240}?transition: none/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?#menu \.menu-buttons > \.btn\.suggest[\s\S]*?transition: none/);
  });

  it('introduces no new duration or token', () => {
    expect(shared).not.toMatch(/\d+ms|\d+s\b/);
  });
});

describe('2. picking a card on the phone fan eases into the air', () => {
  const thumb = bodyAfter(PLAYER_CSS, 'html[data-thumb] .dock .hand-row > .hand .card {\n  transition: opacity 220ms ease-out, transform');

  it('transitions transform on the shared arrival, so the pick cannot snap', () => {
    expect(thumb).toContain('opacity 220ms ease-out');
    expect(thumb).toContain('transform var(--ix-open) var(--ix-ease-open)');
    // Compositor only: the fan's lift is a transform; nothing here repaints or reflows.
    expect(thumb).not.toMatch(/box-shadow|filter|width|height|left|top/);
  });

  it('is still under Reduce motion, both ways of asking', () => {
    expect(PLAYER_CSS).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*html\[data-thumb\] \.dock \.hand-row > \.hand \.card \{ transition: none; \}/);
    expect(PLAYER_CSS).toMatch(/\.reduce-motion html\[data-thumb\] \.dock \.hand-row > \.hand \.card \{\s*transition: none;/);
  });
});

describe('3. the lesson caption becomes present instead of popping', () => {
  const fn = main.slice(main.indexOf('function showLessonPlate('), main.indexOf('function renderLessonGuide('));

  it('uses the shared arrival primitive, 4px and no scale growth', () => {
    expect(fn).toContain('enterSurface(plate, { travel: INTERFACE_MOTION.travel, scale: 1 })');
    expect(INTERFACE_MOTION.travel).toBe(4);
  });

  it('arrives when the words change or the plate was hidden, and never blocks the words', () => {
    expect(fn).toContain('const wasHidden = plate.hidden;');
    expect(fn).toContain('if (wasHidden || fresh) enterSurface(');
    // The text is written BEFORE the entrance: the caption is legible from frame one.
    expect(fn.indexOf('copy.textContent = text')).toBeLessThan(fn.indexOf('enterSurface(plate'));
    // The entrance is synchronous (no timer in front of it); the function's existing 400ms timer
    // only RE-PLACES the plate after the camera settles, as it always did.
    expect(fn.indexOf('enterSurface(plate')).toBeLessThan(fn.indexOf('window.setTimeout'));
    expect(fn).not.toMatch(/\bawait\b/);
  });
});

describe('4. the finish card’s score line lands between its title and its verdict', () => {
  it('arrives on the shared beat, 4px and a fade', () => {
    const rule = bodyAfter(css, "#gameover[data-fresh='1'] .go-score {");
    expect(rule).toContain('go-score-in var(--ix-open) var(--ix-ease-open) 90ms both');
    const frames = bodyAfter(css, '@keyframes go-score-in {');
    expect(frames).toContain('opacity: 0');
    expect(frames).toContain('translate: 0 4px');
    expect(frames).not.toMatch(/scale|filter|box-shadow|left|top/);
  });

  it('is the middle beat of the card: title 60ms < score 90ms < verdict 120ms', () => {
    const title = bodyAfter(css, "#gameover[data-fresh='1'] .go-title {");
    const score = bodyAfter(css, "#gameover[data-fresh='1'] .go-score {");
    const verdict = bodyAfter(css, "#gameover[data-fresh='1'] .go-verdict {");
    const delay = (body: string) => Number(/(\d+)ms both/.exec(body)?.[1] ?? -1);
    expect(delay(title)).toBe(60);
    expect(delay(score)).toBe(90);
    expect(delay(verdict)).toBe(120);
    for (const body of [title, score, verdict]) expect(body).toContain('var(--ix-open) var(--ix-ease-open)');
  });

  it('is a designed still state under Reduce motion', () => {
    expect(css).toMatch(/\.reduce-motion #gameover\[data-fresh='1'\] \.go-score \{\s*animation: none;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?#gameover\[data-fresh='1'\] \.go-score \{\s*animation: none;/);
  });
});

describe('5. the card detail bubble answers on the press beat', () => {
  it('fades and rises 2px on --ix-press with the shared curve', () => {
    expect(tip).toContain('duration: INTERFACE_MOTION.press');
    expect(tip).toContain('easing: INTERFACE_MOTION.easeOpen');
    expect(tip).toContain("{ opacity: 0, translate: '0 2px' }");
    expect(tip).toContain("{ opacity: 1, translate: '0 0' }");
  });

  it('animates only opacity and translate, and never its placement', () => {
    const reveal = tip.slice(tip.indexOf('const revealTip'), tip.indexOf('const hide ='));
    expect(reveal).not.toMatch(/left|top|width|height|filter|box-shadow|scale/);
    // Placement is still written as left/top (not animated) by place().
    expect(tip).toContain('tip.style.left =');
    expect(tip).toContain('tip.style.top =');
  });

  it('is guarded by the one motion switch and leaves nothing running', () => {
    expect(tip).toContain('interfaceMotionAllowed()');
    expect(tip).toMatch(/\.finished\.then\(\(anim\) => anim\.cancel\(\)\)/);
    expect(tip).not.toMatch(/setInterval/);
  });
});
