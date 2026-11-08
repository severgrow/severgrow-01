// Quiet optional "Keep your progress" for guests (owner, 2026-11-08). Dismissible, once, never
// over a Blitz decision. Pure decision rules — no DOM.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  KEEP_PROGRESS_KEY,
  keepProgressDecision,
  parseKeepProgressMemory,
} from '../src/player/keep-progress.js';

describe('keep-progress offer rules', () => {
  it('a guest who has not dismissed may be offered after a level clear', () => {
    expect(keepProgressDecision({
      kind: 'guest',
      memory: parseKeepProgressMemory(null),
      reason: 'level-clear',
      covered: false,
    })).toEqual({ offer: true, memory: { dismissed: false, offered: true } });
  });

  it('a guest may also be offered after a first claim', () => {
    expect(keepProgressDecision({
      kind: 'guest',
      memory: parseKeepProgressMemory(null),
      reason: 'first-claim',
      covered: false,
    }).offer).toBe(true);
  });

  it('signed-in players are never offered', () => {
    expect(keepProgressDecision({
      kind: 'account',
      memory: parseKeepProgressMemory(null),
      reason: 'level-clear',
      covered: false,
    }).offer).toBe(false);
  });

  it('dismissed stays dismissed', () => {
    expect(keepProgressDecision({
      kind: 'guest',
      memory: { dismissed: true, offered: true },
      reason: 'level-clear',
      covered: false,
    }).offer).toBe(false);
  });

  it('already offered is not shown again', () => {
    expect(keepProgressDecision({
      kind: 'guest',
      memory: { dismissed: false, offered: true },
      reason: 'first-claim',
      covered: false,
    }).offer).toBe(false);
  });

  it('a Blitz decision or victory card blocks the offer (no modal over it)', () => {
    expect(keepProgressDecision({
      kind: 'guest',
      memory: parseKeepProgressMemory(null),
      reason: 'level-clear',
      covered: true,
    }).offer).toBe(false);
  });

  it('parses and rejects malformed memory safely', () => {
    expect(parseKeepProgressMemory(null)).toEqual({ dismissed: false, offered: false });
    expect(parseKeepProgressMemory('{bad')).toEqual({ dismissed: false, offered: false });
    expect(parseKeepProgressMemory(JSON.stringify({ dismissed: true, offered: true })))
      .toEqual({ dismissed: true, offered: true });
    expect(KEEP_PROGRESS_KEY).toMatch(/^severgrow\./);
  });
});

describe('keep-progress opens only at the end of a game, over a blurred screen (owner, 2026-11-08)', () => {
  // OWNER CHANGED THE RULE: "never show the open separate window type window mid game - always at the end
  // game blurring the rest of the screen behind - same for account login when guest". It used to wait for
  // the result card to be put away and then show a strip at the bottom of the screen (12 s dwell).
  const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
  const main = read('../src/main.ts');
  const src = read('../src/player/keep-progress.ts');
  it('is held unless the result card is on screen, and is offered when the card is presented', () => {
    expect(main).toMatch(/keepProgress = mountKeepProgress\(\{[\s\S]*?covered: \(\) => !endScreenReady\(\)/);
    const present = main.slice(main.indexOf('function presentResult('), main.indexOf('function hideGameOver('));
    expect(present).toContain('offerEndOfGamePrompts()');
  });
  it('is a centred dialog over a blurred scrim, not a strip at the bottom', () => {
    expect(src).toMatch(/#keep-progress \{[^}]*position: fixed; inset: 0;/);
    expect(src).toMatch(/#keep-progress::before \{[^}]*backdrop-filter: blur\(/);
    expect(src).not.toMatch(/setTimeout\(hide, KEEP_PROGRESS_DWELL_MS\)/);
  });
});

describe('keep-progress details (review, 0.84)', () => {
  const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
  const src = read('../src/player/keep-progress.ts');
  it('arrives like every other surface: the shared entrance, nothing under reduced motion', () => {
    expect(src).toContain('enterSurface(card');
  });
  it('shows a keyboard focus ring on its keys', () => {
    expect(src).toMatch(/#keep-progress \.keep-progress-actions button:focus-visible \{[^}]*outline:/);
  });
  it('is dark glass with no stroked contour on its keys', () => {
    const keys = src.slice(src.indexOf('#keep-progress .keep-progress-actions button {'), src.indexOf('}', src.indexOf('#keep-progress .keep-progress-actions button {')));
    expect(keys).toMatch(/border:\s*0/);
    expect(src).not.toMatch(/border-color:\s*rgba/);
  });
  it('is a named dialog over the finished game, not a live status', () => {
    expect(src).toContain("root.setAttribute('role', 'dialog')");
    expect(src).toContain("root.setAttribute('aria-label', ACCOUNT.keepProgressTitle)");
  });
  it('Escape puts it away like Not now', () => {
    expect(src).toMatch(/key === 'Escape'/);
  });
  it('never offers Sign in in a build that has no sign-in key', () => {
    expect(src).toContain('hooks.canSignIn');
    const main = read('../src/main.ts');
    expect(main).toMatch(/canSignIn: \(\) => !!document\.getElementById\('menu-login'\)/);
  });
});
