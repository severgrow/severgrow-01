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

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const css = read('../src/style.css');

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
