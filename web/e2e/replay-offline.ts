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
import { REPLAY_PACING } from '../src/replay/timeline.js';

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
    page.waitForFunction('(() => { const h = window.__severgrow; return !!h && !!h.state() && !h.busy(); })()', undefined, { timeout: 30_000 });
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
  await page.waitForFunction('(() => { const h = window.__severgrow; return !!h && !!h.state() && !h.busy(); })()', undefined, { timeout: 60_000 });
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
  // The owner's faster, move-aware curve (2026-10-30): the reported total is the new length and
  // never leaves the curve's stated floor/cap. A match this long used to read 50 s.
  check(
    'the practice replay reports the shorter, move-aware total',
    !!now && now.total >= REPLAY_PACING.minTotal && now.total <= REPLAY_PACING.maxTotal,
    `${((now?.total ?? 0) / 1000).toFixed(1)}s (was capped at 50.0s)`,
  );
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
  // The board itself (its hexes), not the SVG's box: the box also carries headroom for the homes,
  // and since 2026-10-30 it is sized to the hexes. On a phone the board is as WIDE as the screen
  // allows; the height test is for screens where the board is height-limited.
  const hexes = (await page.evaluate(() => {
    const r = [...document.querySelectorAll('#replay .rp-board svg .hex-cell')].map((c) => c.getBoundingClientRect());
    if (!r.length) return null;
    return { w: Math.max(...r.map((x) => x.right)) - Math.min(...r.map((x) => x.left)), h: Math.max(...r.map((x) => x.bottom)) - Math.min(...r.map((x) => x.top)) };
  })) as { w: number; h: number } | null;
  check(
    'the board dominates the replay screen',
    !!hexes && (hexes.w >= 390 * 0.85 || hexes.h >= 844 * 0.5),
    `${Math.round(hexes?.w ?? 0)}×${Math.round(hexes?.h ?? 0)}px on 390×844`,
  );
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${SHOTS}/replay-practice-mid-390x844.png` });

  // THE TURNING-POINT NOTCH is honest about this match: when the plan has no cut there is no
  // control at all (never one that does nothing); when it has one, the notch is present.
  const plan = (await page.evaluate(() => (window as unknown as { __severgrow?: { replayPlan?: () => unknown } }).__severgrow?.replayPlan?.() ?? null)) as
    | { turningPoint: { frame: number; tiles: number } | null }
    | null;
  const notchVisible = await page.locator('#replay [data-rp="turn"]').isVisible().catch(() => false);
  check(
    'the turning-point notch exists exactly when the match has a cut',
    !!plan && (plan.turningPoint ? notchVisible : !notchVisible),
    plan?.turningPoint ? `${plan.turningPoint.tiles} tiles at frame ${plan.turningPoint.frame}` : 'no cut',
  );

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

  // THE SPRITE WINDOWS STAY WINDOWS (owner screenshot, 2026-10-26): each strength stone and each
  // bonus hex's gold frame is a small nested <svg> cropping one picture out of an atlas. A replay
  // rule once sized and un-clipped EVERY svg on the board, so each window showed its whole atlas —
  // all nine stones on every tile, strips of three frames hanging off the board — and every check
  // above still passed. Measured, not eyeballed: no window is bigger than a hex, and all are clipped.
  const windows = (await page.evaluate(`(() => {
    const cell = document.querySelector('#replay .rp-board .hex-cell')?.getBoundingClientRect();
    const hex = cell ? Math.max(cell.width, cell.height) : 0;
    const measure = (sel) =>
      [...document.querySelectorAll('#replay .rp-board ' + sel)].map((n) => {
        // The window must keep the size its own attributes give it: CSS width/height stay 'auto'
        // (the bug set them to 100%, i.e. the whole board) and it stays clipped. The on-screen size
        // is then its attribute size times the screen scale. (getBoundingClientRect is no use here:
        // it reports the whole atlas inside the window, clipped or not.)
        const cs = getComputedStyle(n);
        const own = cs.width === 'auto' && cs.height === 'auto';
        const k = n.parentNode?.getScreenCTM?.()?.a ?? 1;
        const size = own ? Math.max(n.width.animVal.value, n.height.animVal.value) * k : Infinity;
        return { size, clipped: cs.overflow !== 'visible' };
      });
    return { hex, stones: measure('.seed-stone-art'), frames: measure('.gold-frame-art') };
  })()`)) as { hex: number; stones: { size: number; clipped: boolean }[]; frames: { size: number; clipped: boolean }[] };
  const worst = (list: { size: number }[]) => Math.round(Math.max(0, ...list.map((w) => w.size)));
  check(
    'every strength stone shows one number, clipped inside its hex',
    windows.hex > 0 && windows.stones.length > 0 && windows.stones.every((w) => w.clipped && w.size < windows.hex),
    `${windows.stones.length} stones, largest ${worst(windows.stones)}px vs hex ${Math.round(windows.hex)}px`,
  );
  check(
    'every gold frame is one frame, the size of its hex',
    windows.frames.length > 0 && windows.frames.every((w) => w.clipped && w.size <= windows.hex * 1.15),
    `${windows.frames.length} frames, largest ${worst(windows.frames)}px vs hex ${Math.round(windows.hex)}px`,
  );

  // THE CLEAN LAYOUT (owner, 2026-10-26): no "… to move" sentence on screen (whose move it is reads
  // from the lit name and its pip), only the 2-4 biggest moments on the bar, and futasaku.com signed
  // once in the footer. The turn line is still SPOKEN to a screen reader.
  const chrome = (await page.evaluate(`(() => {
    const r = document.getElementById('replay');
    const line = r.querySelector('.rp-turn');
    const box = line.getBoundingClientRect();
    const visibleText = [...r.querySelectorAll('*')].filter((n) => {
      const b = n.getBoundingClientRect();
      return n.childElementCount === 0 && b.width > 2 && b.height > 2 && /to move/i.test(n.textContent || '');
    }).length;
    const marks = [...r.querySelectorAll('[data-rp="moment"], [data-rp="turn"]:not([hidden])')];
    const live = [...r.querySelectorAll('.rp-name[data-live="1"]')].length;
    return {
      visibleText, spoken: /to move/i.test(line.textContent || '') && line.getAttribute('aria-live') === 'polite',
      lineBox: Math.round(box.width * box.height),
      marks: marks.length, ticks: r.querySelectorAll('.rp-tick').length, live,
      site: (r.querySelector('.rp-brand-site')?.textContent || '').trim(), brands: r.querySelectorAll('.rp-brand').length,
    };
  })()`)) as { visibleText: number; spoken: boolean; lineBox: number; marks: number; ticks: number; live: number; site: string; brands: number };
  check('no "to move" sentence is shown while the replay plays', chrome.visibleText === 0 && chrome.lineBox <= 1, JSON.stringify(chrome));
  check('the turn is still spoken to a screen reader', chrome.spoken);
  check('exactly one name is lit as the mover', chrome.live === 1, String(chrome.live));
  check('the bar marks 2-4 biggest moments, no hand-over hairs', chrome.marks >= 2 && chrome.marks <= 4 && chrome.ticks === 0, `${chrome.marks} marks, ${chrome.ticks} hairs`);
  check('futasaku.com signs the replay once', chrome.site === 'futasaku.com' && chrome.brands === 1, `${chrome.site} ×${chrome.brands}`);

  // THE MOMENT CAPTION: a tap on a pin lands on that play and names it over the board.
  const pin = page.locator('#replay [data-rp="moment"], #replay [data-rp="turn"]:not([hidden])').first();
  await pin.click();
  await page.waitForTimeout(350);
  const cap = (await page.evaluate(`(() => {
    const c = document.querySelector('#replay .rp-caption');
    const r = c.getBoundingClientRect();
    const b = document.querySelector('#replay .rp-board').getBoundingClientRect();
    return { show: c.dataset.show, opacity: getComputedStyle(c).opacity, eyebrow: c.querySelector('.rp-caption-eyebrow').textContent,
      line: c.querySelector('.rp-caption-line').textContent, inBoard: r.top >= b.top - 1 && r.bottom <= b.bottom && r.left >= b.left - 1 && r.right <= b.right + 1,
      taps: getComputedStyle(c).pointerEvents };
  })()`)) as { show: string; opacity: string; eyebrow: string; line: string; inBoard: boolean; taps: string };
  check(
    'a tap on a moment\'s pin names the play over the board',
    cap.show === '1' && Number(cap.opacity) > 0.9 && /(cut \d+ tiles?|\d+-point swing)/i.test(cap.line) && /^(\d\d \/ \d\d|turning point)$/i.test(cap.eyebrow.trim()),
    `${cap.eyebrow} · ${cap.line}`,
  );
  check('the caption sits inside the board and takes no taps', cap.inBoard && cap.taps === 'none', JSON.stringify(cap));
  await page.screenshot({ path: `${SHOTS}/replay-practice-moment-390x844.png` });
  await page.waitForTimeout(2800);
  check('the caption rests a beat, then fades', (await page.locator('#replay .rp-caption').getAttribute('data-show')) === '0');

  // THE END: jump near the finish and let it play out; the result is shown, and Replay again sits
  // over the foot of the finished board.
  await page.locator('#replay .rp-scrub').focus();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  if (!(await replayNow(page))?.playing) await page.keyboard.press('Space');
  await page.waitForFunction(`(() => document.getElementById('replay')?.dataset.ended === '1')()`, undefined, { timeout: 20_000 });
  await page.waitForTimeout(400);
  const result = ((await page.locator('#replay .rp-turn').textContent()) ?? '').trim();
  const resultBox = await page.locator('#replay .rp-turn').boundingBox();
  const againBox = await page.locator('#replay [data-rp="again"]').boundingBox();
  const boardBox2 = await page.locator('#replay .rp-board').boundingBox();
  check('the finished replay shows the result', /wins|draw/i.test(result) && !!resultBox && resultBox.height >= 12, result);
  check(
    'Replay again sits over the foot of the finished board, a 44px target',
    !!againBox && !!boardBox2 && againBox.height >= 44 && againBox.y + againBox.height <= boardBox2.y + boardBox2.height + 1 &&
      Math.abs(againBox.x + againBox.width / 2 - (boardBox2.x + boardBox2.width / 2)) <= 2,
    JSON.stringify(againBox),
  );
  const win = (await page.evaluate(`(() => {
    const r = document.getElementById('replay');
    const w = r.dataset.winner;
    const pts = [...r.querySelectorAll('.rp-pts')].map((n) => ({ seat: n.dataset.seat, color: getComputedStyle(n).color, op: getComputedStyle(n).opacity }));
    const names = [...r.querySelectorAll('.rp-name')].map((n) => ({ seat: n.dataset.seat, op: getComputedStyle(n).opacity }));
    return { w, pts, names, lineSeat: r.querySelector('.rp-turn').dataset.seat ?? null };
  })()`)) as { w: string; pts: { seat: string; color: string; op: string }[]; names: { seat: string; op: string }[]; lineSeat: string | null };
  const loserPts = win.pts.find((p) => p.seat !== win.w);
  const loserName = win.names.find((n) => n.seat !== win.w);
  check(
    'the winner pops: their side lit, the other side steps back, the result names them in their ink',
    win.w === 'draw' || (!!loserPts && Number(loserPts.op) < 0.5 && !!loserName && Number(loserName.op) < 0.5 && win.lineSeat === win.w),
    JSON.stringify(win),
  );
  await page.screenshot({ path: `${SHOTS}/replay-practice-end-390x844.png` });

  await page.locator('#replay [data-rp="close"]').click();
  await page.locator('#replay').waitFor({ state: 'hidden', timeout: 5_000 });
  check('leaving the practice replay returns to the result card', await page.locator('#gameover').isVisible());
  const titleAfter = ((await page.locator('#go-title').textContent()) ?? '').trim();
  const seedsAfter = await page.evaluate(() => {
    const el = document.getElementById('go-seeds');
    return el ? `${el.hidden ? 'hidden' : 'shown'}:${(el.textContent ?? '').trim()}` : 'missing';
  });
  check('the practice result card is untouched', titleAfter === titleBefore && seedsAfter === seedsBefore, `${titleBefore} / ${seedsBefore}`);

  // ---------- Reduce motion: same pacing, the board simply is the next position ----------
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('input[data-setting="reduceMotion"]');
    if (!input) throw new Error('no reduce-motion switch');
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.locator('#go-replay').click();
  await waitVisible(page, '#replay', 20_000);
  await page.waitForTimeout(900);
  const rm = await replayNow(page);
  check(
    'reduce motion keeps the pacing exactly in band',
    !!rm && rm.total > 0 && Math.abs(rm.total - (now?.total ?? 0)) <= 80,
    `${rm?.total} vs ${now?.total}`,
  );
  check(
    'reduce motion paints no crossfade or flight on the replay',
    (await page.evaluate(() => {
      const root = document.getElementById('replay');
      const inside = document
        .getAnimations()
        .filter((a) => a.playState === 'running')
        .filter((a) => {
          const effect = a.effect;
          const target = effect instanceof KeyframeEffect ? effect.target : null;
          return target instanceof Element && !!target.closest('#replay');
        });
      return (
        document.documentElement.classList.contains('reduce-motion') &&
        (root?.querySelectorAll('.hex-cell').length ?? 0) > 0 &&
        inside.length === 0
      );
    })) === true,
  );
  const beforeAdvance = (await replayNow(page))?.index ?? -1;
  await page.waitForTimeout(1_800);
  const afterAdvance = await replayNow(page);
  check(
    'reduce motion still advances the match',
    !!afterAdvance && afterAdvance.playing && afterAdvance.index > beforeAdvance,
    `${beforeAdvance} → ${afterAdvance?.index}`,
  );
  await page.screenshot({ path: `${SHOTS}/replay-practice-reduced-390x844.png` });
  await page.locator('#replay [data-rp="close"]').click();
  await page.locator('#replay').waitFor({ state: 'hidden', timeout: 5_000 });
} finally {
  await browser.close();
  await server.close();
}

if (failed) {
  console.error(`${failed} offline replay checks failed`);
  process.exit(1);
}
console.log('replay-offline checks passed');
