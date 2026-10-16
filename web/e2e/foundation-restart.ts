import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { legalActions, startingPlayerFor, viewFor } from '../../src/engine/index.js';
import type { Action, Player, State } from '../../src/engine/index.js';

// The boot match is seeded from the URL; the two matches after it come from New Game.
const BOOT_SEED = 219682080;
// foundation-restart covers the restart/continue flow, not the starter lottery. New Game takes
// its seed from crypto.getRandomValues (main.ts randomSeed()) and the engine's seeded lottery
// then decides who opens, so pin those two draws to human-first matches and keep the spec
// deterministic. The turn gate below still tolerates a bot-first opening: correctness does not
// rest on this pinning.
const MENU_SEEDS = [100000002, 555555551];
for (const seed of MENU_SEEDS) assert.equal(startingPlayerFor(seed), 0, `fixture seed ${seed} must be a human-first match`);

// A FREE port (helpers/preview-port.ts): two concurrent runs can never collide.
const { server, url: BASE } = await servePreview(4201, { logLevel: 'silent' });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript((seeds: number[]) => {
    (window as any).__name = (f: unknown) => f;
    window.confirm = () => true;
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, speed: 'normal', reduceMotion: false, autoSkip: false, confirmPolicy: 'always' }));
    // Pin New Game's seed source (main.ts randomSeed()) to the fixture seeds above.
    let next = 0;
    const real = crypto.getRandomValues.bind(crypto) as (array: Uint32Array) => Uint32Array;
    (crypto as unknown as Record<string, unknown>).getRandomValues = (array: Uint32Array) => {
      if (array.length === 1 && next < seeds.length) { array[0] = seeds[next++]!; return array; }
      return real(array);
    };
  }, MENU_SEEDS);
  await page.goto(`${BASE}?seed=${BOOT_SEED}`);

  const state = () => page.evaluate(() => (window as any).__severgrow.state() as State | null);
  const playFor = (action: Action, who: Player) => page.evaluate((arg: { action: Action; who: Player }) => Boolean((window as any).__severgrow.playFor(arg.action, arg.who)), { action, who });
  const click = (selector: string) => page.locator(selector).evaluate((element: Element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));

  // The boot match (?seed=) starts through the same async path (the starter lottery) as a menu
  // match. Let it settle before starting another: two overlapping startGame() calls each reach
  // beginSession(), and the boot one can otherwise land *after* the new match and replace the
  // session under the test (the original cause of the flake).
  await page.waitForFunction((bootSeed: number) => {
    const game = (window as any).__severgrow;
    const s = game?.state();
    const lottery = document.getElementById('starter-lottery');
    return !!s && s.seed === bootSeed && !game.busy() && !!lottery?.hidden;
  }, BOOT_SEED, { timeout: 20000 });

  // Start a fresh match and wait for the human's genuine turn with a legal move, from the live
  // state — never a boot transient and never a fixed sleep. The tier is the EASIEST training tier:
  // the five old tiers (Beginner…Pro) became EASY 3–4 / MEDIUM 5–7 / HARD 8–9, so the old
  // `data-difficulty="beginner"` no longer exists (this was the one red CI job, futa04-critical).
  await click('#menu-new');
  await page.locator('#level-grid [data-difficulty="easy"]').waitFor({ state: 'attached' });
  const boot = await state();
  assert(boot);
  await click('#level-grid [data-difficulty="easy"]');
  const ready = async (previousSeed: number) => {
    await page.waitForFunction((prev: number) => {
      const game = (window as any).__severgrow;
      const s = game?.state();
      const lottery = document.getElementById('starter-lottery');
      return !!s && s.seed !== prev && !game.busy() && !!lottery?.hidden && s.actor === 0 && s.phase !== 'GAME_OVER';
    }, previousSeed, { timeout: 20000 });
    const s = await state();
    assert(s && s.seed !== previousSeed, 'the new match is the current one');
    assert(legalActions(viewFor(s, 0)).length > 0, 'the human has a legal move');
    return s;
  };
  const fresh = await ready(boot.seed);
  assert.equal(fresh.phase, 'DRAW', 'a fresh turn opens with the draw');

  // Draw from the deck with the real tap. A re-render can swallow a synthetic click, so retry
  // the *interaction* (never an assertion) while the draw is still untouched.
  let drawn = false;
  for (let i = 0; i < 6 && !drawn; i++) {
    await page.waitForFunction(() => {
      const game = (window as any).__severgrow;
      const s = game?.state();
      return !!s && s.actor === 0 && s.phase === 'DRAW' && !game.busy();
    }, undefined, { timeout: 10000 });
    await click('#deck');
    drawn = await page.waitForFunction(() => {
      const game = (window as any).__severgrow;
      return game.state()?.phase === 'ACT' && !game.busy();
    }, undefined, { timeout: 4000 }).then(() => true).catch(() => false);
  }
  assert(drawn, 'the deck tap draws a card');

  // Place the growing tile through the test hook. foundation-restart covers the restart, and
  // this drives the same session.play + afterPlay path (the real move and its score animation)
  // a tap does; futa04-critical drives the real card/hex taps on the same board. This keeps the
  // spec off the fanned-card and swapping-hex re-render races.
  const grown = await state();
  assert(grown && grown.phase === 'ACT', 'the draw leaves the Grow step');
  const action = legalActions(viewFor(grown, 0)).find(a => a.t === 'Sprout');
  assert(action?.t === 'Sprout', 'a Sprout is legal after the draw');
  const beforeScore = viewFor(grown, 0).score;
  assert(await playFor(action, 0), 'the Sprout is accepted');
  const scored = await state();
  assert(scored && viewFor(scored, 0).score > beforeScore, 'the Sprout scores');
  await page.waitForFunction((n: number) => Number(document.querySelector('#score-you')?.textContent) > n, beforeScore, { timeout: 10000 });

  // Start a fresh match again: its scoreboard must be zero, and the previous match's score
  // animation must not be able to write into it.
  await click('#hud-menu');
  await click('#gm-new');
  await page.locator('#level-grid [data-difficulty="easy"]').waitFor({ state: 'attached' });
  await click('#level-grid [data-difficulty="easy"]');
  const restarted = await ready(scored.seed);
  assert.notEqual(restarted.seed, scored.seed);
  assert.equal(restarted.startingPlayer, startingPlayerFor(restarted.seed));
  assert.notEqual(restarted.phase, 'GAME_OVER');
  assert.equal(await page.locator('#score-you').textContent(), '0', 'old score animation cannot overwrite new game');
  assert.deepEqual(errors, []);
  console.log('Fresh match cancels previous score count: passed');
  await page.close();
} finally {
  await browser.close();
  server.httpServer.close();
}
