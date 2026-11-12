// FUTASAKU 0.5 — board art that cannot load must NEVER be drawn.
//
// The owner's iPhone screenshot (an online duel, mid "Opponent's turn") showed three light-blue
// rounded-square tiles with a white "?" on the board. They are the browser's own "missing image"
// face: when an <image>'s request fails, WebKit paints a blue "?" tile in the element's box, at the
// tile's size and its board rotation, right on the board. The app asked for art it could not load,
// so the browser drew its placeholder instead of the board falling back to its own no-art look.
//
// This proves the fix on BOTH seats of a live duel: with every board-art request failing, the page
// must draw NO art element at all (so no placeholder can appear) and the board must still be there
// (flat territory colour, homes, number stones) — exactly the look the board has before art decodes.
//
//   npx tsx web/e2e/futa04-art-fallback.ts
//
// Fails on the pre-fix code (the board still holds <image> elements pointing at the failed files).
import { mkdirSync } from 'node:fs';
import { startLocalDuel, openSeat, openDuel } from './helpers/local-duel.js';
import type { LocalDuel, LocalMatch, SeatSession } from './helpers/local-duel.js';

const PORT = Number(process.env.PREVIEW_PORT ?? 4391);
const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (cond: () => Promise<boolean> | boolean, timeout = 30_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await cond()) return true; } catch { /* navigating */ }
    await tick(150);
  }
  return false;
};

/** Every board-art file this build ships: tile + home sprites, rocks and the ground. */
const ART = /(?:meadow|ashen|garden|fortress|rock_hex|empty_ground)/;

/** The art elements the page is holding right now, plus what the board itself still shows. */
const audit = (s: SeatSession) =>
  s.page.evaluate(`(() => {
    const art = /${ART.source}/;
    const all = Array.from(document.querySelectorAll('image'));
    const bad = all.filter((i) => art.test(i.getAttribute('href') || ''));
    const rect = (i) => { const r = i.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
    return {
      bad: bad.map((i) => ({ href: (i.getAttribute('href') || '').split('/').pop(), cls: i.getAttribute('class') || '', r: rect(i) })),
      artElements: all.length,
      tiles: document.querySelectorAll('#board .tile').length,
      homes: document.querySelectorAll('#board .default-home-art, #board .lm-body, #board [class*="landmark"]').length,
      stones: document.querySelectorAll('#board .seed-stone-value').length,
      boardShown: !!document.querySelector('#board'),
    };
  })()`) as Promise<{ bad: { href: string; cls: string; r: number[] }[]; artElements: number; tiles: number; homes: number; stones: number; boardShown: boolean }>;

const phase = (s: SeatSession): Promise<string> =>
  s.page.evaluate(() => (window as unknown as { __severgrow: { state: () => { phase: string } | null } }).__severgrow.state()?.phase ?? '');
const myTurn = (s: SeatSession): Promise<boolean> =>
  s.page.evaluate(() => !!(window as unknown as { __severgrow: { online: () => { myTurn: boolean } | null } }).__severgrow.online()?.myTurn);

/** One whole turn through the page's own controls (Draw, skip Grow, throw a card). */
const playTurn = async (s: SeatSession): Promise<void> => {
  if (!(await waitFor(() => myTurn(s), 40_000))) return;
  await waitFor(async () => (await phase(s)) === 'DRAW', 8_000);
  for (let i = 0; i < 6 && (await phase(s)) === 'DRAW'; i++) {
    await s.page.locator('#deck').click({ force: true }).catch(() => undefined);
    await waitFor(async () => (await phase(s)) !== 'DRAW', 4_000);
  }
  await waitFor(() => s.page.evaluate('!window.__severgrow.busy()') as Promise<boolean>, 10_000);
  for (let i = 0; i < 6 && (await phase(s)) === 'ACT'; i++) {
    await s.page.evaluate(`(() => { const b = document.querySelector('#moves .end, #moves .futa04-skip, .futa04-skip, .end'); if (b && !b.disabled) b.click(); })()`);
    await waitFor(async () => (await phase(s)) !== 'ACT', 4_000);
  }
  for (let i = 0; i < 6 && (await phase(s)) === 'DISCARD'; i++) {
    const card = (await s.page.evaluate(`(() => { const d = window.__severgrow.legal().filter((a) => a.t === 'Discard')[0]; return d ? d.card : null; })()`)) as number | null;
    if (card === null) break;
    await s.page.locator(`#hand [data-card="${card}"]`).click({ force: true }).catch(() => undefined);
    await tick(250);
    // Pick, then tap the pile: a second card tap only deselects (owner, 2026-10-25).
    await s.page.locator('#discard').click({ force: true }).catch(() => undefined);
    await waitFor(async () => (await phase(s)) !== 'DISCARD', 4_000);
  }
};

const duel: LocalDuel = await startLocalDuel({ port: PORT, turnTimeoutMs: 24 * 3_600_000 });
console.log(`built page on ${duel.origin}`);

const seat = async (match: LocalMatch, which: 0 | 1): Promise<SeatSession> => {
  const s = await openSeat(duel, match, which, { speed: 'skip', reduceMotion: true });
  // Every board-art request fails on this seat's device (the owner's phone, one asset at a time).
  await s.context.route(ART, (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'gone' }));
  await s.page.reload({ waitUntil: 'domcontentloaded' });
  return s;
};

try {
  const match = await duel.newMatch();
  const a = await seat(match, 0);
  const b = await seat(match, 1);
  await openDuel(a, match.matchId);
  await openDuel(b, match.matchId);
  for (const s of [a, b]) for (let i = 0; i < 2; i++) { if (!(await myTurn(s))) break; await playTurn(s); await tick(500); }
  for (const [name, s] of [['seat0', a], ['seat1', b]] as const) {
    await waitFor(async () => !(await myTurn(s)), 40_000);
    await tick(900);
    const seen = await audit(s);
    check(`${name}: no art element points at a failed file`, seen.bad.length === 0,
      seen.bad.length ? `${seen.bad.length} drawn: ${seen.bad.map((x) => `${x.href}@${x.r.join(',')}`).join(' ')}` : `0 of ${seen.artElements} art elements`);
    check(`${name}: the board is still a board (fallback look, not a blank)`,
      seen.boardShown && seen.tiles > 0 && seen.homes > 0, `tiles=${seen.tiles} homes=${seen.homes} stones=${seen.stones}`);
    await s.page.screenshot({ path: `${OUT}art-fallback-${name}.png` });
  }
  await a.context.close();
  await b.context.close();
} finally {
  await duel.close();
}

if (failed) {
  console.error(`\n${failed} board-art fallback checks failed — a failed image is still being drawn`);
  process.exit(1);
}
console.log('\nNo failed board art is ever drawn (both seats).');
