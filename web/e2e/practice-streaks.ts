/**
 * PRACTICE STREAKS + BEST ONLINE BLITZ STREAK (owner, 2026-11-18; two groups 2026-11-20).
 *
 * Only HARD and BLITZ carry a streak (owner, 2026-11-20: EASY and MEDIUM stop counting), so only they
 * show the current streak (left, muted) and the best (right, slightly brighter), in the Planet key's
 * read-out, with nothing else inside the key. Checked at 320, 390, 430, a landscape phone and a
 * desktop, on Chromium and WebKit (`practice-streaks-ios`):
 *   - the label stays centred and never touches a number; both numbers sit inside the key;
 *   - "0" when there is nothing yet; the key keeps its 50px height (44px target) and its focus ring;
 *   - best is brighter than current;
 *   - EASY and MEDIUM are plain keys: no numbers, no streak in their spoken name;
 *   - the legend sits in the gap before HARD (never above EASY) and its words align to that key's
 *     number columns; the MEDIUM→HARD gap is measurably wider than EASY→MEDIUM, with and without
 *     the legend, and again with the BLITZ key removed (the three-key screen is measured).
 * On Chromium at 390 a real HARD game is played to its end and the key's numbers change on return,
 * with no reload. The signed-in profile shows "Best Blitz streak" as the online row's key tile and
 * "Achievements x/x" (the API is a local stub; nothing real is called).
 *
 * Build: the planet-login fixture (CHANNEL=futa05, VITE_DUEL_API_URL=http://127.0.0.1:65530/...,
 * VITE_SUPABASE_URL=https://stub.invalid, VITE_SUPABASE_ANON_KEY=local). The port is 65530 by
 * default; STREAK_OFFLINE_PORT overrides the fixture's listener when another suite on the machine
 * already owns it, and the build's VITE_DUEL_API_URL must then point at the same port.
 */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, webkit } from 'playwright-core';
import type { Page } from 'playwright-core';
import { productFixture } from './helpers/product-fixture.js';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { applyGame, isStreakTier } from '../../server/src/streaks/rules.js';
import type { PracticeStreaks, StreakResult } from '../../server/src/streaks/rules.js';

const ios = process.env.STREAK_WEBKIT === '1';
const out = process.env.SHOTS ?? 'docs/screens/practice-streaks';
/** Wall-clock budgets only (a shared machine running other suites can take minutes to boot and
 *  paint). Defaults to the repo's usual 30s; STREAK_WAIT_MS raises it on a loaded machine without
 *  changing a single assertion. */
const WAIT = Number(process.env.STREAK_WAIT_MS ?? 30_000);
mkdirSync(out, { recursive: true });
const fixture = await productFixture({ offlineApiPort: Number(process.env.STREAK_OFFLINE_PORT ?? 65530) });
const browser = await (ios ? webkit : chromium).launch(ios ? {} : { executablePath: process.env.PW_CHROMIUM ?? chromium.executablePath(), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const PREFIX = 'futa05-test:';
const PLAYER = '33333333-3333-4333-8333-333333333333';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'apikey,authorization,content-type,x-futasaku-client-version,x-futasaku-rules-version' };
const streakSave = (tiers: Record<string, { current: number; best: number }>, completed: number) => JSON.stringify({ v: 1, players: { [PLAYER]: { tiers, pending: [], counted: [], completed } } });
const SEEDED = { easy: { current: 2, best: 5 }, medium: { current: 0, best: 0 }, hard: { current: 12, best: 128 }, blitz: { current: 1, best: 3 } };
const isCompleted = (result: string) => result === 'win' || result === 'loss' || result === 'draw';

const prepare = async (p: Page, signedIn: boolean, completed = 3) => {
  // The account, as the real server keeps it: each posted game id counted once by the shared rule.
  const account: PracticeStreaks = JSON.parse(JSON.stringify(SEEDED));
  let completedCount = completed;
  const counted = new Set<string>();
  await p.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/duel/, '');
    if (path === '/v1/players/me/streaks' && route.request().method() === 'POST') {
      for (const g of (route.request().postDataJSON() as { games: { id: string; tier: keyof PracticeStreaks; result: StreakResult }[] }).games) {
        if (counted.has(g.id)) continue; counted.add(g.id);
        // The real server's rule: an EASY/MEDIUM report is accepted and recorded, never counted.
        if (isStreakTier(g.tier)) account[g.tier] = applyGame(account[g.tier], g.result);
        if (isCompleted(g.result)) completedCount += 1;
      }
    }
    const body =
      path === '/v1/auth/methods' ? { ok: true, email: true }
      : path === `/v1/players/${PLAYER}/record` ? { ok: true, onlineBlitzBest: 7, achievements: { done: 12, total: 35 } }
      : path === '/v1/seeds/achievements' ? { ok: true, achievements: Array.from({ length: 35 }, (_, i) => ({ done: i < 12 })) }
      : path === `/v1/players/${PLAYER}/profile` ? { ok: true, profile: { displayName: 'RYK', tag: 'ABCD', level: 23, tiles: 14, connectedTiles: 9, colourId: 3, online: { games: 40, wins: 26, longestStreak: 6 } } }
      : path === '/v1/players/me/streaks' ? { ok: true, practice: account, onlineBlitz: { current: 2, best: 7 }, completed: completedCount }
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
  }, { prefix: PREFIX, player: PLAYER, save: streakSave(SEEDED, completed), signedIn });
};

const openPractice = async (p: Page) => {
  // The page's own boot is awaited below, so a loaded machine does not need the full `load` event.
  await p.goto(fixture.origin + '/test/', { waitUntil: 'domcontentloaded', timeout: WAIT });
  await p.waitForFunction('(() => !!window.__severgrow?.ready?.())()', undefined, { timeout: WAIT });
  if (!(await p.locator('#menu-new').isVisible().catch(() => false))) await p.click('#menu-play', { timeout: WAIT });
  await p.click('#menu-new', { timeout: WAIT });
  await p.waitForSelector('#level-grid .difficulty-tile');
};

/** The reveal rule's first paint: does this screen show the legend and the two numbers at all? */
const streakVisible = (p: Page) => p.evaluate(`(() => {
  const grid = document.getElementById('level-grid');
  const keys = [...grid.querySelectorAll('.difficulty-tile')];
  return {
    legend: !!grid.querySelector(':scope > .practice-streak-legend'),
    numbered: grid.querySelectorAll('.practice-streak-key').length,
    cells: grid.querySelectorAll('.practice-streak-side').length,
    labels: keys.map((k) => (k.textContent ?? '').trim()),
    spoken: keys.map((k) => k.getAttribute('aria-label') ?? ''),
  };
})()`) as Promise<{ legend: boolean; numbered: number; cells: number; labels: string[]; spoken: string[] }>;

type KeyGeometry = { tier: string; current: string; best: string; height: number; labelOff: number; gapLeft: number; gapRight: number; inside: boolean; brighter: boolean };
const measure = (p: Page) => p.evaluate(`(() => [...document.querySelectorAll('#level-grid .difficulty-tile.practice-streak-key')].map((key) => {
  const r = key.getBoundingClientRect();
  const label = key.querySelector('.practice-streak-label').getBoundingClientRect();
  const cur = key.querySelector('.practice-streak-current'); const best = key.querySelector('.practice-streak-best');
  // The DIGITS' own extent (the cells stretch across their column; the text is what must stay clear).
  const ink = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
  const labelInk = (() => { const r = document.createRange(); r.selectNodeContents(key.querySelector('.practice-streak-label')); return r.getBoundingClientRect(); })();
  const c = ink(cur); const b = ink(best);
  return { tier: key.dataset.difficulty, current: cur.textContent, best: best.textContent, height: r.height,
    labelOff: Math.abs((label.left + label.right) / 2 - (r.left + r.right) / 2),
    gapLeft: labelInk.left - c.right, gapRight: b.left - labelInk.right,
    inside: c.left >= r.left - 0.5 && b.right <= r.right + 0.5,
    brighter: Number(getComputedStyle(best).opacity) > Number(getComputedStyle(cur).opacity) };
}))()`) as Promise<KeyGeometry[]>;

const play = async (p: Page) => {
  const read = () => p.evaluate('(() => window.__severgrow.state())()') as Promise<State | null>;
  for (let i = 0; i < 1500; i++) {
    const s = await read(); if (!s) throw new Error('no state'); if (s.phase === 'GAME_OVER') return s;
    await p.waitForFunction('(() => !!window.__severgrow.state() && !window.__severgrow.busy())()', undefined, { timeout: WAIT });
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
  const allSizes: [string, number, number][] = [['320', 320, 568], ['390', 390, 844], ['430', 430, 932], ['landscape', 844, 390], ['desktop', 1440, 900]];
  /** `STREAK_SIZES=390` re-runs a subset while iterating (the suite is unchanged). */
  const only = (process.env.STREAK_SIZES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const sizes = only.length ? allSizes.filter(([name]) => only.includes(name)) : allSizes;
  for (const [name, width, height] of sizes) {
    const p = await browser.newPage({ viewport: { width, height }, hasTouch: width < 900 });
    await prepare(p, true, 3);
    await openPractice(p);
    await p.waitForSelector('#level-grid .practice-streak-key');
    const keys = await measure(p);
    assert.deepEqual(keys.map((k) => k.tier), ['hard', 'pro'], `${name}: only HARD and BLITZ carry the numbers`);
    assert.deepEqual(keys.map((k) => `${k.current}|${k.best}`), ['12|128', '1|3'], `${name}: current left, best right, "0" when nothing yet`);
    for (const k of keys) {
      assert(k.height >= 44, `${name} ${k.tier}: a 44px target (${k.height})`);
      assert(k.labelOff <= 1, `${name} ${k.tier}: the label stays centred (${k.labelOff.toFixed(2)}px off)`);
      assert(k.gapLeft >= 4 && k.gapRight >= 4, `${name} ${k.tier}: numbers never touch the label (${k.gapLeft.toFixed(1)} / ${k.gapRight.toFixed(1)})`);
      assert(k.inside, `${name} ${k.tier}: both numbers inside the key`);
      assert(k.brighter, `${name} ${k.tier}: best is brighter than current`);
    }
    // EASY and MEDIUM are plain Practice keys again (owner, 2026-11-20): a 44px target, their own
    // label, no number cells and nothing about streaks in the spoken name.
    const plain = await p.evaluate(`(() => [...document.querySelectorAll('#level-grid .difficulty-tile')].filter((k) => !k.classList.contains('practice-streak-key')).map((k) => ({
      tier: k.dataset.difficulty, height: k.getBoundingClientRect().height, label: (k.textContent ?? '').trim(),
      cells: k.querySelectorAll('.practice-streak-side').length, spoken: k.getAttribute('aria-label') ?? '',
    })))()`) as { tier: string; height: number; label: string; cells: number; spoken: string }[];
    assert.deepEqual(plain.map((k) => k.tier), ['easy', 'medium'], `${name}: EASY and MEDIUM carry no streak`);
    for (const k of plain) {
      assert(k.height >= 44, `${name} ${k.tier}: a 44px target (${k.height})`);
      assert.equal(k.cells, 0, `${name} ${k.tier}: no number cells`);
      assert(!/streak/i.test(k.spoken), `${name} ${k.tier}: nothing about streaks is spoken`);
    }
    assert.deepEqual(plain.map((k) => k.label), ['EASY', 'MEDIUM']);
    // The second, static signal that HARD/BLITZ are the real deal: a very faint cream wash over the
    // top of those two keys only (a gradient on ::before). MEDIUM is the untouched baseline.
    const accent = await p.evaluate(`(() => { const keys = [...document.querySelectorAll('#level-grid .difficulty-tile')]; const wash = (id) => getComputedStyle(keys.find((k) => k.dataset.difficulty === id), '::before').backgroundImage; return { hard: wash('hard'), blitz: wash('pro'), medium: wash('medium') }; })()`) as { hard: string; blitz: string; medium: string };
    assert.match(accent.hard, /gradient/, `${name}: HARD wears the faint wash`);
    assert.equal(accent.hard, accent.blitz, `${name}: BLITZ wears the same wash`);
    assert.equal(accent.medium, 'none', `${name}: MEDIUM stays plain`);
    // "dont go 'Practice / match'" (owner): the heading is one line at every size.
    const heading = await p.evaluate(`(() => { const h = document.getElementById('levels-heading'); const r = h.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(h).lineHeight) || parseFloat(getComputedStyle(h).fontSize) * 1.3; return { lines: Math.round(r.height / lh), clipped: h.scrollWidth > h.clientWidth + 1 }; })()`) as { lines: number; clipped: boolean };
    assert.equal(heading.lines, 1, `${name}: the heading stays on one line`);
    assert(!heading.clipped, `${name}: the heading fits without being cut`);
    // Keyboard focus keeps its ring.
    await p.keyboard.press('Tab');
    await p.locator('#level-grid .difficulty-tile').first().focus();
    if (ios) {
      // Headless WebKit never reports :focus-visible for a programmatic focus (the keyboard modality
      // stays false even after Tab), so the ring's computed outline cannot be observed here. Assert
      // the two things that ARE the contract: the key takes keyboard focus, and the ring rule exists.
      const state = await p.evaluate(`(() => {
        const key = document.querySelector('#level-grid .difficulty-tile');
        const css = [...document.styleSheets].map((sheet) => { try { return [...sheet.cssRules].map((r) => r.cssText).join(''); } catch { return ''; } }).join('');
        return { focused: document.activeElement === key, rule: /#levels \.level-grid \.difficulty-tile:focus-visible/.test(css) };
      })()`) as { focused: boolean; rule: boolean };
      assert(state.focused, `${name}: the Practice key takes keyboard focus`);
      assert(state.rule, `${name}: the focus-ring rule is present`);
    } else {
      const ring = await p.evaluate("getComputedStyle(document.querySelector('#level-grid .difficulty-tile')).outlineStyle");
      assert.notEqual(ring, 'none', `${name}: the focus ring stays`);
    }
    assert.match(await p.locator('.difficulty-tile[data-difficulty="hard"]').getAttribute('aria-label') ?? '', /Current streak 12, longest streak 128\./, `${name}: the numbers are spoken`);
    // THE LEGEND (owner, 2026-11-18): "current streak" starts 3px inside the key's left border and
    // "longest streak" ends 3px inside its right border; each key's numbers sit centred under their
    // word, so both sides are the same distance from the key's edges. Since 2026-11-20 the legend
    // belongs to HARD/BLITZ: it is the row directly above HARD, after MEDIUM — never above EASY.
    const legend = await p.evaluate(`(() => { const l = document.querySelector('#level-grid > .practice-streak-legend'); const keys = [...document.querySelectorAll('#level-grid .difficulty-tile')];
      const byId = (id) => keys.find((k) => k.dataset.difficulty === id);
      const hard = byId('hard'), medium = byId('medium');
      const [a, b] = l.querySelectorAll('span'); const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); const kh = hard.getBoundingClientRect();
      const border = parseFloat(getComputedStyle(hard).borderLeftWidth) || 0;
      const centre = (r) => (r.left + r.right) / 2;
      const off = [hard, byId('pro')].map((key) => { const k = key.getBoundingClientRect(); const c = key.querySelector('.practice-streak-current').getBoundingClientRect(), d = key.querySelector('.practice-streak-best').getBoundingClientRect();
        return { under: Math.max(Math.abs(centre(c) - centre(ra)), Math.abs(centre(d) - centre(rb))), mirror: Math.abs((centre(c) - k.left) - (k.right - centre(d))) }; });
      return { beforeHard: l.nextElementSibling === hard, afterMedium: (medium.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        words: [a.textContent, b.textContent],
        leftInset: ra.left - (kh.left + border), rightInset: (kh.right - border) - rb.right,
        under: Math.max(...off.map((o) => o.under)), mirror: Math.max(...off.map((o) => o.mirror)),
        above: kh.top - rb.bottom, overlap: rb.left - ra.right }; })()`) as { beforeHard: boolean; afterMedium: boolean; words: string[]; leftInset: number; rightInset: number; under: number; mirror: number; above: number; overlap: number };
    assert(legend.beforeHard, `${name}: the legend is the row directly above HARD`);
    assert(legend.afterMedium, `${name}: ...and it sits after MEDIUM, never above EASY`);
    assert.deepEqual(legend.words, ['Current streak', 'Longest streak']);
    assert(Math.abs(legend.leftInset - 3) <= 1 && Math.abs(legend.rightInset - 3) <= 1, `${name}: 3px inside HARD's borders (${legend.leftInset.toFixed(1)} / ${legend.rightInset.toFixed(1)})`);
    assert(legend.under <= 1, `${name}: every number centred under its word (${legend.under.toFixed(2)}px off)`);
    assert(legend.mirror <= 1, `${name}: the two numbers equally far from the key's edges (${legend.mirror.toFixed(2)}px off)`);
    assert(legend.above >= 2 && legend.overlap >= 8, `${name}: clear of the key and of each other (${legend.above.toFixed(1)} / ${legend.overlap.toFixed(1)})`);
    // THE TWO GROUPS (owner, 2026-11-20): the MEDIUM→HARD pause is measurably wider than EASY→MEDIUM.
    const gaps = await p.evaluate(`(() => { const keys = [...document.querySelectorAll('#level-grid .difficulty-tile')]; const r = (id) => keys.find((k) => k.dataset.difficulty === id).getBoundingClientRect();
      const easy = r('easy'), medium = r('medium'), hard = r('hard'); return { easyMedium: medium.top - easy.bottom, mediumHard: hard.top - medium.bottom }; })()`) as { easyMedium: number; mediumHard: number };
    assert(Math.abs(gaps.easyMedium - 8) <= 2, `${name}: EASY→MEDIUM stays the grid's own 8px (${gaps.easyMedium.toFixed(1)})`);
    assert(gaps.mediumHard >= gaps.easyMedium + 12, `${name}: MEDIUM→HARD is the group break (${gaps.easyMedium.toFixed(1)} / ${gaps.mediumHard.toFixed(1)})`);
    assert(gaps.mediumHard <= gaps.easyMedium + 70, `${name}: ...a pause, not a void (${gaps.mediumHard.toFixed(1)})`);
    console.log(`  ${name}: EASY→MEDIUM ${gaps.easyMedium.toFixed(1)}px · MEDIUM→HARD ${gaps.mediumHard.toFixed(1)}px · legend inset ${legend.leftInset.toFixed(1)}/${legend.rightInset.toFixed(1)}px · numbers under words ${legend.under.toFixed(2)}px · mirror ${legend.mirror.toFixed(2)}px · gap above HARD ${legend.above.toFixed(1)}px`);
    await p.screenshot({ path: `${out}/keys-${ios ? 'webkit' : 'chromium'}-${name}.png` });
    console.log('PASS', ios ? 'webkit' : 'chromium', name, 'two groups, HARD/BLITZ numbers, centred labels, 44px, focus ring');
    await p.close();
  }

  // THE BLITZ-ABSENT CASE (the two groups must read as groups even when BLITZ is not there).
  // The futa05 build always appends the key, so the key is removed and the LAID-OUT screen measured:
  // the legend must still sit above HARD, HARD's numbers must stay centred under the words, and the
  // group pause must still be wider than EASY→MEDIUM. (The paint path itself treats any key outside
  // HARD/BLITZ as a plain key and anchors the legend to the first streak key — which is HARD — so a
  // three-key grid paints the same way; there is simply no BLITZ key left to skip.)
  {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    try {
      await prepare(p, true, 3);
      await openPractice(p);
      await p.waitForSelector('#level-grid .practice-streak-key');
      await p.evaluate(() => { document.querySelector('#level-grid .difficulty-tile[data-difficulty="pro"]')?.remove(); });
      // Let the grid lay out again without the row the key occupied.
      await p.waitForFunction(() => document.querySelectorAll('#level-grid .difficulty-tile').length === 3, undefined, { timeout: WAIT });
      await p.waitForTimeout(250);
      const seen = await p.evaluate(`(() => {
        const grid = document.getElementById('level-grid');
        const keys = [...grid.querySelectorAll('.difficulty-tile')];
        const key = (id) => keys.find((k) => k.dataset.difficulty === id);
        const box = (id) => key(id).getBoundingClientRect();
        const easy = box('easy'), medium = box('medium'), hardBox = box('hard');
        const hard = key('hard');
        const legend = grid.querySelector(':scope > .practice-streak-legend');
        const ra = legend?.querySelectorAll('span')[0]?.getBoundingClientRect(), rb = legend?.querySelectorAll('span')[1]?.getBoundingClientRect();
        const cur = hard && hard.querySelector('.practice-streak-current')?.getBoundingClientRect();
        const best = hard && hard.querySelector('.practice-streak-best')?.getBoundingClientRect();
        const c = (b) => (b ? (b.left + b.right) / 2 : 0);
        return {
          ids: keys.map((k) => k.dataset.difficulty),
          numbered: keys.filter((k) => k.classList.contains('practice-streak-key')).map((k) => k.dataset.difficulty),
          legendBeforeHard: !!legend && legend.nextElementSibling === hard,
          words: legend ? [...legend.querySelectorAll('span')].map((s) => s.textContent) : [],
          under: Math.max(Math.abs(c(cur) - c(ra)), Math.abs(c(best) - c(rb))),
          easyMedium: medium.top - easy.bottom,
          mediumHard: hardBox.top - medium.bottom,
        };
      })()`) as { ids: string[]; numbered: string[]; legendBeforeHard: boolean; words: string[]; under: number; easyMedium: number; mediumHard: number };
      assert.deepEqual(seen.ids, ['easy', 'medium', 'hard'], 'no BLITZ: the grid has the three training tiers');
      assert.deepEqual(seen.numbered, ['hard'], 'no BLITZ: only HARD carries the numbers');
      assert(seen.legendBeforeHard, 'no BLITZ: the legend is the row directly above HARD');
      assert.deepEqual(seen.words, ['Current streak', 'Longest streak']);
      assert(seen.under <= 1, `no BLITZ: HARD's numbers stay centred under the words (${seen.under.toFixed(2)}px off)`);
      assert(Math.abs(seen.easyMedium - 8) <= 2, `no BLITZ: EASY→MEDIUM stays 8px (${seen.easyMedium.toFixed(1)})`);
      assert(seen.mediumHard >= seen.easyMedium + 12, `no BLITZ: MEDIUM→HARD is still the group break (${seen.easyMedium.toFixed(1)} / ${seen.mediumHard.toFixed(1)})`);
      console.log(`  no BLITZ: EASY→MEDIUM ${seen.easyMedium.toFixed(1)}px · MEDIUM→HARD ${seen.mediumHard.toFixed(1)}px · numbers under words ${seen.under.toFixed(2)}px`);
      await p.screenshot({ path: `${out}/keys-no-blitz-${ios ? 'webkit' : 'chromium'}-390.png` });
      console.log('PASS', ios ? 'webkit' : 'chromium', 'no BLITZ: legend above HARD, one group break, HARD numbers aligned');
    } finally {
      await p.close();
    }
  }

  // THE REVEAL RULE (owner, 2026-11-20): guests never see the legend or the numbers; a signed-in
  // account sees them only after three fully completed Practice matches.
  for (const [label, signedIn, completed] of [['guest', false, 3], ['account with two completed games', true, 2]] as const) {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await prepare(p, signedIn, completed);
    await openPractice(p);
    const hidden = await streakVisible(p);
    assert.equal(hidden.legend, false, `${label}: no streak legend`);
    assert.equal(hidden.numbered, 0, `${label}: no key wears the numbers`);
    assert.equal(hidden.cells, 0, `${label}: no number cells at all`);
    // The keys are exactly the plain Practice keys again: their own labels, no streak suffix.
    assert.deepEqual(hidden.labels, ['EASY', 'MEDIUM', 'HARD', 'BLITZ'], `${label}: the plain tier labels`);
    assert(hidden.spoken.every((aria) => !/streak/i.test(aria)), `${label}: nothing about streaks is spoken`);
    // The group break does NOT depend on the legend: with the numbers hidden it is still a pause
    // between MEDIUM and HARD, a little wider than EASY→MEDIUM.
    const gaps = await p.evaluate(`(() => { const keys = [...document.querySelectorAll('#level-grid .difficulty-tile')]; const r = (id) => keys.find((k) => k.dataset.difficulty === id).getBoundingClientRect();
      const easy = r('easy'), medium = r('medium'), hard = r('hard'); return { easyMedium: medium.top - easy.bottom, mediumHard: hard.top - medium.bottom }; })()`) as { easyMedium: number; mediumHard: number };
    assert(gaps.mediumHard >= gaps.easyMedium + 6, `${label}: the MEDIUM→HARD pause survives without the legend (${gaps.easyMedium.toFixed(1)} / ${gaps.mediumHard.toFixed(1)})`);
    assert(gaps.mediumHard <= gaps.easyMedium + 26, `${label}: ...and stays whisper-quiet (${gaps.mediumHard.toFixed(1)})`);
    await p.screenshot({ path: `${out}/hidden-${label.replace(/\W+/g, '-')}-${ios ? 'webkit' : 'chromium'}.png` });
    console.log('PASS', ios ? 'webkit' : 'chromium', `${label}: the legend and the numbers are hidden`);
    await p.close();
  }

  if (!ios) {
    // A real game: the numbers change on return, without a reload. It is played on HARD, because
    // EASY and MEDIUM no longer count (owner, 2026-11-20). The account has TWO completed games, so
    // this one is the third and is also the transition from hidden to revealed.
    const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await prepare(p, true, 2);
    await openPractice(p);
    assert.equal((await streakVisible(p)).legend, false, 'two completed games keep the numbers hidden');
    await p.click('.difficulty-tile[data-difficulty="hard"]');
    await p.waitForFunction('(() => { const s = window.__severgrow?.state?.(); return !!s && s.phase !== "GAME_OVER"; })()', undefined, { timeout: WAIT });
    const loads = await p.evaluate('performance.getEntriesByType("navigation").length');
    const end = await play(p);
    const won = end.result?.winner === 0; const draw = end.result?.winner === null;
    await p.evaluate("(() => { document.getElementById('gameover')?.setAttribute('hidden',''); })()");
    await p.evaluate(`(() => { const b = document.getElementById('go-menu') || document.getElementById('gm-main'); b?.click(); })()`);
    await p.waitForTimeout(400);
    if (!(await p.locator('#menu-new').isVisible().catch(() => false))) await p.click('#menu-play').catch(() => undefined);
    await p.click('#menu-new');
    // The third fully completed game crossed the reveal: HARD and BLITZ now carry the numbers.
    await p.waitForSelector('#level-grid .practice-streak-key');
    const hard = (await measure(p)).find((k) => k.tier === 'hard')!;
    const expected = won ? '13|128' : draw ? '12|128' : '0|128';
    assert.equal(`${hard.current}|${hard.best}`, expected, `after a ${won ? 'win' : draw ? 'draw' : 'loss'} the HARD key reads ${expected}`);
    assert.equal(await p.evaluate('performance.getEntriesByType("navigation").length'), loads, 'no reload');
    await p.screenshot({ path: `${out}/keys-after-game.png` });
    console.log('PASS chromium the HARD key moved after a real game, with no reload:', expected);
    await p.close();
  }

  // The signed-in profile: Best Blitz streak as the online row's key tile, and Achievements x/x.
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await prepare(p, true);
  await p.goto(fixture.origin + '/test/', { waitUntil: 'domcontentloaded', timeout: WAIT });
  await p.waitForFunction('(() => !!window.__severgrow?.ready?.())()', undefined, { timeout: WAIT });
  await p.waitForFunction("(() => { const k = document.getElementById('menu-login'); return !!k && !k.hidden; })()", undefined, { timeout: WAIT });
  await p.click('#menu-login');
  await p.waitForSelector('#sheet-profile:not([hidden])');
  // Wall-clock budget only (a loaded machine's stub read can take a while); the assertion is the text.
  await p.waitForFunction("(() => document.getElementById('profile-achievements')?.textContent === '12/35')()", undefined, { timeout: WAIT }).catch(() => undefined);
  const achievementsText = await p.evaluate(() => document.getElementById('profile-achievements')?.textContent ?? '(missing)');
  assert.equal(achievementsText, '12/35', `the profile's achievements line (${achievementsText})`);
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
