// THE TURN RIM LIGHTS WHEN THE MOVE IS TAPPABLE — proof in a real browser, for every mode the
// owner named: an offline practice match (with its pre-game ceremony), an online duel (two
// contexts, the real local service) and an offline Blitz match. Online Blitz runs the same
// `OnlineSession`, board and publisher as a normal duel, so the duel scenario covers its gate.
//
//   CHANNEL=futa04 npm run web:build        # the offline part serves web/dist
//   npx tsx web/e2e/futa04-turn-rim.ts
//
// Frames go to /tmp/turnrim/ with a JSON dump of every rim write and every animation-frame sample,
// so "it stayed dark while their cards landed" is evidence, not an opinion.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { startingPlayerFor } from '../../src/engine/index.js';
import { servePreview } from './helpers/preview-port.js';
import { assertDistChannel } from './helpers/dist-channel.js';
import { endTurnViaPage, openDuel, openSeat, sleep, startLocalDuel, statePhase, tapExposed, waitIdle } from './helpers/local-duel.js';

const SHOTS = '/tmp/turnrim';
mkdirSync(SHOTS, { recursive: true });
const CHROME = process.env.PW_CHROMIUM
  ?? '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

let checks = 0;
const check = (ok: unknown, name: string): void => {
  assert.ok(ok, name);
  checks++;
  console.log(`  ok  ${name}`);
};

// ---- the page probe ---------------------------------------------------------------------------
// A per-frame sample of what the board says, plus a MutationObserver on the rim's own writes.
// A STRING, not a function: tsx/esbuild's `__name` helper cannot cross into the page, and a passed
// function would die on its first inner arrow (this suite's first run proved it: 0 samples).
const PROBE = `(() => {
  const w = window;
  const list = (w.__rimSamples ??= []);
  const writes = (w.__rimWrites ??= []);
  const snap = () => {
    const h = w.__severgrow;
    const s = h?.state?.() ?? null;
    const o = h?.online?.() ?? null;
    return {
      t: Math.round(performance.now()),
      epoch: Date.now(),
      rim: document.body?.dataset.turn ?? '',
      actor: s ? s.actor : -1,
      phase: s ? s.phase : '',
      busy: h ? !!h.busy?.() : false,
      ceremony: !document.getElementById('starter-lottery')?.hidden,
      revealing: o ? o.revealing : null,
      myTurn: o ? o.myTurn : null,
      serverActor: o ? o.serverActor : null,
    };
  };
  const observe = () => {
    if (!document.body) return void setTimeout(observe, 10);
    new MutationObserver(() => writes.push(snap())).observe(document.body, { attributes: true, attributeFilter: ['data-turn'] });
  };
  observe();
  const tick = () => {
    if (w.__severgrow && document.body) list.push(snap());
    if (list.length > 40_000) list.splice(0, 20_000);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`;

type Sample = {
  t: number; epoch: number; rim: string; actor: number; phase: string; busy: boolean; ceremony: boolean;
  revealing: boolean | null; myTurn: boolean | null; serverActor: number | null;
};
const snapNow = (page: Page): Promise<Sample> => page.evaluate(() => {
  const h = (window as any).__severgrow;
  const s = h?.state?.() ?? null;
  const o = h?.online?.() ?? null;
  return {
    t: Math.round(performance.now()),
    epoch: Date.now(),
    rim: document.body.dataset.turn ?? '',
    actor: s ? s.actor : -1,
    phase: s ? s.phase : '',
    busy: h ? !!h.busy() : false,
    ceremony: !document.getElementById('starter-lottery')?.hidden,
    revealing: o ? o.revealing : null,
    myTurn: o ? o.myTurn : null,
    serverActor: o ? o.serverActor : null,
  };
});
const logOf = (page: Page): Promise<{ samples: Sample[]; writes: Sample[]; anim: any[] }> => page.evaluate(() => ({
  samples: (window as any).__rimSamples ?? [],
  writes: (window as any).__rimWrites ?? [],
  anim: (window as any).__severgrow?.animLog?.() ?? [],
}));
const dump = (name: string, log: unknown): void => writeFileSync(`${SHOTS}/${name}`, JSON.stringify(log), 'utf8');
const shot = (page: Page, name: string): Promise<Buffer> => page.screenshot({ path: `${SHOTS}/${name}`, timeout: 120_000 });

// ---- a continuous frame recorder --------------------------------------------------------------
// A screenshot takes long enough on a loaded machine that the short window we are proving (the
// opponent's last cards landing after the state already handed over) can close while it encodes.
// The compositor's own screencast keeps every frame, timestamped, so the shot INSIDE that window
// can be picked afterwards by the sample that named it.
type CastFrame = { epoch: number; file: string };
const startCast = async (page: Page, name: string): Promise<{ frames: CastFrame[]; stop: () => Promise<void> }> => {
  const cdp = await page.context().newCDPSession(page);
  const frames: CastFrame[] = [];
  let i = 0;
  cdp.on('Page.screencastFrame', (frame) => {
    const file = `${SHOTS}/${name}-${String(i++).padStart(3, '0')}.jpg`;
    writeFileSync(file, Buffer.from(frame.data, 'base64'));
    // `timestamp` is seconds since the epoch; the receipt time is the same clock the page's
    // `Date.now()` readings use (the probe records one per frame), so they correlate directly.
    frames.push({ epoch: Math.round((frame.metadata.timestamp ?? Date.now() / 1000) * 1000), file });
    void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => undefined);
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, everyNthFrame: 1 });
  return {
    frames,
    stop: async () => {
      await cdp.send('Page.stopScreencast').catch(() => undefined);
      await cdp.detach().catch(() => undefined);
    },
  };
};
const pickFrame = (frames: CastFrame[], from: number, to: number): CastFrame | null => {
  const inside = frames.filter((f) => f.epoch >= from && f.epoch <= to);
  if (inside.length) return inside[Math.floor(inside.length / 2)]!;
  // No frame landed strictly inside: take the closest one, and say so by its path.
  const closest = frames.reduce<CastFrame | null>((best, f) => (!best || Math.abs(f.epoch - from) < Math.abs(best.epoch - from) ? f : best), null);
  return closest;
};
const phaseOf = (page: Page): Promise<string> =>
  page.evaluate(() => (window as any).__severgrow?.state()?.phase ?? '').catch(() => '');
/**
 * Tap a PILE by activating the element itself. At 430x932 the fanned hand lies over the deck's
 * centre, so a hit-tested click at that point lands on a hand card instead (measured: the topmost
 * element there was `#hand .card`). This is the same button a player's tap reaches, without the
 * fan's z-order deciding whether the test advances.
 */
const tapPile = (page: Page, id: 'deck' | 'discard'): Promise<void> =>
  page.evaluate((pile) => (document.getElementById(pile) as HTMLButtonElement | null)?.click(), id);

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const cleanup: (() => Promise<unknown>)[] = [];
try {
  // =============================================================================================
  // 1. OFFLINE PRACTICE (futa04): the ceremony, my own move, and the opponent's cards landing.
  // =============================================================================================
  const served = await servePreview(4192, { build: { outDir: 'dist' }, logLevel: 'error' });
  cleanup.push(() => served.server.close());
  // The engine itself picks a seed that starts with ME, so "ownership alone would light it".
  let seed = 0;
  for (let s = 210_000_000; s < 210_000_200; s++) if (startingPlayerFor(s) === 0) { seed = s; break; }
  assert.ok(seed > 0, 'found a seed where the human starts');

  const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  cleanup.push(() => page.close());
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.addInitScript({ content: PROBE });
  await page.addInitScript(() => {
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({
      sound: false, music: false, coach: false, speed: 'slow', reduceMotion: false, eyeCandy: true, autoSkip: false,
    }));
    localStorage.setItem('main2:severgrow.tips.v1', JSON.stringify({ fruit: true, strengthen: true, draw: true }));
  });
  await page.goto(`${served.url}?seed=${seed}`);
  await assertDistChannel(page);
  check(true, 'offline: the served build is the futa04 product channel');

  // ---- the pre-game ceremony owns the board; the prepared match underneath is already mine
  await page.waitForSelector('#starter-lottery:not([hidden])', { timeout: 30000 });
  await sleep(700);
  const ritual = await snapNow(page);
  check(ritual.actor === 0 && ritual.rim !== 'you', `offline: dark through the ceremony (actor ${ritual.actor}, rim "${ritual.rim}")`);
  await shot(page, 'offline-1-ritual-rim-dark.png');

  // ---- the ceremony ends: the same moment the first tap is accepted
  await page.waitForFunction(() => {
    const h = (window as any).__severgrow;
    return !!h && !h.busy() && h.state()?.actor === 0;
  }, undefined, { timeout: 45000 });
  await page.waitForFunction(() => document.body.dataset.turn === 'you', undefined, { timeout: 15000 });
  await shot(page, 'offline-2-ready-rim-lit.png');
  check(true, 'offline: it lights at the moment the ceremony lifts and the move is tappable');

  // ---- MY move: draw, pick a Grow card, drag on the board (an interaction in progress), commit
  // The pile carries the idle-hint pulse, so actionability waits would never settle: activate it.
  await tapPile(page, 'deck');
  await page.waitForFunction(() => {
    const h = (window as any).__severgrow;
    return !h.busy() && h.state()?.phase === 'ACT';
  }, undefined, { timeout: 30000 });
  const sprout = await page.evaluate(() => {
    const a = (window as any).__severgrow.legal().find((x: { t: string }) => x.t === 'Sprout');
    return a ? { card: a.card as number, key: `${a.coord.q},${a.coord.r}` as string } : null;
  });
  check(!!sprout, 'offline: a real mid-turn Grow is available for the own-move check');
  await page.locator(`#hand [data-card="${sprout!.card}"]`).click({ force: true });
  check(await page.evaluate(() => document.documentElement.classList.contains('futa04-move-active')), 'offline: the pick marks the board as move-active');
  check((await snapNow(page)).rim === 'you', 'offline: the rim stays lit while I am choosing my own move');
  const box = (await page.locator(`#board .hex-cell[data-key="${sprout!.key}"]`).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 5, box.y + box.height / 2 + 5, { steps: 4 });
  await shot(page, 'offline-3-mid-drag-rim-lit.png');
  const dragging = await snapNow(page);
  await page.mouse.up();
  check(dragging.rim === 'you', 'offline: the rim stays lit mid-drag (an interaction in progress is still my turn)');
  // Make sure the Grow actually commits, so its animation frames are sampled with the state still mine.
  const placed = (): Promise<boolean> => page.evaluate((k) => !!(window as any).__severgrow.state().board[k], sprout!.key);
  if (!(await placed())) {
    const still = await page.evaluate((k) => (window as any).__severgrow.legal().some((a: any) => a.t === 'Sprout' && `${a.coord.q},${a.coord.r}` === k), sprout!.key);
    if (still) await page.locator(`#board .hex-cell[data-key="${sprout!.key}"]`).click({ force: true });
  }
  await page.waitForFunction((k) => !!(window as any).__severgrow.state().board[k], sprout!.key, { timeout: 15000 });
  check(true, 'offline: my Grow committed');

  // ---- end the turn and throw, so the opponent takes over
  for (let i = 0; i < 40 && (await phaseOf(page)) === 'ACT'; i++) {
    await page.evaluate(() => {
      const b = document.querySelector<HTMLElement>('#moves .end, #moves .futa04-skip, .futa04-skip, .end');
      if (b && !b.hasAttribute('disabled')) b.click();
    });
    await sleep(250);
  }
  check((await phaseOf(page)) === 'DISCARD', 'offline: the Throw step arrived');
  const cardId = await page.evaluate(() => {
    const d = (window as any).__severgrow.legal().find((a: { t: string }) => a.t === 'Discard');
    return d ? (d.card as number) : null;
  });
  assert.notEqual(cardId, null, 'a forced discard exists');
  await page.locator(`#hand [data-card="${cardId}"]`).click({ force: true });
  await sleep(200);
  // Record frames from before the throw: the window we are proving is short and a screenshot's
  // encode cannot be trusted to land inside it on a loaded machine.
  const cast = await startCast(page, 'offline-cast');
  const handoffSeen = page.waitForFunction(() => {
    const h = (window as any).__severgrow;
    return h.state()?.actor === 0 && h.busy();
  }, undefined, { timeout: 60000 }).catch(() => undefined);
  await tapPile(page, 'discard');
  const botTurnAt = await (async () => {
    await page.waitForFunction(() => (window as any).__severgrow.state()?.actor === 1, undefined, { timeout: 30000 });
    return snapNow(page);
  })();
  await page.waitForFunction(() => document.body.dataset.turn === 'opponent', undefined, { timeout: 15000 });
  check(true, 'offline: the quiet trace on the opponent\'s turn');

  // ---- THE BUG WINDOW: the state already says MINE, the opponent's cards are still landing.
  await handoffSeen;

  // ---- the queue drains: the light appears exactly here
  await page.waitForFunction(() => {
    const h = (window as any).__severgrow;
    return !h.busy() && h.state()?.actor === 0;
  }, undefined, { timeout: 30000 });
  await page.waitForFunction(() => document.body.dataset.turn === 'you', undefined, { timeout: 15000 });
  const readyAt = (await snapNow(page)).t;
  await sleep(250);
  await cast.stop();
  await shot(page, 'offline-6-tappable-rim-lit.png');
  check(true, 'offline: the light appears when the board is genuinely tappable');

  const offlineLog = await logOf(page);
  dump('offline.json', offlineLog);
  const drain = offlineLog.samples.filter((s) => s.t >= botTurnAt.t && s.t <= readyAt);
  // The window itself, from the page's own frames: the state says MINE while the queue is still busy.
  const windowSamples = drain.filter((s) => s.actor === 0 && s.busy);
  check(windowSamples.length > 0, `offline: the hand-off window existed (${windowSamples.length} frames with the state mine and the queue busy)`);
  // WHAT "THEIR CARDS ARE STILL LANDING" MEANS, from the page's own pump log: the last step whose
  // player is the opponent. `busy` alone is not that test — the rim legitimately stays lit through
  // MY OWN move and through the neutral "your turn"/sync steps, where the page's tap gate is open
  // (`blocking() === false`). The owner's bug is the window BEFORE that, so the assertion is about
  // the opponent's steps, not about the pump being idle.
  const opponentSteps = (offlineLog.anim as { ev: string; who?: number; t: number; k?: string }[])
    .filter((a) => a.ev === 'step' && a.who === 1 && a.t >= botTurnAt.t);
  const lastOpponentEnd = Math.max(...opponentSteps.map((a) => a.t));
  check(opponentSteps.length > 0 && Number.isFinite(lastOpponentEnd),
    `offline: the opponent's last steps were logged (${opponentSteps.map((a) => `${a.k}@${Math.round(a.t)}`).join(', ')})`);
  const darkWindow = drain.filter((s) => s.t < lastOpponentEnd);
  check(darkWindow.length > 0, `offline: the hand-off window was observed (${darkWindow.length} frames before their last card landed)`);
  check(!darkWindow.some((s) => s.rim === 'you'), `offline: every one of those frames was dark (${darkWindow.length})`);
  const opponentFrame = pickFrame(cast.frames, botTurnAt.epoch, (windowSamples[0]?.epoch ?? botTurnAt.epoch + 2000));
  if (opponentFrame) {
    copyFileSync(opponentFrame.file, `${SHOTS}/offline-4-opponent-turn-rim-dark.jpg`);
    console.log(`  frame: ${SHOTS}/offline-4-opponent-turn-rim-dark.jpg (from ${opponentFrame.file})`);
  }
  check(!!opponentFrame, 'offline: a compositor frame was captured during the opponent\'s turn');
  const handoffFrame = pickFrame(cast.frames, windowSamples[0]!.epoch, windowSamples.at(-1)!.epoch);
  if (handoffFrame) {
    copyFileSync(handoffFrame.file, `${SHOTS}/offline-5-handoff-cards-landing-rim-dark.jpg`);
    console.log(`  frame: ${SHOTS}/offline-5-handoff-cards-landing-rim-dark.jpg (from ${handoffFrame.file})`);
  }
  check(!!handoffFrame, 'offline: a compositor frame was captured inside the hand-off window');
  const firstLit = drain.find((s) => s.rim === 'you');
  check(!!firstLit && firstLit.t >= lastOpponentEnd,
    `offline: the first light came after their last card landed (lit ${firstLit ? Math.round(firstLit.t - lastOpponentEnd) : '-'}ms after)`);
  check(!drain.some((s) => s.rim === 'you' && s.t < lastOpponentEnd), 'offline: no frame lit the rim while the opponent was still animating');
  const ownMoveLit = offlineLog.samples.filter((s) => s.rim === 'you' && s.busy && s.actor === 0 && s.t < botTurnAt.t);
  check(ownMoveLit.length > 0, `offline: it stayed lit through MY OWN move's animation (${ownMoveLit.length} frames)`);
  check(!offlineLog.samples.some((s) => s.ceremony && s.rim === 'you'), 'offline: never lit while the ceremony overlay was up');
  const drainWrites = offlineLog.writes.filter((w) => w.t >= botTurnAt.t && w.rim === 'you');
  check(drainWrites.every((w) => w.t >= lastOpponentEnd), `offline: every write to "you" in the hand-off came after their last card (${drainWrites.length} writes)`);
  check(pageErrors.length === 0, `offline: no page errors${pageErrors.length ? ` (${pageErrors[0]})` : ''}`);

  // =============================================================================================
  // 2. ONLINE DUEL (two contexts, the real local service) — the live enemy-turn reveal.
  //    Online Blitz is the same OnlineSession, board and syncTurnRim; only the send timing differs.
  // =============================================================================================
  const duel = await startLocalDuel({ port: 4337 });
  cleanup.push(() => duel.close());
  const match = await duel.newMatch();
  const seatA = await openSeat(duel, match, 0);
  const seatB = await openSeat(duel, match, 1);
  await Promise.all([seatA, seatB].map((s) => s.page.evaluate(PROBE)));
  await openDuel(seatA, match.matchId);
  await openDuel(seatB, match.matchId);
  const mover = match.starterSeat === 0 ? seatA : seatB;
  const waiter = match.starterSeat === 0 ? seatB : seatA;
  check(true, 'online: both seats are in the same duel');

  const onlineErrors: string[] = [];
  mover.page.on('pageerror', (e) => onlineErrors.push(e.message));
  waiter.page.on('pageerror', (e) => onlineErrors.push(e.message));

  await waitIdle(mover);
  // A duel's turn opens in DRAW: one deck tap commits the draw, then the Throw control can end it.
  for (let i = 0; i < 6 && (await statePhase(mover)) !== 'ACT'; i++) {
    await tapExposed(mover, '#deck');
    await sleep(400);
  }
  check((await statePhase(mover)) === 'ACT', `online: the mover reached its ACT step (${await statePhase(mover)})`);
  const castOnline = await startCast(waiter.page, 'online-cast');
  // The first frame that has the gate shut, sampled inside the page (a round trip later could miss
  // a short reveal on a loaded machine).
  const revealSeen = waiter.page.waitForFunction(() => {
    const h = (window as any).__severgrow;
    const o = h?.online?.();
    if (!o?.revealing) return null;
    const s = h.state?.() ?? null;
    return {
      t: Math.round(performance.now()),
      epoch: Date.now(),
      rim: document.body.dataset.turn ?? '',
      actor: s ? s.actor : -1,
      phase: s ? s.phase : '',
      busy: !!h.busy(),
      ceremony: false,
      revealing: o.revealing,
      myTurn: o.myTurn,
      serverActor: o.serverActor,
    };
  }, undefined, { timeout: 25000 }).then((h) => h.jsonValue() as Promise<Sample>).catch(() => null);
  check(await endTurnViaPage(mover), 'online: the first seat ended its turn');

  // The receiving phone: the server has already handed it the turn, and the reveal is showing.
  const revealing = await revealSeen;
  check(!!revealing, 'online: the enemy-turn reveal was observed');
  check(revealing!.serverActor === waiter.seat, `online: the server already says it is MY turn (serverActor ${revealing!.serverActor} / seat ${waiter.seat})`);
  check(revealing!.myTurn === false, 'online: the input gate is still shut');
  check(revealing!.rim !== 'you', `online: dark through that gate (rim "${revealing!.rim}")`);
  await waiter.page.waitForFunction(() => (window as any).__severgrow.online()?.revealing === false, undefined, { timeout: 25000 });
  await waiter.page.waitForFunction(() => document.body.dataset.turn === 'you', undefined, { timeout: 15000 });
  await sleep(200);
  await castOnline.stop();
  await shot(waiter.page, 'online-2-tappable-rim-lit.png');
  check(true, 'online: it lights the moment the reveal drains and input opens');
  const receiverLog = await logOf(waiter.page);
  dump('online-receiver.json', receiverLog);
  const revealSamples = receiverLog.samples.filter((s) => s.revealing === true);
  check(revealSamples.length > 0, `online: the reveal window existed (${revealSamples.length} frames with the gate shut)`);
  check(!revealSamples.some((s) => s.rim === 'you'), `online: every one of those frames was dark (${revealSamples.length})`);
  const revealFrame = pickFrame(castOnline.frames, revealSamples[0]!.epoch, revealSamples.at(-1)!.epoch);
  if (revealFrame) {
    copyFileSync(revealFrame.file, `${SHOTS}/online-1-enemy-reveal-rim-dark.jpg`);
    console.log(`  frame: ${SHOTS}/online-1-enemy-reveal-rim-dark.jpg (from ${revealFrame.file})`);
  }
  check(!!revealFrame, 'online: a compositor frame was captured inside the reveal window');
  check(!receiverLog.writes.some((w) => w.rim === 'you' && w.revealing === true), 'online: no rim write lit while the reveal gate was shut');
  const litWrites = receiverLog.writes.filter((w) => w.rim === 'you');
  check(litWrites.length === 1 && litWrites[0]!.revealing === false, `online: exactly one write to "you", after the gate opened (${litWrites.length})`);
  const sender = await snapNow(mover.page);
  await shot(mover.page, 'online-3-waiting-rim-trace.png');
  check(sender.rim === 'opponent', `online: the sender waits on the quiet trace, not a light (rim "${sender.rim}")`);
  check(onlineErrors.length === 0, `online: no page errors${onlineErrors.length ? ` (${onlineErrors[0]})` : ''}`);

  // =============================================================================================
  // 3. OFFLINE BLITZ (futa05 build at the live root — the same bytes the duel is served from).
  // =============================================================================================
  const blitzPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  cleanup.push(() => blitzPage.close());
  await blitzPage.goto(duel.origin);
  await blitzPage.evaluate(PROBE);
  await blitzPage.waitForSelector('#menu-play', { state: 'visible', timeout: 25000 });
  await blitzPage.click('#menu-play');
  await blitzPage.waitForSelector('#menu-new', { state: 'visible', timeout: 15000 });
  await blitzPage.click('#menu-new');
  await blitzPage.waitForSelector('#levels:not([hidden])', { timeout: 15000 });
  await blitzPage.waitForSelector('#level-grid .difficulty-tile', { timeout: 15000 });
  await blitzPage.click('#level-grid [data-difficulty="pro"]');
  await blitzPage.waitForFunction(() => (window as any).__severgrow?.blitz?.()?.active === true, undefined, { timeout: 40000 });
  if (await blitzPage.evaluate(() => !document.getElementById('starter-lottery')!.hidden)) {
    await sleep(600);
    await shot(blitzPage, 'blitz-1-ceremony-rim-dark.png');
    check((await snapNow(blitzPage)).rim !== 'you', 'blitz: the rim stays dark through the Blitz ceremony');
  }
  await blitzPage.waitForFunction(() => {
    const h = (window as any).__severgrow;
    const s = h.state();
    return !h.busy() && s && s.phase !== 'GAME_OVER';
  }, undefined, { timeout: 45000 });
  // The ceremony's own hold is released a beat after the lottery hides; wait for that release rather
  // than sampling the fade (a rim that is correctly dark under the hold would look like a failure).
  await blitzPage.waitForFunction(() => {
    const r = document.getElementById('starter-lottery');
    return !r || r.hidden || !r.getClientRects().length;
  }, undefined, { timeout: 30_000 }).catch(() => undefined);
  await sleep(600);
  const blitzIdle = await snapNow(blitzPage);
  const blitzSheets = await blitzPage.evaluate(() => [...document.querySelectorAll('[id^="sheet-"]:not([hidden])')].map((e) => e.id));
  await shot(blitzPage, 'blitz-2-settled.png');
  check(blitzIdle.rim === (blitzIdle.actor === 0 ? 'you' : 'opponent'),
    `blitz: the settled rim follows the tap (actor ${blitzIdle.actor}, rim "${blitzIdle.rim}", sheets ${JSON.stringify(blitzSheets)})`);
  const blitzLog = await logOf(blitzPage);
  dump('blitz.json', blitzLog);
  check(!blitzLog.samples.some((s) => s.rim === 'you' && s.actor === 1), 'blitz: never lit on the opponent\'s turn');
  check(blitzLog.writes.filter((w) => w.rim === 'you').every((w) => w.actor === 0), 'blitz: every lit write was a seat that could tap');

  console.log(`\n  ${checks} checks passed; frames in ${SHOTS}`);
  console.log(`  seed ${seed}, duel ${match.matchId}, starter ${match.starterSeat}`);
} finally {
  for (const close of cleanup.reverse()) await close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}
