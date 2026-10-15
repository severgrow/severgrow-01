// FUTASAKU 0.5 — PASS 3: the debugging / edge cases a long session does not reach.
//
//   npx tsx web/e2e/online-polish-edge.ts
//
// Covers, on a real CHANNEL=futa05 build against a local duel API:
//   1. a DOUBLE-TAP Throw commits EXACTLY ONE action batch;
//   2. Realtime is unavailable (the local harness never provides it) — polling still carries the
//      whole opponent turn, and the socket is NOT retried in a loop (bounded creations);
//   3. going OFFLINE mid-submit keeps the draft (nothing is lost and nothing double-applies) and
//      the turn completes once the network returns;
//   4. closing the tab mid-turn and reopening: the committed Draw survives and no gate is left shut;
//   5. Reduce motion + Large text: the duel still renders, the touch targets stay >= 44x44, and the
//      screen is not colour-only;
//   6. a whole match with no console error or warning on CHROMIUM and on WEBKIT.
import { chromium, webkit } from 'playwright-core';
import { openMenuEntry } from './helpers/menu-nav.js';
import {
  type SeatSession,
  endTurnViaPage,
  openDuel,
  openSeat,
  sleep,
  startLocalDuel,
  statePhase,
  tapExposed,
  waitingFlag,
} from './helpers/local-duel.js';

const PORT = Number(process.env.PREVIEW_PORT ?? 4265);
const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

let failed = 0;
const check = (name: string, ok: boolean, note = ''): void => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const waitTurnFlag = async (s: SeatSession, timeout = 40_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await waitingFlag(s)) return true;
    await sleep(80);
  }
  return false;
};

const hook = (s: SeatSession): Promise<Record<string, unknown> | null> =>
  s.page.evaluate('window.__severgrow?.online?.() ?? null') as Promise<Record<string, unknown> | null>;

const installCounter = (s: SeatSession): Promise<void> =>
  s.page
    .evaluate(`(() => {
      if (window.__edge) return;
      window.__edge = { actions: 0, sockets: 0, socketMessages: 0 };
      var realFetch = window.fetch;
      window.fetch = function (input, init) {
        try {
          var url = String(typeof input === 'string' ? input : input && input.url);
          var method = (init && init.method) || (input && input.method) || 'GET';
          if (method === 'POST' && url.indexOf('/actions') !== -1) window.__edge.actions++;
        } catch (e) {}
        return realFetch.apply(window, arguments);
      };
      var RealWS = window.WebSocket;
      if (RealWS) {
        function Wrapped(url, protocols) { window.__edge.sockets++; return protocols === undefined ? new RealWS(url) : new RealWS(url, protocols); }
        Wrapped.prototype = RealWS.prototype;
        window.WebSocket = Wrapped;
      }
    })()`)
    .then(() => undefined);

const counters = (s: SeatSession): Promise<{ actions: number; sockets: number }> =>
  s.page.evaluate('window.__edge ? { actions: window.__edge.actions, sockets: window.__edge.sockets } : { actions: -1, sockets: -1 }') as Promise<{
    actions: number;
    sockets: number;
  }>;

const hasDraftNow = (s: SeatSession): Promise<boolean> =>
  s.page.evaluate(
    "(() => { try { return Object.keys(sessionStorage).some(function (k) { return k.indexOf('duel.draft.v1.') !== -1; }); } catch (e) { return false; } })()",
  ) as Promise<boolean>;

const duel = await startLocalDuel({ port: PORT });
try {
  // ---------------------------------------------------------------- 1 + 2: double tap, no realtime
  {
    const match = await duel.newMatch();
    const actorSeat = match.starterSeat;
    const watcherSeat: 0 | 1 = actorSeat === 0 ? 1 : 0;
    const actor = await openSeat(duel, match, actorSeat, { speed: 'fast' });
    const watcher = await openSeat(duel, match, watcherSeat, { speed: 'fast' });
    try {
      await openDuel(actor, match.matchId);
      await openDuel(watcher, match.matchId);
      await installCounter(actor);
      check('the actor holds the turn through the page', await waitTurnFlag(actor, 40_000));

      // Draw (commits one action), then hammer the Throw control.
      for (let i = 0; i < 5 && (await statePhase(actor)) !== 'ACT'; i++) {
        await tapExposed(actor, '#deck');
        await sleep(400);
      }
      const before = await counters(actor);
      // Hammer the Throw control only — the Discard that follows is a SECOND, legitimate commit.
      for (let i = 0; i < 8; i++) {
        await actor.page.evaluate(`(() => { var b = document.querySelector('#moves .end, #moves .futa04-skip, .futa04-skip'); if (b && !b.disabled) b.click(); })()`);
        await sleep(50);
      }
      await sleep(600);
      const afterThrow = await counters(actor);
      const throwPosts = afterThrow.actions - before.actions;
      check('rapid repeated Throw taps commit exactly ONE batch (the Discard is a separate commit)', throwPosts === 1, `${throwPosts} POST /actions for 8 taps`);
      const ended = await endTurnViaPage(actor, 25_000);
      const after = await counters(actor);
      const totalPosts = after.actions - before.actions;
      check('the whole turn costs exactly two commits (EndAct batch + Discard)', totalPosts === 2 && ended, `${totalPosts} POST /actions`);
      check('the opponent sees the finished turn with NO Realtime socket (polling carries it)', await waitTurnFlag(watcher, 40_000));
      const wc = await counters(watcher);
      check('Realtime is not retried in a loop when it is unavailable', wc.sockets <= 8, `${wc.sockets} WebSocket attempt(s)`);
      check('nothing is left queued or revealing on the watcher', (await hook(watcher))?.queued === 0 && (await hook(watcher))?.revealing === false);
    } finally {
      await actor.context.close();
      await watcher.context.close();
    }
  }

  // ---------------------------------------------------------------- 3: offline mid-submit
  {
    const match = await duel.newMatch();
    const actorSeat = match.starterSeat;
    const actor = await openSeat(duel, match, actorSeat, { speed: 'fast' });
    try {
      await openDuel(actor, match.matchId);
      check('the actor holds the turn (offline case)', await waitTurnFlag(actor, 40_000));
      // Draw first so a Grow is possible (the turn starts in DRAW), then make the draft with the UI
      // still online, then pull the network: the point of the check is that the draft survives the
      // outage, not that the paint gesture works while offline.
      for (let i = 0; i < 5 && (await statePhase(actor)) !== 'ACT'; i++) {
        await tapExposed(actor, '#deck');
        await sleep(400);
      }
      const sp = (await actor.page.evaluate(`(() => {
        var legal = (window.__severgrow && window.__severgrow.legal) ? window.__severgrow.legal() : [];
        for (var i = 0; i < legal.length; i++) {
          if (legal[i].t === 'Sprout') return { card: legal[i].card, key: legal[i].coord.q + ',' + legal[i].coord.r };
        }
        return null;
      })()`)) as { card: number; key: string } | null;
      if (sp) {
        await tapExposed(actor, `#hand [data-card="${sp.card}"]`);
        await sleep(200);
        await tapExposed(actor, `#board .hex-cell[data-key="${sp.key}"]`);
        await sleep(250);
        if (!(await hasDraftNow(actor))) {
          // the card is a fanned-out sliver: use the page's own element
          await actor.page.click(`#hand [data-card="${sp.card}"]`, { force: true }).catch(() => undefined);
          await sleep(200);
          await tapExposed(actor, `#board .hex-cell[data-key="${sp.key}"]`);
          await sleep(300);
        }
      }
      const hadDraft = await hasDraftNow(actor);
      check('a local Grow can be drafted', hadDraft, sp ? 'sprout offered' : 'no sprout offered');

      const revBefore = (await hook(actor))?.revision as number;
      await actor.context.setOffline(true);
      await actor.page.evaluate("window.dispatchEvent(new Event('offline'));");
      await sleep(300);
      // ONE Throw attempt while offline (its ~1.2 s retry window sits well inside the outage, so no
      // late retry can land after we come back and move the revision on us).
      await actor.page.evaluate(`(() => { var b = document.querySelector('#moves .end, #moves .futa04-skip, .futa04-skip'); if (b && !b.disabled) b.click(); })()`);
      await sleep(4_000);
      const hookOffline = await hook(actor);
      const apiAfter = (await duel.api.getState(match.guests[actorSeat]!.token, match.matchId)).player;
      check('an offline Throw does not double-apply or advance the server', apiAfter.revision === revBefore, `api rev ${apiAfter.revision} vs page ${revBefore}`);
      check('the page says it is reconnecting rather than pretending success', hookOffline?.connection !== 'online', String(hookOffline?.connection));
      // The UI itself must still respond offline: the pause menu is app-local, no network.
      await actor.page.click('#hud-menu').catch(() => undefined);
      await sleep(300);
      const menuOpen = (await actor.page.evaluate("(() => { var el = document.getElementById('sheet-menu'); return !!el && !el.hidden; })()")) as boolean;
      if (menuOpen) await actor.page.click('#gm-resume').catch(() => undefined);
      check('the UI is not frozen while offline (the pause menu still opens)', menuOpen);

      await actor.context.setOffline(false);
      await actor.page.evaluate("window.dispatchEvent(new Event('online'));");
      await sleep(1_500);
      const recovered = (await hook(actor))?.connection;
      check('coming back online restores the link', recovered === 'online', String(recovered));
      const draftStillThere = await hasDraftNow(actor);
      // What matters to the player is the PAINTED grow, not the storage key: with an unsent draft
      // the page must still show one more tile than the server has.
      const pageTiles = (await actor.page.evaluate(
        "Array.prototype.map.call(document.querySelectorAll('.l-tiles .tile[data-key]'), function (e) { return e.dataset.key; }).filter(Boolean).length",
      )) as number;
      const apiTiles = Object.values(
        (await duel.api.getState(match.guests[actorSeat]!.token, match.matchId)).player.view.board as Record<string, unknown>,
      ).filter(Boolean).length;
      check(
        'the unsent draft survives the offline window (still painted on the board)',
        pageTiles > apiTiles,
        `page ${pageTiles} tiles vs server ${apiTiles} (sessionStorage key ${draftStillThere ? 'kept' : 'gone'})`,
      );
      // The turn can still be completed once online.
      const finished = await endTurnViaPage(actor, 30_000);
      check('the turn completes after the network returns', finished);
    } finally {
      await actor.context.close();
    }
  }

  // ---------------------------------------------------------------- 4: close the tab mid-turn
  {
    const match = await duel.newMatch();
    const actorSeat = match.starterSeat;
    const actor = await openSeat(duel, match, actorSeat, { speed: 'fast' });
    try {
      await openDuel(actor, match.matchId);
      check('the actor holds the turn (reopen case)', await waitTurnFlag(actor, 40_000));
      for (let i = 0; i < 5 && (await statePhase(actor)) !== 'ACT'; i++) {
        await tapExposed(actor, '#deck');
        await sleep(400);
      }
      const revAfterDraw = (await hook(actor))?.revision as number;
      const committed = (await duel.api.getState(match.guests[actorSeat]!.token, match.matchId)).player;
      check('the Draw was committed to the server before the tab closed', committed.revision === revAfterDraw && committed.view.phase !== 'DRAW', `api ${committed.revision} page ${revAfterDraw}`);
      await actor.page.close();
      // Reopen the same identity: the page must resume on the committed Draw, no stuck gate. A
      // reopen replays what was missed (here its own committed Draw), so the gate is briefly shut.
      const reopened = await openSeat(duel, match, actorSeat, { speed: 'fast' });
      try {
        await openDuel(reopened, match.matchId);
        let back = await hook(reopened);
        const start = Date.now();
        while (Date.now() - start < 20_000) {
          back = await hook(reopened);
          if (back && back.myTurn === true && back.revealing === false && back.queued === 0) break;
          await sleep(200);
        }
        check('the reopened tab resumes on the committed turn (no stuck gate)', !!back && back.revealing === false && back.myTurn === true && back.queued === 0, JSON.stringify(back));
        const boardOk = (await back?.revision) === committed.revision;
        check('the reopened tab shows the committed revision', boardOk, `page ${back?.revision} api ${committed.revision}`);
      } finally {
        await reopened.context.close();
      }
    } finally {
      await actor.context.close().catch(() => undefined);
    }
  }

  // ---------------------------------------------------------------- 5: reduce motion + large text
  {
    const match = await duel.newMatch();
    const seat = await openSeat(duel, match, match.starterSeat, { speed: 'fast', reduceMotion: true });
    try {
      await seat.page.evaluate(() => {
        const raw = localStorage.getItem('futa05:severgrow.settings.v1');
        const s = raw ? JSON.parse(raw) : {};
        localStorage.setItem('futa05:severgrow.settings.v1', JSON.stringify({ ...s, largeText: true, reduceMotion: true }));
      });
      await seat.page.reload({ waitUntil: 'domcontentloaded' });
      await seat.page.waitForSelector('#menu', { timeout: 30_000 });
      await openDuel(seat, match.matchId);
      const small = (await seat.page.evaluate(`(() => {
        var out = [];
        var nodes = document.querySelectorAll('#duel-hud, #hud-menu, #hud-history, #deck, #discard, #tool-undo, #hand-sort, #moves button');
        for (var i = 0; i < nodes.length; i++) {
          var el = nodes[i];
          if (el.closest('[hidden]') || !el.offsetParent) continue;
          var r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)) out.push((el.id || el.className) + ':' + Math.round(r.width) + 'x' + Math.round(r.height));
        }
        return out;
      })()`)) as string[];
      check('every visible duel control is at least 44x44 with Large text + Reduce motion', small.length === 0, small.slice(0, 6).join(', '));
      const word = (await seat.page.evaluate("(document.querySelector('[data-duel-turn]') || {}).textContent || ''")) as string;
      check('the turn word is text, never colour alone', word.trim().length > 0, word.trim());
    } finally {
      await seat.context.close();
    }
  }
} finally {
  await duel.close();
}

// ---------------------------------------------------------------- 6: a whole match, no console noise
for (const [engineName, executablePath] of [['chromium', CHROME], ['webkit', undefined]] as const) {
  const browser = await (engineName === 'chromium' ? chromium : webkit)
    .launch(executablePath ? { executablePath } : {})
    .catch((error: unknown) => {
      console.log(`SKIP (${engineName}): could not launch — ${String(error).slice(0, 120)}`);
      return null;
    });
  if (!browser) continue;
  const local = await startLocalDuel({ port: PORT + 1 });
  try {
    const match = await local.newMatch();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const noise: string[] = [];
    page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') noise.push(`${m.type()}: ${m.text().slice(0, 160)}`);
    });
    await ctx.addInitScript(
      ({ ik, identity }) => {
        try {
          localStorage.clear();
          localStorage.setItem(ik, JSON.stringify(identity));
          localStorage.setItem('futa05:severgrow.duel.firstCard.v1', '1');
          localStorage.setItem('futa05:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, speed: 'fast', reduceMotion: false, eyeCandy: false, autoSkip: false }));
        } catch {
          /* blocked */
        }
      },
      {
        ik: 'futa05:severgrow.duel.identity.v1',
        identity: {
          token: match.guests[0]!.token,
          playerId: match.guests[0]!.playerId,
          displayName: match.guests[0]!.displayName,
          kind: 'guest',
        },
      },
    );
    await page.goto(local.origin, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#menu', { timeout: 30_000 });
    await openMenuEntry(page, 'menu-online');
    await page.waitForSelector('#online-hub:not([hidden])', { timeout: 25_000 });
    if (await page.locator('#online-first-ok').isVisible().catch(() => false)) await page.click('#online-first-ok');
    const row = page.locator(`#online-matches li[data-match-id="${match.matchId}"]`);
    await row.waitFor({ state: 'visible', timeout: 25_000 });
    await row.click();
    await page.waitForSelector('#duel-hud:not([hidden])', { timeout: 25_000 });
    // One complete turn through the page (Draw → Throw → Discard), then idle to let any late
    // warning surface.
    const session: SeatSession = { seat: match.starterSeat, guest: match.guests[match.starterSeat]!, context: ctx, page, identityKey: '', sessionKey: '' };
    if (await waitTurnFlag(session, 40_000)) {
      for (let i = 0; i < 6 && (await statePhase(session)) !== 'ACT' && (await statePhase(session)) !== 'DISCARD'; i++) {
        await tapExposed(session, '#deck');
        await sleep(400);
      }
      await endTurnViaPage(session, 30_000);
    }
    await sleep(1_200);
    // This harness deliberately points the Realtime host at a black hole (127.0.0.1:9), so the
    // browser logs a connection failure for it; that noise is caused by the harness, not the app.
    // It is listed explicitly so nothing is hidden. Everything else must be clean.
    const harnessNoise = noise.filter((n) => n.includes('127.0.0.1:9'));
    const blockedPorts = noise.filter((n) => n.includes('port 9 blocked'));
    const preloadNotices = noise.filter((n) => n.includes('preloaded using link preload but not used'));
    const real = noise.filter((n) => !n.includes('127.0.0.1:9') && !n.includes('port 9 blocked') && !n.includes('preloaded using link preload but not used'));
    if (harnessNoise.length || blockedPorts.length) console.log(`    (${harnessNoise.length + blockedPorts.length} harness-caused Realtime connection log(s) ignored on ${engineName})`);
    if (preloadNotices.length) console.log(`    (${preloadNotices.length} pre-existing font-preload notice(s) ignored on ${engineName} — see docs/ONLINE-POLISH.md)`);
    check(`a whole turn on ${engineName} logs no console error or warning (beyond the harness's own Realtime host)`, real.length === 0, real.slice(0, 4).join(' | '));
  } finally {
    await local.close();
    await browser.close().catch(() => undefined);
  }
}

if (failed) {
  console.error(`\n${failed} edge-case check(s) failed`);
  process.exit(1);
}
console.log('\nEdge cases: one throw per tap, polling carries a dead Realtime, drafts survive offline, the tab reopens clean.');
