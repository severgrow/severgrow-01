// A first-time tester must see a way to play WITH THE FIRST PAINT, never after a network wait.
//
// The defect this pins (2026-10-16): the product menu's controls ship `hidden` in index.html and were
// revealed only by `showScreen('menu')`, which boot reaches AFTER `await mountPlayerEnhancements()`
// — so over a slow network the menu painted with no PLAY for seconds (the owner measured 1.5–3 s on
// the live site). The fix lays the menu out in boot's SYNCHRONOUS prefix via `layoutMenu(canContinue)`
// (its first await is mountPlayerEnhancements, so everything before it paints together), which
// depends only on compile-time channel flags, `src/strings.ts` and saved-game storage. LOG IN alone
// may wait for the Google probe — it is owned by the accounts module, not by this menu.
//
// A source-level assertion about ORDER (are the reveals before the first await?) rather than about
// incidental formatting: it fails if a later edit moves the reveal back behind the async boot, or
// re-inlines it into `showScreen` only.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const main = readFileSync(fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8');
const vite = readFileSync(fileURLToPath(new URL('../vite.config.ts', import.meta.url)), 'utf8');
const css = readFileSync(fileURLToPath(new URL('../src/style.css', import.meta.url)), 'utf8');
const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');

describe('the product menu shows a way to play with the first paint', () => {
  it('lays the menu out in the synchronous prefix, before boot\u2019s first await', () => {
    const early = main.indexOf('layoutMenu(syncMenuResume());');
    expect(early, 'boot must lay the menu out itself').toBeGreaterThan(-1);
    const firstAwait = main.indexOf('\nawait mountPlayerEnhancements();');
    expect(firstAwait, 'the async player mounts remain boot\u2019s first yield').toBeGreaterThan(-1);
    expect(early, 'the menu reveal must come BEFORE the async mounts, not after').toBeLessThan(firstAwait);
  });

  it('reveals PLAY and the world map inside layoutMenu, so showScreen is not the only route', () => {
    const start = main.indexOf('function layoutMenu(');
    expect(start).toBeGreaterThan(-1);
    const body = main.slice(start, main.indexOf('\nfunction showScreen(', start));
    // The gating is unchanged: PLAY is product-only, the world map needs a product build WITH an
    // online endpoint (a build-time flag — no network). Both are pure DOM writes.
    expect(body).toMatch(/\$\('menu-play'\)\.hidden = !FEATURES\.campaign/);
    expect(body).toMatch(/\$\('menu-world'\)\.hidden = !\(FEATURES\.campaign && online\)/);
    expect(body, 'the menu layout must never touch the network').not.toMatch(/\bawait\b|fetch\(|probeGoogle/);
  });

  it('never awaits the accounts/Google probe on the boot path', () => {
    // The probe is a Supabase round trip; boot must never block on it. It is reached only through a
    // dynamic import that is deliberately not awaited, and `mountAccounts` is never awaited.
    expect(main).toMatch(/void import\('\.\/accounts\/mount\.js'\)/);
    expect(main).not.toMatch(/await import\('\.\/accounts\/mount\.js'\)/);
    expect(main).not.toMatch(/await\s+[^\n;]*mountAccounts/);
  });
});

describe('the product menu paints its finished column before the module runs', () => {
  // 2026-11-02 smoothness pass. The menu's shape is static, so the built HTML carries the finished
  // column: the beta line, an unhidden PLAY, and TERRITORY's reserved slot. `layoutMenu` then only
  // fills data and reveals the map key into the space already held for it. The early PLAY must
  // carry a replay guard, or a tap before the module bound its handler would be lost.
  it('builds the product menu into the HTML it ships', () => {
    expect(vite, 'the build drops PLAY\u2019s hidden attribute').toMatch(/menu-play.*\?\) hidden>/);
    expect(vite, 'the beta line comes from src/strings.ts').toMatch(/FEEDBACK\.betaNote/);
    expect(vite, 'TERRITORY\u2019s slot is reserved only with a real endpoint').toMatch(/worldReserved[\s\S]*VITE_DUEL_API_URL/);
    expect(html, 'an early tap is replayed once the app is ready').toMatch(/data-early-tap[\s\S]*severor-ready/);
  });

  it('shows those keys behind the product scope and reserves the map slot invisibly', () => {
    expect(css).toMatch(/html\.test-typography-v2 #menu:not\(\[data-laid-out\]\) \.menu-buttons\s*\{[\s\S]*?visibility: visible/);
    expect(css).toMatch(/html\.test-typography-v2\.world-reserved #menu:not\(\[data-laid-out\]\) #menu-world\[hidden\]\s*\{[\s\S]*?visibility: hidden/);
    // The legacy-only entries must never paint on the product menu before its layout.
    expect(css).toMatch(/#menu-new[\s\S]{0,120}display: none !important/);
  });

  it('preloads the two assets the first frame actually uses', () => {
    expect(html).toMatch(/rel="preload"[^>]*futasaku-numerals-700\.woff2/);
    expect(html).toMatch(/rel="preload"[^>]*paint-wordmark\.svg/);
  });
});
