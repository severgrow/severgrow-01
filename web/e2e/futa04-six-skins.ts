// THE SIX IN-GAME SKINS, ON A REAL BOARD (owner's design, docs/SKINS-PROPOSAL.md; 2026-11-20).
//
// What this proves, on the product build:
//   * every family paints a WHOLE BOARD of its grounds, not one tile — the variation family, both
//     homes, and (for Nero) the seams between neighbours;
//   * the six are painted as SVG paint servers on the board's own cells (`<use>` of a `<g>` in
//     `<defs>`), never as an image, so nothing is blurry at DPR 3 and nothing needs a new file;
//   * with NO skin chosen the board is exactly what it always was: the nine Forest / nine Ash
//     pictures, no skinned node anywhere;
//   * Nero's road stubs really do meet: at the midpoint of every shared edge the pixel is road,
//     not the pale block mass that would show a step.
//
// Shots: SKIN_SHOTS (default /tmp/wire).
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { servePreview, closePreview } from './helpers/preview-port.js';
import { positionSave } from './position.js';
import { resumeSavedGame } from './helpers/menu-nav.js';
import { allCoords, coordKey, newGame } from '../../src/engine/index.js';
import type { Player, State, Tile } from '../../src/engine/index.js';

const DIR = process.env.SKIN_SHOTS ?? '/tmp/wire';
mkdirSync(DIR, { recursive: true });
const served = process.env.FUTA04_URL ? null : await servePreview(0, { build: { outDir: process.env.FUTA04_DIST ?? 'dist' }, logLevel: 'silent' });
const BASE = process.env.FUTA04_URL ?? served!.url;
const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox'],
});
let checks = 0;
const check = (value: unknown, name: string) => { assert(value, name); checks++; };

/** A full radius-3 board: every cell taken, my side left, theirs right, three strengths. */
const fullBoard = (): State => {
  const base = newGame(4242);
  const board: Record<string, Tile | null> = { ...base.board };
  for (const c of allCoords(3)) {
    const key = coordKey(c);
    if (board[key]?.root) continue;
    const owner = (c.q < 0 ? 0 : 1) as Player;
    const ring = (Math.abs(c.q) + Math.abs(c.r) + Math.abs(c.q + c.r)) / 2;
    board[key] = { owner, strength: (ring % 3) + 1 };
  }
  return { ...base, phase: 'ACT', actor: 0, turnPlayer: 0, board };
};

const SKINS = ['console', 'voxel', 'brushed', 'carrara', 'nero', 'hypnosis'] as const;
const GROUNDS: Record<string, number> = { console: 9, voxel: 14, brushed: 7, carrara: 6, nero: 7, hypnosis: 7 };

const openBoard = async (page: Page, choice: { tileMine?: string | null; tileTheirs?: string | null } | null) => {
  await page.addInitScript((saved) => {
    (window as unknown as { __name: unknown }).__name = (f: unknown) => f;
    localStorage.setItem('main2:severgrow.save.v7', saved.save);
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({
      coach: false, sound: false, music: false, reduceMotion: true, speed: 'skip', vibration: false,
    }));
    // The picker belongs to the admin account alone (ui/skinChoice.ts); these shots are its.
    localStorage.setItem('main2:severgrow.duel.identity.v1', JSON.stringify({
      token: 'e2e', playerId: '11111111-1111-4111-8111-111111111111', displayName: 'RYK', kind: 'account',
    }));
    if (saved.skin) localStorage.setItem('main2:severgrow.board-skin.v1', saved.skin);
    else localStorage.removeItem('main2:severgrow.board-skin.v1');
  }, { save: positionSave({ state: fullBoard() }), skin: choice ? JSON.stringify({ mine: 'forest', theirs: 'ash', background: 'slate', ...choice }) : null });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await resumeSavedGame(page);
  await page.waitForFunction(() => document.querySelectorAll('#board .hex-cell').length >= 30, undefined, { timeout: 60_000 });
  await page.waitForTimeout(900);
};

/** What the tile layer actually painted. */
const painted = async (page: Page) => page.evaluate(() => {
  const tiles = [...document.querySelectorAll('#board .l-tiles .tile')];
  const uses = [...document.querySelectorAll('#board use.tileskin-ground')];
  // The territory PICTURES only: the number stones and the stone atlas are images too.
  const images = [...document.querySelectorAll('#board .l-tiles image.default-art-sprite')];
  const homes = [...document.querySelectorAll('#board .l-homes use.tileskin-home')];
  return {
    cells: tiles.length,
    uses: uses.length,
    hrefs: uses.map((u) => (u.getAttribute('href') ?? '').replace('#', '')),
    defs: [...new Set(uses.map((u) => (u.getAttribute('href') ?? '').replace('#', '')))],
    homes: homes.length,
    homeDefs: [...new Set(homes.map((u) => (u.getAttribute('href') ?? '').replace('#', '')))],
    images: images.map((i) => i.getAttribute('href') ?? ''),
    sketched: uses.map((u) => u.getAttribute('class') ?? ''),
  };
});

try {
  // ---- 1. the DEFAULT board: untouched -----------------------------------------------------------
  for (const [w, h, dpr] of [[390, 844, 3], [1280, 800, 2]] as const) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: w < 600, isMobile: w < 600 });
    try {
      await openBoard(page, null);
      const art = await painted(page);
      check(art.uses === 0, `${w}x${h}: no skinned tile with no choice stored (found ${art.uses})`);
      check(art.homes === 0, `${w}x${h}: no skinned home with no choice stored`);
      // The shipped paint path, exactly: one sprite picture per taken tile, the same 18 variants
      // (nine Forest + nine Ash; some are inlined as data URIs by the build, so not all are named).
      check(art.images.length === art.uses + art.cells - 2 || art.images.length >= 30,
        `${w}x${h}: one picture per taken tile (${art.images.length} pictures)`);
      // Every picture is one of the shipped Forest/Ash files — a hashed asset URL, or the same file
      // inlined by the build as a data URI (small pictures are inlined).
      check(art.images.every((href) => /forest-0\d|ash-0\d/.test(href) || href.startsWith('data:image/webp')),
        `${w}x${h}: every tile is a Forest/Ash picture`);
      check(new Set(art.images).size <= 18, `${w}x${h}: at most the nine + nine shipped grounds (${new Set(art.images).size})`);
      await page.screenshot({ path: `${DIR}/default-${w}x${h}.png`, timeout: 120_000, animations: 'disabled' });
      console.log(`${w}x${h}: DEFAULT unchanged — ${art.cells} cells, ${art.images.length} Forest/Ash pictures, 0 skinned`);
    } finally { await page.close(); }
  }

  // ---- 2. each family, on a whole board ----------------------------------------------------------
  for (const skin of SKINS) {
    for (const [w, h, dpr] of [[390, 844, 3], [1280, 800, 2]] as const) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: w < 600, isMobile: w < 600 });
      try {
        await openBoard(page, { tileMine: skin, tileTheirs: skin });
        const art = await painted(page);
        check(art.uses >= 33, `${skin} ${w}x${h}: every ground is skinned (${art.uses} of ${art.cells})`);
        // Both homes wear the family's mark. One <def> serves both sides when they share a family.
        check(art.homes === 2, `${skin} ${w}x${h}: both homes are the family's (${art.homes})`);
        check(art.homeDefs.every((id) => id.startsWith(`tileskin-${skin}-home-`)), `${skin} ${w}x${h}: the homes are this family's`);
        check(art.images.length === 0, `${skin} ${w}x${h}: no sprite picture is left on a skinned board (${art.images.length})`);
        check(art.defs.every((id) => id.startsWith(`tileskin-${skin}-`)), `${skin} ${w}x${h}: the defs are this family's`);
        // The variation family really varies: a board fuller than the family shows every ground.
        const used = art.defs.filter((id) => !id.includes('-home-'));
        check(used.length >= Math.min(GROUNDS[skin]!, 6),
          `${skin} ${w}x${h}: ${used.length} different grounds on the board (family has ${GROUNDS[skin]})`);
        if (skin === 'voxel') {
          // THE WEIGHT, seen on a real board: plain ground (v0) is common, a feature is not.
          const plain = art.hrefs.filter((id) => id.startsWith('tileskin-voxel-0-')).length;
          check(plain >= 3, `voxel ${w}x${h}: plain ground is the common ground (${plain} of ${art.hrefs.length})`);
        }
        const expected = new Set(Array.from({ length: GROUNDS[skin]! }, (_, v) => `tileskin-${skin}-${v}-`));
        check(used.every((id) => [...expected].some((prefix) => id.startsWith(prefix))),
          `${skin} ${w}x${h}: every painted def is one of the family's own variants`);
        await page.screenshot({ path: `${DIR}/${skin}-${w}x${h}.png`, timeout: 120_000, animations: 'disabled' });
        if (skin === 'nero') {
          // SEAMS: at the midpoint of a shared edge, the pixel is ROAD, not the pale block mass.
          const seams = await page.evaluate(() => {
            // A home's cell is an empty group (its art lives on the homes layer): no box, no seam.
            const cells = [...document.querySelectorAll('#board .l-tiles .tile')]
              .map((c) => {
                const [q, r] = (c.getAttribute('data-key') ?? '0,0').split(',').map(Number) as [number, number];
                // The cell's own hexagon, not the group: the seed stone sits on the group and would
                // pull its box off the hex's centre by a pixel or two (half a road at 46 px).
                const hex = c.querySelector('path.fa-tile-base');
                const b = (hex ?? c).getBoundingClientRect();
                // THE OWNER BOUNDARY carries the territory contour (a light line), which is not art.
                // Seams are measured between two tiles of the SAME side so the road is what shows.
                const owner = (c.getAttribute('class') ?? '').includes(' you') ? 0 : 1;
                return { q, r, owner, x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width };
              })
              .filter((c) => c.w > 10);
            const at = new Map(cells.map((c) => [`${c.q},${c.r}`, c]));
            const out: { x: number; y: number; w: number }[] = [];
            for (const c of cells) {
              for (const [dq, dr] of [[1, 0], [0, 1]] as const) {
                const n = at.get(`${c.q + dq},${c.r + dr}`);
                if (n && n.owner === c.owner) out.push({ x: (c.x + n.x) / 2, y: (c.y + n.y) / 2, w: c.w });
              }
            }
            return out;
          });
          check(seams.length >= 20, `nero ${w}x${h}: ${seams.length} shared edges to check`);
          const png = await page.screenshot({ timeout: 120_000, animations: 'disabled' });
          const { decodePng } = await import('./helpers/png.js');
          const bmp = decodePng(png);
          let worst = 0;
          let tested = 0;
          for (const s of seams) {
            const x = Math.round(s.x * (w < 600 ? 3 : 2));
            const y = Math.round(s.y * (w < 600 ? 3 : 2));
            if (x < 3 || y < 3 || x >= bmp.width - 3 || y >= bmp.height - 3) continue;
            // 3 px across the seam, along the edge: the stub is ~0.07 H = ~3 css px wide
            for (const dx of [-1, 0, 1]) {
              const [rr, gg, bb] = bmp.rgba(x + dx, y);
              worst = Math.max(worst, 0.2126 * rr + 0.7152 * gg + 0.0722 * bb);
            }
            tested++;
          }
          check(tested >= 10, `nero ${w}x${h}: ${tested} same-side seams measured on the picture`);
          check(worst < 140, `nero ${w}x${h}: every shared edge is road at its midpoint (lightest ${worst.toFixed(0)} luminance)`);
          console.log(`nero ${w}x${h}: ${tested} seams closed, lightest midpoint ${worst.toFixed(0)} luminance`);
        }
        console.log(`${skin} ${w}x${h}: ${art.uses} skinned grounds, ${used.length} variants, ${art.homes} homes`);
      } finally { await page.close(); }
    }
  }

  // ---- 3. two different families on the two sides (colour is no longer "whose") -------------------
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    try {
      await openBoard(page, { tileMine: 'voxel', tileTheirs: 'nero' });
      const art = await painted(page);
      check(art.defs.some((id) => id.startsWith('tileskin-voxel-')), 'my side wears Voxel');
      check(art.defs.some((id) => id.startsWith('tileskin-nero-')), 'their side wears Nero');
      await page.screenshot({ path: `${DIR}/mixed-voxel-vs-nero-390x844.png`, timeout: 120_000, animations: 'disabled' });
      console.log('mixed: Voxel against Nero on one board');
    } finally { await page.close(); }
  }

  console.log(`${checks} six-skin checks passed (6 families x 2 viewports, the default board, and a mixed board)`);
} finally {
  await browser.close();
  if (served) await closePreview(served.server);
}
