// THE REPLAY IN A REAL BROWSER (owner brief, 2026-10-25).
//
// This suite plays a REAL finished duel through the real server (both seats driven by the engine's
// own bot, so every move is legal and the log is exactly what production would hold), then watches
// its replay in Chromium at 390x844 and 1280x800 and asserts the owner's rules:
//
//   * the replay is BOARD ONLY — no hand, no cockpit, no cards, no guidance inside it;
//   * the names are on the players and the turn line changes at a hand-over;
//   * the scrub bar really seeks (the painted position changes, and coming back lands on the same
//     frame AND the same board);
//   * a tap pauses, a tap resumes, and the end offers "Replay again";
//   * leaving lands back on the result card, with its state (title + Seeds line) intact;
//   * a finished row in "Your matches" opens a past replay.
//
// Screenshots go to docs/screens/replay/ (or $SHOTS).
//   CHANNEL=futa04 npx tsx web/e2e/replay-duel.ts
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { chooseLevelAction } from '../../src/bots/levels.js';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { createHttpServer } from '../../server/src/http.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import type { PlayerRecord } from '../../server/src/storage/types.js';
import { servePreview } from './helpers/preview-port.js';
import { openMenuEntry, waitMenuEntry } from './helpers/menu-nav.js';
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

const waitVisible = async (page: Page, sel: string, ms = 20_000) => {
  await page.waitForSelector(`${sel}:not([hidden])`, { timeout: ms });
};

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

/** The player's own diagnostic hook: the frame on screen and the board actually painted. */
const replayNow = async (page: Page): Promise<ReplayNow | null> =>
  (await page.evaluate(() => {
    const hook = (window as unknown as { __severgrow?: { replay?: () => unknown } }).__severgrow;
    return hook?.replay?.() ?? null;
  })) as ReplayNow | null;

const boardSignature = async (page: Page): Promise<string> => (await replayNow(page))?.board ?? '';

type ReplayPlan = {
  total: number;
  names: [string, string];
  frames: { index: number; at: number; duration: number; turn: number; boundary: boolean; kind: string; board: string }[];
};

/** The player's own frame plan: the exact beat times, seats and board signatures it will paint. */
const replayPlan = async (page: Page): Promise<ReplayPlan | null> =>
  (await page.evaluate(() => {
    const hook = (window as unknown as { __severgrow?: { replayPlan?: () => unknown } }).__severgrow;
    return hook?.replayPlan?.() ?? null;
  })) as ReplayPlan | null;

/**
 * THE SEEK PROOF (owner brief: "a scrub bar … it must actually seek").
 *
 * Pick one EXACT hand-over beat from the player's own plan, drag the bar to the middle of that
 * beat's time slot, and then require all four things to name that same frame: the reported index,
 * the seat whose turn it is, the visible line (with that seat's name), and the painted board (its
 * signature must be the plan's signature for that frame — the position rebuilt from the log, not
 * the neighbouring frame's picture).
 */
const seekToTurnSwitch = async (page: Page): Promise<{ ok: boolean; note: string }> => {
  const box = await page.locator('#replay .rp-scrub').boundingBox();
  if (!box) return { ok: false, note: 'no scrub bar' };
  const plan = await replayPlan(page);
  const handovers = plan?.frames.filter((f) => f.kind === 'turn') ?? [];
  if (!plan || handovers.length === 0) return { ok: false, note: 'no turn hand-over in the plan' };
  const target = handovers[Math.floor(handovers.length / 2)]!;
  const x = box.x + box.width * ((target.at + target.duration / 2) / plan.total);
  const y = box.y + box.height / 2;
  // Hold the bar: `seek` runs on pointerdown and the clock stays still until pointerup, so the
  // frame, the name and the turn line are read from ONE position (no race with playback).
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(80);
  const at = await replayNow(page);
  const name = ((await page.locator(`#replay .rp-name[data-seat="${target.turn}"]`).textContent()) ?? '').trim();
  const line = ((await page.locator('#replay .rp-turn').textContent()) ?? '').trim();
  const lineSeat = await page.getAttribute('#replay .rp-turn', 'data-seat');
  await page.mouse.up();
  const ok =
    !!at &&
    at.index === target.index &&
    at.turn === target.turn &&
    at.board === target.board &&
    name.length > 0 &&
    line.includes(name) &&
    Number(lineSeat) === target.turn;
  return {
    ok,
    note: `frame ${at?.index}/${target.index}, seat ${at?.turn}/${target.turn}, name "${name}", line "${line}", lineSeat ${lineSeat}, boardMatch ${at?.board === target.board}`,
  };
};

/** Settings for a fast, quiet run; motion ON, so the replay's crossfade path is the one measured. */
const settingsInit = () => {
  localStorage.clear();
  localStorage.setItem(
    'main2:severgrow.settings.v1',
    JSON.stringify({ sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false }),
  );
};

const buildWithApi = async (apiBase: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
      env: { ...process.env, CHANNEL: 'futa04', VITE_DUEL_API_URL: apiBase },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    child.stderr?.on('data', (b: Buffer) => {
      err += String(b);
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`web:build failed: ${err}`))));
  });

/**
 * The bearer token the page's own identity store holds.
 *
 * The product prefixes every storage KEY at boot by patching `Storage.prototype` (web/src/channel.ts),
 * so an unprefixed read here goes through the product's own slot and needs no knowledge of the
 * channel prefix. The body is a STRING because the bundler's name-preserving transform would
 * otherwise inject a `__name` helper the page does not have. The value is only ever READ.
 */
const tokenOf = async (page: Page): Promise<string | null> => {
  const token = await page.evaluate(
    `(() => { try {
       const id = JSON.parse(localStorage.getItem('severgrow.duel.identity.v1') || 'null');
       return id && typeof id.token === 'string' && id.token.length > 0 ? id.token : null;
     } catch { return null; } })()`,
  );
  return typeof token === 'string' && token.length > 0 ? token : null;
};

const storage = new MemoryStorage();
const service = new MatchService({
  storage,
  config: { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'], turnTimeoutMs: 3_600_000 },
});
const apiServer = createHttpServer({ service, config: { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'] } });
await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}`;
console.log(`local duel API on ${apiBase}`);
await buildWithApi(apiBase);

const { server: previewServer, origin } = await servePreview(4311, { logLevel: 'error' });
console.log(`preview at ${origin}`);
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(`${origin}/`);
    if (res.ok || res.status === 404) break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}

const browser = await chromium.launch({ executablePath: CHROME });
mkdirSync(SHOTS, { recursive: true });

/** Play both seats through the real API until the duel finishes (or a cap, then an honest resign). */
const playDuel = async (matchId: string, a: PlayerRecord, b: PlayerRecord, cap = 260): Promise<number> => {
  let commits = 0;
  for (let i = 0; i < cap; i++) {
    const viewA = await service.viewPayload(a, matchId);
    if (viewA.status !== 'active') break;
    const actor = viewA.actor === 0 ? a : b;
    const view = await service.viewPayload(actor, matchId);
    if (view.status !== 'active' || view.legalActions.length === 0) break;
    // The engine's own bot picks from that player's legal list: every move is real and legal.
    const action = chooseLevelAction(view.view, 4, 1000 + i);
    await service.submitAction(actor, matchId, {
      expectedRevision: view.revision,
      requestId: `e2e-${matchId.slice(0, 8)}-${i}`,
      action,
    });
    commits += 1;
  }
  const end = await service.viewPayload(a, matchId);
  if (end.status === 'active') await service.resign(b, matchId);
  return commits;
};

try {
  // ---------- two phones: create + join ----------
  const contextA = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const pageA = await contextA.newPage();
  await pageA.addInitScript(settingsInit);
  await pageA.goto(origin);
  await waitVisible(pageA, '#menu');
  await waitMenuEntry(pageA, 'menu-online', { timeout: 25_000 });
  await openMenuEntry(pageA, 'menu-online');
  await waitVisible(pageA, '#online-hub');
  const firstOk = pageA.locator('#online-first-ok');
  if (await firstOk.isVisible().catch(() => false)) await firstOk.click();
  await pageA.click('#online-create');
  await pageA.waitForSelector('#online-waiting:not([hidden]), #game:not([hidden])', { timeout: 30_000 });
  const invite = ((await pageA.locator('#online-invite-code').textContent().catch(() => '')) ?? '').trim();
  if (!invite) throw new Error('no invite code');

  const contextB = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const pageB = await contextB.newPage();
  await pageB.addInitScript(settingsInit);
  await pageB.goto(origin);
  await waitVisible(pageB, '#menu');
  await waitMenuEntry(pageB, 'menu-online', { timeout: 25_000 });
  await openMenuEntry(pageB, 'menu-online');
  await waitVisible(pageB, '#online-hub');
  const firstOkB = pageB.locator('#online-first-ok');
  if (await firstOkB.isVisible().catch(() => false)) await firstOkB.click();
  await pageB.click('#online-join-open');
  await waitVisible(pageB, '#online-join');
  await pageB.fill('#online-join-code', invite);
  await pageB.click('#online-join-submit');
  await waitVisible(pageB, '#game', 30_000);
  await waitVisible(pageA, '#game', 30_000);
  check('two phones are in a real duel', true);

  const [tokenA, tokenB] = [await tokenOf(pageA), await tokenOf(pageB)];
  if (!tokenA || !tokenB) throw new Error('no tokens');
  const [a, b] = [await service.authenticate(tokenA), await service.authenticate(tokenB)];
  const matchId = (await pageA.evaluate('window.__severgrow.online().matchId')) as string;
  const commits = await playDuel(matchId, a, b);
  const moves = (await storage.movesOf(matchId, 0)).length;
  const finished = await service.viewPayload(a, matchId);
  console.log(`duel finished: ${commits} commits, ${moves} stored moves, status=${finished.status}`);
  check('the duel is a real finished match with a full move log', finished.status === 'finished' && moves > 8, `${moves} moves`);

  // ---------- the finish card offers the replay ----------
  // The plate now waits for the BOARD, not a clock (the final move is seen first, owner
  // 2026-10-25). This harness commits a whole duel through the API in a couple of seconds, so the
  // page is legitimately far behind a real two-phone pace and drains the backlog at Skip speed
  // before the plate may rise; the budget honours that, and the wait prints what it took.
  const cardWaited = Date.now();
  await pageA.waitForFunction(
    () => {
      const go = document.getElementById('gameover');
      return !!go && !go.hidden;
    },
    undefined,
    { timeout: 120_000 },
  );
  console.log(`finish card after ${((Date.now() - cardWaited) / 1000).toFixed(1)}s of catch-up`);
  await dismissInstall(pageA);
  await pageB
    .waitForFunction(() => {
      const go = document.getElementById('gameover');
      return !!go && !go.hidden;
    }, undefined, { timeout: 120_000 })
    .catch(() => undefined);
  const goTitleBefore = ((await pageA.locator('#go-title').textContent()) ?? '').trim();
  const goSeedsBefore = await pageA.evaluate(() => {
    const el = document.getElementById('go-seeds');
    return el ? `${el.hidden ? 'hidden' : 'shown'}:${(el.textContent ?? '').trim()}` : 'missing';
  });

  const replayButton = pageA.locator('#go-replay');
  check('the finish card shows the replay control', await replayButton.isVisible().catch(() => false));
  const buttonText = ((await pageA.locator('#go-replay').textContent()) ?? '').replace(/\s+/g, ' ').trim();
  check('the control is named "Watch replay"', /Watch replay/i.test(buttonText), buttonText);
  check(
    'the control carries a real drawn icon (not a glyph)',
    await pageA.evaluate(() => !!document.querySelector('#go-replay .i svg path, #go-replay .i svg circle')),
  );
  await pageA.screenshot({ path: `${SHOTS}/finish-390x844.png` });

  // ---------- open the replay ----------
  await replayButton.click();
  await waitVisible(pageA, '#replay', 20_000);
  const mounted = await replayNow(pageA);
  check('the replay mounts and its clock runs', !!mounted && mounted.total > 0, JSON.stringify(mounted));
  const total = mounted?.total ?? 0;
  console.log(`replay total: ${(total / 1000).toFixed(1)}s`);
  check(
    `the whole replay lands on the ${REPLAY_PACING.minTotal / 1000}-${REPLAY_PACING.maxTotal / 1000} s curve`,
    total >= REPLAY_PACING.minTotal && total <= REPLAY_PACING.maxTotal + 1_000,
    `${(total / 1000).toFixed(1)}s`,
  );

  // ---------- board only ----------
  const leaks = (await pageA.evaluate(() => {
    const root = document.getElementById('replay');
    if (!root) return ['no #replay'];
    const bad = ['#hand', '#dock', '#hud', '#futa04-box', '.cockpit', '#tool-replay', '#deck', '#discard', '#futasaku-glass', '.card'];
    return bad.filter((sel) => root.querySelector(sel));
  })) as string[];
  check('the replay contains no hand, cockpit, cards, deck, dock or guidance', leaks.length === 0, leaks.join(','));
  check(
    'the replay is its own full surface, not painted inside the game shell',
    await pageA.evaluate(() => {
      const r = document.getElementById('replay');
      return !!r && r.parentElement === document.body && !r.closest('#game');
    }),
  );

  // ---------- the names and the turn line ----------
  const names = (await pageA.evaluate(() =>
    [...document.querySelectorAll('#replay .rp-name')].map((n) => (n.textContent ?? '').trim()),
  )) as string[];
  check('both players are named on the replay', names.length === 2 && names.every((n) => n.length > 0), names.join(' / '));
  const turnText = ((await pageA.locator('#replay .rp-turn').textContent()) ?? '').trim();
  check('the turn line names whose turn it is', /to move/i.test(turnText), turnText);
  check(
    'the FUTASAKU mark is in the footer',
    await pageA.evaluate(() => !!document.querySelector('#replay .rp-brand')),
  );

  // ---------- mid-replay and the turn switch ----------
  await pageA.waitForTimeout(1200);
  await pageA.screenshot({ path: `${SHOTS}/replay-mid-390x844.png` });
  const switched = await seekToTurnSwitch(pageA);
  check('a seek to a turn hand-over paints that exact frame and names the player', switched.ok, switched.note);
  await pageA.waitForTimeout(420);
  await pageA.screenshot({ path: `${SHOTS}/replay-turn-390x844.png` });

  // ---------- scrubbing really seeks ----------
  const scrub = pageA.locator('#replay .rp-scrub');
  const box = await scrub.boundingBox();
  if (!box) throw new Error('no scrub bar');
  const tapBoard = async () => {
    await pageA.mouse.click(box.x + box.width * 0.35, box.y - 140); // on the board, not on a control
    await pageA.waitForTimeout(140);
    return replayNow(pageA);
  };
  const dragTo = async (fraction: number) => {
    const x = box.x + box.width * fraction;
    const y = box.y + box.height / 2;
    await pageA.mouse.move(x, y);
    await pageA.mouse.down();
    await pageA.mouse.move(x, y, { steps: 3 });
    await pageA.mouse.up();
  };

  // Hold the picture still first, then sample two positions far apart. Each sample reads BOTH the
  // frame and the board actually painted (the player rebuilds it from the log on a drag).
  if ((await replayNow(pageA))?.playing) await tapBoard();
  await dragTo(0.15);
  const atEarly = await replayNow(pageA);
  const boardEarly = await boardSignature(pageA);
  await dragTo(0.7);
  const atLate = await replayNow(pageA);
  const boardLate = await boardSignature(pageA);
  check('scrubbing to 15% lands on an early frame', !!atEarly && atEarly.index > 0 && atEarly.index < (atLate?.index ?? 0), `${atEarly?.index}`);
  check('scrubbing to 70% lands on a later frame', !!atLate && !!atEarly && atLate.index > atEarly.index, `${atEarly?.index} → ${atLate?.index}`);
  check('the painted board changed with the seek (not just the clock)', !!boardEarly && !!boardLate && boardEarly !== boardLate);
  await dragTo(0.15);
  const backEarly = await replayNow(pageA);
  check('seeking back to the same point restores the same frame', !!backEarly && !!atEarly && backEarly.index === atEarly.index, `${backEarly?.index} vs ${atEarly?.index}`);
  check('the same point paints the same board', (await boardSignature(pageA)) === boardEarly);
  check('a drag from a paused replay leaves it paused', !!backEarly && !backEarly.playing);
  await pageA.screenshot({ path: `${SHOTS}/replay-scrub-paused-390x844.png` });

  // ---------- tap to pause / tap to resume; a drag while playing carries on ----------
  const resumed = await tapBoard();
  check('a tap on the board starts playback', !!resumed && resumed.playing);
  await dragTo(0.55);
  await pageA.waitForTimeout(250);
  const carried = await replayNow(pageA);
  check('releasing the scrub bar carries on from the seeked frame', !!carried && carried.playing, JSON.stringify(carried));
  const paused = await tapBoard();
  check('a second tap pauses playback', !!paused && !paused.playing);

  // ---------- the end: Replay again ----------
  await dragTo(0.99);
  await tapBoard(); // resume from the last beat (a drag from paused holds the picture)
  await pageA.waitForSelector('#replay[data-ended="1"]', { timeout: 20_000 });
  check('the end of the replay offers "Replay again"', await pageA.locator('#replay [data-rp="again"]').isVisible());
  await pageA.screenshot({ path: `${SHOTS}/replay-end-390x844.png` });
  await pageA.locator('#replay [data-rp="again"]').click();
  // Restart and pause in ONE task: the clock only advances on rAF, so this reads the true first
  // beat instead of a load-dependent time. The pause is the product's own stage handler.
  const restarted = (await pageA.evaluate(() => {
    document.querySelector<HTMLElement>('#replay [data-rp="again"]')?.click();
    document.querySelector('#replay .rp-stage')?.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', clientX: 8, clientY: 8 }),
    );
    const hook = (window as unknown as { __severgrow?: { replay?: () => unknown } }).__severgrow;
    return hook?.replay?.() ?? null;
  })) as ReplayNow | null;
  check(
    'Replay again starts from the first beat',
    !!restarted && restarted.ended === false && restarted.playing === false && restarted.index === 0 && restarted.elapsed === 0,
    JSON.stringify(restarted),
  );

  // ---------- exit returns to the untouched result card ----------
  await pageA.locator('#replay [data-rp="close"]').click();
  await pageA.locator('#replay').waitFor({ state: 'hidden', timeout: 5_000 });
  const goTitleAfter = ((await pageA.locator('#go-title').textContent()) ?? '').trim();
  check('leaving the replay returns to the result card', await pageA.locator('#gameover').isVisible());
  check('the result card kept its outcome', goTitleAfter === goTitleBefore, `${goTitleBefore} → ${goTitleAfter}`);
  const goSeedsAfter = await pageA.evaluate(() => {
    const el = document.getElementById('go-seeds');
    return el ? `${el.hidden ? 'hidden' : 'shown'}:${(el.textContent ?? '').trim()}` : 'missing';
  });
  check('the result card kept its Seeds line unchanged', goSeedsAfter === goSeedsBefore, `${goSeedsBefore} → ${goSeedsAfter}`);

  // ---------- the same replay at desktop size ----------
  await pageA.setViewportSize({ width: 1280, height: 800 });
  await pageA.waitForTimeout(350);
  await pageA.screenshot({ path: `${SHOTS}/finish-1280x800.png` });
  await pageA.locator('#go-replay').click();
  await waitVisible(pageA, '#replay', 10_000);
  await pageA.waitForTimeout(1400);
  await pageA.screenshot({ path: `${SHOTS}/replay-mid-1280x800.png` });
  check('the replay opens at desktop size too', await pageA.locator('#replay .rp-board > svg').isVisible());
  await pageA.locator('#replay [data-rp="close"]').click();
  await pageA.locator('#replay').waitFor({ state: 'hidden', timeout: 5_000 });

  // ---------- the past-ten entry point: a finished row in Your matches ----------
  if (await pageB.locator('#replay').isVisible().catch(() => false)) {
    await pageB.locator('#replay [data-rp="close"]').click().catch(() => undefined);
    await pageB.locator('#replay').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
  }
  await dismissInstall(pageB);
  const backToMatches = pageB.locator('#go-other');
  if (await backToMatches.isVisible().catch(() => false)) await backToMatches.click();
  await pageB.waitForSelector('#online-hub:not([hidden])', { timeout: 30_000 });
  // "Your matches" is a closed disclosure by default; open it before tapping a finished row.
  if (await pageB.locator('#online-matches-panel').isHidden()) {
    await pageB.locator('#online-matches-toggle').click();
  }
  await pageB.waitForSelector('#online-matches .bucket-finished', { timeout: 30_000 });
  const finishedRow = pageB.locator('#online-matches .bucket-finished').first();
  const rowWord = ((await finishedRow.locator('.online-row-status').textContent()) ?? '').trim();
  check('a finished duel’s row says it opens the replay', /Watch replay/i.test(rowWord), rowWord);
  await finishedRow.click();
  await waitVisible(pageB, '#replay', 20_000);
  check('a past duel opens its replay from the match list', await pageB.locator('#replay .rp-board > svg').isVisible());
  await pageB.waitForTimeout(900);
  await pageB.screenshot({ path: `${SHOTS}/replay-past-390x844.png` });
  await pageB.locator('#replay [data-rp="close"]').click();
  await pageB.locator('#replay').waitFor({ state: 'hidden', timeout: 5_000 });
  check('leaving a past replay returns to the match list', await pageB.locator('#online-hub').isVisible());
} finally {
  await browser.close();
  await previewServer.close();
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
}

if (failed) {
  console.error(`${failed} replay checks failed`);
  process.exit(1);
}
console.log('replay-duel checks passed');
