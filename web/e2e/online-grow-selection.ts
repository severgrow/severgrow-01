// FUTASAKU 0.5 — online Grow selection must behave EXACTLY like the offline game.
//
//   npx tsx web/e2e/online-grow-selection.ts
//
// The owner's two-phone playtest found that tapping a tile while growing "sort of deselects
// itself" unless the card and the tile were tapped very quickly, and that a card picked during
// Grow could stay picked into Throw. Both are the same fault: the driver emitted on every poll and
// the page rebuilt its interaction Session on each emit, throwing the transient selection away.
//
// This proves the fix on BOTH seats and against the offline game:
//   1. tap a tile  -> it stays selected for longer than one poll interval (the clobber window);
//   2. tap a card  -> it stays selected for longer than one poll interval;
//   3. tap card + tile -> the Grow commits into the local draft;
//   4. a step change (Grow -> Throw) clears the selection, exactly as offline does;
//   5. the identical gesture sequence in the offline game shows the same behaviour.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { preview } from 'vite';
import type { Action } from '../../src/engine/index.js';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { createHttpServer } from '../../server/src/http.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { DuelClient } from '../../server/src/client.js';
import type { FetchLike } from '../../server/src/client.js';

const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
const PORT = Number(process.env.PREVIEW_PORT ?? 4217);
const PREFIX = 'futa05:';
/** Longer than the active poll (2s) and the waiting poll (900ms): a clobber would land inside it. */
const POLL_WAIT_MS = 2_600;

mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------- page scripts

type Sel = { card: number | null; hex: string | null; kind: string | null; option: number };
type Plan = {
  phase: string;
  actor: number;
  sel: Sel | null;
  emptySproutKey: string | null;
  multiCard: number | null;
  /** A card with a Sprout and no Bloom recipe (a tap picks Sprout, not the paint map). */
  sproutCard: number | null;
  /** A Sprout target hex of `sproutCard` — tapping it commits that card's Grow. */
  sproutCardHex: string | null;
  bloomCard: number | null;
  hasDraft: boolean;
};

type Seat = { page: Page; seat: 0 | 1; token: string; who: string };

const READ = `(() => {
  const g = window.__severgrow;
  const st = g.state ? g.state() : null;
  if (!st) return null;
  const legal = g.legal ? g.legal() : [];
  const sel = g.sel ? g.sel() : null;
  const board = st.board || {};
  const byCard = new Map();
  const bloomKindsByCard = new Map();
  const seenKinds = new Set();
  let emptySproutKey = null;
  for (const a of legal) {
    if (a.t === 'Sprout') {
      const k = a.coord.q + ',' + a.coord.r;
      if (!emptySproutKey && !board[k]) emptySproutKey = k;
      if (!byCard.has(a.card)) byCard.set(a.card, new Set());
      byCard.get(a.card).add(k);
    } else if (a.t === 'Bloom') {
      const kind = 'bloom-' + a.cards.length + '-' + a.cards.slice().sort(function (x, y) { return x - y; }).join('.');
      if (!seenKinds.has(kind)) {
        seenKinds.add(kind);
        for (const c of a.cards) {
          if (!bloomKindsByCard.has(c)) bloomKindsByCard.set(c, new Set());
          bloomKindsByCard.get(c).add(kind);
        }
      }
    }
  }
  let multiCard = null;
  for (const entry of byCard) if (entry[1].size >= 2) { multiCard = entry[0]; break; }
  let sproutCard = null;
  let sproutCardHex = null;
  for (const entry of byCard) if (!bloomKindsByCard.has(entry[0])) { sproutCard = entry[0]; sproutCardHex = Array.from(entry[1])[0]; break; }
  let bloomCard = null;
  for (const entry of bloomKindsByCard) if (entry[1].size === 1) { bloomCard = entry[0]; break; }
  let draft = false;
  try { draft = Object.keys(sessionStorage).some(function (k) { return k.indexOf('severgrow.duel.draft.v1.') !== -1; }); } catch (e) {}
  return { phase: st.phase, actor: st.actor, sel: sel, emptySproutKey: emptySproutKey, multiCard: multiCard, sproutCard: sproutCard, sproutCardHex: sproutCardHex, bloomCard: bloomCard, hasDraft: draft };
})()`;

const read = (page: Page): Promise<Plan | null> => page.evaluate(READ) as Promise<Plan | null>;

const tapSelector = async (page: Page, selector: string): Promise<boolean> => {
  const point = (await page.evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  const r = el.getBoundingClientRect();
  for (const yf of [0.5, 0.32, 0.68, 0.2, 0.8]) {
    for (const xf of [0.5, 0.3, 0.7]) {
      const x = r.left + r.width * xf, y = r.top + r.height * yf;
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === el || el.contains(hit))) return { x: x, y: y };
    }
  }
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`)) as { x: number; y: number } | null;
  if (!point) return false;
  await page.mouse.click(point.x, point.y);
  return true;
};

const waitPlan = async (page: Page, want: (p: Plan) => boolean, timeout = 25_000): Promise<Plan | null> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const p = await read(page);
    if (p && want(p)) return p;
    await page.waitForTimeout(150);
  }
  return null;
};

const selectedSomething = (sel: Sel | null): boolean => !!sel && (sel.card !== null || sel.hex !== null || sel.kind !== null);

// ---------------------------------------------------------------------------- local duel API

const buildWithApi = async (apiBase: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
      env: { ...process.env, PATH: process.env.PATH, CHANNEL: 'futa05', VITE_DUEL_API_URL: apiBase },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    child.stderr?.on('data', (b) => {
      err += String(b);
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`web:build failed: ${err}`))));
  });

const service = new MatchService({
  storage: new MemoryStorage(),
  config: { ...DEFAULT_SERVER_CONFIG, corsOrigin: '*', turnTimeoutMs: 24 * 3_600_000 },
});
const apiServer = createHttpServer({ service, config: { ...DEFAULT_SERVER_CONFIG, corsOrigin: '*' } });
await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
const apiPort = (apiServer.address() as AddressInfo).port;
const apiBase = `http://127.0.0.1:${apiPort}`;
console.log(`local duel API on ${apiBase}`);

const nodeFetch: FetchLike = (url, init) => fetch(url, init);
const api = new DuelClient({ baseUrl: apiBase, fetch: nodeFetch });

await buildWithApi(apiBase);
const previewServer = await preview({
  configFile: 'web/vite.config.ts',
  preview: { host: '127.0.0.1', port: PORT, strictPort: true },
  logLevel: 'error',
});
const origin =
  previewServer.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ??
  `http://127.0.0.1:${(previewServer.httpServer?.address() as AddressInfo | null)?.port ?? PORT}`;
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(`${origin}/`);
    if (res.ok || res.status === 404) break;
  } catch {
    await sleep(100);
  }
}
console.log(`preview at ${origin}`);

// ---------------------------------------------------------------------------- app helpers

const settingsScript = (identity?: { token: string; playerId: string; displayName: string | null }): string =>
  [
    '(function () {',
    '  try {',
    '    if (sessionStorage.getItem("__growSelSeeded") === "1") return;',
    '    localStorage.clear();',
    identity
      ? `    localStorage.setItem(${JSON.stringify(PREFIX + 'severgrow.duel.identity.v1')}, ${JSON.stringify(
          JSON.stringify({ ...identity, kind: 'guest' }),
        )});`
      : '',
    `    localStorage.setItem(${JSON.stringify(PREFIX + 'severgrow.duel.firstCard.v1')}, '1');`,
    `    localStorage.setItem(${JSON.stringify(PREFIX + 'severgrow.settings.v1')}, ${JSON.stringify(
      JSON.stringify({ sound: false, music: false, coach: false, speed: 'skip', reduceMotion: true, eyeCandy: false }),
    )});`,
    '    sessionStorage.setItem("__growSelSeeded", "1");',
    '  } catch (e) {}',
    '})();',
    'try { window.confirm = function () { return true; }; } catch (e) {}',
  ]
    .filter(Boolean)
    .join('\n');

const openApp = async (
  browser: Browser,
  viewport: { width: number; height: number },
  identity?: { token: string; playerId: string; displayName: string | null },
): Promise<{ context: BrowserContext; page: Page }> => {
  const touch = viewport.width < 500;
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  await context.addInitScript({ content: settingsScript(identity) });
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#menu-online:not([hidden])', { timeout: 45_000 });
  return { context, page };
};

const openHub = async (page: Page): Promise<void> => {
  await page.click('#menu-online');
  await page.waitForSelector('#online-hub:not([hidden])', { timeout: 25_000 });
  const firstOk = page.locator('#online-first-ok');
  if (await firstOk.isVisible().catch(() => false)) await firstOk.click();
};

const createDuel = async (page: Page): Promise<string> => {
  await page.click('#online-create');
  await page.waitForSelector('#online-waiting:not([hidden])', { timeout: 25_000 });
  return ((await page.locator('#online-invite-code').textContent()) ?? '').trim();
};

const joinDuel = async (page: Page, invite: string): Promise<void> => {
  await page.click('#online-join-open');
  await page.waitForSelector('#online-join:not([hidden])', { timeout: 15_000 });
  await page.fill('#online-join-code', invite);
  await page.click('#online-join-submit');
};

const drawViaDeck = async (page: Page): Promise<boolean> => {
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.waitForSelector('#deck:not([disabled])', { timeout: 8_000 }).catch(() => undefined);
    const box = await page.locator('#deck').boundingBox().catch(() => null);
    if (!box) return false;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const ok = await page
      .waitForFunction('window.__severgrow && window.__severgrow.state() && window.__severgrow.state().phase === "ACT"', undefined, {
        timeout: 3_000,
      })
      .then(() => true)
      .catch(() => false);
    if (ok) return true;
  }
  return false;
};

const phaseChanged = (page: Page): Promise<boolean> =>
  page
    .waitForFunction('window.__severgrow.state() && window.__severgrow.state().phase !== "ACT"', undefined, { timeout: 6_000 })
    .then(() => true)
    .catch(() => false);

/**
 * End the Grow step with the shared Skip / Throw control. In Futa04 the visible control is the
 * smart cockpit slot, but the underlying EndAct button always lives in #moves, so a DOM click on
 * it is the same real step change for off- and online.
 */
const endGrowStep = async (page: Page): Promise<boolean> => {
  const clicked = await page.evaluate(
    `(() => { const b = document.querySelector('#moves .end, #moves .futa04-skip, .futa04-skip, .end'); if (!b || b.disabled) return false; b.click(); return true; })()`,
  );
  if (clicked && (await phaseChanged(page))) return true;
  await tapSelector(page, '#smart-context');
  await page.waitForTimeout(220);
  if (await page.locator('#smart-selector').isVisible().catch(() => false)) {
    await page.locator('#smart-selector button[data-action^="skip:"]').first().click().catch(() => undefined);
  }
  return phaseChanged(page);
};

const shot = async (page: Page, name: string): Promise<string> => {
  // JPEG at quality 80 keeps the evidence readable and the folder small enough to keep in the repo.
  const path = `${OUT}${name}.jpg`;
  await page.screenshot({ path, type: 'jpeg', quality: 80 });
  return path;
};

// ---------------------------------------------------------------------------- gestures

/** Case 1 — tap an empty Grow spot: it must still be selected after a whole poll interval. */
const caseTileFirst = async (page: Page, who: string): Promise<boolean> => {
  const plan = await waitPlan(page, (p) => p.actor === 0 && p.phase === 'ACT' && !!p.emptySproutKey);
  if (!plan?.emptySproutKey) {
    check(`${who}: an empty Grow spot is offered`, false, JSON.stringify(plan));
    return false;
  }
  const key = plan.emptySproutKey;
  await tapSelector(page, `#board .hex-cell[data-key="${key}"]`);
  await page.waitForTimeout(140);
  const after = await read(page);
  const selectedNow = after?.sel?.hex === key;
  check(`${who}: tapping a tile selects it`, selectedNow, JSON.stringify(after?.sel));
  // The clobber window: a poll lands inside this wait and must not throw the selection away.
  await page.waitForTimeout(POLL_WAIT_MS);
  const later = await read(page);
  const still = later?.sel?.hex === key;
  check(`${who}: the tile STAYS selected for longer than one poll interval`, still, JSON.stringify(later?.sel));
  return selectedNow && still;
};

/** Drop whatever is picked (a hex by tapping it again; a card by tapping it again). */
const clearSelection = async (page: Page): Promise<void> => {
  const cur = await read(page);
  if (!cur?.sel) return;
  if (cur.sel.hex) await tapSelector(page, `#board .hex-cell[data-key="${cur.sel.hex}"]`);
  else if (cur.sel.card !== null) await tapSelector(page, `#hand [data-card="${cur.sel.card}"]`);
  else return;
  await page.waitForTimeout(160);
};

/** Case 2 — tap a card (multi-target Grow, or single-recipe Bloom): it must stick, then commit. */
const caseCardFirst = async (page: Page, who: string): Promise<boolean> => {
  const plan = await waitPlan(page, (p) => p.actor === 0 && p.phase === 'ACT' && (p.multiCard !== null || p.bloomCard !== null));
  const card = plan?.multiCard ?? plan?.bloomCard ?? null;
  if (!plan || card === null) {
    console.log(`    ${who}: no multi-target / single-recipe card in this hand; card-first case skipped`);
    return true;
  }
  await clearSelection(page);
  await tapSelector(page, `#hand [data-card="${card}"]`);
  await page.waitForTimeout(160);
  const after = await read(page);
  const selected = after?.sel?.card === card;
  check(`${who}: tapping a card selects it`, selected, JSON.stringify(after?.sel));
  await page.waitForTimeout(POLL_WAIT_MS);
  const later = await read(page);
  const still = later?.sel?.card === card;
  check(`${who}: the card STAYS selected for longer than one poll interval`, still, JSON.stringify(later?.sel));
  return selected && still;
};

/** Case 3 — card + tile commits the Grow (a local draft online, a played move offline). */
const caseCommit = async (page: Page, who: string): Promise<boolean> => {
  const plan = await waitPlan(page, (p) => p.actor === 0 && p.phase === 'ACT' && p.sproutCard !== null);
  if (!plan || plan.sproutCard === null) {
    console.log(`    ${who}: no plain Sprout card in this hand; commit case skipped`);
    return true;
  }
  await clearSelection(page);
  await tapSelector(page, `#hand [data-card="${plan.sproutCard}"]`);
  await page.waitForTimeout(200);
  const afterCard = await read(page);
  // A card with exactly one target plays on the tap; with several, the target tile finishes it.
  if (afterCard?.phase === 'ACT' && afterCard.sel?.card === plan.sproutCard && plan.sproutCardHex) {
    await tapSelector(page, `#board .hex-cell[data-key="${plan.sproutCardHex}"]`);
    await page.waitForTimeout(800);
  }
  const committed = await read(page);
  // A committed Grow is a local draft (online) or a played move; either clears the selection.
  const landed = !!committed && (committed.hasDraft === true || committed.phase !== 'ACT');
  const cleared = !selectedSomething(committed?.sel ?? null);
  check(`${who}: card + tile commits the Grow`, landed && cleared, JSON.stringify(committed));
  return landed && cleared;
};

/** Pick something to select (never a lone hex when a card is available). */
const pickSomething = async (page: Page, plan: Plan): Promise<boolean> => {
  if (plan.bloomCard !== null) return tapSelector(page, `#hand [data-card="${plan.bloomCard}"]`);
  if (plan.multiCard !== null) return tapSelector(page, `#hand [data-card="${plan.multiCard}"]`);
  if (plan.emptySproutKey) return tapSelector(page, `#board .hex-cell[data-key="${plan.emptySproutKey}"]`);
  return false;
};

/** Case 4 (offline) — the shared Skip control ends the Grow step and clears the selection. */
const caseStepChangeUi = async (page: Page, who: string): Promise<boolean> => {
  const plan = await waitPlan(page, (p) => p.actor === 0 && p.phase === 'ACT');
  if (!plan) {
    const now = await read(page);
    const cleared = !selectedSomething(now?.sel ?? null);
    check(`${who}: a step change clears the selection`, cleared, JSON.stringify({ phase: now?.phase, sel: now?.sel }));
    return cleared;
  }
  await clearSelection(page);
  if (!(await pickSomething(page, plan))) {
    console.log(`    ${who}: nothing cleanly selectable for the step-change case; skipped`);
    return true;
  }
  await page.waitForTimeout(160);
  const before = (await read(page))?.sel ?? null;
  const had = selectedSomething(before);
  const ended = await endGrowStep(page);
  await page.waitForTimeout(500);
  const afterPlan = await read(page);
  const cleared = !selectedSomething(afterPlan?.sel ?? null);
  check(
    `${who}: a step change clears the selection`,
    had && ended && cleared,
    JSON.stringify({ before, after: afterPlan?.sel, ended, phase: afterPlan?.phase }),
  );
  return had && ended && cleared;
};

/** Case 4 (online) — the turn ends through a real submit; the step change must clear the selection. */
const caseStepChangeApi = async (seat: Seat, endTurn: (seat: Seat) => Promise<void>): Promise<boolean> => {
  const who = seat.who;
  const plan = await waitPlan(seat.page, (p) => p.actor === 0 && p.phase === 'ACT');
  if (!plan) {
    check(`${who}: a Grow step is available for the step change`, false, JSON.stringify(plan));
    return false;
  }
  await clearSelection(seat.page);
  if (!(await pickSomething(seat.page, plan))) {
    console.log(`    ${who}: nothing cleanly selectable for the step-change case; skipped`);
    return true;
  }
  await seat.page.waitForTimeout(160);
  const before = (await read(seat.page))?.sel ?? null;
  const had = selectedSomething(before);
  // End the ACT step for real (EndAct, then Discard): the page sees the step change on its poll.
  await endTurn(seat);
  const changed = await seat.page
    .waitForFunction('window.__severgrow.state() && window.__severgrow.state().phase !== "ACT"', undefined, { timeout: 12_000 })
    .then(() => true)
    .catch(() => false);
  await seat.page.waitForTimeout(600);
  const afterPlan = await read(seat.page);
  const cleared = !selectedSomething(afterPlan?.sel ?? null);
  check(
    `${who}: a step change clears the selection`,
    had && changed && cleared,
    JSON.stringify({ before, after: afterPlan?.sel, changed, phase: afterPlan?.phase }),
  );
  return had && changed && cleared;
};

// ---------------------------------------------------------------------------- run

const browser = await chromium.launch({ executablePath: CHROME });
try {
  // ========================================================================== ONLINE (both seats)
  const { context: ctxA, page: A } = await openApp(browser, { width: 390, height: 844 });
  await openHub(A);
  const invite = await createDuel(A);
  const { context: ctxB, page: B } = await openApp(browser, { width: 390, height: 844 });
  await openHub(B);
  await joinDuel(B, invite);
  await B.waitForSelector('#game:not([hidden])', { timeout: 30_000 });
  await A.waitForSelector('#game:not([hidden])', { timeout: 30_000 });
  await A.waitForSelector('#duel-hud:not([hidden])', { timeout: 25_000 });
  await B.waitForSelector('#duel-hud:not([hidden])', { timeout: 25_000 });

  // The futa05 channel patches Storage so a bare key is prefixed automatically — read it bare.
  const sessionKey = 'severgrow.duel.session.v1';
  const stateA = JSON.parse((await A.evaluate((k) => localStorage.getItem(k), sessionKey)) ?? '{}') as { seat: 0 | 1; matchId: string; token: string };
  const stateB = JSON.parse((await B.evaluate((k) => localStorage.getItem(k), sessionKey)) ?? '{}') as { seat: 0 | 1; matchId: string; token: string };
  const starting = (await api.getState(stateA.token, stateA.matchId)).player.startingPlayer;
  console.log(`    match ${stateA.matchId}: starting seat ${starting}`);
  const seatA: Seat = { page: A, seat: stateA.seat, token: stateA.token, who: 'seat 0' };
  const seatB: Seat = { page: B, seat: stateB.seat, token: stateB.token, who: 'seat 1' };
  const first = starting === stateA.seat ? seatA : seatB;
  const second = first === seatA ? seatB : seatA;

  const otherOf = (seat: Seat): Seat => (seat === seatA ? seatB : seatA);

  /** Nudge whichever seat holds the turn one step on (Draw / EndAct / Discard). */
  const passOnce = async (seat: Seat): Promise<boolean> => {
    const { player } = await api.getState(seat.token, stateA.matchId);
    if (player.view.actor !== player.seat) return false;
    const next =
      player.legalActions.find((a: Action) => a.t === 'Draw') ??
      player.legalActions.find((a: Action) => a.t === 'EndAct') ??
      player.legalActions.find((a: Action) => a.t === 'Discard');
    if (!next) return false;
    await api.submitAction(seat.token, stateA.matchId, {
      expectedRevision: player.revision,
      requestId: `grow-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      actions: [next],
    });
    await sleep(200);
    return true;
  };

  /** Finish `seat`'s turn for real through the API (EndAct, then Discard). */
  const endSeatTurn = async (seat: Seat): Promise<void> => {
    for (let i = 0; i < 8; i++) {
      const { player } = await api.getState(seat.token, stateA.matchId);
      if (player.view.actor !== player.seat) return;
      const next =
        player.legalActions.find((a: Action) => a.t === 'EndAct') ??
        player.legalActions.find((a: Action) => a.t === 'Discard');
      if (!next) return;
      await api.submitAction(seat.token, stateA.matchId, {
        expectedRevision: player.revision,
        requestId: `growend-${i}-${Date.now()}`,
        actions: [next],
      });
      await sleep(200);
    }
  };

  /** Advance the match (through the API) until `seat` is the actor in the Grow step. */
  const advanceToAct = async (seat: Seat): Promise<boolean> => {
    const other = otherOf(seat);
    for (let i = 0; i < 60; i++) {
      const { player } = await api.getState(seat.token, stateA.matchId);
      if (player.view.actor === player.seat && player.view.phase === 'ACT') return true;
      const actor = player.view.actor === player.seat ? seat : other;
      if (!(await passOnce(actor))) return false;
    }
    return false;
  };

  const seatReady = async (seat: Seat): Promise<boolean> => {
    await seat.page
      .waitForFunction('document.querySelector("#duel-hud [data-duel-turn]")?.textContent?.includes("Your turn")', undefined, {
        timeout: 20_000,
      })
      .catch(() => undefined);
    return !!(await waitPlan(seat.page, (p) => p.actor === 0 && p.phase === 'ACT'));
  };

  const runSeat = async (seat: Seat): Promise<void> => {
    // Turn 1: the transient selection must survive a poll (tile-first and card-first), then a step
    // change must clear it.
    check(`${seat.who}: reached the Grow step`, await advanceToAct(seat));
    check(`${seat.who}: this seat acts in the Grow step`, await seatReady(seat));
    await caseTileFirst(seat.page, seat.who);
    await shot(seat.page, `grow-selection-online-${seat.who.replace(' ', '')}-tile`);
    await caseCardFirst(seat.page, seat.who);
    await caseStepChangeApi(seat, endSeatTurn);
    await shot(seat.page, `grow-selection-online-${seat.who.replace(' ', '')}-step`);
    // Turn 2: a picked card plus its tile commits the Grow.
    check(`${seat.who}: reached a second Grow step`, await advanceToAct(seat));
    if (await seatReady(seat)) await caseCommit(seat.page, seat.who);
  };

  await runSeat(first);
  await runSeat(second);

  await ctxA.close();
  await ctxB.close();

  // ========================================================================== OFFLINE comparison
  const { context: ctxOff, page: off } = await openApp(browser, { width: 390, height: 844 });
  await off.click('#menu-new');
  await off.waitForSelector('#levels:not([hidden])', { timeout: 15_000 });
  await off.locator('.level-tile').first().click();
  await off.waitForSelector('#game:not([hidden])', { timeout: 20_000 });
  await off.waitForSelector('#starter-lottery[hidden]', { timeout: 15_000 }).catch(() => undefined);
  check('offline: Draw opens the Grow step', await drawViaDeck(off));
  const offReady = await waitPlan(off, (p) => p.actor === 0 && p.phase === 'ACT');
  check('offline: this seat acts in the Grow step', !!offReady, JSON.stringify(offReady && { phase: offReady.phase, actor: offReady.actor }));
  if (offReady) {
    await caseTileFirst(off, 'offline');
    await caseCardFirst(off, 'offline');
    await caseStepChangeUi(off, 'offline');
    await shot(off, 'grow-selection-offline');
  }
  await ctxOff.close();
} finally {
  await browser.close();
  await previewServer.close();
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
}

if (failed) {
  console.error(`\n${failed} online Grow-selection checks failed`);
  process.exit(1);
}
console.log('\nOnline Grow selection matches the offline game (both seats).');


