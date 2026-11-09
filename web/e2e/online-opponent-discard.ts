// Real public opponent turns through the same pipeline used by Blitz and ordinary online games.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Action } from '../../src/engine/index.js';
import { startLocalDuel, openSeat, openDuel } from './helpers/local-duel.js';
import { createLiveApi } from '../src/online/live/api.js';
import { applyAs, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import { positionSave } from './position.js';

const out = process.env.SHOTS ?? '/tmp/opponent-discard';
mkdirSync(out, { recursive: true });
const duel = await startLocalDuel({ port: 4319 });
try {
  for (const variant of [
    { width: 390, height: 844, mode: 'async' }, { width: 1440, height: 900, mode: 'async' },
    { width: 390, height: 844, mode: 'blitz' }, { width: 1440, height: 900, mode: 'blitz' },
    { width: 390, height: 844, mode: 'reduced' },
    { width: 390, height: 844, mode: 'async', drawFrom: 'discard' },
    { width: 1440, height: 900, mode: 'async', drawFrom: 'discard' },
    { width: 390, height: 844, mode: 'blitz', drawFrom: 'discard' },
    { width: 1440, height: 900, mode: 'blitz', drawFrom: 'discard' },
  ]) {
    const { mode, drawFrom = 'deck', ...viewport } = variant;
    if (process.env.DISCARD_MODE && process.env.DISCARD_MODE !== mode) continue;
    const match = await duel.newMatch();
    const actor = match.starterSeat;
    const watcher = actor === 0 ? 1 : 0;
    const seat = await openSeat(duel, match, watcher, { viewport, isMobile: viewport.width < 500, reduceMotion: mode === 'reduced' });
    await seat.page.evaluate('window.__name = f => f;');
    await openDuel(seat, match.matchId);
    await seat.page.waitForFunction(() => !(window as any).__severgrow.busy());
    if (mode === 'blitz') {
      const from = createLiveApi({ baseUrl: duel.apiBase, token: () => match.guests[actor].token });
      const to = createLiveApi({ baseUrl: duel.apiBase, token: () => match.guests[watcher].token });
      await from.presence('in_match', match.matchId); await to.presence('in_match', match.matchId);
      const invite = await from.challenge(match.matchId); await to.accept(invite.challenge.id);
      await seat.page.waitForFunction(() => document.documentElement.dataset.blitzDuel === '1');
    }
    await seat.page.evaluate(() => {
      const trace: unknown[] = [];
      (window as any).__discardFlight = trace;
      (window as any).__opponentDraw = [];
      const layer = document.getElementById('enemy-flight')!;
      new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement) || !node.matches('.flyer.opp')) continue;
          if (node.matches('.back')) {
            const box = layer.getBoundingClientRect();
            (window as any).__opponentDraw.push({x: box.x + parseFloat(node.style.left), y: box.y + parseFloat(node.style.top)});
            continue;
          }
          const sample = () => {
            const r = node.getBoundingClientRect();
            trace.push({ x: r.x, y: r.y, width: r.width, opacity: Number(getComputedStyle(node).opacity),
              pile: document.getElementById('discard-top')?.dataset.faceKey });
            if (node.isConnected) requestAnimationFrame(sample);
          };
          sample();
        }
      }).observe(layer, { childList: true });
    });
    const before = await seat.page.locator('#discard-top').getAttribute('data-face-key');
    const drawOrigin = (await seat.page.locator(`#${drawFrom === 'deck' ? 'deck' : 'discard'} .pile-card`).first().boundingBox())!;
    let thrown: { id: number; suit: unknown; rank: number } | null = null;
    for (const t of ['Draw', 'EndAct', 'Discard']) {
      const view = (await duel.api.getState(match.guests[actor].token, match.matchId)).player;
      const action = view.legalActions.find(a => a.t === t && (a.t !== 'Draw' || a.from === drawFrom)) as Action;
      assert(action, `legal ${t}`);
      if (action.t === 'Discard') thrown = view.view.hand.find(c => c.id === action.card)!;
      await duel.api.submitAction(match.guests[actor].token, match.matchId, {
        action, expectedRevision: view.revision, requestId: `discard-${viewport.width}-${t}`,
      });
    }
    // THE TURN ARRIVES AT ONCE (owner, 2026-11-09: "in async the move wasn't shown straight away to
    // the other player ... for good 15 seconds. ... this should never ever break in future"). From the
    // server accepting the throw to the watcher's screen starting to show it: under 3 seconds.
    const acceptedAt = Date.now();
    await seat.page.waitForFunction(() => (window as any).__discardFlight.length > 0, undefined, { timeout: 15000 });
    const arrivedMs = Date.now() - acceptedAt;
    console.log(`${mode} ${viewport.width}: the opponent's turn reached the screen in ${arrivedMs} ms`);
    assert(arrivedMs < 3000, `the opponent's finished turn must reach the watcher within 3 s (took ${arrivedMs} ms)`);
    await seat.page.waitForFunction(() => (window as any).__discardFlight.length > 3, undefined, { timeout: 15000 }).catch(async error => {
      console.log(JSON.stringify(await seat.page.evaluate(() => ({
        online: (window as any).__severgrow.online(), trace: (window as any).__discardFlight,
        steps: (window as any).__severgrow.animLog(), settings: (window as any).__severgrow.settings(),
        seat: document.getElementById('opp-seat')?.getBoundingClientRect().toJSON(),
      }))));
      await seat.page.screenshot({ path: `${out}/failure-${mode}-${viewport.width}.png` });
      throw error;
    });
    await seat.page.screenshot({ path: `${out}/flight-${mode}-${viewport.width}.png` });
    await seat.page.waitForFunction(() => {
      const h = (window as any).__severgrow;
      return h.online()?.myTurn && !h.busy() && !document.querySelector('.flyer.opp');
    }, undefined, { timeout: 15000 });
    const trace = await seat.page.evaluate(() => (window as any).__discardFlight) as { x:number; y:number; width:number; opacity:number; pile:string }[];
    const visible = trace.filter(s => s.opacity > .5 && s.width > 20);
    writeFileSync(`${out}/trace-${mode}-${viewport.width}.json`, JSON.stringify({ before, thrown, trace }, null, 2));
    assert(visible.length >= 3, 'opponent card is visible, not just a pile replacement');
    if (mode !== 'reduced') assert(Math.hypot(visible.at(-1)!.x-visible[0]!.x, visible.at(-1)!.y-visible[0]!.y) > 40, 'card travels from opponent hand');
    if(drawFrom === 'deck') assert(visible.some(s => s.pile === before), 'old pile remains under the approaching card');
    const starts = await seat.page.evaluate(() => (window as any).__opponentDraw) as {x:number;y:number}[];
    assert.equal(starts.length, 1, 'one opponent draw');
    assert(Math.hypot(starts[0]!.x-drawOrigin.x, starts[0]!.y-drawOrigin.y)<2, `draw starts at the actual ${drawFrom} pile`);
    assert.equal(await seat.page.locator('#discard-top').getAttribute('data-face-key'), `${thrown!.id}:${thrown!.suit}:${thrown!.rank}`);
    assert.equal(await seat.page.locator('.flyer.opp').count(), 0, 'flight cleans up');
    const presence = seat.page.locator('[data-duel-presence]');
    const bolt = seat.page.locator('[data-live="pill"]');
    if (await presence.isVisible() && await bolt.isVisible()) {
      const labelBox = (await presence.boundingBox())!;
      const boltBox = (await bolt.boundingBox())!;
      assert(labelBox.x >= boltBox.x + boltBox.width + 4, 'presence remains clear of the Blitz button during gameplay');
    }
    console.log(`PASS ${mode} ${viewport.width} from ${drawFrom}: correct draw origin, throw arrival and cleanup`);
    await seat.context.close();
  }
  if (!process.env.DISCARD_MODE || process.env.DISCARD_MODE === 'offline') {
    let state = newGame(42);
    if (state.actor === 0) for (const t of ['Draw', 'EndAct', 'Discard']) {
      const action = legalActions(viewFor(state, 0)).find(a => a.t === t && (a.t !== 'Draw' || a.from === 'deck'))!;
      state = applyAs(state, 0, action);
    }
    for (const t of ['Draw', 'EndAct']) state = applyAs(state, 1,
      legalActions(viewFor(state, 1)).find(a => a.t === t && (a.t !== 'Draw' || a.from === 'deck'))!);
    assert.equal(state.actor, 1); assert.equal(state.phase, 'DISCARD');
    const context = await duel.browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(save => {
      (window as any).__name = (f: unknown) => f;
      localStorage.setItem('futa05:severgrow.save.v7', save);
      localStorage.setItem('futa05:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, speed: 'normal', reduceMotion: false }));
      const trace: unknown[] = []; (window as any).__offlineDiscard = trace;
      new MutationObserver(records => {
        for (const r of records) for (const n of r.addedNodes) if (n instanceof HTMLElement && n.matches('.flyer.opp:not(.back)')) {
          const sample = () => {
            const b = n.getBoundingClientRect(); trace.push({ x:b.x, y:b.y, opacity:Number(getComputedStyle(n).opacity) });
            if (n.isConnected) requestAnimationFrame(sample);
          }; sample();
        }
      }).observe(document, { childList:true, subtree:true });
    }, positionSave({ state, level: 7 }));
    const page = await context.newPage(); await page.goto(duel.origin);
    await page.waitForFunction(() => (window as any).__severgrow?.ready());
    // Load a test position through the existing classic-resume handler. Product menus hide
    // this legacy entry; this checks the offline animation, not menu navigation.
    await page.evaluate(() => document.getElementById('menu-continue')!.click());
    await page.waitForFunction(() => {
      const h = (window as any).__severgrow;
      return (window as any).__offlineDiscard.length > 3 && h.state()?.actor === 0 && !h.busy();
    }, undefined, { timeout: 30000 });
    const trace = await page.evaluate(() => (window as any).__offlineDiscard) as { x:number; y:number; opacity:number }[];
    const visible = trace.filter(p => p.opacity > .5);
    assert(visible.length >= 3);
    assert(Math.hypot(visible.at(-1)!.x-visible[0]!.x, visible.at(-1)!.y-visible[0]!.y) > 40);
    assert.equal(await page.locator('.flyer.opp').count(), 0);
    writeFileSync(`${out}/trace-offline.json`, JSON.stringify(trace));
    console.log('PASS offline bot: visible moving card and cleanup through the shared animation');
    await context.close();
  }
} finally { await duel.close(); }
