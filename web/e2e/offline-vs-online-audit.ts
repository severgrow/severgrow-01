// Player-perspective differential audit: OFFLINE (local futa04 build) vs ONLINE (live /futa0.5/).
//
// This file is new and owned by the audit stream. It does not import or change any app code; it
// only drives the deployed/local pages as a player would and records what a player would see.
//
//   npx tsx web/e2e/offline-vs-online-audit.ts --only=offline
//   npx tsx web/e2e/offline-vs-online-audit.ts --only=online
//   npx tsx web/e2e/offline-vs-online-audit.ts            (both)
//
// Offline: OFFLINE_URL (default http://127.0.0.1:4180/), the local CHANNEL=futa04 build.
// Online : LIVE_APP from helpers/online-matrix.ts (live /futa0.5/) + the live Edge API.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import {
  DEVICES,
  BrowserPool,
  createDuel,
  createGuest,
  joinDuel,
  openHub,
  openSession,
  readHud,
  resign,
  setVisibility,
  shot,
  waitFinished,
  waitGame,
} from './helpers/online-matrix.js';
import type { DeviceProfile, Session } from './helpers/online-matrix.js';

const OFFLINE_URL = process.env.OFFLINE_URL ?? 'http://127.0.0.1:4180/';
const SCREEN_DIR = 'docs/screens/offline-vs-online';
const OUT = process.env.AUDIT_OUT ?? '/tmp/offline-vs-online-audit.json';
mkdirSync(SCREEN_DIR, { recursive: true });

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.split('=')[1] ?? 'both';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
type Rec = Record<string, unknown>;
const report: Rec = { offlineUrl: OFFLINE_URL, startedAt: new Date().toISOString() };

// ---------------------------------------------------------------- shared page probes

const visibleControls = (page: Page): Promise<string[]> =>
  page.evaluate(`(() => {
    const menu = document.querySelector('#menu');
    const pause = document.querySelector('#sheet-menu');
    const over = document.querySelector('#gameover');
    const hub = document.querySelector('#online-hub');
    const host = menu && !menu.hidden ? menu
      : pause && !pause.hidden ? pause
      : over && !over.hidden ? over
      : hub && !hub.hidden ? hub
      : document.body;
    const out = [];
    for (const el of host.querySelectorAll('button')) {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (r.width < 1 || r.height < 1 || st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) continue;
      if (el.closest('[hidden]')) continue;
      out.push((el.id ? '#' + el.id : el.className.split(' ')[0]).replace(/\\s+/g, '') + ':' + (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40));
    }
    return out;
  })()`);

const screenText = (page: Page, selector: string): Promise<string> =>
  page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? (el.textContent || '').replace(/\\s+/g, ' ').trim() : ''; })()`);

const existence = (page: Page, selector: string): Promise<boolean> =>
  page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const r = el.getBoundingClientRect(); return !el.closest('[hidden]') && r.width > 1 && r.height > 1; })()`);

const clickCenter = async (page: Page, selector: string): Promise<boolean> => {
  const box = await page.locator(selector).first().boundingBox().catch(() => null);
  if (!box) return false;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return true;
};

// ---------------------------------------------------------------- offline

const runOffline = async (device: DeviceProfile, browser: Browser): Promise<void> => {
  const label = `offline-${device.id}`;
  const context = await browser.newContext({
    viewport: device.viewport,
    hasTouch: device.hasTouch,
    isMobile: device.isMobile,
    userAgent: device.userAgent,
    deviceScaleFactor: device.deviceScaleFactor,
    serviceWorkers: 'block',
  });
  await context.addInitScript(`(() => {
    try {
      localStorage.setItem('severgrow.settings.v1', JSON.stringify({ sound: false, music: false, vibration: false, eyeCandy: false }));
    } catch (e) {}
  })()`);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  const rec: Rec = { label, viewport: device.viewport, errors };
  try {
    await page.goto(OFFLINE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('#menu', { timeout: 20_000 });
    await sleep(600);
    rec.menuControls = await visibleControls(page);
    await shot({ page } as Session, `${label}-1-menu`, SCREEN_DIR);

    await clickCenter(page, '#menu-new');
    await page.waitForSelector('#levels:not([hidden])', { timeout: 10_000 }).catch(() => null);
    await sleep(300);
    rec.levelControls = await visibleControls(page);
    await clickCenter(page, '#level-grid .difficulty-tile');
    await page.waitForSelector('#game:not([hidden])', { timeout: 20_000 });
    await sleep(2800);
    rec.boardControls = await visibleControls(page);
    rec.hint = await screenText(page, '#hint');
    rec.turnPill = await screenText(page, '#turn');
    rec.deckCount = await screenText(page, '#deck-count');
    rec.discardCount = await screenText(page, '#discard-count');
    rec.coachVisible = await existence(page, '#coach');
    rec.coachSuggested = await screenText(page, '#coach-suggested');
    rec.undoVisibleBeforeDraw = await existence(page, '#tool-undo');
    rec.sortVisibleBeforeDraw = await existence(page, '#hand-sort');
    rec.replayVisible = await existence(page, '#tool-replay');
    rec.scoreLabels = [await screenText(page, '#score-you-label'), await screenText(page, '#score-bot-label')];
    await shot({ page } as Session, `${label}-2-board-start`, SCREEN_DIR);

    await clickCenter(page, '#deck');
    await sleep(1800);
    rec.phaseAfterDraw = await page.evaluate(`(() => (window.__severgrow && window.__severgrow.state()) ? window.__severgrow.state().phase : '')()`);
    rec.hintAfterDraw = await screenText(page, '#hint');
    rec.handCount = await page.evaluate(`(() => document.querySelectorAll('#hand .card').length)`);

    const firstCard = await page.evaluate(`(() => {
      const el = document.querySelector('#hand .card'); if (!el) return null;
      const r = el.getBoundingClientRect(); return { id: el.getAttribute('data-card'), x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`) as { id: string; x: number; y: number } | null;
    if (firstCard) {
      await page.mouse.click(firstCard.x, firstCard.y);
      await sleep(500);
      rec.selAfterTapCard = await page.evaluate(`(() => (window.__severgrow && window.__severgrow.sel) ? window.__severgrow.sel() : null)()`);
      rec.hintAfterTapCard = await screenText(page, '#hint');
      await page.mouse.click(firstCard.x, firstCard.y);
      await sleep(500);
      rec.selAfterTapCardAgain = await page.evaluate(`(() => (window.__severgrow && window.__severgrow.sel) ? window.__severgrow.sel() : null)()`);
    } else rec.selAfterTapCard = 'no cards in hand';

    const orderBefore = await page.evaluate(`(() => Array.from(document.querySelectorAll('#hand .card')).map((c) => c.getAttribute('data-card')))`);
    const sortBox = await page.locator('#hand-sort').boundingBox().catch(() => null);
    if (sortBox) {
      await page.mouse.click(sortBox.x + sortBox.width / 2, sortBox.y + sortBox.height / 2);
      await sleep(700);
    }
    const orderAfter = await page.evaluate(`(() => Array.from(document.querySelectorAll('#hand .card')).map((c) => c.getAttribute('data-card')))`);
    rec.sortChangedOrder = JSON.stringify(orderBefore) !== JSON.stringify(orderAfter);
    rec.sortVisible = await existence(page, '#hand-sort');

    rec.legalSample = await page.evaluate(`(() => (window.__severgrow && window.__severgrow.legal) ? window.__severgrow.legal().slice(0, 8).map((a) => a.t) : [])`);
    const sprout = await page.evaluate(`(() => {
      const legal = (window.__severgrow && window.__severgrow.legal) ? window.__severgrow.legal() : [];
      const a = legal.find((x) => x.t === 'Sprout');
      if (!a) return null;
      const card = document.querySelector('#hand .card[data-card="' + a.card + '"]');
      if (!card) return null;
      const rc = card.getBoundingClientRect();
      return { card: a.card, cardX: rc.x + rc.width / 2, cardY: rc.y + rc.height / 2 };
    })()`) as { card: number; cardX: number; cardY: number } | null;
    if (sprout) {
      await page.mouse.click(sprout.cardX, sprout.cardY);
      await sleep(400);
      const target = await page.evaluate(`(() => {
        const t = document.querySelector('#board .target, #board .hex-cell.selected, #board .hex-cell.receptive');
        if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()`) as { x: number; y: number } | null;
      if (target) {
        await page.mouse.click(target.x, target.y);
        await sleep(900);
        if (await existence(page, '#confirm')) { await clickCenter(page, '#confirm-play'); await sleep(900); }
        rec.afterGrow = await page.evaluate(`(() => (window.__severgrow && window.__severgrow.state()) ? window.__severgrow.state().phase : '')`);
        rec.undoAvailableAfterGrow = await page.evaluate(`(() => !!(window.__severgrow && window.__severgrow.canUndo && window.__severgrow.canUndo()))`);
        rec.hintAfterGrow = await screenText(page, '#hint');
        if (rec.undoAvailableAfterGrow) {
          await clickCenter(page, '#tool-undo');
          await sleep(1400);
          rec.undoWorked = !(await page.evaluate(`(() => !!(window.__severgrow && window.__severgrow.canUndo && window.__severgrow.canUndo()))`));
        }
      } else rec.afterGrow = 'no target hex offered (single-tap place)';
    } else rec.afterGrow = 'no Sprout offered';

    await shot({ page } as Session, `${label}-3-board-midturn`, SCREEN_DIR);

    await clickCenter(page, '#hud-menu');
    await page.waitForSelector('#sheet-menu:not([hidden])', { timeout: 8_000 }).catch(() => null);
    await sleep(500);
    rec.pauseMenuControls = await visibleControls(page);
    rec.pauseResignVisible = await existence(page, '#gm-resign');
    await shot({ page } as Session, `${label}-4-pause`, SCREEN_DIR);
    await clickCenter(page, '#gm-resume');
    await sleep(400);

    rec.endControlPresent = await page.evaluate(`(() => !!document.querySelector('#moves .end, .end'))()`);
    rec.smartContextVisible = await existence(page, '#smart-context');
    if (rec.smartContextVisible) { await clickCenter(page, '#smart-context'); await sleep(1000); }
    else if (rec.endControlPresent) { await page.evaluate(`(() => { const e = document.querySelector('#moves .end, .end'); if (e) e.click(); })()`); await sleep(1000); }
    rec.phaseAfterEnd = await page.evaluate(`(() => (window.__severgrow && window.__severgrow.state()) ? window.__severgrow.state().phase : '')`);

    const handCard = await page.evaluate(`(() => { const c = document.querySelector('#hand .card'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`) as { x: number; y: number } | null;
    const pile = await page.evaluate(`(() => { const d = document.getElementById('discard'); const r = d.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`) as { x: number; y: number };
    if (handCard) {
      await page.mouse.move(handCard.x, handCard.y); await page.mouse.down();
      for (let k = 1; k <= 8; k++) await page.mouse.move(handCard.x + ((pile.x - handCard.x) * k) / 8, handCard.y + ((pile.y - handCard.y) * k) / 8);
      await page.mouse.up();
      await sleep(1200);
    }
    rec.phaseAfterThrow = await page.evaluate(`(() => (window.__severgrow && window.__severgrow.state()) ? window.__severgrow.state().phase : '')`);
    rec.turnAfterThrow = await screenText(page, '#turn');
    let skipSeen = false;
    for (let i = 0; i < 16; i++) { if (await existence(page, '#tool-skip')) { skipSeen = true; break; } await sleep(250); }
    rec.skipVisibleDuringOpponentReplay = skipSeen;
    await shot({ page } as Session, `${label}-5-opponent-replay`, SCREEN_DIR);
    rec.replayButtonVisibleAfter = await existence(page, '#tool-replay');
    rec.opponentTurnWord = await screenText(page, '#turn');
  } catch (error) {
    rec.fatal = String(error instanceof Error ? error.message : error).slice(0, 400);
  } finally {
    report[label] = rec;
    await context.close();
  }
};

// ---------------------------------------------------------------- online

const runOnline = async (device: DeviceProfile, pool: BrowserPool): Promise<void> => {
  const label = `online-${device.id}`;
  const rec: Rec = { label, viewport: device.viewport };
  let a: Session | null = null;
  let b: Session | null = null;
  try {
    const guestA = await createGuest();
    const guestB = await createGuest();
    a = await openSession(pool, device, guestA, `${label}-A`);
    b = await openSession(pool, device, guestB, `${label}-B`);

    await openHub(a);
    rec.menuControls = await visibleControls(a.page);
    await shot(a, `${label}-1-menu`, SCREEN_DIR);

    const { inviteCode } = await createDuel(a);
    await openHub(b);
    await joinDuel(b, inviteCode);
    await waitGame(a); await waitGame(b);
    await sleep(2800);

    rec.hudA = await readHud(a);
    rec.hudB = await readHud(b);
    rec.turnA = await screenText(a.page, '[data-duel-turn]');
    rec.turnB = await screenText(b.page, '[data-duel-turn]');
    rec.scoreLabels = [await screenText(a.page, '#score-you-label'), await screenText(a.page, '#score-bot-label')];
    rec.coachVisible = await existence(a.page, '#coach');
    rec.deadlineText = await screenText(a.page, '[data-duel-deadline]');
    rec.starterChipText = await screenText(a.page, '[data-duel-starter]');
    rec.starterChipVisible = await existence(a.page, '[data-duel-starter]');
    rec.hintText = await screenText(a.page, '#hint');
    rec.duelHudVisible = await existence(a.page, '#duel-hud');
    rec.turnPill = await screenText(a.page, '#turn');
    rec.deckCount = await screenText(a.page, '#deck-count');
    rec.discardCount = await screenText(a.page, '#discard-count');
    rec.replayVisible = await existence(a.page, '#tool-replay');
    rec.sortVisible = await existence(a.page, '#hand-sort');
    rec.undoVisible = await existence(a.page, '#tool-undo');
    rec.boardControls = await visibleControls(a.page);
    rec.helpButton = await existence(a.page, '#futa04-help-button');
    await shot(a, `${label}-2-board`, SCREEN_DIR);

    await clickCenter(a.page, '#hud-menu');
    await a.page.waitForSelector('#sheet-menu:not([hidden])', { timeout: 8_000 }).catch(() => null);
    await sleep(500);
    rec.pauseMenuControls = await visibleControls(a.page);
    rec.pauseResignVisible = await existence(a.page, '#gm-resign');
    rec.hudResignVisible = await existence(a.page, '#duel-resign');
    await shot(a, `${label}-3-pause`, SCREEN_DIR);
    await clickCenter(a.page, '#gm-resume');
    await sleep(400);

    const ok = await resign(a);
    rec.resignOk = ok;
    rec.finishTitleA = await waitFinished(a);
    rec.finishTitleB = await waitFinished(b);
    rec.finishSubA = await screenText(a.page, '#go-sub');
    rec.finishReasonA = await screenText(a.page, '#go-reason');
    rec.finishScoreA = await screenText(a.page, '#go-score');
    rec.finishBreakA = await screenText(a.page, '#go-break');
    rec.finishStatsA = await screenText(a.page, '#go-stats');
    rec.finishHighlightsA = await screenText(a.page, '#go-highlights');
    rec.finishControls = await visibleControls(a.page);
    await shot(a, `${label}-4-finish`, SCREEN_DIR);

    await clickCenter(a.page, '#go-rematch');
    await a.page.waitForSelector('#online-hub:not([hidden])', { timeout: 15_000 }).catch(() => null);
    await sleep(1200);
    rec.matchListText = await screenText(a.page, '#online-matches');
    rec.matchListControls = await visibleControls(a.page);
    await shot(a, `${label}-5-matchlist`, SCREEN_DIR);

    await setVisibility(b.page, false);
    await sleep(500);
    await setVisibility(b.page, true);
    rec.visibilitySurvived = true;
  } catch (error) {
    rec.fatal = String(error instanceof Error ? error.message : error).slice(0, 400);
  } finally {
    report[label] = rec;
    if (a) await a.close();
    if (b) await b.close();
  }
};

// ---------------------------------------------------------------- main

const pick = (id: string): DeviceProfile => {
  const d = DEVICES.find((x) => x.id === id);
  if (!d) throw new Error(`no device ${id}`);
  return d;
};

const main = async (): Promise<void> => {
  if (only !== 'online') {
    const browser = await chromium.launch({ headless: true });
    for (const device of [pick('android-390x844'), pick('desktop-chromium-1280x800')]) {
      await runOffline(device, browser);
      console.log(`offline ${device.id} done`);
    }
    await browser.close();
  }
  if (only !== 'offline') {
    const pool = new BrowserPool(false);
    for (const device of [pick('android-390x844'), pick('desktop-chromium-1280x800')]) {
      await runOnline(device, pool);
      console.log(`online ${device.id} done`);
    }
    await pool.close();
  }
  report.finishedAt = new Date().toISOString();
  report.verify = computeVerify(report);
  writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
  console.log(`wrote ${OUT}`);
  for (const v of report.verify as { name: string; ok: boolean }[]) console.log(`${v.ok ? 'PASS' : 'FAIL'} ${v.name}`);
};

/** Invariants that hold today, so a later change that breaks them shows up as a FAIL line. */
const computeVerify = (rep: Rec): { name: string; ok: boolean; note?: string }[] => {
  const keys = Object.keys(rep).filter((k) => k.includes('-'));
  const offline = keys.filter((k) => k.startsWith('offline-')).map((k) => rep[k] as Rec);
  const online = keys.filter((k) => k.startsWith('online-')).map((k) => rep[k] as Rec);
  const controls = (rec: Rec): string[] => (Array.isArray(rec.boardControls) ? (rec.boardControls as string[]) : []);
  const ids = (list: string[]): string[] => list.map((x) => x.split(':')[0] ?? '').filter((x) => x.startsWith('#')).sort();
  const out: { name: string; ok: boolean; note?: string }[] = [];
  const offlineMenus = offline.flatMap((r) => (Array.isArray(r.menuControls) ? (r.menuControls as string[]) : []));
  out.push({
    name: 'offline build has no "Play online" entry',
    ok: offline.length > 0 && !offlineMenus.some((m) => m.includes('#menu-online')),
    note: offlineMenus.filter((m) => m.includes('#menu-online')).join(','),
  });
  const o1 = offline[0], n1 = online[0];
  if (o1 && n1) {
    const oIds = ids(controls(o1));
    const nIds = ids(controls(n1)).filter((x) => x !== '#duel-resign');
    const missing = oIds.filter((x) => !nIds.includes(x));
    const extra = nIds.filter((x) => !oIds.includes(x));
    out.push({ name: 'online board offers the same controls as offline (minus Resign)', ok: missing.length === 0 && extra.length === 0, note: `missing=${missing.join(',')} extra=${extra.join(',')}` });
  }
  for (const r of online) {
    const hud = r.hudA as Rec | undefined;
    if (hud) out.push({ name: `online duel HUD visible (${r.label})`, ok: r.duelHudVisible === true && typeof hud.turn === 'string' && String(hud.turn).length > 0 });
  }
  for (const r of online) {
    out.push({ name: `online finish says opposite results to the two players (${r.label})`, ok: r.finishTitleA === 'You lost' && r.finishTitleB === 'You won' });
  }
  return out;
};

await main();
