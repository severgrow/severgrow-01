// TEMPORARY: the owner's proof picture — the recorded replay's Bomb beside the new in-game Bomb,
// at the same mark of the same beat. Deleted after the session.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { allNeighbors, coordKey, newGame } from '../../src/engine/index.js';
import type { Card, Player, State } from '../../src/engine/index.js';
import { positionSave } from './position.js';
import { resumeSavedGame } from './helpers/menu-nav.js';
import { createServer } from 'vite';
import type { AddressInfo } from 'node:net';

const SHOTS = process.env.SHOTS ?? '/tmp/bomb-fix2';
mkdirSync(SHOTS, { recursive: true });
/** The burst mark of `STRIKE_TIMING` — the landed, solid card with the glow over it. */
const P = Number(process.env.P ?? 0.36);

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

const save = (name: string, dataUrl: string) => {
  writeFileSync(`${SHOTS}/${name}`, Buffer.from(dataUrl.split(',')[1]!, 'base64'));
  console.log(`shot ${SHOTS}/${name}`);
};

// The DEV server: `/src/...` modules must be importable in the page (the replay painter).
const server = await createServer({ configFile: 'web/vite.config.ts', server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
await server.listen();
const url = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}/`;
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM!, args: ['--no-sandbox'] });
try {
  const width = 390, height = 844, dpr = 3;
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
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
  await page.waitForFunction(() => {
    const f = document.querySelector('.flyer.card') as HTMLElement | null;
    const a = f?.getAnimations()[0];
    if (!f || !a) return false;
    a.pause();
    a.currentTime = Number(a.effect?.getTiming().duration ?? 0) * 0.36;
    return true;
  }, undefined, { timeout: 4000, polling: 4 });
  await page.waitForTimeout(140);
  const info = await page.evaluate(() => {
    const f = document.querySelector('.flyer.card') as HTMLElement;
    const r = f.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const m = Math.max(30, info.width * 0.8);
  const clip = {
    x: Math.max(0, Math.round(info.left - m)), y: Math.max(0, Math.round(info.top - m)),
    width: Math.round(info.width + 2 * m), height: Math.round(info.height + 2 * m),
  };
  const livePng = (await page.screenshot({ clip })).toString('base64');
  save('compare-live.png', `data:image/png;base64,${livePng}`);

  // The recorded replay, painted at the SAME mark by the same curve: `paintStrike` from
  // `replay/strike.ts`, laid out so its hex is exactly the in-game hex and its card exactly the
  // in-game card, then cropped to the same box.
  const replay = await page.evaluate(async ({ p, hexW, crop, key }) => {
    const { layoutBoard, hexCorner, screenCoordsOf } = await import('/src/replay/board-canvas.ts' as string);
    const { paintStrike } = await import('/src/replay/strike.ts' as string);
    const { cardArtUrl, BOMB_FACE } = await import('/src/ui/card-art.ts' as string);
    const img = new Image();
    img.src = cardArtUrl(BOMB_FACE);
    await img.decode();
    // The board's cell list and terrain, as the match has them.
    const st = (window as any).__severgrow.state();
    const data = { board: st.board, coords: screenCoordsOf({ me: 0, config: st.config }), terrain: st.terrain, me: 0 };
    // Scale the poster layout until its hex is the live hex, so the two cards are the same size.
    let lo = 0.1, hi = 40, layout = null as any;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const L = layoutBoard(data, { w: 390 * mid, h: 844 * mid, cx: 195 * mid, cy: 422 * mid });
      if (L.hex < hexW) lo = mid; else hi = mid;
      layout = L;
    }
    const size = { w: Math.ceil(440 * (lo + hi) / 2), h: Math.ceil(960 * (lo + hi) / 2) };
    const big = document.createElement('canvas');
    big.width = size.w; big.height = size.h;
    const g = big.getContext('2d')!;
    paintStrike(g, layout, { target: key, area: [key], cards: 1 }, p, img, hexCorner);
    const cell = layout.cells.find((c: { key: string }) => c.key === key)!;
    const k = Math.min(lo, hi);
    const small = document.createElement('canvas');
    small.width = crop.width; small.height = crop.height;
    const s = small.getContext('2d')!;
    // The replay is cropped around its own target cell, the live shot around the flying card: both
    // are centred on the Bomb, so the two pictures can be read side by side.
    s.drawImage(big, Math.round(cell.x - crop.width / 2), Math.round(cell.y - crop.height / 2), crop.width, crop.height, 0, 0, crop.width, crop.height);
    return { png: small.toDataURL(), hex: layout.hex, k };
  }, { p: P, hexW: hex!.width, crop: { width: clip.width, height: clip.height }, key });
  save('compare-replay.png', replay.png);
  console.log(`replay hex ${replay.hex.toFixed(2)}px vs live hex ${hex!.width.toFixed(2)}px`);

  // Side by side, with the words the owner needs.
  const composed = await page.evaluate(async ({ live, rep, w, h }) => {
    const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src;
    });
    const [a, b] = await Promise.all([load(live), load(rep)]);
    const gap = 28, label = 46, pad = 18;
    const out = document.createElement('canvas');
    out.width = pad * 2 + w * 2 + gap; out.height = pad * 2 + h + label;
    const g = out.getContext('2d')!;
    g.fillStyle = '#0e0f10'; g.fillRect(0, 0, out.width, out.height);
    g.drawImage(a, pad, pad + label, w, h);
    g.drawImage(b, pad + w + gap, pad + label, w, h);
    g.fillStyle = '#e8ddc9';
    g.font = '600 20px system-ui, sans-serif';
    g.fillText('IN GAME (new)', pad, pad + 26);
    g.fillText("RECORDED REPLAY (the reference)", pad + w + gap, pad + 26);
    g.strokeStyle = 'rgba(232,221,201,.35)'; g.lineWidth = 2;
    g.strokeRect(pad - 1, pad + label - 1, w + 2, h + 2);
    g.strokeRect(pad + w + gap - 1, pad + label - 1, w + 2, h + 2);
    return out.toDataURL();
  }, { live: `data:image/png;base64,${livePng}`, rep: replay.png, w: clip.width, h: clip.height });
  save('compare-replay-vs-game.png', composed);
  console.log(JSON.stringify({ clip, cardH: info.height, hex: hex!.width }));
  await context.close();
} finally {
  await browser.close();
  server.httpServer?.close();
}
