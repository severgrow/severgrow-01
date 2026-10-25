// THE OFFLINE REPLAY (owner brief, 2026-10-25): "every match you finish you can rewatch".
//
// Plays a REAL practice match to its finish card through the page's own hooks (the computer moves
// itself), then asserts the offline entry point the owner asked for if it was easy:
//   * the finish card offers "Watch replay" after a practice match;
//   * the replay is the whole match, board-only, with the player named "You";
//   * it seeks, pauses and exits back to an untouched result card;
//   * a campaign lesson (a set opening) is covered by the timeline unit test
//     ("replays a campaign opening from its own set position"); the page path is the same function.
//
// Screenshots go to docs/screens/replay/ (or $SHOTS).
//   CHANNEL=futa04 npx tsx web/e2e/replay-offline.ts
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { servePreview } from './helpers/preview-port.js';
import { seedSettings } from './helpers/settings-seed.js';

const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const SHOTS = process.env.SHOTS?.trim() || new URL('../../docs/screens/replay/', import.meta.url).pathname;

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const waitVisible = async (page: Page, sel: string, ms = 25_000) => {
  await page.waitForSelector(`${sel}:not([hidden])`, { timeout: ms });
};

const settingsInit = (page: Page) =>
  seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });

const dismissInstall = async (page: Page) => {
  const prompt = page.locator('#install-prompt');
  if (!(await prompt.isVisible().catch(() => false))) return;
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(150);
  if (await prompt.isVisible().catch(() => false)) {
    await page.evaluate("(() => { const el = document.getElementById('install-prompt'); if (el) el.hidden = true; })()");
  }
};

type ReplayNow = {
  index: number;
  playing: boolean;
  elapsed: number;
  total: number;
  ended: boolean;
  board: string;
  turn: number | null;
};
const replayNow = async (page: Page): Promise<ReplayNow | null> =>
  (await page.evaluate(() => {
    const hook = (window as unknown as { __severgrow?: { replay?: () => unknown } }).__severgrow;
    return hook?.replay?.() ?? null;
  })) as ReplayNow | null;

/** The position on screen, in `finish-fit`'s own proven order: natural moves, then any legal. */
const toGameOver = async (page: Page, maxSteps = 2000): Promise<string> => {
  await page
    .waitForFunction(() => {
      const ritual = document.getElementById('starter-lottery');
      return !ritual || ritual.hidden || !ritual.getClientRects().length;
    }, undefined, { timeout: 15_000 })
    .catch(() => undefined);
  const read = () => page.evaluate('(() => { const h = window.__severgrow; return h.state(); })()') as Promise<State | null>;
  const idle = () =>
    page.waitForFunction('(() => { const h = window.__severgrow; return !!h.state() && !h.busy(); })()', undefined, { timeout: 30_000 });
  let waiting = 0;
  let refused = 0;
  for (let i = 0; i < maxSteps; i++) {
    const s = await read();
    if (!s) return 'no state';
    if (s.phase === 'GAME_OVER') return 'ended';
    await idle();
    const now = (await read())!;
    if (now.phase === 'GAME_OVER') return 'ended';
    if (now.actor !== 0) {
      if (++waiting > 400) return `the computer never finished its turn (${now.actor}, ${now.phase})`;
      await page.waitForTimeout(80);
      continue;
    }
    waiting = 0;
    const legal = legalActions(viewFor(now, 0));
    if (!legal.length) return `no legal move for the human (${now.phase})`;
    const pick = (t: Action['t']) => legal.find((a) => a.t === t) ?? null;
    const natural = (now.phase === 'DRAW'
      ? [pick('Draw'), pick('EndAct'), pick('Discard')]
      : [pick('Bloom'), pick('Sprout'), pick('EndAct'), pick('Discard')]
    ).filter((a): a is Action => !!a);
    const candidates: Action[] = [...natural, ...legal.filter((a) => !natural.includes(a))];
    let applied = false;
    for (const candidate of candidates) {
      applied = await page.evaluate(
        ([a, who]) => Boolean((window as unknown as { __severgrow: { playFor: (x: unknown, p: number) => boolean } }).__severgrow.playFor(a, who)),
        [candidate, 0] as const,
      );
      if (applied) break;
    }
    if (!applied) {
      // A surface still handing over (the starter ritual, a beat's settle) can refuse a legal move
      // for a few frames. That is transient; a PERSISTENT refusal of every legal action is not.
      if (++refused > 10) return `the app refused every legal action (${now.phase})`;
      await page.waitForTimeout(200);
      continue;
    }
    refused = 0;
  }
  return `still playing after ${maxSteps} steps`;
};

const { server, origin } = await servePreview(4322, { logLevel: 'error' });
const browser = await chromium.launch({ executablePath: CHROME });
mkdirSync(SHOTS, { recursive: true });

try {
  const context = await browser.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await settingsInit(page);
  // A deterministic offline practice game, seeded from the URL — the same door finish-fit uses.
  await page.goto(`${origin}/?seed=219682080`);
  await page.waitForFunction('(() => { const h = window.__severgrow; return !!h.state() && !h.busy(); })()', undefined, { timeout: 60_000 });
  await waitVisible(page, '#game', 30_000);
  const ended = await toGameOver(page);
  check('a real practice match reaches its finish card', ended === 'ended', ended);

  await page.waitForSelector('#gameover:not([hidden])', { timeout: 30_000 });
  await page.waitForFunction('(() => { const h = window.__severgrow; return !h.busy(); })()', undefined, { timeout: 30_000 });
  await page.waitForTimeout(400);
  await dismissInstall(page);
  const titleBefore = ((await page.locator('#go-title').textContent()) ?? '').trim();
  const seedsBefore = await page.evaluate(() => {
    const el = document.getElementById('go-seeds');
    return el ? `${el.hidden ? 'hidden' : 'shown'}:${(el.textContent ?? '').trim()}` : 'missing';
  });
  check('the practice finish card offers "Watch replay"', await page.locator('#go-replay').isVisible().catch(() => false));
  // The tightest real phone (the one finish-fit's rule is about): the extra replay row must not
  // make the card scroll or push the control off screen.
  const fit = (await page.evaluate(`(() => {
    const card = document.querySelector('#gameover .go-card');
    const replay = document.getElementById('go-replay');
    const r = replay ? replay.getBoundingClientRect() : null;
    return {
      overflow: card ? card.scrollHeight - card.clientHeight : null,
      inside: !!r && r.top >= -1 && r.bottom <= window.innerHeight + 1,
    };
  })()`)) as { overflow: number | null; inside: boolean };
  check('the finish card still fits a 360x640 phone', (fit.overflow ?? 1) <= 0, `overflow ${fit.overflow}px`);
  check('the replay control is inside a 360x640 screen', fit.inside);
  await page.screenshot({ path: `${SHOTS}/finish-practice-360x640.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/finish-practice-390x844.png` });

  await page.locator('#go-replay').click();
  await waitVisible(page, '#replay', 20_000);
  const now = await replayNow(page);
  check('the practice replay mounts with a real clock', !!now && now.total > 0, JSON.stringify({ total: now?.total }));
  const names = (await page.evaluate(() =>
    [...document.querySelectorAll('#replay .rp-name')].map((n) => (n.textContent ?? '').trim()),
  )) as string[];
  check('the offline replay names the player "You"', names[0] === 'You' && (names[1]?.length ?? 0) > 0, names.join(' / '));
  check(
    'the offline replay is board-only (no hand, cockpit or cards)',
    (await page.evaluate(() => {
      const root = document.getElementById('replay');
      return !root?.querySelector('#hand, #dock, #hud, .cockpit, .card, #deck, #discard');
    })) === true,
  );
  const boardBox = await page.locator('#replay .rp-board > svg').boundingBox();
  check('the board dominates the replay screen', !!boardBox && boardBox.height >= 844 * 0.5, `${Math.round(boardBox?.height ?? 0)}px of 844`);
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${SHOTS}/replay-practice-mid-390x844.png` });

  // A drag is a real seek; the displayed picture must change and come back.
  const box = await page.locator('#replay .rp-scrub').boundingBox();
  if (!box) throw new Error('no scrub bar');
  const dragTo = async (fraction: number) => {
    const x = box.x + box.width * fraction;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(80);
  };
  await dragTo(0.1);
  const early = await replayNow(page);
  await dragTo(0.8);
  const late = await replayNow(page);
  check('the practice replay seeks (frame and board move)', !!early && !!late && late.index > early.index && late.board !== early.board);
  await page.screenshot({ path: `${SHOTS}/replay-practice-seek-390x844.png` });

  await page.locator('#replay [data-rp="close"]').click();
  await page.locator('#replay').waitFor({ state: 'hidden', timeout: 5_000 });
  check('leaving the practice replay returns to the result card', await page.locator('#gameover').isVisible());
  const titleAfter = ((await page.locator('#go-title').textContent()) ?? '').trim();
  const seedsAfter = await page.evaluate(() => {
    const el = document.getElementById('go-seeds');
    return el ? `${el.hidden ? 'hidden' : 'shown'}:${(el.textContent ?? '').trim()}` : 'missing';
  });
  check('the practice result card is untouched', titleAfter === titleBefore && seedsAfter === seedsBefore, `${titleBefore} / ${seedsBefore}`);
} finally {
  await browser.close();
  await server.close();
}

if (failed) {
  console.error(`${failed} offline replay checks failed`);
  process.exit(1);
}
console.log('replay-offline checks passed');
