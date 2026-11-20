// TEMPORARY: the owner's BEFORE photos + the crop numbers, at the worst frame of the old beat.
// Deleted after the session. Runs against whichever worktree builds it.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { allNeighbors, coordKey, newGame } from '../../src/engine/index.js';
import type { Card, Player, State } from '../../src/engine/index.js';
import { positionSave } from './position.js';
import { resumeSavedGame } from './helpers/menu-nav.js';
import { servePreview } from './helpers/preview-port.js';

const SHOTS = process.env.SHOTS ?? '/tmp/bomb-fix2/before';
const PREFIX = process.env.PREFIX ?? 'before';
mkdirSync(SHOTS, { recursive: true });
const ART = 256 / 356;
const cropY = (w: number, h: number) => Math.max(0, 1 - Math.min(1, ART / (w / h)));

const fixture = () => {
  const base = newGame(3107);
  const target = { q: -1, r: 2 };
  const board = { ...base.board, [coordKey(target)]: { owner: 1 as Player, strength: 9 } };
  for (const nb of allNeighbors(target)) {
    if (board[coordKey(nb)] === null) board[coordKey(nb)] = { owner: 1 as Player, strength: 4 };
    for (const n2 of allNeighbors(nb)) if (board[coordKey(n2)] === null) board[coordKey(n2)] = { owner: 1 as Player, strength: 2 };
  }
  const state: State = { ...base, phase: 'ACT', actor: 0, turnPlayer: 0, board,
    hands: [[{ id: 1000, suit: null, rank: 0 }, ...base.hands[0].filter((c) => c.suit !== null)] as Card[], base.hands[1]] };
  return { state, target };
};

const { server, url } = await servePreview(0, { logLevel: 'silent' });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM!, args: ['--no-sandbox'] });
try {
  for (const [width, height, dpr] of [[390, 844, 3], [1280, 800, 2]] as const) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: width < 600, hasTouch: width < 600 });
    const page = await context.newPage();
    await page.addInitScript(({ saved }) => {
      (window as any).__name = (fn: unknown) => fn;
      localStorage.setItem('main2:severgrow.save.v7', saved);
      localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, autoSkip: false, reduceMotion: false, speed: 'normal', vibration: false }));
    }, { saved: positionSave({ state: fixture().state }) });
    await page.goto(url);
    await resumeSavedGame(page);
    await page.waitForFunction(() => document.querySelectorAll('#board .hex-cell').length > 0);
    await page.waitForFunction(() => document.documentElement.classList.contains('futa04-card-art-ready'));
    await page.waitForTimeout(600);
    const { target } = fixture();
    const key = coordKey(target);
    const card = await page.locator('#hand [data-card="1000"]').boundingBox();
    await page.mouse.click(card!.x + card!.width / 2, card!.y + card!.height / 2);
    await page.waitForTimeout(160);
    const hex = await page.locator(`#board .hex-cell[data-key="${key}"]`).boundingBox();
    await page.mouse.click(hex!.x + hex!.width / 2, hex!.y + hex!.height / 2);
    // Sample the whole flight from its own animation, then park it on its worst frame.
    const scan = await page.waitForFunction(() => {
      const f = document.querySelector('.flyer.card') as HTMLElement | null;
      const a = f?.getAnimations()[0];
      if (!f || !a) return null;
      a.pause();
      const dur = Number(a.effect?.getTiming().duration ?? 0);
      const out: { p: number; w: number; h: number; o: number; l: number; t: number; r: number; b: number }[] = [];
      for (let i = 0; i <= 40; i++) {
        const p = i / 40;
        a.currentTime = dur * p;
        const r = f.getBoundingClientRect();
        out.push({ p, w: r.width, h: r.height, o: Number(getComputedStyle(f).opacity), l: r.left, t: r.top, r: r.right, b: r.bottom });
      }
      return { dur, out };
    }, undefined, { timeout: 4000, polling: 4 }).then((h) => h.jsonValue()) as { dur: number; out: { p: number; w: number; h: number; o: number; l: number; t: number; r: number; b: number }[] };
    const visible = scan.out.filter((s) => s.o > 0.05 && s.w > 1);
    let worstCrop = 0;
    for (const s of visible) worstCrop = Math.max(worstCrop, cropY(s.w, s.h));
    // The peak of the beat: the frame where the card has SETTLED ON THE TILE (its centre is nearest
    // the hex's centre) and is still solid — the moment the owner is looking at.
    const hx = hex!.x + hex!.width / 2, hy = hex!.y + hex!.height / 2;
    const onTile = visible.filter((s) => s.o > 0.5);
    const worst = onTile.reduce((m, s) => (Math.hypot((s.l + s.w / 2) - hx, (s.t + s.h / 2) - hy)
      < Math.hypot((m.l + m.w / 2) - hx, (m.t + m.h / 2) - hy) ? s : m), onTile[0]!);
    console.log(`${PREFIX} ${width}: ${scan.out.length} frames, worst crop ${(worstCrop * 100).toFixed(2)}% of the art's height; beat ${scan.dur}ms`);
    console.log(`${PREFIX} ${width}: on the tile at p=${worst.p.toFixed(3)}: ${worst.w.toFixed(1)}x${worst.h.toFixed(1)} aspect ${(worst.w / worst.h).toFixed(4)} opacity ${worst.o.toFixed(2)} crop ${(cropY(worst.w, worst.h) * 100).toFixed(2)}%`);
    // Park on the worst frame (the one the owner sees as cut), and photograph it.
    await page.evaluate(({ p, dur }) => {
      const a = (document.querySelector('.flyer.card') as HTMLElement).getAnimations()[0]!;
      a.pause();
      a.currentTime = dur * p;
    }, { p: worst.p, dur: scan.dur });
    await page.waitForTimeout(160);
    const box = { left: worst.l, top: worst.t, right: worst.r, bottom: worst.b };
    const m = Math.max(30, (box.right - box.left) * 0.9);
    const clip = { x: Math.max(0, box.left - m), y: Math.max(0, box.top - m), width: Math.min(width, box.right - box.left + 2 * m), height: Math.min(height, box.bottom - box.top + 2 * m) };
    await page.screenshot({ path: `${SHOTS}/${PREFIX}-${width}-peak.png`, clip });
    console.log(`shot ${SHOTS}/${PREFIX}-${width}-peak.png`);
    // The card alone, at the device's own pixel density: the printed edge is what was cut.
    await page.screenshot({ path: `${SHOTS}/${PREFIX}-${width}-card.png`, clip: {
      x: Math.max(0, Math.round(worst.l)), y: Math.max(0, Math.round(worst.t)),
      width: Math.round(worst.w), height: Math.round(worst.h) } });
    console.log(`shot ${SHOTS}/${PREFIX}-${width}-card.png (${worst.w.toFixed(1)}x${worst.h.toFixed(1)}, aspect ${(worst.w / worst.h).toFixed(4)})`);
    // A strip: five frames across the beat (the art, the landing, the hold).
    const strip = [0.15, 0.35, 0.55, 0.75, 0.95];
    for (let i = 0; i < strip.length; i++) {
      await page.evaluate(({ p, dur }) => {
        const a = (document.querySelector('.flyer.card') as HTMLElement).getAnimations()[0]!;
        a.pause();
        a.currentTime = dur * p;
      }, { p: strip[i]!, dur: scan.dur });
      await page.waitForTimeout(90);
      await page.screenshot({ path: `${SHOTS}/frame-${PREFIX}-${width}-${i}.png`, clip });
    }
    console.log(`shots ${SHOTS}/frame-${PREFIX}-${width}-0..4.png`);
    await context.close();
  }
} finally {
  await browser.close();
  await server.httpServer.close();
}
