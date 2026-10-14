// A standard (async) online duel now offers a REAL rematch as the FIRST, primary action on the
// finish screen. Rematch means the project's one-line plan — "create a fresh invite to the same
// friend and show it" — so it does exactly two things in order: tear the finished duel's session
// down FIRST (a finished session must never leak into the new match), then create a brand-new
// match and surface the EXISTING invite/share screen (the same code + `Share invite` as Create a
// duel). This guards the affordance, the word and the ORDER of the flow; the real create + share +
// opponent join + play is proved by `web/e2e/online-duel-two-browser.ts`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { ONLINE } from '../../src/strings.js';
import { runRematch } from '../src/online/rematch.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const html = read('../index.html');
const mainSource = read('../src/main.ts');
const goButtons = html.slice(
  html.indexOf('<div class="go-buttons">'),
  html.indexOf('</div>', html.indexOf('<div class="go-buttons">')),
);

describe('online finish screen: Rematch leads', () => {
  it('is the first button and carries the primary style', () => {
    const first = /<button id="([^"]+)"/.exec(goButtons)?.[1];
    expect(first, 'the first button in the finish screen').toBe('go-rematch');
    expect(goButtons).toMatch(/<button id="go-rematch"[^>]*class="[^"]*\bprimary\b/);
  });

  it('keeps Back to matches and Menu as secondary affordances, not gone', () => {
    expect(goButtons.indexOf('id="go-other"')).toBeGreaterThan(goButtons.indexOf('id="go-rematch"'));
    expect(goButtons.indexOf('id="go-menu"')).toBeGreaterThan(goButtons.indexOf('id="go-other"'));
    // The primary slot's copy is the Rematch word; the back-out and menu words sit in the others.
    expect(ONLINE.rematch).toBe('Rematch');
    expect(ONLINE.backToMatches).toBe('Back to matches');
    expect(ONLINE.menuButton).toBe('Menu');
  });

  it('is short, emoji-free copy from the one home for words', () => {
    expect(ONLINE.rematch.length).toBeLessThanOrEqual(24);
    expect(ONLINE.rematch).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});

describe('rematch flow: teardown first, then a fresh match', () => {
  it('tears the finished session down before creating the new one (nothing leaks)', async () => {
    const order: string[] = [];
    let activeSession: string | null = 'finished-match';
    const createMatch = vi.fn(async () => {
      // By the time the new match is asked for, the finished one must already be gone.
      expect(activeSession, 'the finished session is gone before the new match is created').toBeNull();
      order.push('create');
    });
    await runRematch({
      tearDown: () => {
        order.push('tearDown');
        activeSession = null;
      },
      createMatch,
    });
    expect(order).toEqual(['tearDown', 'create']);
    expect(createMatch).toHaveBeenCalledTimes(1);
    expect(activeSession).not.toBe('finished-match');
  });

  it('surfaces the new match through the existing create-match/invite path', async () => {
    const createMatch = vi.fn(() => Promise.resolve());
    await runRematch({ tearDown: () => undefined, createMatch });
    // `createMatch` is the lobby's own "Create a duel": a fresh match + the invite/share screen.
    expect(createMatch).toHaveBeenCalledTimes(1);
  });
});

describe('offline is untouched', () => {
  it('keeps Play again / Try again and the primary slot exactly as before', () => {
    expect(goButtons).toContain('>Play again<');
    expect(mainSource).toMatch(/go-rematch'\)\.textContent\s*=\s*won \? 'Play again' : 'Try again'/);
  });
});
