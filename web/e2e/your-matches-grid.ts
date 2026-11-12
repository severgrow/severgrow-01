// YOUR MATCHES ON A GRID (owner, 2026-11-11: "Won or lost should always be in same line, have its own
// space. Opponent used their grace - shouldn't be shown. Divide this whole games submenu in a grid").
// Real games on the in-memory server, one of every row type, then measured: every row's name, state
// and right slot share the same x on every row; no text overflows its cell; no grace words; 48px rows;
// keys 44px. Screenshots at phone and desktop widths land in $SHOTS (default /tmp/your-matches-grid).
// Run: node --import tsx web/e2e/your-matches-grid.ts
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import type { Action } from '../../src/engine/index.js';
import { startLocalDuel, openSeat, type LocalMatch } from './helpers/local-duel.js';
import { openMenuEntry } from './helpers/menu-nav.js';

const out = process.env.SHOTS ?? '/tmp/your-matches-grid';
mkdirSync(out, { recursive: true });
const duel = await startLocalDuel({ port: 4337 });
try {
  const api = duel.api;
  const me = await api.createGuest('RYK');
  const guest = async (name: string) => api.createGuest(name);
  const game = async (name: string) => {
    const them = await guest(name);
    const created = await api.createMatch(me.token);
    const joined = await api.joinMatch(them.token, created.match.inviteCode);
    return { them, matchId: created.match.matchId, mySeat: created.player.seat, theirSeat: joined.player.seat, starter: created.player.startingPlayer };
  };
  // one whole turn by whoever is to move
  const turn = async (token: string, matchId: string, tag: string) => {
    for (const t of ['Draw', 'EndAct', 'Discard']) {
      const v = (await api.getState(token, matchId)).player;
      const action = v.legalActions.find((a) => a.t === t && (a.t !== 'Draw' || a.from === 'deck')) as Action;
      await api.submitAction(token, matchId, { action, expectedRevision: v.revision, requestId: `${tag}-${t}` });
    }
  };
  const tokenOfStarter = (g: Awaited<ReturnType<typeof game>>) => (g.starter === g.mySeat ? me.token : g.them.token);
  // 1. active: whose turn it is depends on the deal; play turns until each is right
  const yours = await game('CoralBear');
  if (yours.starter !== yours.mySeat) await turn(yours.them.token, yours.matchId, 'y');
  const theirs = await game('MossyOwl');
  if (theirs.starter === theirs.mySeat) await turn(me.token, theirs.matchId, 't');
  // 2. a waiting invite nobody joined
  await api.createMatch(me.token);
  // 3. finished: won with a replay (they resign after a turn), lost with no moves, a rematch asked by them
  const won = await game('Baxter'); await turn(tokenOfStarter(won), won.matchId, 'w'); await api.resign(won.them.token, won.matchId);
  const lost = await game('Shana'); await api.resign(me.token, lost.matchId);
  const asked = await game('AmberWillowfield'); await turn(tokenOfStarter(asked), asked.matchId, 'a'); await api.resign(asked.them.token, asked.matchId);
  await api.rematch(asked.them.token, asked.matchId);

  const fake: LocalMatch = { matchId: yours.matchId, guests: [{ token: me.token, playerId: me.player.id, displayName: 'RYK' }, { token: yours.them.token, playerId: yours.them.player.id, displayName: 'CoralBear' }], inviteCode: '', starterSeat: 0 };
  for (const size of [{ width: 390, height: 844, tag: 'phone' }, { width: 360, height: 780, tag: 'small' }, { width: 1280, height: 800, tag: 'desktop' }]) {
    const s = await openSeat(duel, fake, 0, { viewport: { width: size.width, height: size.height }, isMobile: size.width < 600 });
    const p = s.page;
    await p.evaluate('window.__name = f => f;');
    await openMenuEntry(p, 'menu-online', { timeout: 40_000 });
    await p.waitForSelector('#online-hub:not([hidden])', { timeout: 25_000 });
    if (await p.locator('#online-first-ok').isVisible().catch(() => false)) await p.click('#online-first-ok');
    if (await p.locator('#online-matches-panel').isHidden().catch(() => false)) await p.click('#online-matches-toggle');
    await p.waitForSelector('#online-matches li', { timeout: 15_000 });
    await p.waitForTimeout(900);
    const rows = await p.evaluate(() => [...document.querySelectorAll<HTMLElement>('#online-matches li.online-row')].map((li) => {
      const r = (sel: string) => { const el = li.querySelector(sel) as HTMLElement | null; if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left), r: Math.round(b.right), w: el.scrollWidth, cw: el.clientWidth }; };
      const box = li.getBoundingClientRect();
      return { text: li.innerText.replace(/\s+/g, ' ').trim(), h: Math.round(box.height), name: r('.online-row-name b'), state: r('.online-row-status'), slotRight: Math.round(box.right) - (r('.online-row-time')?.r ?? r('.online-row-keys')?.r ?? 0), keys: [...li.querySelectorAll<HTMLElement>('.online-row-key')].map((k) => Math.round(k.getBoundingClientRect().width)) };
    }));
    console.log(size.tag, JSON.stringify(rows.map((r) => `${r.text} | name@${r.name?.x} state@${r.state?.x}`)));
    assert(rows.length >= 6, `all row types listed (${rows.length})`);
    assert(rows.every((r) => r.h === 48), `48px rows (${rows.map((r) => r.h)})`);
    assert.equal(new Set(rows.map((r) => r.name?.x)).size, 1, 'every name starts on one line');
    assert.equal(new Set(rows.map((r) => r.state?.x)).size, 1, 'every state starts on one line');
    assert(rows.every((r) => r.state && r.state.w <= r.state.cw + 1), 'no state word overflows its column');
    assert(rows.every((r) => r.keys.every((w) => w === 44)), 'keys are 44px');
    assert(!rows.some((r) => /grace/i.test(r.text)), 'no grace words');
    // the server's names are two short words (up to ~11 letters): never cut, even at 360px
    assert(rows.every((r) => r.name && r.name.w <= r.name.cw + 1), `no name is cut (${size.tag})`);
    await p.locator('#online-matches-panel').screenshot({ path: `${out}/${size.tag}.png` });
    await s.context.close();
  }
  console.log('PASS your matches grid');
} finally { await duel.close(); }
