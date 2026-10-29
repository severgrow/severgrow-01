// THE HOMES GROW (browser): the player's own home is drawn a stage older by the history this
// device already holds, one growth moment plays when a threshold is crossed, and the in-match
// states (danger, smothered, withered) still win.
//
//   npx tsx web/e2e/home-growth.ts
//
// Needs a PREBUILT `CHANNEL=futa04` dist (its storage prefix is `main2:`) and Chromium:
//   PW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx tsx web/e2e/home-growth.ts
// Pass --shots=docs/screens to write the screenshots this suite takes.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { coordKey, homeCoord, newMatch } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';
import { servePreview } from './helpers/preview-port.js';
import { assertDistChannel } from './helpers/dist-channel.js';
import { positionSave } from './position.js';

const SHOTS = process.argv.find((a) => a.startsWith('--shots='))?.slice(8) ?? null;
if (SHOTS) mkdirSync(`${SHOTS}/home-growth`, { recursive: true });
const shot = (name: string) => (SHOTS ? `${SHOTS}/home-growth/${name}.png` : null);

/** A picture of the board itself. CDP capture (no Playwright stability wait) is the reliable path
 *  on a loaded machine; `page.screenshot` is the fallback. A missed picture is reported, never
 *  allowed to abort the checks that prove the feature. */
const shotMisses: string[] = [];
const saveShot = async (page: Page, name: string): Promise<void> => {
  const path = shot(name);
  if (!path) return;
  const view = page.viewportSize() ?? { width: 390, height: 844 };
  const box = await page.locator('#board').boundingBox().catch(() => null);
  const clip = box
    ? {
        x: Math.max(0, box.x - 10),
        y: Math.max(0, box.y - 10),
        width: Math.min(view.width - Math.max(0, box.x - 10), box.width + 20),
        height: Math.min(view.height - Math.max(0, box.y - 10), box.height + 20),
      }
    : { x: 0, y: 0, width: view.width, height: view.height };
  try {
    const cdp = await page.context().newCDPSession(page);
    const r = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale: 1 },
    });
    writeFileSync(path, Buffer.from(r.data, 'base64'));
    await cdp.detach().catch(() => undefined);
    return;
  } catch { /* fall through to the Playwright path */ }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.screenshot({ path, clip, timeout: 20_000 });
      return;
    } catch {
      await page.waitForTimeout(400);
    }
  }
  shotMisses.push(name);
  console.log(`FAIL  ${name}: screenshot not written (machine under load)`);
};

const SEED_URL = '?seed=219682080';
const SETTINGS = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ palette: 'soil', sound: false, music: false, coach: false, speed: 'normal', reduceMotion: false, eyeCandy: true, ...extra });

type Seed = {
  played?: number;
  grow?: number;
  completed?: string[];
  seen?: number | null;
  settings?: Record<string, unknown>;
  save?: string | null;
};

let checks = 0;
const check = (value: unknown, name: string) => {
  assert(value, name);
  checks++;
};

const served = await servePreview(0, { logLevel: 'silent' });
const BASE = served.url;
const LAUNCH = {
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
};
// ONE browser for the whole suite; every case gets its own context (its own storage) and closes it.
// This machine runs several agents' suites at once, so a browser per case is what the OOM killer
// used to take; one browser with one live page at a time is the stable shape.
const browser = await chromium.launch(LAUNCH);

/**
 * Watch for the one growth moment from before the page boots. The observer records every time a
 * home gains `.lm-growing`, plus the CSS properties its animations touch (the cheapness contract).
 */
const initProbe = () => {
  const log = { growing: 0, props: [] as string[], at: null as number | null };
  (window as unknown as { __growthProbe: typeof log }).__growthProbe = log;
  new MutationObserver((entries) => {
    for (const e of entries) {
      if (e.type !== 'attributes' || e.attributeName !== 'class') continue;
      const el = e.target as Element;
      if (!el.classList || !el.classList.contains('lm-growing') || !el.classList.contains('landmark')) continue;
      log.growing++;
      log.at = performance.now();
      const sample = () => {
        for (const a of document.getAnimations()) {
          const fx = a.effect as KeyframeEffect | null;
          if (!fx || !(fx.target instanceof Element) || !fx.target.closest('.landmark')) continue;
          for (const k of fx.getKeyframes()) for (const p of Object.keys(k)) log.props.push(p);
        }
      };
      // The animation is created by the style pass after this class change; read it a beat later.
      sample();
      setTimeout(sample, 60);
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
};

const open = async (o: Seed, viewport = { width: 390, height: 844 }, settle = true) => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: viewport.width < 700, hasTouch: viewport.width < 700 });
  const page = await context.newPage();
  const close = async () => { await context.close().catch(() => undefined); };
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(function (s: Seed) {
    // Seed once per tab: a reload must keep the records the app wrote (the replay check relies on it).
    if (sessionStorage.getItem('__growth_seeded')) return;
    sessionStorage.setItem('__growth_seeded', '1');
    const w = window as unknown as { __name?: unknown };
    w.__name = w.__name ?? ((f: unknown) => f);
    localStorage.clear();
    localStorage.setItem('main2:severgrow.settings.v1', (s as unknown as { settings: string }).settings);
    localStorage.setItem('main2:severgrow.stats.v1', JSON.stringify({
      played: s.played ?? 0, wins: Math.min(s.played ?? 0, 2), losses: 0, draws: 0, best: 12, streak: 0, bestStreak: 1,
      winsByLevel: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    }));
    localStorage.setItem('main2:severgrow.play.v1', JSON.stringify({ grow: s.grow ?? 0, bloom: 0, bomb: 0, blast: 0, longestBloom: 0 }));
    if (s.completed) localStorage.setItem('main2:severgrow.campaign.progress.v3', JSON.stringify({ version: 1, unlocked: s.completed.length + 1, completed: s.completed, best: {} }));
    if (s.seen) localStorage.setItem('main2:severgrow.homes.growth.v1', JSON.stringify({ v: 1, stage: s.seen }));
    if (s.save) localStorage.setItem('main2:severgrow.save.v7', s.save);
  }, { ...o, settings: SETTINGS(o.settings) } as unknown as Seed);
  await page.addInitScript(initProbe);
  await page.goto(o.save ? BASE : BASE + SEED_URL);
  await assertDistChannel(page);
  if (o.save) {
    // The product menu hides Continue, but its listener is bound: a DOM click is the same resume
    // path (exactly as futa04-motion.ts opens a saved position).
    await page.waitForSelector('#menu-continue', { state: 'attached', timeout: 60_000 });
    await page.evaluate(() => document.getElementById('menu-continue')?.click());
  }
  await page.waitForFunction(() => {
    const h = (window as any).__severgrow;
    return !!h && !!h.state() && !h.busy();
  }, undefined, { timeout: 90_000 });
  await page.waitForSelector('#starter-lottery', { state: 'hidden', timeout: 45_000 }).catch(() => undefined);
  if (settle) await page.waitForTimeout(1400);
  return { page, errors, close };
};

type HomeInfo = { stage: string | null; layers: number; cls: string; seen: string | null; crownW: number; apples: number };
const homeInfo = (page: Page): Promise<HomeInfo> =>
  page.evaluate(() => {
    const home = document.querySelector<SVGGElement>('#board .landmark.lm-tree');
    const layer = home?.querySelector<SVGGElement>('.lm-growth-settled, .lm-growth-to, .lm-growth-from');
    return {
      stage: home?.dataset.growthStage ?? null,
      layers: home?.querySelectorAll('.lm-growth').length ?? 0,
      cls: home?.getAttribute('class') ?? '',
      seen: localStorage.getItem('severgrow.homes.growth.v1'),
      crownW: layer ? layer.getBoundingClientRect().width : 0,
      apples: home?.querySelectorAll('.lm-growth-apple').length ?? 0,
    };
  });

const probe = (page: Page) =>
  page.evaluate(() => {
    const p = (window as any).__growthProbe as { growing: number; props: string[] };
    return { growing: p.growing, props: [...new Set(p.props)] };
  });

const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

try {
  // ---- the ladder from seeded histories ------------------------------------------------------
  const stages: { name: string; seed: Seed; stage: string }[] = [
    { name: 'stage-1-new', seed: {}, stage: '1' },
    { name: 'stage-2-games', seed: { played: 4, grow: 8 }, stage: '2' },
    { name: 'stage-3-games', seed: { played: 14, grow: 40 }, stage: '3' },
    { name: 'stage-4-games', seed: { played: 32, grow: 90 }, stage: '4' },
  ];
  let lastCrown = 0;
  for (const s of stages) {
    const { page, errors, close } = await open(s.seed);
    const info = await homeInfo(page);
    check(info.stage === s.stage, `${s.name}: the earned stage renders (${info.stage})`);
    check(info.layers >= 1, `${s.name}: a crown layer is drawn`);
    check(info.crownW > lastCrown, `${s.name}: the crown is larger than the stage below (${info.crownW.toFixed(1)} > ${lastCrown.toFixed(1)})`);
    check(info.apples > 0, `${s.name}: the home bears apples`);
    check(noOverflow(page), `${s.name}: no horizontal scroll`);
    check(errors.length === 0, `${s.name}: no page errors (${errors.join(' | ')})`);
    await saveShot(page, s.name);
    lastCrown = info.crownW;
    await close();
  }

  // Campaign and games are the same ladder: 2 levels == 6 points == 4 finished games' worth.
  {
    const a = await open({ completed: ['first-growth', 'broken-ground'] });
    const b = await open({ played: 6 });
    const ia = await homeInfo(a.page);
    const ib = await homeInfo(b.page);
    check(ia.stage === '2' && ib.stage === '2', 'campaign levels and finished games climb the same ladder');
    check(Math.abs(ia.crownW - ib.crownW) < 1, 'the same stage draws identically whatever earned it');
    await a.close();
    await b.close();
  }

  // ---- the growth moment: once, finite, transform/opacity only --------------------------------
  {
    const { page, errors, close } = await open({ played: 4, grow: 8 }, { width: 390, height: 844 }, false);
    await page.waitForFunction(() => document.querySelector('.landmark.lm-growing'), undefined, { timeout: 5_000 });
    await saveShot(page, 'growing-stage-2-phone');
    await page.waitForTimeout(1100);
    const info = await homeInfo(page);
    const p = await probe(page);
    check(p.growing === 1, `growth plays exactly once (${p.growing})`);
    const animated = p.props.filter((x) => !['offset', 'easing', 'composite', 'computedOffset'].includes(x));
    check(animated.length > 0 && animated.every((x) => ['transform', 'opacity'].includes(x)), `growth is compositor-only (${animated.join(',') || 'none'})`);
    check(info.stage === '2' && info.layers === 1, 'the moment settles on one stage-2 crown');
    check(info.seen === JSON.stringify({ v: 1, stage: 2 }), `the seen flag is written once (${info.seen})`);
    check(await page.locator('.landmark.lm-growth-from').count() === 0, 'the leaving layer is removed');
    check(errors.length === 0, `no page errors during the moment (${errors.join(' | ')})`);

    // The next board (a reload is the harshest case) must NOT replay it.
    await page.reload();
    await page.waitForFunction(() => {
      const h = (window as any).__severgrow;
      return !!h && !!h.state() && !h.busy();
    }, undefined, { timeout: 90_000 });
    await page.waitForSelector('#starter-lottery', { state: 'hidden', timeout: 45_000 }).catch(() => undefined);
    await page.waitForTimeout(2200);
    const again = await probe(page);
    const info2 = await homeInfo(page);
    check(again.growing === 0, `the moment never replays on the next board (${again.growing})`);
    check(info2.stage === '2', 'the settled stage is still on the next board');
    await close();
  }

  // ---- Reduce motion settles immediately -----------------------------------------------------
  // (Speed Off is the same pure gate, covered by web/tests/home-growth.test.ts. The product
  // Settings hide the speed row and parseSettings pins 'normal', so it is not reachable here.)
  for (const [name, settings] of [['reduce-motion', { reduceMotion: true }]] as const) {
    const { page, errors, close } = await open({ played: 4, grow: 8, settings });
    const info = await homeInfo(page);
    const p = await probe(page);
    check(info.stage === '2', `${name}: the settled earned stage shows straight away`);
    check(p.growing === 0, `${name}: no growth moment plays`);
    check(info.seen === JSON.stringify({ v: 1, stage: 2 }), `${name}: the stage is still recorded, so it cannot replay later`);
    check(errors.length === 0, `${name}: no page errors`);
    await close();
  }

  // ---- an already-seen stage is settled from the first frame --------------------------------
  {
    const { page, close } = await open({ played: 4, grow: 8, seen: 2 });
    const info = await homeInfo(page);
    const p = await probe(page);
    check(info.stage === '2' && p.growing === 0, 'a stage recorded earlier is settled, never re-grown');
    await close();
  }

  // ---- in-match states win over the stage ---------------------------------------------------
  const dangerState = (): State => {
    const st = newMatch(219682080);
    const home = homeCoord(0, st.config);
    // Three enemy tiles on the human home's open sides: enough for danger (logic/home.ts).
    let placed = 0;
    for (const n of [
      { q: home.q + 1, r: home.r }, { q: home.q, r: home.r + 1 }, { q: home.q - 1, r: home.r + 1 },
      { q: home.q - 1, r: home.r }, { q: home.q, r: home.r - 1 }, { q: home.q + 1, r: home.r - 1 },
    ]) {
      const k = coordKey(n);
      if (!(k in st.board) || st.terrain[k] === 'rock') continue;
      st.board[k] = { owner: 1, strength: 1, root: false };
      if (++placed === 3) break;
    }
    return { ...st, phase: 'ACT', turnPlayer: 0, actor: 0 };
  };
  const ended = (winner: 0 | 1): State => {
    const st = newMatch(219682080);
    return { ...st, phase: 'GAME_OVER', result: { winner, reason: 'strangle', scores: [5, 11], strengths: [9, 17] } };
  };

  {
    const { page, errors, close } = await open({ played: 32, grow: 90, save: positionSave({ state: dangerState() }) });
    const info = await homeInfo(page);
    check(info.cls.includes('danger'), `danger is shown on the growing home (${info.cls})`);
    check(info.stage === '4', 'the mature stage is still known while in danger');
    const dim = await page.locator('.landmark.lm-tree').evaluate((el) => getComputedStyle(el.querySelector('.lm-growth')!).opacity);
    check(Number(dim) < 1, `the crown dims under danger (${dim})`);
    await saveShot(page, 'danger-stage-4-phone');
    check(errors.length === 0, `danger: no page errors (${errors.join(' | ')})`);
    await close();
  }
  {
    const { page, errors, close } = await open({ played: 32, grow: 90, save: positionSave({ state: ended(1) }) });
    await page.waitForSelector('#gameover:not([hidden])', { timeout: 20_000 }).catch(() => undefined);
    await page.evaluate(() => (document.getElementById('go-board') as HTMLButtonElement | null)?.click());
    await page.waitForTimeout(600);
    const info = await homeInfo(page);
    check(info.cls.includes('strangled'), `a strangled mature tree is strangled (${info.cls})`);
    const grey = await page.locator('.landmark.lm-tree .lm-growth-crown circle').first().evaluate((el) => getComputedStyle(el).fill);
    check(grey === 'rgb(143, 138, 131)', `the crown is withered grey (${grey})`);
    const apples = await page.locator('.landmark.lm-tree .lm-growth-apple').first().evaluate((el) => getComputedStyle(el).opacity);
    check(Number(apples) === 0, `the apples are gone (${apples})`);
    await saveShot(page, 'withered-stage-4-phone');
    check(errors.length === 0, `withered: no page errors (${errors.join(' | ')})`);
    await close();
  }
  {
    const { page, errors, close } = await open({ played: 32, grow: 90, save: positionSave({ state: ended(0) }) });
    await page.waitForSelector('#gameover:not([hidden])', { timeout: 20_000 }).catch(() => undefined);
    await page.evaluate(() => (document.getElementById('go-board') as HTMLButtonElement | null)?.click());
    await page.waitForTimeout(600);
    const cls = await page.locator('.landmark.lm-volcano').getAttribute('class');
    check(cls?.includes('strangled'), `the opponent's home is smothered (${cls})`);
    check(await page.locator('.landmark.lm-volcano .lm-growth').count() === 0, 'the opponent never grows');
    await saveShot(page, 'smothered-opponent-phone');
    check(errors.length === 0, `smothered: no page errors (${errors.join(' | ')})`);
    await close();
  }

  // ---- a tile still selects; the growth never eats a tap -------------------------------------
  {
    const { page, errors, close } = await open({ played: 32, grow: 90 });
    const pointer = await page.locator('.landmark.lm-tree .lm-growth').first().evaluate((el) => getComputedStyle(el).pointerEvents);
    check(pointer === 'none', `the growth layer is inert to pointers (${pointer})`);

    // A REAL tap path: draw from the deck if needed, pick a card, tap one of its target hexes.
    const phase = await page.evaluate(() => (window as any).__severgrow.state().phase);
    if (phase === 'DRAW') {
      await page.evaluate(() => document.getElementById('deck')?.click());
      await page.waitForFunction(() => (window as any).__severgrow.state().phase !== 'DRAW', undefined, { timeout: 20_000 });
    }
    const card = await page.evaluate(() => {
      const h = (window as any).__severgrow;
      const a = h.legal().find((x: { t: string }) => x.t === 'Sprout');
      return a ? (a.card as number) : null;
    });
    check(card !== null, 'a Grow is legal on the grown board');
    const before = await page.evaluate(() => (window as any).__severgrow.state().history.length);
    const point = await page.locator(`#hand [data-card="${card}"]`).evaluate((el) => {
      const r = el.getBoundingClientRect();
      for (const xf of [0.08, 0.2, 0.35, 0.5, 0.7, 0.9]) {
        for (const yf of [0.2, 0.45, 0.7, 0.85]) {
          const x = r.left + r.width * xf;
          const y = r.top + r.height * yf;
          if (document.elementFromPoint(x, y)?.closest('#hand .card') === el) return { x, y };
        }
      }
      return null;
    });
    check(point !== null, 'the card has an exposed surface');
    await page.mouse.click(point!.x, point!.y);
    const target = page.locator('.l-over .target').first();
    await target.waitFor({ timeout: 10_000 });
    const targetKey = await target.getAttribute('data-key');
    const hex = await page.locator(`.hex-cell[data-key="${targetKey}"] path.hex`).boundingBox();
    check(hex !== null, 'the target hex has a hitbox');
    await page.mouse.click(hex!.x + hex!.width / 2, hex!.y + hex!.height / 2);
    if (await page.locator('#confirm-play').isVisible().catch(() => false)) await page.click('#confirm-play');
    await page.waitForFunction(() => !(window as any).__severgrow.busy(), undefined, { timeout: 30_000 }).catch(() => undefined);
    const after = await page.evaluate(() => (window as any).__severgrow.state().history.length);
    check(after > before, `a tapped hex still selects and plays (${before} -> ${after})`);
    check(await page.locator('#board g.hex-cell').count() === 37, 'the 37 hexes are untouched');
    check(errors.length === 0, `tap path: no page errors (${errors.join(' | ')})`);
    await close();
  }

  // ---- desktop scale, every stage once more -------------------------------------------------
  for (const [name, seed, stage] of [
    ['stage-1-desktop', {}, '1'],
    ['stage-4-desktop', { played: 32, grow: 90 }, '4'],
  ] as const) {
    const { page, errors, close } = await open(seed, { width: 1280, height: 800 });
    const info = await homeInfo(page);
    check(info.stage === stage, `${name}: stage ${stage} at desktop scale`);
    await saveShot(page, name);
    check(errors.length === 0, `${name}: no page errors`);
    await close();
  }
} finally {
  await browser.close().catch(() => undefined);
  await new Promise<void>((r) => served.server.httpServer.close(() => r()));
}

console.log(`\n${checks} checks passed${SHOTS ? `; screenshots in ${SHOTS}/home-growth` : ''}`);
process.exit(0);
