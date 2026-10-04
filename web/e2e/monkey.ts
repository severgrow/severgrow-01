// The monkey: hundreds of random taps, drags, long-presses, clicks and keys on the real page,
// on a phone (touch) and a desktop (mouse), with a fixed random seed (so a failure can be
// replayed). After every action it checks: no page error, the page never stays busy, the
// game state passes the engine's own invariants (no tile on rock or off the board, roots in
// place, strengths 1-9, every tile joined to its root, no card in two places), and when the
// page is idle the board shows exactly the tiles the state has. Games that end start again.
//   npx tsx web/e2e/monkey.ts [--steps=400] [--seed=7] [--only=phone|desktop]   (MONKEY_TRACE=1 prints each step)
// Needs a built page (npm run web:build) and Chromium (PW_CHROMIUM=/path/to/chrome).
import { chromium } from 'playwright-core';
import type { CDPSession, Page } from 'playwright-core';
import { preview } from 'vite';
import { createCards, mulberry32 } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';
import { checkState } from '../../src/sim/invariants.js';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const STEPS = Number(arg('steps') ?? 400);
const SEED = Number(arg('seed') ?? 7);
const ONLY = arg('only'); // 'phone' or 'desktop'
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4191, strictPort: true }, logLevel: 'silent' });
const BASE = 'http://localhost:4191/';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const failures: string[] = [];

type Hook = { state: () => State | null; busy: () => boolean };
/** The page's state (null while the page is loading, e.g. after a reload). */
const hook = async (page: Page): Promise<{ state: State | null; busy: boolean }> => {
  for (let i = 0; i < 50; i++) {
    const r = await page
      .evaluate(() => {
        const h = (window as unknown as { __severgrow?: Hook }).__severgrow;
        return h ? { state: h.state(), busy: h.busy() } : null;
      })
      .catch(() => null);
    if (r) return r;
    await page.waitForTimeout(100);
  }
  return { state: null, busy: false };
};

/** The engine's invariants on the page's state (cards that left the hands, deck and pile count as played). */
const invariants = (s: State): string | null => {
  const seen = new Set([...s.hands[0], ...s.hands[1], ...s.deck, ...s.discard].map((c) => c.id));
  const played = new Set(createCards(s.config).map((c) => c.id).filter((id) => !seen.has(id)));
  try {
    checkState(s, played, undefined, 10_000);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};

const run = async (name: string, touch: boolean, seed: number) => {
  const rand = mulberry32(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const vp = touch ? { width: 390, height: 844 } : { width: 1280, height: 800 };
  const page = await browser.newPage({ viewport: vp, hasTouch: touch, isMobile: touch });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // the game must never leave its page (a sideways swipe once made the browser "go back")
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame() && f.url() !== BASE) errors.push(`the page went to ${f.url().slice(0, 60)}`);
  });
  page.on('crash', () => errors.push('the page crashed'));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('severgrow.settings.v1', JSON.stringify({ sound: false, coach: false, speed: 'skip' }));
  });
  await page.goto(BASE);
  await page.click('#menu-new');
  await page.click('#level-grid [data-level="3"]');
  const cdp: CDPSession | null = touch ? await page.context().newCDPSession(page) : null;
  const touchAt = async (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
    cdp!.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const hexes = async () => page.locator('.hex-cell').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
  const visible = (sel: string) => page.locator(sel).evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null && !(e as HTMLButtonElement).disabled).map((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
  const tap = async (p: { x: number; y: number }) => {
    if (touch) {
      await touchAt('touchStart', p.x, p.y);
      await touchAt('touchEnd');
    } else await page.mouse.click(p.x, p.y);
  };
  let games = 0;
  let moves = 0;
  const kinds: Record<string, number> = {};
  const log: string[] = [];
  for (let step = 0; step < STEPS; step++) {
    // wait out animations (skip is on, so they are short); a page that stays busy is stuck
    const t0 = Date.now();
    let h = await hook(page);
    while (h.busy && Date.now() - t0 < 20_000) {
      await page.waitForTimeout(100);
      h = await hook(page);
    }
    if (h.busy) {
      failures.push(`${name} step ${step}: busy for 20 s`);
      break;
    }
    const s = h.state;
    if (s) {
      const bad = invariants(s);
      if (bad) failures.push(`${name} step ${step}: invariant: ${bad}`);
      const real = Object.values(s.board).filter((t) => t).length;
      let shown = await page.locator('.l-tiles .tile').count();
      if (shown !== real) {
        // give a redraw a moment; only a board that stays wrong is a failure
        await page.waitForTimeout(600);
        shown = await page.locator('.l-tiles .tile').count();
        const now = (await hook(page)).state;
        const realNow = now ? Object.values(now.board).filter((t) => t).length : real;
        if (shown !== realNow) {
          const keys = await page.locator('.l-tiles .tile').evaluateAll((els) => els.map((e) => e.getAttribute('data-key')));
          const extra = keys.filter((k) => !now?.board[k!]);
          failures.push(`${name} step ${step}: board shows ${shown} tiles, state has ${realNow}; extra ${extra.join(' ')}; last actions: ${log.slice(-6).join(' > ')}`);
        }
      }
      if (s.phase === 'GAME_OVER') {
        games++;
        moves += s.history?.length ?? 0;
        await page.locator('#go-rematch:visible, #moves .btn.primary:visible').first().click({ timeout: 3000 }).catch(async () => {
          await page.keyboard.press('Escape');
        });
        continue;
      }
    }
    // a random action, weighted towards the things a player does most
    const roll = rand();
    let kind = '';
    if (roll < 0.25) {
      kind = 'tap hex';
      const hs = await hexes();
      if (hs.length) await tap(pick(hs));
    } else if (roll < 0.42) {
      kind = 'tap card';
      const cs = await visible('#hand [data-card]');
      if (cs.length) await tap(pick(cs));
    } else if (roll < 0.62) {
      kind = 'tap button';
      const bs = await visible('#moves button, #confirm button, #tooltip button, #deck, #discard, #first-tip-ok');
      if (bs.length) await tap(pick(bs));
    } else if (roll < 0.8) {
      kind = 'drag';
      const hs = await hexes();
      if (hs.length) {
        const path = Array.from({ length: 2 + Math.floor(rand() * 3) }, () => pick(hs));
        if (touch) {
          await touchAt('touchStart', path[0]!.x, path[0]!.y);
          for (let i = 1; i < path.length; i++) await touchAt('touchMove', path[i]!.x, path[i]!.y);
          // sometimes lift outside the board, sometimes a second finger
          if (rand() < 0.1) await touchAt('touchMove', 5, vp.height - 5);
          await touchAt('touchEnd');
        } else {
          await page.mouse.move(path[0]!.x, path[0]!.y);
          await page.mouse.down({ button: rand() < 0.05 ? 'right' : 'left' });
          for (let i = 1; i < path.length; i++) await page.mouse.move(path[i]!.x, path[i]!.y, { steps: 3 });
          await page.mouse.up();
        }
      }
    } else if (roll < 0.86) {
      kind = 'long press';
      const hs = await hexes();
      if (hs.length && touch) {
        const p = pick(hs);
        await touchAt('touchStart', p.x, p.y);
        await page.waitForTimeout(520);
        await touchAt('touchEnd');
      } else if (hs.length) {
        const p = pick(hs);
        await page.mouse.move(p.x, p.y);
      }
    } else if (roll < 0.92) {
      kind = 'key';
      await page.focus('#board').catch(() => {});
      await page.keyboard.press(pick(['Escape', 'Enter', 'Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '1', '3']));
    } else if (roll < 0.95) {
      kind = 'undo or cancel';
      await page.locator('#tool-undo:enabled, #moves .cancel:visible, #confirm-cancel:visible').first().click({ timeout: 500 }).catch(() => {});
    } else {
      kind = 'menu round trip';
      await page.click('#hud-history').catch(() => {});
      await page.keyboard.press('Escape');
    }
    kinds[kind] = (kinds[kind] ?? 0) + 1;
    if (process.env.MONKEY_TRACE) console.error(`${name} ${step} ${kind}`);
    log.push(`${kind}@${(await hook(page)).state?.phase ?? '-'}`);
    await page.waitForTimeout(30);
    if (errors.length) {
      failures.push(`${name} step ${step} (${kind}): ${errors.splice(0).join(' | ')}`);
      if (failures.length > 5) break;
    }
  }
  const s = (await hook(page)).state;
  moves += s?.history?.length ?? 0;
  console.log(`${name}: ${STEPS} random actions (${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ')}); ${games} games finished; ${moves} moves played`);
  await page.close();
  return moves;
};

const m1 = ONLY === 'desktop' ? 0 : await run('phone (touch)', true, SEED);
const m2 = ONLY === 'phone' ? 0 : await run('desktop (mouse)', false, SEED + 1);
if (m1 + m2 < (ONLY ? 10 : 20)) failures.push(`too few moves played (${m1 + m2}): the monkey never got going`);
await browser.close();
await server.close();
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(failures.length ? `\nmonkey: ${failures.length} problem(s)` : '\nmonkey: no problems');
process.exit(failures.length ? 1 : 0);
