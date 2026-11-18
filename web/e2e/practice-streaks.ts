/**
 * PRACTICE STREAKS + BEST ONLINE BLITZ STREAK (owner, 2026-11-18).
 *
 * The four Practice keys show the current streak (left, muted) and the best (right, slightly
 * brighter), in the Planet key's read-out, with nothing else inside the key. Checked at 320, 390, 430,
 * a landscape phone and a desktop, on Chromium and WebKit (`practice-streaks-ios`):
 *   - the label stays centred and never touches a number; both numbers sit inside the key;
 *   - "0" when there is nothing yet; the key keeps its 50px height (44px target) and its focus ring;
 *   - best is brighter than current.
 * On Chromium at 390 a real Easy game is played to its end and the key's numbers change on return,
 * with no reload. The signed-in profile shows "Best Blitz streak" as the online row's key tile and
 * "Achievements x/x" (the API is a local stub; nothing real is called).
 *
 * Build: the planet-login fixture (CHANNEL=futa05, VITE_DUEL_API_URL=http://127.0.0.1:65530/...,
 * VITE_SUPABASE_URL=https://stub.invalid, VITE_SUPABASE_ANON_KEY=local).
 */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, webkit } from 'playwright-core';
import type { Page } from 'playwright-core';
import { productFixture } from './helpers/product-fixture.js';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { applyGame } from '../../server/src/streaks/rules.js';
import type { PracticeStreaks, StreakResult } from '../../server/src/streaks/rules.js';

const ios = process.env.STREAK_WEBKIT === '1';
const out = process.env.SHOTS ?? 'docs/screens/practice-streaks';
mkdirSync(out, { recursive: true });
const fixture = await productFixture({ offlineApiPort: 65530 });
const browser = await (ios ? webkit : chromium).launch(ios ? {} : { executablePath: process.env.PW_CHROMIUM ?? chromium.executablePath(), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const PREFIX = 'futa05-test:';
const PLAYER = '33333333-3333-4333-8333-333333333333';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'apikey,authorization,content-type,x-futasaku-client-version,x-futasaku-rules-version' };
const streakSave = (tiers: Record<string, { current: number; best: number }>) => JSON.stringify({ v: 1, players: { [PLAYER]: { tiers, pending: [], counted: [] } } });
const SEEDED = { easy: { current: 2, best: 5 }, medium: { current: 0, best: 0 }, hard: { current: 12, best: 128 }, blitz: { current: 1, best: 3 } };

const prepare = async (p: Page, signedIn: boolean) => {
  // The account, as the real server keeps it: each posted game id counted once by the shared rule.
  const account: PracticeStreaks = JSON.parse(JSON.stringify(SEEDED));
  const counted = new Set<string>();
  await p.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/duel/, '');
    if (path === '/v1/players/me/streaks' && route.request().method() === 'POST') {
      for (const g of (route.request().postDataJSON() as { games: { id: string; tier: keyof PracticeStreaks; result: StreakResult }[] }).games) {
        if (counted.has(g.id)) continue; counted.add(g.id); account[g.tier] = applyGame(account[g.tier], g.result);
      }
    }
    const body =
      path === '/v1/auth/methods' ? { ok: true, email: true }
      : path === `/v1/players/${PLAYER}/record` ? { ok: true, onlineBlitzBest: 7, achievements: { done: 12, total: 35 } }
      : path === `/v1/players/${PLAYER}/profile` ? { ok: true, profile: { displayName: 'RYK', tag: 'ABCD', level: 23, tiles: 14, connectedTiles: 9, colourId: 3, online: { games: 40, wins: 26, longestStreak: 6 } } }
      : path === '/v1/players/me/streaks' ? { ok: true, practice: account, onlineBlitz: { current: 2, best: 7 } }
      : null;
    await route.fulfill({ status: body ? 200 : 503, headers: cors, contentType: 'application/json', body: JSON.stringify(body ?? { error: 'stub' }) });
  });
  await p.route('**/auth/v1/settings', (r) => r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ external: { email: true, google: false } }) }));
  await p.addInitScript(({ prefix, player, save, signedIn }) => {
    (window as any).__name = (f: unknown) => f;
    localStorage.setItem(`${prefix}severgrow.settings.v1`, JSON.stringify({ sound: false, music: false, reduceMotion: true, speed: 'skip' }));
    localStorage.setItem(`${prefix}severgrow.duel.identity.v1`, JSON.stringify({ token: 'local', playerId: player, displayName: 'RYK', kind: signedIn ? 'account' : 'guest' }));
    if (signedIn) localStorage.setItem(`${prefix}futasaku.account.v1`, JSON.stringify({ provider: 'email', email: 'ryk@example.invalid', playerId: player }));
    localStorage.setItem(`${prefix}severgrow.practice.streaks.v1`, save);
  }, { prefix: PREFIX, player: PLAYER, save: streakSave(SEEDED), signedIn });
};

const openPractice = async (p: Page) => {
  await p.goto(fixture.origin + '/test/');
  await p.waitForFunction('(() => !!window.__severgrow?.ready?.())()', undefined, { timeout: 30_000 });
  if (!(await p.locator('#menu-new').isVisible().catch(() => false))) await p.click('#menu-play');
  await p.click('#menu-new');
  await p.waitForSelector('#level-grid .practice-streak-key');
};

type KeyGeometry = { tier: string; current: string; best: string; height: number; labelOff: number; gapLeft: number; gapRight: number; inside: boolean; brighter: boolean };
const measure = (p: Page) => p.evaluate(`(() => [...document.querySelectorAll('#level-grid .difficulty-tile')].map((key) => {
  const r = key.getBoundingClientRect();
  const label = key.querySelector('.practice-streak-label').getBoundingClientRect();
  const cur = key.querySelector('.practice-streak-current'); const best = key.querySelector('.practice-streak-best');
  const c = cur.getBoundingClientRect(); const b = best.getBoundingClientRect();
  return { tier: key.dataset.difficulty, current: cur.textContent, best: best.textContent, height: r.height,
    labelOff: Math.abs((label.left + label.right) / 2 - (r.left + r.right) / 2),
    gapLeft: label.left - c.right, gapRight: b.left - label.right,
    inside: c.left >= r.left - 0.5 && b.right <= r.right + 0.5,
    brighter: Number(getComputedStyle(best).opacity) > Number(getComputedStyle(cur).opacity) };
}))()`) as Promise<KeyGeometry[]>;

const play = async (p: Page) => {
  const read = () => p.evaluate('(() => window.__severgrow.state())()') as Promise<State | null>;
  for (let i = 0; i < 1500; i++) {
    const s = await read(); if (!s) throw new Error('no state'); if (s.phase === 'GAME_OVER') return s;
    await p.waitForFunction('(() => !!window.__severgrow.state() && !window.__severgrow.busy())()', undefined, { timeout: 30_000 });
    const now = (await read())!; if (now.phase === 'GAME_OVER') return now;
    if (now.actor !== 0) { await p.waitForTimeout(40); continue; }
    const legal = legalActions(viewFor(now, 0));
    const pick = (t: Action['t']) => legal.find((a) => a.t === t);
    const order = [pick('Bloom'), pick('Sprout'), pick('EndAct'), pick('Discard'), pick('Draw'), ...legal].filter((a): a is Action => !!a);
    for (const a of order) if (await p.evaluate(`(() => window.__severgrow.playFor(${JSON.stringify(a)}, 0))()`)) break;
  }
  throw new Error('the game did not end');
};

try {
  const sizes: [string, number, number][] = [['320', 320, 568], ['390', 390, 844], ['430', 430, 932], ['landscape', 844, 390], ['desktop', 1440, 900]];
  for (const [name, width, height] of sizes) {
    const p = await browser.newPage({ viewport: { width, height }, hasTouch: width < 900 });
    await prepare(p, false);
    await openPractice(p);
    const keys = await measure(p);
    assert.deepEqual(keys.map((k) => k.tier), ['easy', 'medium', 'hard', 'pro'], `${name}: the four Practice keys`);
    assert.deepEqual(keys.map((k) => `${k.current}|${k.best}`), ['2|5', '0|0', '12|128', '1|3'], `${name}: current left, best right, "0" when nothing yet`);
    for (const k of keys) {
      assert(k.height >= 44, `${name} ${k.tier}: a 44px target (${k.height})`);
      assert(k.labelOff <= 1, `${name} ${k.tier}: the label stays centred (${k.labelOff.toFixed(2)}px off)`);
      assert(k.gapLeft >= 4 && k.gapRight >= 4, `${name} ${k.tier}: numbers never touch the label (${k.gapLeft.toFixed(1)} / ${k.gapRight.toFixed(1)})`);
      assert(k.inside, `${name} ${k.tier}: both numbers inside the key`);
      assert(k.brighter, `${name} ${k.tier}: best is brighter than current`);
    }
    // Keyboard focus keeps its ring.
    await p.keyboard.press('Tab');
    await p.locator('#level-grid .difficulty-tile').first().focus();
    const ring = await p.evaluate("getComputedStyle(document.querySelector('#level-grid .difficulty-tile')).outlineStyle");
    assert.notEqual(ring, 'none', `${name}: the focus ring stays`);
    assert.match(await p.locator('#level-grid .difficulty-tile').first().getAttribute('aria-label') ?? '', /Streak 2, best 5\./, `${name}: the numbers are spoken`);
    await p.screenshot({ path: `${out}/keys-${ios ? 'webkit' : 'chromium'}-${name}.png` });
    console.log('PASS', ios ? 'webkit' : 'chromium', name, 'four keys, centred labels, numbers inside, 44px, focus ring');
    await p.close();
  }

  if (!ios) {
    // A real game: the numbers change on return, without a reload.
    const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await prepare(p, false);
    await openPractice(p);
    await p.click('.difficulty-tile[data-difficulty="easy"]');
    await p.waitForFunction('(() => { const s = window.__severgrow?.state?.(); return !!s && s.phase !== "GAME_OVER"; })()', undefined, { timeout: 30_000 });
    const loads = await p.evaluate('performance.getEntriesByType("navigation").length');
    const end = await play(p);
    const won = end.result?.winner === 0; const draw = end.result?.winner === null;
    await p.evaluate("(() => { document.getElementById('gameover')?.setAttribute('hidden',''); })()");
    await p.evaluate(`(() => { const b = document.getElementById('go-menu') || document.getElementById('gm-main'); b?.click(); })()`);
    await p.waitForTimeout(400);
    if (!(await p.locator('#menu-new').isVisible().catch(() => false))) await p.click('#menu-play').catch(() => undefined);
    await p.click('#menu-new');
    const easy = (await measure(p))[0]!;
    const expected = won ? '3|5' : draw ? '2|5' : '0|5';
    assert.equal(`${easy.current}|${easy.best}`, expected, `after a ${won ? 'win' : draw ? 'draw' : 'loss'} the Easy key reads ${expected}`);
    assert.equal(await p.evaluate('performance.getEntriesByType("navigation").length'), loads, 'no reload');
    await p.screenshot({ path: `${out}/keys-after-game.png` });
    console.log('PASS chromium the Easy key moved after a real game, with no reload:', expected);
    await p.close();
  }

  // The signed-in profile: Best Blitz streak as the online row's key tile, and Achievements x/x.
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await prepare(p, true);
  await p.goto(fixture.origin + '/test/');
  await p.waitForFunction('(() => !!window.__severgrow?.ready?.())()', undefined, { timeout: 30_000 });
  await p.waitForFunction("(() => { const k = document.getElementById('menu-login'); return !!k && !k.hidden; })()", undefined, { timeout: 20_000 });
  await p.click('#menu-login');
  await p.waitForSelector('#sheet-profile:not([hidden])');
  await p.waitForFunction("(() => document.getElementById('profile-achievements')?.textContent === '12/35')()", undefined, { timeout: 10_000 });
  const key = p.locator('#profile-play-online .sp-tile-key');
  await key.waitFor();
  assert.equal(await key.locator('dt').textContent(), 'Best Blitz streak');
  assert.equal(await key.locator('dd').textContent(), '7');
  const sizes2 = await p.evaluate(`(() => { const k = document.querySelector('#profile-play-online .sp-tile-key dd'); const o = document.querySelector('#profile-play-online .sp-tile:not(.sp-tile-key) dd');
    return { key: parseFloat(getComputedStyle(k).fontSize), other: parseFloat(getComputedStyle(o).fontSize) }; })()`) as { key: number; other: number };
  assert(sizes2.key > sizes2.other, 'the Blitz record reads as the more important number');
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/profile-${ios ? 'webkit' : 'chromium'}-390.png` });
  console.log('PASS', ios ? 'webkit' : 'chromium', 'profile: Best Blitz streak 7 as the key tile, Achievements 12/35');
  await p.close();
} finally {
  await browser.close();
  await fixture.close();
}
