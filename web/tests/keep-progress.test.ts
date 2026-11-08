// Quiet optional "Keep your progress" for guests (owner, 2026-11-08). Dismissible, once, never
// over a Blitz decision. Pure decision rules — no DOM.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  KEEP_PROGRESS_DWELL_MS,
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

describe('keep-progress waits for the result and then gets out of the way (review, 0.84)', () => {
  const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
  const main = read('../src/main.ts');
  const src = read('../src/player/keep-progress.ts');
  it('is released when the result card is put away, like the achievement line', () => {
    const hide = main.slice(main.indexOf('function hideGameOver'), main.indexOf('\n}\n', main.indexOf('function hideGameOver')));
    expect(hide).toContain('keepProgress?.release()');
  });
  it('treats a finished match whose card has not been put away yet as covered', () => {
    expect(main).toMatch(/keepProgress = mountKeepProgress\(\{[\s\S]*?covered: \(\) => coveredForQuietPrompts\(\) \|\| resultPending\(\)/);
  });
  it('leaves on its own after a short dwell, so it never sits over the next match', () => {
    expect(KEEP_PROGRESS_DWELL_MS).toBeGreaterThanOrEqual(8000);
    expect(KEEP_PROGRESS_DWELL_MS).toBeLessThanOrEqual(15000);
    expect(src).toMatch(/setTimeout\(hide, KEEP_PROGRESS_DWELL_MS\)/);
  });
});

describe('keep-progress details (review, 0.84)', () => {
  const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
  const src = read('../src/player/keep-progress.ts');
  it('arrives like every other surface: the shared entrance, nothing under reduced motion', () => {
    expect(src).toContain('enterSurface(root');
  });
  it('shows a keyboard focus ring on its keys', () => {
    expect(src).toMatch(/#keep-progress \.keep-progress-actions button:focus-visible \{[^}]*outline:/);
  });
  it('is dark glass with no stroked contour on its keys', () => {
    const keys = src.slice(src.indexOf('#keep-progress .keep-progress-actions button {'), src.indexOf('}', src.indexOf('#keep-progress .keep-progress-actions button {')));
    expect(keys).toMatch(/border:\s*0/);
    expect(src).not.toMatch(/border-color:\s*rgba/);
  });
  it('is a named region with keys, not a live status', () => {
    expect(src).toContain("root.setAttribute('role', 'region')");
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
