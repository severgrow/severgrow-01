// A HOME SCREEN APP SIGNS IN WITH GOOGLE LIKE ANY BROWSER (owner, 2026-11-21: "we still need to be
// able to login through google in home screen ap").
//
// On 2026-11-20 a refusal was added to `start()`: when `navigator.standalone` was true it showed
// "For Google, open FUTASAKU in Safari…" and never started OAuth. It was written on an ASSUMPTION
// that iOS could not finish the flow inside a standalone app; the owner then reported that LIVE,
// which has no such check, signs in from the Home Screen without trouble. The block was our own
// regression, so it was removed and `start()` does exactly what it does in the browser.
//
// This pins the absence of that special case in the SOURCE, because the mistake was cheap to make
// once and the whole point is that nobody re-adds it without device evidence. The behaviour itself is
// proven in the browser suite (`web/e2e/accounts-google.ts`, section H, Chromium and WebKit).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mount = readFileSync(new URL('../src/accounts/mount.ts', import.meta.url), 'utf8');

/** The `start()` function's own body, from its declaration to its closing brace. */
const startBody = (): string => {
  const from = mount.indexOf('const start = async');
  expect(from).toBeGreaterThan(-1);
  const to = mount.indexOf('\n  };', from);
  expect(to).toBeGreaterThan(from);
  return mount.slice(from, to);
};

describe('Google sign-in in a Home Screen app', () => {
  it('has no standalone refusal: nothing in the accounts module reads navigator.standalone', () => {
    expect(mount).not.toContain('installedOnIOS');
    expect(mount).not.toContain('navigator.standalone');
    expect(mount).not.toContain('display-mode: standalone');
  });

  it('start() begins the normal OAuth flow whatever the display mode', () => {
    const body = startBody();
    // The three steps live takes: keep the verifier, then navigate to Supabase's authorize URL.
    expect(body).toContain('newVerifier()');
    expect(body).toContain('savePending(');
    expect(body).toContain('authorizeUrl(');
    expect(body).toContain('location.assign(');
    // And no display-mode or touch detection decides anything here (the word may appear in the
    // explanatory comment, but never as a condition).
    expect(body).not.toContain('matchMedia');
    expect(body).not.toContain('display-mode');
    // The only guard before the flow is the double-tap lock.
    const guard = body.indexOf('if (openingGoogle) return;');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(body.indexOf('warmSignIn()'));
  });

  it('keeps no copy that tells a player to leave the app for Safari', () => {
    const strings = readFileSync(new URL('../../src/strings.ts', import.meta.url), 'utf8');
    expect(strings).not.toContain('open FUTASAKU in Safari');
  });
});
