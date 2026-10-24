// FUTASAKU 0.5 — LONG-SESSION SOAK, TEARDOWN-CYCLE and MEMORY/PERF REGRESSION guard.
//
//   npx tsx web/e2e/online-soak-teardown.ts                                  # 15 matches x 10 turns
//   SOAK_MATCHES=3 SOAK_TURNS=4 npx tsx web/e2e/online-soak-teardown.ts      # a quick smoke run
//
// PASS 1 (soak / leak hunt) + PASS 3 (teardown cycle) + PASS 5 (the guard) in one run.
//
// ONE long-lived tab per seat — the realistic case: a player opens the app once and plays many
// matches. Across SOAK_MATCHES matches it plays SOAK_TURNS turns each, mixing LIVE turns (both
// players tap through the real UI, the enemy-turn gate animates every move) with ASYNC turns (the
// actor commits straight to the API, so the opponent sees a catch-up). After every match it leaves
// through a DIFFERENT exit route and then measures with the test-only probe:
//
//   * LIVE resource counts: intervals / timers / outstanding rAF callbacks / open WebSockets /
//     listener counts (keyed by a descriptive string) / DOM nodes,
//   * localStorage + sessionStorage key counts and bytes,
//   * requests the client makes idle, while hidden, during a turn, and AFTER LEAVING a duel,
//   * heap RETAINED after a forced GC (CDP) at the boot / middle / end checkpoints.
//
// The run asserts the teardown-cycle invariant: resource counts return to the SAME baseline after
// every exit route, with no drift as matches accumulate — the guard that would catch a per-match
// leak, and the guard that fails this run if one appears.
import { mkdirSync, writeFileSync } from 'node:fs';
import { onlinePerspective } from '../src/online/perspective.js';
import { openMenuEntry } from './helpers/menu-nav.js';
import { chooseBloom, drawMeld } from './drawing.js';
import type { Action } from '../../src/engine/index.js';
import {
  type LocalDuel,
  type SeatSession,
  endTurnViaPage,
  sleep,
  startLocalDuel,
  statePhase,
  tapExposed,
  waitingFlag,
  waitIdle,
} from './helpers/local-duel.js';
import {
  type ListenerCounts,
  type ResourceSnapshot,
  installProbe,
  listenerGrowth,
  openCdp,
  readListeners,
  readResources,
  retainedHeap,
} from './helpers/online-probe.js';

const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
const PORT = Number(process.env.PREVIEW_PORT ?? 4249);
mkdirSync(OUT, { recursive: true });

const MATCHES = Number(process.env.SOAK_MATCHES ?? 15);
const TURNS = Number(process.env.SOAK_TURNS ?? 10);
const QUIET_WATCH_MS = Number(process.env.SOAK_QUIET_MS ?? 3_500);
/** Safety cap on the actions one ASYNC turn commits. A complete turn is Draw, one grow, EndAct,
 *  then the forced Discard (4 actions), so the cap must be at least that. 8 leaves room for a
 *  turn that ends without a discard. */
const ASYNC_STEPS = Number(process.env.SOAK_ASYNC_STEPS ?? 8);
/** Every Nth match is played ASYNC (turns committed to the API, never tapped). */
const ASYNC_EVERY = Number(process.env.SOAK_ASYNC_EVERY ?? 3);
/** SOAK_TRACE=1 prints both seats' view state after every turn (diagnostics). */
const TRACE = process.env.SOAK_TRACE === '1';

let failed = 0;
const check = (name: string, ok: boolean, note = ''): void => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const pct = (values: number[], p: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
};
const mb = (bytes: number): string => (bytes / 1024 / 1024).toFixed(2) + 'MB';
const K = (bytes: number): string => (bytes / 1024).toFixed(0) + 'KB';
const other = (seat: 0 | 1): 0 | 1 => (seat === 0 ? 1 : 0);

// ------------------------------------------------------------------ request counting

type RequestLog = { t: number; method: string; path: string; page: number };
const apiLog: RequestLog[] = [];
const viewResponses: { t: number; page: number; status: number; revision: number | null; events: number | null }[] = [];
const attachRequestLog = (page: SeatSession['page'], apiBase: string, pageIndex: number): void => {
  page.on('request', (req) => {
    const url = req.url();
    if (!url.startsWith(apiBase)) return;
    apiLog.push({ t: Date.now(), method: req.method(), path: url.slice(apiBase.length), page: pageIndex });
  });
  page.on('response', (res) => {
    const url = res.url();
    if (!url.startsWith(apiBase) || !url.includes('/view')) return;
    void res
      .json()
      .then((body: { player?: { revision?: number; events?: unknown[] } }) => {
        viewResponses.push({
          t: Date.now(),
          page: pageIndex,
          status: res.status(),
          revision: body?.player?.revision ?? null,
          events: Array.isArray(body?.player?.events) ? body.player.events.length : null,
        });
      })
      .catch(() => undefined);
  });
};
const requestsSince = (t0: number): RequestLog[] => apiLog.filter((r) => r.t >= t0);
const viewResponsesSince = (t0: number): typeof viewResponses => viewResponses.filter((r) => r.t >= t0);

// The live challenger listener is an APP-LEVEL component: on the futa05 build it mounts whenever an
// identity exists (web/src/online/live/mount.ts) because a challenge must be heard anywhere in the
// app, not only inside a duel. It therefore arms ONE 250 ms ticker and polls the challenge inbox and
// its own presence every few seconds — deliberately, whether or not a duel is open. Those are not
// per-duel resources, so the boot baseline is taken AFTER it is up, and its inbox/presence polls are
// excluded from "polling stopped after leaving" (which guards the DUEL session's own polling). Live
// duels themselves are proved by web/e2e/live-duels.ts.
const LIVE_LISTENER_PATHS = ['/v1/players/me/challenges', '/v1/players/me/presence'] as const;
const isLiveListenerRequest = (path: string): boolean => LIVE_LISTENER_PATHS.some((p) => path.startsWith(p));

/** Wait until the app-level live listener has mounted (so the boot baseline includes it). */
const waitLiveListener = async (s: SeatSession, timeout = 20_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const up = (await s.page
      .evaluate(() => typeof (window as unknown as { __futasakuLive?: unknown }).__futasakuLive === 'function')
      .catch(() => false)) as boolean;
    if (up) return true;
    await sleep(250);
  }
  return false;
};

// ------------------------------------------------------------------ page helpers

const drawViaDeck = async (s: SeatSession): Promise<boolean> => {
  for (let i = 0; i < 6; i++) {
    const tapped = (await tapExposed(s, '#deck')) || (await s.page.click('#deck', { force: true }).then(() => true).catch(() => false));
    if (tapped) {
      const start = Date.now();
      while (Date.now() - start < 8_000) {
        const phase = await statePhase(s);
        // The shadow phase changes before the drawn card's flight finishes. Inputs are still
        // closed during that animation, so a phase-only wait races the next card/hex tap.
        if (phase === 'ACT' || phase === 'DISCARD') return waitIdle(s);
        await sleep(80);
      }
    }
    await sleep(250);
  }
  return false;
};

const hasDraft = (s: SeatSession): Promise<boolean> =>
  s.page.evaluate(() => {
    try {
      return Object.keys(sessionStorage).some((k) => k.indexOf('duel.draft.v1.') !== -1);
    } catch {
      return false;
    }
  });

const waitTurnFlag = async (s: SeatSession, timeout = 40_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await waitingFlag(s)) return true;
    await sleep(80);
  }
  return false;
};

/** Wait until this page no longer holds an online session (teardown really happened). */
const waitNoSession = async (s: SeatSession, timeout = 10_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const hook = await s.page.evaluate('window.__severgrow?.online?.() ?? null').catch(() => null);
    if (!hook) return true;
    await sleep(100);
  }
  return false;
};

const isVisible = (s: SeatSession, id: string): Promise<boolean> =>
  s.page
    .evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      return !!el && !el.closest('[hidden]') && el.getBoundingClientRect().width > 1;
    }, id)
    .catch(() => false);

const clickVisible = async (s: SeatSession, id: string): Promise<boolean> => {
  if (!(await isVisible(s, id))) return false;
  await s.page.click(id, { force: true }).catch(() => undefined);
  return true;
};

/** From anywhere: land on the main menu. */
const toMenu = async (s: SeatSession): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < 15_000) {
    // The install invitation (after a played game) is a full-screen sheet; it would swallow the
    // taps below, so dismiss it first — through the product's own affordance (Escape), then the
    // scrim, and only as a last resort by hiding it directly.
    if (await isVisible(s, '#install-prompt')) {
      await s.page.keyboard.press('Escape').catch(() => undefined);
      await sleep(150);
      if (await isVisible(s, '#install-prompt')) {
        await s.page.click('.install-prompt-scrim', { force: true }).catch(() => undefined);
        await sleep(150);
      }
      if (await isVisible(s, '#install-prompt')) {
        await s.page.evaluate("(() => { var el = document.getElementById('install-prompt'); if (el) el.hidden = true; })()");
        await sleep(150);
      }
      continue;
    }
    if (await isVisible(s, '#menu')) return;
    if (await isVisible(s, '#gameover')) {
      // The finished board is still visible UNDER this modal; handle the topmost surface first.
      await clickVisible(s, '#go-menu');
    } else if (await isVisible(s, '#game')) {
      await clickVisible(s, '#hud-menu');
      await sleep(120);
      await clickVisible(s, '#gm-main');
    } else if (await isVisible(s, '#levels')) {
      await clickVisible(s, '#levels-back');
    } else if (await isVisible(s, '#online-hub')) {
      await clickVisible(s, '#online-back');
    } else if (await isVisible(s, '#online-waiting')) {
      await clickVisible(s, '#online-waiting-back');
    } else if (await isVisible(s, '#online-join')) {
      await clickVisible(s, '#online-join-back');
    }
    await sleep(150);
  }
  const visible = await s.page
    .evaluate(`(() => {
      var ids = ['menu','game','gameover','levels','online-hub','online-waiting','online-join','install-prompt','sheet-menu','starter-lottery'];
      var out = {};
      for (var i = 0; i < ids.length; i++) {
        var el = document.getElementById(ids[i]);
        out[ids[i]] = !!el && !el.hidden && el.getBoundingClientRect().width > 1;
      }
      return out;
    })()`)
    .catch(() => null);
  throw new Error(`could not reach the main menu; screens visible: ${JSON.stringify(visible)}`);
};

/** Menu → online hub → tap this match's row → the duel board. */
const enterDuel = async (s: SeatSession, matchId: string): Promise<void> => {
  await toMenu(s);
  // Play online is behind the PLAY doorway on product channels; openMenuEntry routes the doorway.
  await openMenuEntry(s.page, 'menu-online');
  for (let i = 0; i < 100; i++) {
    if (await isVisible(s, '#online-hub')) break;
    await sleep(100);
  }
  if (await isVisible(s, '#online-first-ok')) await clickVisible(s, '#online-first-ok');
  const row = s.page.locator(`#online-matches li[data-match-id="${matchId}"]`);
  await row.waitFor({ state: 'visible', timeout: 25_000 });
  await row.click();
  await s.page.waitForSelector('#game:not([hidden])', { timeout: 25_000 });
  await s.page.waitForSelector('#duel-hud:not([hidden])', { timeout: 25_000 });
};

/** The authoritative board a seat may see, in that seat's SCREEN keys (never the page's copy). */
const serverBoard = async (duel: LocalDuel, matchId: string, token: string, seat: 0 | 1): Promise<string> => {
  const view = (await duel.api.getState(token, matchId)).player;
  const p = onlinePerspective(seat);
  return Object.entries(view.view.board as Record<string, unknown>)
    .filter(([, tile]) => !!tile)
    .map(([key]) => p.mapKey(key))
    .sort()
    .join(',');
};

const shownBoard = (s: SeatSession): Promise<string> =>
  s.page
    .evaluate(
      "Array.prototype.map.call(document.querySelectorAll('.l-tiles .tile[data-key]'), function (e) { return e.dataset.key; }).sort().join(',')",
    )
    .then((v) => String(v)) as Promise<string>;

/** A cheap breakdown of what is retained in the DOM/product state (to name a growing structure). */
const domBreakdown = (s: SeatSession): Promise<Record<string, number>> =>
  s.page.evaluate(`(() => {
    var hook = window.__severgrow || {};
    var anim = hook.animLog ? hook.animLog() : [];
    var costs = hook.renderCosts ? hook.renderCosts() : [];
    var count = function (sel) { return document.querySelectorAll(sel).length; };
    return {
      nodes: document.getElementsByTagName('*').length,
      onlineRows: count('#online-matches li'),
      hexCells: count('#board .hex-cell'),
      boardLayers: count('#board > g'),
      animMarks: anim.length,
      renderCosts: costs.length,
      handCards: count('#hand .card'),
      canvasNodes: count('canvas'),
      sheetChildren: count('.sheet-body *'),
    };
  })()`) as Promise<Record<string, number>>;

/** The gate is fully open on this page: the server's turn, no replay left, nothing queued, and
 *  (when `minRevision` is given) the page has actually applied a view at least that fresh. Without
 *  the revision check a page that never advanced past its first gated payload would satisfy
 *  "myTurn" while showing a stale board. */
const waitTurnOpen = async (s: SeatSession, timeout = 40_000, minRevision = 0): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const hook = (await s.page.evaluate('window.__severgrow?.online?.() ?? null').catch(() => null)) as
      | { myTurn: boolean; revealing: boolean; queued: number; revision: number }
      | null;
    if (hook && hook.myTurn && !hook.revealing && hook.queued === 0 && hook.revision >= minRevision) return true;
    await sleep(80);
  }
  return false;
};

/** Wait until this page's applied revision catches up with the server (its poll cadence is 2s). */
const waitCaughtUp = async (s: SeatSession, minRevision: number, timeout = 8_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const rev = (await s.page.evaluate('window.__severgrow?.online?.()?.revision ?? -1').catch(() => -1)) as number;
    if (rev >= minRevision) return true;
    await sleep(200);
  }
  return false;
};

const setHidden = (s: SeatSession, hidden: boolean): Promise<void> =>
  s.page
    .evaluate(`(() => {
      var h = ${hidden ? 'true' : 'false'};
      var proto = Document.prototype;
      Object.defineProperty(proto, 'visibilityState', { configurable: true, get: function () { return h ? 'hidden' : 'visible'; } });
      Object.defineProperty(proto, 'hidden', { configurable: true, get: function () { return !!h; } });
      document.dispatchEvent(new Event('visibilitychange'));
      return document.visibilityState + '/' + document.hidden;
    })()`)
    .then((v) => {
      if (v !== `${hidden ? 'hidden/true' : 'visible/false'}`) console.log(`    WARNING: visibility override did not take: ${v}`);
    })
    .catch((e) => console.log(`    WARNING: visibility override threw: ${String(e).slice(0, 120)}`));

/**
 * One whole turn committed straight to the server (an ASYNC turn: no page taps at all).
 *
 * A complete turn is FOUR actions, not three: Draw, one grow (Bloom/Sprout), EndAct, then the
 * forced Discard that finishes it. The Discard is what flips the actor, so a cap that stops at
 * EndAct leaves the match in DISCARD with the same actor — which is exactly the half-finished turn
 * that made an earlier version of this harness look like a stalled poll.
 */
const apiTurn = async (duel: LocalDuel, matchId: string, token: string, maxSteps = 8): Promise<number> => {
  let grew = 0;
  let hasGrown = false;
  for (let step = 0; step < maxSteps; step++) {
    const v = (await duel.api.getState(token, matchId)).player;
    if (v.status !== 'active' || v.actor !== v.seat) break;
    const legal = (v.legalActions ?? []) as { t: string; hexes?: unknown[] }[];
    const phase = v.view.phase;
    const bloom = legal
      .filter((a) => a.t === 'Bloom')
      .sort((x, y) => ((y.hexes as unknown[] | undefined)?.length ?? 0) - ((x.hexes as unknown[] | undefined)?.length ?? 0))[0];
    // DRAW → draw once. ACT → EXACTLY one grow, then End. DISCARD → the forced card. Preferring a
    // grow every time the phase is ACT would keep growing and never reach the Discard that hands
    // the turn over (the bug an earlier version of this helper had).
    const grow = bloom ?? legal.find((a) => a.t === 'Sprout');
    const pick =
      phase === 'DRAW'
        ? legal.find((a) => a.t === 'Draw')
        : phase === 'DISCARD'
          ? legal.find((a) => a.t === 'Discard')
          : hasGrown
            ? (legal.find((a) => a.t === 'EndAct') ?? grow)
            : (grow ?? legal.find((a) => a.t === 'EndAct'));
    if (!pick) break;
    if (grow && pick === grow) {
      hasGrown = true;
      grew = (bloom?.hexes as unknown[] | undefined)?.length ?? 1;
    }
    await duel.api.submitAction(token, matchId, {
      expectedRevision: v.revision,
      requestId: `soak-${matchId}-${step}-${Date.now()}`,
      action: pick as never,
    });
  }
  return grew;
};

// ---- mid-turn draft helper: make a legal local Grow, so a draft exists to leave unsent ---------

/** Tap the first card, then try lit hexes until a mid-turn draft exists. */
const makeDraft = async (s: SeatSession): Promise<boolean> => {
  if (await hasDraft(s)) return true;
  const confirmPendingMove = async (): Promise<boolean> => {
    // Smart confirmation is a fixed product default. A risky legal Grow is still only a preview
    // until the player accepts it; the old fallback mistook that preview for a missing draft.
    if (await s.page.locator('#confirm-play').isVisible()) {
      await s.page.click('#confirm-play');
      await sleep(220);
    }
    return hasDraft(s);
  };
  // Prefer the multi-tile Bloom path (the kind buttons), which is exact.
  if (await paintGrow(s, 2)) return true;
  // Otherwise take the exact legal Sprout: its own card, its own coordinate.
  const sp = (await s.page.evaluate(`(() => {
    var legal = (window.__severgrow && window.__severgrow.legal) ? window.__severgrow.legal() : [];
    for (var i = 0; i < legal.length; i++) {
      if (legal[i].t === 'Sprout') return { card: legal[i].card, key: legal[i].coord.q + ',' + legal[i].coord.r };
    }
    return null;
  })()`)) as { card: number; key: string } | null;
  if (!sp) return false;
  await tapExposed(s, `#hand [data-card="${sp.card}"]`);
  await sleep(180);
  if (await confirmPendingMove()) return true;
  await tapExposed(s, `#board .hex-cell[data-key="${sp.key}"]`);
  await sleep(220);
  if (await confirmPendingMove()) return true;
  // Last resort: the card is a fanned-out sliver — try the page's own card element directly.
  await s.page.click(`#hand [data-card="${sp.card}"]`, { force: true }).catch(() => undefined);
  await sleep(180);
  await tapExposed(s, `#board .hex-cell[data-key="${sp.key}"]`);
  await sleep(220);
  return confirmPendingMove();
};

// ---- heavy-Bloom helper: the multi-tile sequential reveal path ---------------------------------

const paintGrow = async (s: SeatSession, minHexes = 2): Promise<boolean> => {
  const action = await s.page.evaluate((minimum) => {
    const hook = (window as unknown as { __severgrow: { legal(): Action[] } }).__severgrow;
    return hook.legal().find((a) => a.t === 'Bloom' && a.hexes.length >= minimum) ?? null;
  }, minHexes);
  if (!action) return false;
  // Use the current Bloom family chooser and real drag gestures, not retired data-kind buttons.
  await chooseBloom(s.page, action);
  if (!(await drawMeld(s.page, action))) return false;
  if (await s.page.locator('#confirm-play').isVisible()) await s.page.click('#confirm-play');
  await sleep(220);
  return hasDraft(s);
};

// ------------------------------------------------------------------ the run

type MatchRecord = {
  match: number;
  mode: 'live' | 'async';
  exit: string;
  requestsIdle: number;
  requestsHidden: number;
  requestsTurn: number;
  requestsAfterLeave: number;
  heap0: number;
  heap1: number;
  s0: ResourceSnapshot;
  s1: ResourceSnapshot;
};

const report: {
  matches: MatchRecord[];
  checkpoints: { label: string; seat0Heap: number; seat1Heap: number; seat0: ResourceSnapshot; seat1: ResourceSnapshot }[];
  storage: unknown;
} = { matches: [], checkpoints: [], storage: null };

const EXIT_ROUTES = ['pause-main', 'pause-new', 'finish-menu', 'finish-other', 'finish-back'] as const;

const duel = await startLocalDuel({ port: PORT });
try {
  const g0 = await duel.api.createGuest();
  const g1 = await duel.api.createGuest();
  const guest0 = { token: g0.token, playerId: g0.player.id, displayName: g0.player.displayName };
  const guest1 = { token: g1.token, playerId: g1.player.id, displayName: g1.player.displayName };
  const seat0 = await openSeatPersistent(duel, guest0);
  const seat1 = await openSeatPersistent(duel, guest1);
  const seats: [SeatSession, SeatSession] = [seat0, seat1];
  attachRequestLog(seat0.page, duel.apiBase, 0);
  attachRequestLog(seat1.page, duel.apiBase, 1);
  const cdp0 = await openCdp(seat0.context, seat0.page);
  const cdp1 = await openCdp(seat1.context, seat1.page);

  await toMenu(seat0);
  await toMenu(seat1);
  // Let the app-level live listener finish mounting before this baseline, so its one ticker and its
  // inbox poll are part of "boot" rather than looking like a per-duel leak later.
  const liveUp = [await waitLiveListener(seat0), await waitLiveListener(seat1)];
  console.log(`live listener mounted at boot: seat0=${liveUp[0]} seat1=${liveUp[1]}`);
  await sleep(400);
  const boot0 = await readResources(seat0.page);
  const boot1 = await readResources(seat1.page);
  const bootListeners0: ListenerCounts = await readListeners(seat0.page);
  const bootHeap0 = await retainedHeap(cdp0);
  const bootHeap1 = await retainedHeap(cdp1);
  console.log(`BOOT seat0 ${JSON.stringify(pick(boot0))}\nBOOT seat1 ${JSON.stringify(pick(boot1))}\nBOOT heap ${mb(bootHeap0)} / ${mb(bootHeap1)}`);
  report.checkpoints.push({ label: 'boot', seat0Heap: bootHeap0, seat1Heap: bootHeap1, seat0: boot0, seat1: boot1 });

  let totalTurns = 0;
  const postTeardown: { match: number; exit: string; s0: ResourceSnapshot; s1: ResourceSnapshot }[] = [];

  for (let m = 1; m <= MATCHES; m++) {
    const mode: 'live' | 'async' = m % ASYNC_EVERY === 0 ? 'async' : 'live';
    const exit = EXIT_ROUTES[(m - 1) % EXIT_ROUTES.length]!;
    const wantsDraft = m % 4 === 2;

    const created = await duel.api.createMatch(g0.token);
    const matchId = created.match.matchId;
    await duel.api.joinMatch(g1.token, created.match.inviteCode);
    const seatOfPlayer: [0 | 1, 0 | 1] = [created.player.seat, other(created.player.seat)];
    const tokens: [string, string] = [g0.token, g1.token];

    await enterDuel(seat0, matchId);
    await enterDuel(seat1, matchId);

    const view0 = (await duel.api.getState(g0.token, matchId)).player;
    const seatNow = (v: { actor: number }): 0 | 1 => (seatOfPlayer[0] === v.actor ? 0 : 1);
    let actor: 0 | 1 = seatNow(view0);
    check(`match ${m}: seat ${seatOfPlayer[actor]} holds the turn at the start`, await waitTurnFlag(seats[actor]!, 40_000));

    for (let turn = 1; turn <= TURNS; turn++) {
      // The SERVER is the truth for who acts: never alternate on an assumption.
      const apiActor = (await duel.api.getState(g0.token, matchId)).player;
      if (apiActor.status !== 'active') {
        console.log(`    match ${m}: the match finished at turn ${turn}`);
        break;
      }
      actor = seatNow(apiActor);
      const acting = seats[actor]!;
      const watcher = other(actor);
      const watching = seats[watcher]!;
      if (!(await waitTurnFlag(acting, 40_000))) {
        check(`match ${m} turn ${turn}: the actor's page holds the turn`, false, `seat ${seatOfPlayer[actor]}`);
        const hook = await acting.page.evaluate('window.__severgrow?.online?.() ?? null');
        console.log(`    DIAGNOSTICS actor seat ${actor}: ${JSON.stringify(hook)}`);
        break;
      }

      let drew = false;
      if (mode === 'live') {
        drew = await drawViaDeck(acting);
        // Paint a heavy multi-tile Bloom on every 3rd live turn: the sequential path the owner
        // watches for smoothness, and the biggest single animation the gate has to hold.
        if (drew && turn % 3 === 0) {
          await sleep(150);
          if (!(await paintGrow(acting, 2))) {
            await acting.page.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
          }
        }
        if (!drew) {
          console.log(`    match ${m} turn ${turn}: draw did not land on seat ${actor}; committing via the API instead`);
          await apiTurn(duel, matchId, tokens[actor]!, ASYNC_STEPS);
        } else {
          await endTurnViaPage(acting, 30_000);
        }
      } else {
        await apiTurn(duel, matchId, tokens[actor]!, ASYNC_STEPS);
      }
      totalTurns++;
      // The revision the watcher's page must reach: after a completed turn the gate is open, so the
      // server's own revision IS what the watcher is allowed to see.
      const nextRevision = (await duel.api.getState(g0.token, matchId)).player.revision;

      const opened = await waitTurnOpen(watching, 40_000, nextRevision);
      if (opened && TRACE) {
        for (const [i, s] of seats.entries()) {
          const h = (await s.page.evaluate('window.__severgrow?.online?.() ?? null').catch(() => null)) as Record<string, unknown> | null;
          console.log(
            `      TRACE turn ${turn}: seat${i} rev=${h?.revision} syncRev=${h?.syncRevision} myTurn=${h?.myTurn} revealing=${h?.revealing} actor=${h?.serverActor} queued=${h?.queued}`,
          );
        }
      }
      if (!opened) {
        check(`match ${m} turn ${turn}: the watcher's gate opened`, false, `seat ${seatOfPlayer[watcher]} still gated`);
        const hook = await watching.page.evaluate('window.__severgrow?.online?.() ?? null');
        console.log(`    DIAGNOSTICS seat ${watcher}: ${JSON.stringify(hook)}`);
        const recent = requestsSince(Date.now() - 8_000).filter((r) => r.page === watcher);
        const apiRev = (await duel.api.getState(tokens[watcher]!, matchId)).player;
        console.log(
          `      the page's polls in the last 8s: ${recent.length}; last ${JSON.stringify(recent.slice(-3).map((r) => r.path))}; api revision now ${apiRev.revision} (actor ${apiRev.actor}, my seat ${apiRev.seat})`,
        );
        await watching.page.screenshot({ path: `${OUT}soak-stall-m${m}-t${turn}.png` }).catch(() => undefined);
      } else if (turn === 1 || turn % 5 === 0) {
        console.log(`    match ${m} (${mode}) turn ${turn}: seat ${seatOfPlayer[actor]} acted; seat ${seatOfPlayer[watcher]} open`);
      }
    }
    actor = seatNow((await duel.api.getState(g0.token, matchId)).player);
    const currentActor = actor;
    // Let the page's 2s poll land before comparing: a page up to one poll behind is NOT a board bug.
    const apiFinal = (await duel.api.getState(g0.token, matchId)).player;
    const caughtUp = await waitCaughtUp(seats[currentActor]!, apiFinal.revision, 8_000);

    const finalBoard = await serverBoard(duel, matchId, tokens[currentActor]!, seatOfPlayer[currentActor]!);
    const shown = await shownBoard(seats[currentActor]!);
    const boardOk = shown === finalBoard;
    if (!boardOk) {
      const hook = (await seats[currentActor]!.page.evaluate('window.__severgrow?.online?.() ?? null')) as Record<string, unknown> | null;
      const apiView = (await duel.api.getState(tokens[currentActor]!, matchId)).player;
      const log = (await seats[currentActor]!.page.evaluate('(window.__severgrow && window.__severgrow.animLog) ? window.__severgrow.animLog() : []')) as { ev: string }[];
      const sessions = await Promise.all(
        seats.map((s) =>
          s.page
            .evaluate("(() => { try { return localStorage.getItem('severgrow.duel.session.v1'); } catch (e) { return null; } })()")
            .catch(() => null),
        ),
      );
      console.log(
        `    BOARD MISMATCH match ${m} seat ${currentActor} (engine seat ${seatOfPlayer[currentActor]}): page ${shown.split(',').filter(Boolean).length} tiles vs api ${finalBoard.split(',').filter(Boolean).length} (api revision ${apiView.revision}, caughtUp=${caughtUp})`,
      );
      console.log(`      hook: ${JSON.stringify(hook)}`);
      console.log(`      animLog tail: ${JSON.stringify(log.slice(-14).map((x) => x.ev))}`);
      console.log(`      saved sessions: seat0 ${String(sessions[0]).slice(-90)} | seat1 ${String(sessions[1]).slice(-90)}`);
      for (const [i] of seats.entries()) {
        const responses = viewResponsesSince(Date.now() - 10_000).filter((r) => r.page === i);
        console.log(`      seat${i} view responses: ${JSON.stringify(responses.slice(-4).map((r) => `${r.status}:rev${r.revision}:ev${r.events}`))}`);
      }
      await seats[currentActor]!.page.screenshot({ path: `${OUT}soak-board-mismatch-m${m}.png` }).catch(() => undefined);
    }
    check(
      `match ${m}: the board matches the server after ${TURNS} turns`,
      boardOk,
      `${shown.split(',').filter(Boolean).length} vs ${finalBoard.split(',').filter(Boolean).length} tiles`,
    );

    // ---- cadence measurements, still inside the duel -------------------------------------------
    const idle0 = Date.now();
    await sleep(1_500);
    const idleReqs = requestsSince(idle0).filter((r) => r.method === 'GET');
    const requestsIdle = idleReqs.length;

    await setHidden(seats[currentActor]!, true);
    await setHidden(seats[other(currentActor)]!, true);
    const hiddenVisible = [
      await seats[currentActor]!.page.evaluate('document.visibilityState'),
      await seats[other(currentActor)]!.page.evaluate('document.visibilityState'),
    ];
    const hidden0 = Date.now();
    await sleep(5_000);
    const hiddenReqs = requestsSince(hidden0).filter((r) => r.method === 'GET');
    const requestsHidden = hiddenReqs.length;
    const hiddenPerPage = [hiddenReqs.filter((r) => r.page === 0).length, hiddenReqs.filter((r) => r.page === 1).length];
    if (m === 1) {
      console.log(
        `    hidden-tab check: visibilityState ${JSON.stringify(hiddenVisible)}; ${requestsHidden} GET in 5s (page0 ${hiddenPerPage[0]}, page1 ${hiddenPerPage[1]}); paths ${JSON.stringify([...new Set(hiddenReqs.map((r) => r.path))].slice(0, 4))}`,
      );
    }
    check(
      `match ${m}: the tab really reports hidden while the hidden cadence is measured`,
      hiddenVisible[0] === 'hidden' && hiddenVisible[1] === 'hidden',
      JSON.stringify(hiddenVisible),
    );
    await setHidden(seats[currentActor]!, false);
    await setHidden(seats[other(currentActor)]!, false);

    const turn0 = Date.now();
    await apiTurn(duel, matchId, tokens[currentActor]!, ASYNC_STEPS);
    const requestsTurn = requestsSince(turn0).filter((r) => r.method === 'GET').length;
    await sleep(800);

    // After that API turn the OTHER seat holds the turn — that is the seat we now test the exit on.
    const exitSeat: 0 | 1 = seatNow((await duel.api.getState(g0.token, matchId)).player);

    // ---- an UNSENT draft, then leave (the "draft survives a refresh mid-turn" path) -------------
    let leftWithDraft = false;
    if (wantsDraft) {
      const exitRev = (await duel.api.getState(g0.token, matchId)).player.revision;
      const gateOpen = await waitTurnOpen(seats[exitSeat]!, 30_000, exitRev);
      const drew = gateOpen ? await drawViaDeck(seats[exitSeat]!) : false;
      const painted = drew ? await makeDraft(seats[exitSeat]!) : false;
      leftWithDraft = await hasDraft(seats[exitSeat]!);
      check(`match ${m}: an unsent mid-turn draft exists before the exit`, leftWithDraft, `gateOpen=${gateOpen} drew=${drew} painted=${painted}`);
      console.log(`    match ${m}: leaving with an unsent draft (${leftWithDraft ? 'present' : 'absent'})`);
    }

    // ---- leave through this match's exit route, then measure -----------------------------------
    let exitFailed = false;
    try {
      await leaveVia(seats[exitSeat]!, exit);
      await waitNoSession(seats[exitSeat]!);
      await toMenu(seats[other(exitSeat)]!);
      await waitNoSession(seats[other(exitSeat)]!);
    } catch (error) {
      console.log(`    EXIT FAILED for match ${m} via ${exit}: ${String(error).slice(0, 300)}`);
      exitFailed = true;
      // Do NOT reload: a reload would reset the heap/probe baselines and hide a real leak. Force
      // both pages back to a stable screen with the app's own controls instead.
      for (const s of seats) {
        await toMenu(s).catch(() => undefined);
      }
    }
    await sleep(600);

    const quiet0 = Date.now();
    await sleep(QUIET_WATCH_MS);
    const afterLeavingAll = requestsSince(quiet0);
    const afterLeaving = afterLeavingAll.filter((r) => !isLiveListenerRequest(r.path));
    const listenerPolls = afterLeavingAll.length - afterLeaving.length;
    const requestsAfterLeave = afterLeaving.length;
    check(
      `match ${m} (${exit}): polling stopped after leaving`,
      requestsAfterLeave === 0,
      `${requestsAfterLeave} duel request(s) in ${QUIET_WATCH_MS}ms${listenerPolls ? ` (+${listenerPolls} app-level live-listener poll(s) ignored)` : ''}${afterLeaving[0] ? ` (first ${afterLeaving[0].path})` : ''}`,
    );

    const s0 = await readResources(seat0.page);
    const s1 = await readResources(seat1.page);
    if (exitFailed) console.log(`    match ${m}: excluded from the drift baseline (the exit route failed)`);
    if (!exitFailed) postTeardown.push({ match: m, exit, s0, s1 });
    check(`match ${m} (${exit}): no WebSocket left open`, s0.socketsLive === 0 && s1.socketsLive === 0, `seat0 ${s0.socketsLive}, seat1 ${s1.socketsLive}`);
    // The count must not GROW above the boot baseline: the app-level live listener may hold its one
    // ticker (present at boot), but a duel must never leave an extra timer armed behind it.
    check(
      `match ${m} (${exit}): no interval left armed`,
      s0.intervals <= boot0.intervals && s1.intervals <= boot1.intervals,
      `seat0 ${s0.intervals} (boot ${boot0.intervals}), seat1 ${s1.intervals} (boot ${boot1.intervals})`,
    );
    check(`match ${m} (${exit}): the gate/watchdog state is not leaked`, s0.rafs <= 1 && s1.rafs <= 1, `raf ${s0.rafs}/${s1.rafs}`);

    const heap0 = await retainedHeap(cdp0);
    const heap1 = await retainedHeap(cdp1);
    report.matches.push({
      match: m, mode, exit, requestsIdle, requestsHidden, requestsTurn, requestsAfterLeave, heap0, heap1, s0, s1,
    });
    console.log(
      `MATCH ${m} ${mode} ${exit}: ${JSON.stringify(pick(s0))} | ${JSON.stringify(pick(s1))} | ` +
        `req idle ${requestsIdle}/1.5s hidden ${requestsHidden}/5s turn ${requestsTurn} after-leave ${requestsAfterLeave} | heap ${mb(heap0)}/${mb(heap1)}`,
    );
    console.log(`    dom: ${JSON.stringify(await domBreakdown(seat0))}`);
    const grown = listenerGrowth(bootListeners0, await readListeners(seat0.page)).filter(([, d]) => d > 0);
    if (grown.length) console.log(`    seat0 LIVE listeners above boot: ${JSON.stringify(grown.slice(0, 8))}`);

    if (m === Math.ceil(MATCHES / 3)) {
      report.checkpoints.push({ label: 'middle', seat0Heap: heap0, seat1Heap: heap1, seat0: s0, seat1: s1 });
    }
  }

  await sleep(800);
  const final0 = await readResources(seat0.page);
  const final1 = await readResources(seat1.page);
  const endHeap0 = await retainedHeap(cdp0);
  const endHeap1 = await retainedHeap(cdp1);
  report.checkpoints.push({ label: 'end', seat0Heap: endHeap0, seat1Heap: endHeap1, seat0: final0, seat1: final1 });

  // A reload is the clean way to tell "this page retained it" from "the browser has not released
  // external memory (canvas / decoded images)", which the JS heap number cannot separate.
  let afterReloadHeap = 0;
  if (process.env.SOAK_RELOAD_CHECK !== '0') {
    await seat0.page.reload({ waitUntil: 'domcontentloaded' });
    await seat0.page.waitForSelector('#menu', { timeout: 30_000 }).catch(() => undefined);
    await sleep(1_500);
    afterReloadHeap = await retainedHeap(cdp0);
    console.log(`after a reload of seat0: retained heap ${mb(afterReloadHeap)} (was ${mb(endHeap0)} with ${MATCHES} matches in one tab)`);
  }

  // ================================================================ PASS 1 — the numbers
  console.log(`\n================ PASS 1 — SOAK (${MATCHES} matches, ${totalTurns} turns) ================`);
  for (const cp of report.checkpoints) {
    console.log(`heap ${cp.label.padEnd(6)}: seat0 ${mb(cp.seat0Heap).padStart(9)}  seat1 ${mb(cp.seat1Heap).padStart(9)}  nodes ${cp.seat0.nodes}/${cp.seat1.nodes}`);
  }
  const bootCp = report.checkpoints.find((c) => c.label === 'boot')!;
  const midCp = report.checkpoints.find((c) => c.label === 'middle');
  const endCp = report.checkpoints.find((c) => c.label === 'end')!;
  const firstN = Math.max(1, Math.ceil(MATCHES / 3));
  const slopeA0 = ((midCp?.seat0Heap ?? 0) - bootCp.seat0Heap) / firstN;
  const slopeB0 = (endCp.seat0Heap - (midCp?.seat0Heap ?? 0)) / Math.max(1, MATCHES - firstN);
  const slopeA1 = ((midCp?.seat1Heap ?? 0) - bootCp.seat1Heap) / firstN;
  const slopeB1 = (endCp.seat1Heap - (midCp?.seat1Heap ?? 0)) / Math.max(1, MATCHES - firstN);
  console.log(`retained-heap slope seat0: first third ${K(slopeA0)}/match, then ${K(slopeB0)}/match`);
  console.log(`retained-heap slope seat1: first third ${K(slopeA1)}/match, then ${K(slopeB1)}/match`);
  console.log(`retained-heap growth over ${MATCHES} matches: seat0 ${mb(endCp.seat0Heap - bootCp.seat0Heap)} (${K((endCp.seat0Heap - bootCp.seat0Heap) / MATCHES)}/match), seat1 ${mb(endCp.seat1Heap - bootCp.seat1Heap)} (${K((endCp.seat1Heap - bootCp.seat1Heap) / MATCHES)}/match)`);

  // The heap settles at a CEILING (measured: ~6.2 MB after 4 matches and 5.2 MB after 15), not a
  // per-match slope: caches (fonts, atlases, canvas pools, the material world) fill once. The guard
  // is therefore set well above that ceiling so it only fails on a genuine blow-up — a real
  // per-match leak of 512 KB would mean ~256 MB over 500 matches.
  const GUARD_KB_PER_MATCH = Number(process.env.SOAK_HEAP_KB_PER_MATCH ?? 1024);
  const GUARD_TOTAL_MB = Number(process.env.SOAK_HEAP_TOTAL_MB ?? 64);
  check(
    `PASS 5 guard: the tail retained-heap slope is under ${GUARD_KB_PER_MATCH} KB/match`,
    slopeB0 / 1024 < GUARD_KB_PER_MATCH && slopeB1 / 1024 < GUARD_KB_PER_MATCH,
    `seat0 ${K(slopeB0)}/match, seat1 ${K(slopeB1)}/match`,
  );
  check(
    `PASS 5 guard: retained heap stays under ${GUARD_TOTAL_MB} MB after ${MATCHES} matches`,
    endCp.seat0Heap < GUARD_TOTAL_MB * 1024 * 1024 && endCp.seat1Heap < GUARD_TOTAL_MB * 1024 * 1024,
    `${mb(endCp.seat0Heap)} / ${mb(endCp.seat1Heap)}`,
  );
  // A slow drift that is real but well below the guard threshold is REPORTED, not hidden.
  const driftPerMatch = Math.max(slopeB0, slopeB1) / 1024;
  if (driftPerMatch > 128) {
    console.log(
      `WARN  retained heap still drifts ~${driftPerMatch.toFixed(0)} KB/match in the tail — ${driftPerMatch < GUARD_KB_PER_MATCH ? "below" : "above"} the ${GUARD_KB_PER_MATCH} KB/match guard; a linear extrapolation to 500 matches would retain ~${((driftPerMatch * 500) / 1024).toFixed(0)} MB. See docs/ONLINE-POLISH.md.`,
    );
  }

  console.log('\n================ PASS 1 — LISTENERS / DOM / SOCKETS ================');
  console.log(`boot: ${boot0.listenersLive} live listeners (${boot0.listenerKeysLive} keys), ${boot0.listenersDetached} detached, ${boot0.nodes} nodes`);
  for (const p of postTeardown) {
    console.log(
      `after match ${String(p.match).padStart(2)} (${p.exit.padEnd(12)}): live ${String(p.s0.listenersLive).padStart(4)} (${String(p.s0.listenersLive - boot0.listenersLive).padStart(4)} above boot), detached ${String(p.s0.listenersDetached).padStart(4)}, keys ${p.s0.listenerKeysLive}, nodes ${p.s0.nodes}, raf ${p.s0.rafs}, timeouts ${p.s0.timeouts}`,
    );
  }

  console.log('\n================ PASS 3 — TEARDOWN CYCLE (per exit route) ================');
  const baseline = postTeardown[1] ?? postTeardown[0]!;
  const worst = { intervals: 0, rafs: 0, sockets: 0, listeners: 0 };
  for (const p of postTeardown) {
    worst.intervals = Math.max(worst.intervals, p.s0.intervals, p.s1.intervals);
    worst.rafs = Math.max(worst.rafs, p.s0.rafs, p.s1.rafs);
    worst.sockets = Math.max(worst.sockets, p.s0.socketsLive, p.s1.socketsLive);
    worst.listeners = Math.max(worst.listeners, p.s0.listenersLive);
  }
  console.log(`worst across all ${postTeardown.length} teardowns: intervals ${worst.intervals}, rafs ${worst.rafs}, sockets ${worst.sockets}, live listeners ${worst.listeners}`);
  // Compare to the boot baseline, not absolute zero: the futa05 build's app-level live listener
  // holds one ticker from boot (see the note at LIVE_LISTENER_PATHS). A duel must not ADD one.
  const bootIntervals = Math.max(boot0.intervals, boot1.intervals);
  check('teardown leaves no extra live interval on any exit route', worst.intervals <= bootIntervals, `worst ${worst.intervals} (boot ${bootIntervals})`);
  check('teardown leaves no WebSocket open on every exit route', worst.sockets === 0, `worst ${worst.sockets}`);
  check('teardown leaves no extra rAF loop running on any route', worst.rafs <= 1, `worst ${worst.rafs}`);

  const drift = postTeardown.map((p) => p.s0.listenersLive - baseline.s0.listenersLive);
  console.log(`seat0 LIVE-listener drift vs the match-${baseline.match} baseline: ${drift.join(', ')}`);
  check(
    'live listener counts do not drift as matches accumulate (no per-match listener leak)',
    Math.max(...drift) <= 40 && Math.min(...drift) >= -40,
    `range ${Math.min(...drift)}..${Math.max(...drift)} (the lobby row for each match; capped by the list)`,
  );
  const nodeDrift = postTeardown.map((p) => p.s0.nodes - baseline.s0.nodes);
  console.log(`seat0 DOM-node drift vs baseline: ${nodeDrift.join(', ')}`);
  const nodeTail = postTeardown.slice(-Math.max(2, MATCHES - firstN));
  const nodeSlope = nodeTail.length > 1 ? (nodeTail.at(-1)!.s0.nodes - nodeTail[0]!.s0.nodes) / (nodeTail.length - 1) : 0;
  check(
    'the DOM node count does not grow linearly with matches played (tail slope under 120/match)',
    nodeSlope < 120,
    `${nodeSlope.toFixed(1)} nodes/match over the last ${nodeTail.length} matches`,
  );

  console.log('\n================ PASS 1 — STORAGE ================');
  console.log(`seat0 localStorage : ${final0.storage.localKeys} keys, ${final0.storage.localBytes} bytes, ${final0.storage.localStarterKeys} starter markers, ${final0.storage.localDraftKeys} draft keys`);
  console.log(`seat0 sessionStorage: ${final0.storage.sessionKeys} keys, ${final0.storage.sessionBytes} bytes, ${final0.storage.sessionDraftKeys} draft keys ${JSON.stringify(final0.storage.sessionDraftSamples)}`);
  console.log(`seat1 localStorage : ${final1.storage.localKeys} keys, ${final1.storage.localStarterKeys} starter markers`);
  report.storage = { seat0: final0.storage, seat1: final1.storage };
  check(
    'localStorage does not gain an unbounded number of keys per match',
    final0.storage.localKeys <= 12 + MATCHES * 2,
    `${final0.storage.localKeys} keys after ${MATCHES} matches`,
  );

  console.log('\n================ PASS 2 — REQUEST CADENCE ================');
  const idles = report.matches.map((r) => r.requestsIdle);
  const hiddens = report.matches.map((r) => r.requestsHidden);
  const turns = report.matches.map((r) => r.requestsTurn);
  console.log(`idle, my turn (visible): ${idles.join(', ')} GET / 1.5s -> median ${pct(idles, 50)} (~${(pct(idles, 50) / 1.5).toFixed(2)}/s)`);
  console.log(`hidden tab            : ${hiddens.join(', ')} GET / 5s  -> median ${pct(hiddens, 50)} (~${(pct(hiddens, 50) / 5).toFixed(2)}/s)`);
  console.log(`during one local turn : ${turns.join(', ')} GET -> median ${pct(turns, 50)}`);
  check('a hidden tab is cheap (under 1 request/second)', pct(hiddens, 50) / 5 < 1, `${(pct(hiddens, 50) / 5).toFixed(2)}/s`);

  writeFileSync(`${OUT}soak-report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(`\nfull report: ${OUT}soak-report.json`);
} finally {
  await duel.close();
}

if (failed) {
  console.error(`\n${failed} soak / teardown check(s) failed`);
  process.exit(1);
}
console.log('\nSoak: no per-match leak, teardown returns to baseline on every route, polling stops when you leave.');

// ------------------------------------------------------------------ local helpers

function pick(s: ResourceSnapshot) {
  return {
    int: s.intervals, tmo: s.timeouts, raf: s.rafs, lsLive: s.listenersLive, lsDet: s.listenersDetached,
    sock: s.socketsLive, lsKeys: s.storage.localKeys, ssKeys: s.storage.sessionKeys,
  };
}

/** Leave the duel the way the owner would, through one named route, and end on the menu. */
async function leaveVia(s: SeatSession, route: string): Promise<void> {
  if (route === 'pause-main') {
    await clickVisible(s, '#hud-menu');
    await sleep(150);
    await clickVisible(s, '#gm-main');
  } else if (route === 'pause-new') {
    // Owner direction (2026-10-22): Restart is hidden in a duel (a server match cannot be
    // restarted by one side), so this route leaves through the same quiet Main menu key. The
    // teardown it exercises is identical; the route name stays for the soak's matrix.
    await clickVisible(s, '#hud-menu');
    await sleep(150);
    await clickVisible(s, '#gm-main');
  } else if (route.startsWith('finish')) {
    // A real finish through the pause-menu Resign (one confirm, auto-accepted here).
    await s.page.evaluate('window.confirm = function () { return true; };');
    await clickVisible(s, '#hud-menu');
    await sleep(200);
    await clickVisible(s, '#gm-resign');
    for (let i = 0; i < 100; i++) {
      if (await isVisible(s, '#gameover')) break;
      await sleep(150);
    }
    // The finish screen's exits changed: its PRIMARY slot is now a real Rematch (which creates a
    // fresh match — covered end-to-end by online-duel-two-browser.ts, not by this teardown soak),
    // and the old primary slot is now "Back to matches" (`#go-other`). These routes only exercise
    // teardown + return to the menu, so both back-out names use that one hub exit.
    if (route === 'finish-menu') await clickVisible(s, '#go-menu');
    else await clickVisible(s, '#go-other'); // Back to matches → the hub
    await sleep(500);
    if (route !== 'finish-menu') await clickVisible(s, '#online-back');
  } else if (route === 'lobby-back') {
    // Back to matches (the hub), then the lobby's own Back — the route a player takes when they
    // finish a duel and browse their matches before returning to the menu.
    await s.page.evaluate('window.confirm = function () { return true; };');
    await clickVisible(s, '#hud-menu');
    await sleep(200);
    await clickVisible(s, '#gm-resign');
    for (let i = 0; i < 100; i++) {
      if (await isVisible(s, '#gameover')) break;
      await sleep(150);
    }
    await clickVisible(s, '#go-other'); // Back to matches → the hub
    await sleep(500);
    await clickVisible(s, '#online-back');
  }
  await toMenu(s);
}

/** One persistent player: probe pre-installed, the identity seeded once, no reloads. */
async function openSeatPersistent(
  duel: LocalDuel,
  guest: { token: string; playerId: string; displayName: string | null },
): Promise<SeatSession> {
  const identityKey = 'futa05:severgrow.duel.identity.v1';
  const sessionKey = 'futa05:severgrow.duel.session.v1';
  const context = await duel.browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await installProbe(context);
  await context.addInitScript(
    ({ ik, identity }) => {
      try {
        localStorage.clear();
        localStorage.setItem(ik, JSON.stringify(identity));
        localStorage.setItem('futa05:severgrow.duel.firstCard.v1', '1');
        localStorage.setItem(
          'futa05:severgrow.settings.v1',
          JSON.stringify({ sound: false, music: false, coach: false, speed: 'fast', reduceMotion: true, eyeCandy: false, autoSkip: false }),
        );
      } catch {
        /* storage blocked: the flow will report it */
      }
    },
    { ik: identityKey, identity: { token: guest.token, playerId: guest.playerId, displayName: guest.displayName, kind: 'guest' } },
  );
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(duel.origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#menu', { timeout: 30_000 });
  await page.waitForTimeout(500);
  return { seat: 0, guest: { ...guest }, context, page, identityKey, sessionKey };
}
