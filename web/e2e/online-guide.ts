// The in-game guide inside a REAL online duel (owner, 2026-11-09: a new player who opens a friend's
// duel link learns inside that game). On the opponent's turn "?" opens Match Intel; on my turn it
// opens the lesson window for the next beat, and the window closes when I make that move.
// Blitz turns the guide off. Run: node --import tsx web/e2e/online-guide.ts
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import type { Action } from '../../src/engine/index.js';
import { startLocalDuel, openSeat, openDuel } from './helpers/local-duel.js';
import { createLiveApi } from '../src/online/live/api.js';

const out = process.env.SHOTS ?? '/tmp/online-guide';
mkdirSync(out, { recursive: true });
const duel = await startLocalDuel({ port: 4327 });
try {
  const match = await duel.newMatch();
  const actor = match.starterSeat;
  const me = actor === 0 ? 1 : 0;
  const seat = await openSeat(duel, match, me, { viewport: { width: 390, height: 844 }, isMobile: true });
  const { page } = seat;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluate('window.__name = f => f;');
  await openDuel(seat, match.matchId);
  await page.waitForFunction(() => !(window as any).__severgrow.busy());
  const context = page.locator('#smart-context');

  // 1. Their turn: "?" is in the context key; the label shows (a first game); "?" opens Match Intel.
  await page.waitForFunction(() => document.getElementById('smart-context')?.dataset.action === 'guide', undefined, { timeout: 15000 });
  assert(await page.locator('#futasaku-guide-label').isVisible(), 'HOW TO PLAY label shows in a first online game');
  const keyBox = (await context.boundingBox())!;
  assert(keyBox.width >= 44 && keyBox.height >= 44, '"?" is a 44px target');
  await context.click();
  await page.waitForFunction(() => document.getElementById('futasaku-glass')?.dataset.mode === 'intel', undefined, { timeout: 5000 });
  const tab = await page.locator('#futasaku-glass .intel-tab[aria-selected="true"]').textContent();
  console.log(`their turn: "?" opened Match Intel on the ${tab?.trim()} tab`);
  await page.screenshot({ path: `${out}/their-turn-intel.png` });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('futasaku-glass')?.dataset.mode !== 'intel' || document.getElementById('futasaku-glass')!.hidden, undefined, { timeout: 5000 });

  // 2. The opponent plays a whole turn through the server.
  for (const t of ['Draw', 'EndAct', 'Discard']) {
    const v = (await duel.api.getState(match.guests[actor].token, match.matchId)).player;
    const action = v.legalActions.find((a) => a.t === t && (a.t !== 'Draw' || a.from === 'deck')) as Action;
    assert(action, `legal ${t}`);
    await duel.api.submitAction(match.guests[actor].token, match.matchId, { action, expectedRevision: v.revision, requestId: `guide-${t}` });
  }
  await page.waitForFunction(() => { const h = (window as any).__severgrow; return h.online()?.myTurn && !h.busy(); }, undefined, { timeout: 15000 });

  // 3. My turn: "?" opens the DRAW lesson window with the Draw pile lit; drawing closes it.
  await page.waitForFunction(() => document.getElementById('smart-context')?.dataset.action === 'guide', undefined, { timeout: 15000 });
  await context.click();
  await page.waitForFunction(() => document.getElementById('futasaku-glass')?.dataset.mode === 'tutorial', undefined, { timeout: 5000 });
  const words = (await page.locator('#futasaku-glass').innerText()).replace(/\s+/g, ' ');
  console.log(`my turn: "?" opened the lesson window: ${words.slice(0, 90)}`);
  assert(/draw/i.test(words), 'the first beat on my Draw is DRAW');
  // The LED speaks for my turn (the step word), never the opponent's "WAIT", once the turn has landed.
  await page.waitForTimeout(1200);
  const led = (await page.locator('#smart-led').innerText()).trim();
  console.log(`LED on my turn: ${JSON.stringify(led)}`);
  await page.screenshot({ path: `${out}/my-turn-window.png` });
  await page.locator('#deck .pile-card').first().click({ force: true }); // the pile pulses (never "stable")
  await page.waitForFunction(() => { const g = document.getElementById('futasaku-glass'); return !g || g.hidden || g.dataset.mode !== 'tutorial'; }, undefined, { timeout: 5000 });
  console.log('drawing closed the window');

  // 4. Blitz: the guide is fully off ("?" gone, label gone).
  const from = createLiveApi({ baseUrl: duel.apiBase, token: () => match.guests[actor].token });
  const to = createLiveApi({ baseUrl: duel.apiBase, token: () => match.guests[me].token });
  await from.presence('in_match', match.matchId); await to.presence('in_match', match.matchId);
  const invite = await from.challenge(match.matchId); await to.accept(invite.challenge.id);
  await page.waitForFunction(() => document.documentElement.dataset.blitzDuel === '1', undefined, { timeout: 15000 });
  await page.waitForTimeout(400);
  assert.notEqual(await context.getAttribute('data-action'), 'guide', 'no "?" in Blitz');
  assert(!(await page.locator('#futasaku-guide-label').isVisible().catch(() => false)), 'no label in Blitz');
  console.log('blitz: guide off');
  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS online guide');
  await seat.context.close();
} finally { await duel.close(); }
