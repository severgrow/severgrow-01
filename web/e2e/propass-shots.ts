// v0.7 Step 9: the pro-pass screenshots, at 390x844 and 360x640.
//   npx tsx web/e2e/propass-shots.ts --dist=web/dist --label=after
//   npx tsx web/e2e/propass-shots.ts --dist=<old build> --label=before --old
// "before" shoots the page as it was (main before this change: whole-state saves, key v6);
// "after" shoots the new page, including the new pieces (homes, painting, pause, welcome).
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { CURRENT_RULES_VERSION, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Card, Player, State, Suit } from '../../src/engine/index.js';
import { fixture } from '../../tests/helpers.js';
import { clickKind, hexCenter } from './drawing.js';

const opt = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const DIST = resolve(opt('dist') ?? 'web/dist');
const LABEL = opt('label') ?? 'after';
const OLD = process.argv.includes('--old');
const OUT = resolve(opt('out') ?? 'docs/screens/pro-pass');
mkdirSync(OUT, { recursive: true });

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
  let file = join(DIST, path === '/' ? 'index.html' : path);
  if (!existsSync(file)) file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(4194, r));
const BASE = 'http://localhost:4194/';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const doneCoach = { step: 99, taught: [], known: [], choice: 0, summaryDone: true };

const saveOf = (state: State) =>
  OLD ? { key: 'severgrow.save.v6', value: JSON.stringify({ state, coach: doneCoach, level: 7 }) } : { key: 'severgrow.save.v7', value: JSON.stringify({ v: 7, rules: CURRENT_RULES_VERSION, seed: state.seed, actions: [], base: state, coach: doneCoach, level: 7 }) };

type Size = { w: number; h: number };
const SIZES: Size[] = [{ w: 390, h: 844 }, { w: 360, h: 640 }];
const open = async (size: Size, o: { state?: State; settings?: Record<string, unknown>; fresh?: boolean; url?: string } = {}) => {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const save = o.state ? saveOf(o.state) : null;
  await page.addInitScript(
    ([s, k, v, fresh]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('severgrow.settings.v1', s as string);
      if (k) localStorage.setItem(k as string, v as string);
      if (!fresh) {
        localStorage.setItem('severgrow.seen', '1');
        localStorage.setItem('severgrow.tips.v1', JSON.stringify({ fruit: true, strengthen: true, draw: true }));
        localStorage.setItem('severgrow.ctools.seen', '1');
      }
    },
    [JSON.stringify({ sound: false, coach: false, speed: 'skip', eyeCandy: false, confirmPolicy: 'always', ...o.settings }), save?.key ?? '', save?.value ?? '', !!o.fresh],
  );
  await page.goto(BASE + (o.url ?? ''));
  await page.waitForTimeout(600);
  if (o.state) {
    await page.waitForTimeout(1200);
    await page.locator('#menu-continue').click({ force: true });
    await page.waitForTimeout(1600);
  }
  return page;
};
const shot = async (page: Page, name: string, size: Size, clip?: { x: number; y: number; width: number; height: number }) => {
  // a phone has no hovering mouse: park the test's mouse off the board first
  await page.mouse.move(1, 1);
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${OUT}/${LABEL}-${size.w}x${size.h}-${name}.png`, ...(clip ? { clip } : {}) });
};

const stateWith = (tiles: Record<string, [Player, number]>, hand: [Suit, number][], o: { rock?: string[]; rich?: string[]; discardTop?: Card } = {}): State => {
  const g = newGame(5);
  const f = fixture({ tiles, rock: o.rock ?? [], rich: o.rich ?? [] });
  const pool = [...g.hands[0], ...g.hands[1], ...g.deck];
  const h: Card[] = [];
  for (const [su, r] of hand) h.push(pool.splice(pool.findIndex((c) => c.suit === su && c.rank === r), 1)[0]!);
  const discard = o.discardTop ? [pool.splice(pool.findIndex((c) => c.id === o.discardTop!.id), 1)[0]!] : g.discard;
  return { ...g, board: f.board, terrain: f.terrain, hands: [h, pool.filter((c) => c.suit !== null).splice(0, 7)], deck: pool.filter((c) => !h.includes(c)), discard, phase: 'ACT', turnPlayer: 0, actor: 0 };
};
for (const size of SIZES) {
  // 1. the full game screen in each step: Draw, Grow, Throw (a fresh game at level 7, seed 12)
  {
    const page = await open(size, { url: '?seed=12' });
    // ?seed=12 starts a game at once (level 7, the default); otherwise go through the menu
    await page.waitForTimeout(1500);
    if (await page.locator('#menu-new').isVisible()) {
      await page.locator('#menu-new').click({ force: true });
      await page.waitForTimeout(400);
      await page.locator('#level-grid [data-level="7"]').click({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(2200);
    await shot(page, '1-draw-step', size);
    await page.locator('#deck').click({ force: true });
    await page.waitForTimeout(1500);
    await shot(page, '2-grow-step', size);
    const end = page.locator('#moves .end, #moves .btn:has-text("Throw a card")').first();
    if (await end.count()) await end.click().catch(() => {});
    await page.waitForTimeout(800);
    await shot(page, '3-throw-step', size);
    await page.close();
  }
  if (OLD) continue;
  // 2. the homes close up: idle, danger (4 of 6 sides blocked), tapped
  {
    const danger = stateWith({ '-1,1': [1, 3], '-1,2': [1, 3], '-2,1': [1, 2], '-3,2': [1, 4], '1,-1': [0, 3], '2,-1': [0, 2], '1,-2': [0, 2], '3,-3': [0, 4] }, [[0, 6], [1, 6], [2, 6]]);
    const page = await open(size, { state: danger, settings: { reduceMotion: true } });
    const crop = async (k: string, name: string) => {
      const c = await hexCenter(page, k);
      await shot(page, name, size, { x: Math.max(0, c.x - 60), y: Math.max(0, c.y - 80), width: 120, height: 130 });
    };
    await crop('-2,2', '4-tree-danger');
    await crop('2,-2', '4-volcano-danger');
    await shot(page, '4-homes-danger-board', size);
    await page.close();
    const idle = await open(size, { state: stateWith({}, [[0, 6], [1, 6], [2, 6]]), settings: { reduceMotion: true } });
    const c1 = await hexCenter(idle, '-2,2');
    const c2 = await hexCenter(idle, '2,-2');
    await shot(idle, '4-tree-idle', size, { x: c1.x - 60, y: c1.y - 80, width: 120, height: 130 });
    await shot(idle, '4-volcano-idle', size, { x: c2.x - 60, y: c2.y - 80, width: 120, height: 130 });
    await idle.touchscreen.tap(c1.x, c1.y);
    await idle.waitForTimeout(150);
    await shot(idle, '4-tree-tapped-card', size);
    await idle.touchscreen.tap(c1.x, c1.y);
    await idle.touchscreen.tap(c2.x, c2.y);
    await idle.waitForTimeout(150);
    await shot(idle, '4-volcano-tapped-card', size);
    // the board without the outer frame, the calmer gold, the corner icons and a tooltip
    await idle.touchscreen.tap(c2.x, c2.y);
    await idle.locator('#tool-targets').click();
    await idle.waitForTimeout(150);
    await shot(idle, '5-board-corner-icons', size);
    await idle.close();
  }
  // 3. the Strangle finish: the volcano smothered (my Bloom); the tree withered (the opponent's)
  {
    const s = stateWith({ '-1,1': [0, 3], '0,0': [0, 3], '1,-1': [0, 3] }, [[0, 6], [1, 6], [2, 6]], { rock: ['3,-2', '3,-3', '2,-3', '2,-1'] });
    const a = legalActions(viewFor(s, 0)).find((x) => x.t === 'Bloom' && x.hexes.some((h) => coordKey(h) === '1,-2'))!;
    const page = await open(size, { state: s, settings: { speed: 'normal' } });
    await page.evaluate(`window.__severgrow.playFor(${JSON.stringify(a)}, 0)`);
    await page.waitForSelector('.landmark.lm-volcano.strangled', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(900);
    await shot(page, '6-strangle-volcano-smothered', size);
    await page.close();
  }
  {
    // the opponent to move, holding three 6s, with one open side left around my tree
    const base = stateWith({ '1,-1': [1, 3], '0,0': [1, 3], '-1,1': [1, 3] }, [[3, 2], [3, 5]], { rock: ['-3,2', '-3,3', '-2,3', '-2,1'] });
    const g = newGame(5);
    const pool = [...g.hands[0], ...g.hands[1], ...g.deck].filter((c) => c.suit !== null && !base.hands[0].some((h) => h.id === c.id));
    const opp: Card[] = [];
    for (const [su, r] of [[0, 6], [1, 6], [2, 6]] as [Suit, number][]) opp.push(pool.splice(pool.findIndex((c) => c.suit === su && c.rank === r), 1)[0]!);
    const s: State = { ...base, hands: [base.hands[0], opp], turnPlayer: 1, actor: 1 };
    const page = await open(size, { state: s, settings: { speed: 'normal' } });
    await page.waitForSelector('.landmark.lm-tree.strangled', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(900);
    await shot(page, '6-strangle-tree-withered', size);
    await page.close();
  }
  // 4. painting: Bloom buttons, a cluster mid-paint at 2/3, a run with Reverse, the unavailable reason, the one-tap suggestion
  {
    const s = stateWith({ '0,1': [1, 7] }, [[0, 6], [1, 6], [2, 6], [3, 6], [0, 3], [0, 4], [0, 5]]);
    const page = await open(size, { state: s });
    await shot(page, '7-bloom-buttons', size);
    await page.click('#moves .bloom-toggle').catch(() => {});
    await page.waitForTimeout(250);
    await shot(page, '7-bloom-options', size);
    await page.click('#moves .bloom-toggle').catch(() => {});
    await clickKind(page, '#moves [data-kind^="bloom-3-"]');
    const cdp = await page.context().newCDPSession(page);
    const p1 = await hexCenter(page, '-1,1');
    const p2 = await hexCenter(page, '-1,2');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p1.x, y: p1.y, id: 1 }] });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p1.x + ((p2.x - p1.x) * i) / 6, y: p1.y + ((p2.y - p1.y) * i) / 6, id: 1 }] });
    await page.waitForTimeout(150);
    await shot(page, '8-mid-paint-2-of-3', size);
    // the unavailable reason: the opponent 7 next to the shape needs an 8 or higher
    const p3 = await hexCenter(page, '0,1');
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p2.x + ((p3.x - p2.x) * i) / 6, y: p2.y + ((p3.y - p2.y) * i) / 6, id: 1 }] });
    await page.waitForTimeout(150);
    await shot(page, '9-unavailable-reason', size);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.click('#confirm-cancel').catch(() => {});
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await page.close();
    const r = await open(size, { state: stateWith({}, [[0, 3], [0, 4], [0, 5]]) });
    await clickKind(r, '#moves [data-kind^="bloom-3-"]');
    await r.click('#moves .draw-reverse');
    const cdp2 = await r.context().newCDPSession(r);
    const keys = ['-1,1', '0,1', '1,1'];
    const pts = [] as { x: number; y: number }[];
    for (const k of keys) pts.push(await hexCenter(r, k));
    await cdp2.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0]!.x, y: pts[0]!.y, id: 1 }] });
    for (let j = 1; j < pts.length; j++) for (let i = 1; i <= 6; i++) await cdp2.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pts[j - 1]!.x + ((pts[j]!.x - pts[j - 1]!.x) * i) / 6, y: pts[j - 1]!.y + ((pts[j]!.y - pts[j - 1]!.y) * i) / 6, id: 1 }] });
    await r.waitForTimeout(150);
    await shot(r, '10-run-reverse', size);
    await cdp2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await r.close();
    const t = await open(size, { state: stateWith({}, [[0, 6], [1, 6], [2, 6]]) });
    await clickKind(t, '#moves [data-kind^="bloom-3-"]');
    const c = await hexCenter(t, '-1,1');
    await t.touchscreen.tap(c.x, c.y);
    await t.waitForTimeout(250);
    await shot(t, '11-one-tap-suggestion', size);
    await t.close();
  }
  // 5. the pile cards for every suit and a Fruit card, the Draw-step glow, the largest hand
  {
    const g = newGame(5);
    const all = [...g.hands[0], ...g.hands[1], ...g.deck, ...g.discard];
    const pick = (su: number | null, r: number) => all.find((x) => x.suit === su && (su === null || x.rank === r))!;
    for (const [i, top] of [pick(0, 7), pick(1, 7), pick(2, 7), pick(3, 7), pick(null, 0)].entries()) {
      const s = { ...stateWith({}, [[0, 2], [1, 5], [2, 8], [3, 1], [0, 9], [1, 3], [2, 4]], { discardTop: top }), phase: 'DRAW' as const };
      const hand = s.hands[0];
      const fruit = all.filter((x) => x.suit === null && x.id !== top.id).slice(0, 1);
      const page = await open(size, { state: { ...s, hands: [i === 4 ? [...hand, ...fruit] : hand, s.hands[1]] } });
      const box = await page.locator('.piles').boundingBox();
      if (box) await shot(page, `12-pile-${i < 4 ? `suit${i}` : 'fruit'}`, size, { x: box.x - 4, y: box.y - 4, width: box.width + 8, height: box.height + 8 });
      if (i === 4) await shot(page, '13-draw-step-glow-and-largest-hand', size);
      await page.close();
    }
  }
  // 6. the pause menu, the settings groups, the welcome card, the radius-4 board
  {
    const page = await open(size, { state: stateWith({}, [[0, 6], [1, 6], [2, 6]]) });
    await page.click('#hud-menu');
    await page.waitForTimeout(250);
    await shot(page, '14-pause-menu', size);
    await page.click('#gm-settings');
    await page.waitForTimeout(250);
    await shot(page, '15-settings', size);
    await page.close();
    const w = await open(size, { fresh: true, settings: { eyeCandy: false } });
    await w.waitForTimeout(400);
    await shot(w, '16-welcome-card', size);
    await w.close();
  }
}
await browser.close();
server.close();
console.log(`${LABEL} shots written to ${OUT}`);
