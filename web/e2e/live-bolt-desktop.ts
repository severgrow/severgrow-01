// The real-time bolt on a computer (owner, 2026-10-15): under the wordmark, right-aligned, with
// the full-screen icon to its LEFT; an outline when the opponent is away, lit when they are here.
//
//   PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx web/e2e/live-bolt-desktop.ts
import { mkdirSync } from 'node:fs';
import { openDuel, openSeat, sleep, startLocalDuel } from './helpers/local-duel.js';
import type { SeatSession } from './helpers/local-duel.js';

const OUT = new URL('../../docs/screens/live-bolt/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
type R = { l: number; r: number; t: number; b: number; w: number; h: number } | null;
const probe = (s: SeatSession) =>
  s.page.evaluate(`(() => {
    const R = (el) => { if (!el || el.hidden || getComputedStyle(el).display === 'none') return null; const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
    const bolt = document.querySelector('[data-live="pill"]');
    const path = bolt && bolt.querySelector('path');
    return { bolt: R(bolt), win: R(document.getElementById('hud-window')), brand: R(document.getElementById('hud-brand')),
      state: bolt && !bolt.hidden ? bolt.dataset.state : null, fill: path ? getComputedStyle(path).fill : null };
  })()`) as Promise<{ bolt: R; win: R; brand: R; state: string | null; fill: string | null }>;
const until = async (fn: () => Promise<boolean>, ms = 20_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(200);
  }
  return false;
};

const duel = await startLocalDuel({ port: Number(process.env.PREVIEW_PORT ?? 4248), liveConfig: { presenceStaleMs: 25_000 } });
try {
  const match = await duel.newMatch();
  const me = await openSeat(duel, match, 0, { hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });
  const them = await openSeat(duel, match, 1, { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  await openDuel(me, match.matchId);
  await openDuel(them, match.matchId);
  check('opponent here: the bolt is lit (filled)', await until(async () => (await probe(me)).state === 'ready'), JSON.stringify(await probe(me)));
  const lit = await probe(me);
  await sleep(500); // the fill fades in over 0.3s
  const litNow = await probe(me);
  check('lit means filled, not just an outline', !!litNow.fill && litNow.fill.startsWith('rgb('), String(litNow.fill));
  check('the bolt sits under the wordmark, right edges aligned', !!lit.bolt && !!lit.brand && lit.bolt.t >= lit.brand.b - 1 && Math.abs(lit.bolt.r - lit.brand.r) <= 2, JSON.stringify({ bolt: lit.bolt, brand: lit.brand }));
  check('the full-screen icon is beside it, on its LEFT, on the same row', !!lit.win && !!lit.bolt && lit.win.r <= lit.bolt.l + 1 && Math.abs(lit.win.t - lit.bolt.t) <= 1, JSON.stringify({ win: lit.win, bolt: lit.bolt }));
  check('the full-screen icon is bigger than before (24px glyph in a 44px target)', !!lit.win && lit.win.w >= 44 && lit.win.h >= 44);
  await me.page.screenshot({ path: `${OUT}desktop-lit-1440.png`, clip: { x: 1200, y: 0, width: 240, height: 110 } });
  await me.page.screenshot({ path: `${OUT}desktop-full-1440.png` });
  // The opponent leaves: their presence goes stale, the bolt becomes an outline.
  await them.context.close();
  check('opponent away: the bolt turns to an outline', await until(async () => (await probe(me)).state === 'away', 90_000), JSON.stringify(await probe(me)));
  const empty = (f: string | null) => f === 'rgba(0, 0, 0, 0)' || f === 'transparent' || f === 'none';
  check('away means outline only (no fill, once its 0.3s fade ends)', await until(async () => empty((await probe(me)).fill), 3_000), String((await probe(me)).fill));
  await me.page.screenshot({ path: `${OUT}desktop-away-1440.png`, clip: { x: 1200, y: 0, width: 240, height: 110 } });
  await me.context.close();
} finally {
  await duel.close();
}
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
