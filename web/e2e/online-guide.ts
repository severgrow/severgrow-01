// The quiet help key inside a REAL online duel (owner + agreed design, 2026-11-10). A new guest who
// opens a friend's duel link: the Match Intel key shows "?" ("How to play"); on the opponent's turn a
// tap opens Match Intel; on my turn the first time a move is possible the key gets ONE edge light, a tap
// opens that lesson, and making a move closes it. Nothing opens by itself. Blitz: no "?".
// Run: node --import tsx web/e2e/online-guide.ts
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import type { Action } from '../../src/engine/index.js';
import { startLocalDuel, openSeat, openDuel } from './helpers/local-duel.js';
import { createLiveApi } from '../src/online/live/api.js';

const out = process.env.SHOTS ?? '/tmp/online-guide';
mkdirSync(out, { recursive: true });
const glassOpen = (mode: string) => `(() => { const g = document.getElementById('futasaku-glass'); return !!g && !g.hidden && g.dataset.mode === '${mode}'; })()`;
const glassShut = `(() => { const g = document.getElementById('futasaku-glass'); return !g || g.hidden; })()`;
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
  const key = page.locator('#futa04-help-button');
  const fresh = () => page.evaluate(() => document.documentElement.classList.contains('futasaku-guide-fresh'));

  // 1. Their turn: "?" in the help key, no label, nothing open; a tap opens Match Intel.
  await page.waitForFunction(() => document.documentElement.classList.contains('futasaku-guide-fresh'), undefined, { timeout: 15000 });
  const box = (await key.boundingBox())!;
  assert(box.width >= 44 && box.height >= 44, 'the help key is a 44px target');
  assert.equal(await key.getAttribute('aria-label'), 'How to play');
  assert.equal(await page.locator('#futasaku-guide-label').count(), 0, 'no label');
  assert(await page.evaluate(glassShut), 'nothing opens by itself');
  await key.click();
  await page.waitForFunction(glassOpen('intel'), undefined, { timeout: 5000 });
  console.log('their turn: "?" opens Match Intel');
  await page.keyboard.press('Escape');
  await page.waitForFunction(glassShut, undefined, { timeout: 5000 });

  // 2. The opponent plays a whole turn through the server.
  for (const t of ['Draw', 'EndAct', 'Discard']) {
    const v = (await duel.api.getState(match.guests[actor].token, match.matchId)).player;
    const action = v.legalActions.find((a) => a.t === t && (a.t !== 'Draw' || a.from === 'deck')) as Action;
    assert(action, `legal ${t}`);
    await duel.api.submitAction(match.guests[actor].token, match.matchId, { action, expectedRevision: v.revision, requestId: `guide-${t}` });
  }
  await page.waitForFunction(() => { const h = (window as any).__severgrow; return h.online()?.myTurn && !h.busy(); }, undefined, { timeout: 15000 });

  // 3. My turn: draw -> a move possible for the first time -> one edge light, nothing opens.
  await page.waitForTimeout(400);
  assert(await page.evaluate(glassShut), 'my turn: still nothing opens by itself');
  await page.locator('#deck .pile-card').first().click({ force: true });
  await page.waitForFunction(() => document.getElementById('futa04-help-button')!.classList.contains('guide-hint'), undefined, { timeout: 8000 });
  await page.screenshot({ path: `${out}/grow-light.png` });
  await page.waitForFunction(() => !document.getElementById('futa04-help-button')!.classList.contains('guide-hint'), undefined, { timeout: 4000 });
  assert(await page.evaluate(glassShut), 'the light never opens the window');
  console.log('drew: one edge light, gone by itself');

  // 4. A tap opens that lesson; making a move closes it.
  await key.click();
  await page.waitForFunction(glassOpen('tutorial'), undefined, { timeout: 5000 });
  const words = (await page.locator('#futasaku-glass').innerText()).replace(/\s+/g, ' ');
  console.log(`tap: lesson "${words.slice(0, 60)}"`);
  assert(/grow|bloom|strengthen|cut|bomb|blast/i.test(words), 'the lesson for a move possible now');
  await page.screenshot({ path: `${out}/grow-lesson.png` });
  // Any real move closes it: Skip (end the act) is on the context key now. Clicked without a
  // pointerdown, so it is the MOVE that closes the lesson, not the tap-elsewhere rule.
  await page.waitForFunction(() => document.getElementById('smart-context')?.dataset.action === 'skip', undefined, { timeout: 5000 });
  await page.locator('#smart-context').evaluate((el) => (el as HTMLButtonElement).click());
  await page.waitForFunction(glassShut, undefined, { timeout: 5000 });
  console.log('the move (Skip) closed the lesson');
  assert(await fresh(), 'still a new player');

  // 5. Blitz: the help key is the bulb again, no "?".
  const from = createLiveApi({ baseUrl: duel.apiBase, token: () => match.guests[actor].token });
  const to = createLiveApi({ baseUrl: duel.apiBase, token: () => match.guests[me].token });
  await from.presence('in_match', match.matchId); await to.presence('in_match', match.matchId);
  const invite = await from.challenge(match.matchId); await to.accept(invite.challenge.id);
  await page.waitForFunction(() => document.documentElement.dataset.blitzDuel === '1', undefined, { timeout: 15000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains('futasaku-guide-fresh'), undefined, { timeout: 8000 });
  console.log('blitz: no "?"');
  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS online guide');
  await seat.context.close();
} finally { await duel.close(); }
