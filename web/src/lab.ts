// The material lab (dev only, open the page with ?lab=1): every board material in every
// palette, drawn by the real board code, so the look can be judged quickly on a phone.
// Rows: grass strengths 1-9, lava strengths 1-9, both roots, rock, an empty hex, a gold
// hex (empty and under a tile), and a cut-off chain for each side (dried grass, cooled lava).
// Material pass 2: the 1-9 rows are the strength ramp strips; a second board per palette
// shows neighbours of mixed strengths blending, and moss meeting lava.
import { allCoords, coordKey, newGame } from '../../src/engine/index.js';
import type { Player, Terrain, Tile } from '../../src/engine/index.js';
import { THEMES, THEME_IDS, cssVars } from './logic/themes.js';
import { MATERIAL_TOKENS, materialLook, materialsOf } from './logic/materials.js';
import type { Detail } from './logic/materials.js';
import { BoardView, NO_OVERLAY } from './ui/board.js';
import { warmPhotosNow } from './ui/photo.js';
import { GLOW_CAP, OLD_GLOW_OPACITY } from './logic/topglow.js';

const k = (q: number, r: number) => coordKey({ q, r });

export const showLab = (detail: Detail = 'normal', reduceMotion = false) => {
  if (detail === 'normal') warmPhotosNow();
  const page = document.createElement('main');
  page.className = 'lab';
  page.innerHTML = `<h1>Material lab</h1><p class="muted small">Grass 1-9 · lava 1-9 · roots, rock, empty, gold · cut-off chains fading over two turns (dried grass, cooled lava), with a seed of each side between them. Detail: ${detail}.</p>`;
  const R = 5;
  const config = { ...newGame(1).config, boardRadius: R };
  const terrain: Record<string, Terrain> = Object.fromEntries(allCoords(R).map((c) => [coordKey(c), 'normal' as Terrain]));
  const board: Record<string, Tile | null> = Object.fromEntries(allCoords(R).map((c) => [coordKey(c), null]));
  const put = (key: string, owner: Player, strength: number, root = false) => (board[key] = root ? { owner, strength: 0, root: true } : { owner, strength });
  // moss 1-9 (row r = -2) and fire 1-9 (row r = 2)
  for (let i = 0; i < 9; i++) {
    put(k(-3 + i, -2), 0, i + 1);
    put(k(-5 + i, 2), 1, i + 1);
  }
  // row r = -4: my root, rock, rock, an empty hex, gold (empty), gold under moss
  put(k(-1, -4), 0, 0, true);
  terrain[k(0, -4)] = 'rock';
  terrain[k(1, -4)] = 'rock';
  terrain[k(3, -4)] = 'rich';
  terrain[k(4, -4)] = 'rich';
  put(k(4, -4), 0, 6);
  // row r = 4: the bot's root, rock, gold under fire, gold (empty)
  put(k(-4, 4), 1, 0, true);
  terrain[k(-3, 4)] = 'rock';
  terrain[k(-1, 4)] = 'rich';
  put(k(-1, 4), 1, 7);
  terrain[k(0, 4)] = 'rich';
  // row r = 0: a cut-off chain for each side
  // (UX pass: ages 0, 1, 2 from the middle outwards, so the fade shows)
  const scars = [
    ...[-4, -3, -2].map((q) => ({ key: k(q, 0), owner: 0 as Player, age: -2 - q })),
    ...[2, 3, 4].map((q) => ({ key: k(q, 0), owner: 1 as Player, age: q - 2 })),
  ];
  // Seed A/B test: a seed of each side between the two chains
  board[k(-1, 0)] = { owner: 0, strength: 1, seed: true };
  board[k(1, 0)] = { owner: 1, strength: 1, seed: true };
  // the neighbours board: strengths from a fixed pattern (never random), moss on the left
  // half, lava on the right, so the two meet down the middle
  const allNormal: Record<string, Terrain> = Object.fromEntries(allCoords(R).map((c) => [coordKey(c), 'normal' as Terrain]));
  const mixed: Record<string, Tile | null> = Object.fromEntries(
    allCoords(R).map((c) => {
      const x = c.q + c.r / 2;
      if (Math.abs(x) > 4.5 || Math.abs(c.r) > 4) return [coordKey(c), null];
      const strength = 1 + (((c.q * 7 + c.r * 3) % 9) + 9) % 9;
      return [coordKey(c), { owner: (x < 0 ? 0 : 1) as Player, strength }];
    }),
  );
  // the glow comparison board: a moss 9 and a lava 9, each among lower tiles of both sides
  const small = { ...config, boardRadius: 2 };
  const smallTerrain: Record<string, Terrain> = Object.fromEntries(allCoords(2).map((c) => [coordKey(c), 'normal' as Terrain]));
  const tops: Record<string, Tile | null> = Object.fromEntries(allCoords(2).map((c) => [coordKey(c), null]));
  for (const [key, owner, strength] of [
    [k(-1, 0), 0, 9], [k(-2, 0), 0, 6], [k(-1, -1), 0, 3], [k(-2, 1), 0, 8], [k(-1, 1), 0, 5],
    [k(1, 0), 1, 9], [k(2, 0), 1, 7], [k(1, -1), 1, 4], [k(2, -1), 1, 8], [k(0, 1), 1, 2], [k(0, 0), 0, 7],
  ] as const) tops[key] = { owner, strength };
  for (const id of THEME_IDS) {
    const t = THEMES[id];
    const sec = document.createElement('section');
    sec.className = 'lab-section';
    sec.dataset.palette = id;
    for (const [name, v] of Object.entries(cssVars(t))) sec.style.setProperty(name, v);
    const m = materialsOf(id);
    for (const tok of MATERIAL_TOKENS) sec.style.setProperty(`--m-${tok}`, m.colors[tok]);
    const look = materialLook(id, detail, reduceMotion);
    sec.style.setProperty('--m-intensity', String(look.intensity));
    sec.innerHTML = `<h2>${t.name}</h2>`;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('lab-board');
    sec.appendChild(svg);
    page.appendChild(sec);
    const view = new BoardView(svg, { tap: () => {}, inspect: () => {} });
    view.setup(config, terrain, t.style, look, id);
    view.render(board, { ...NO_OVERLAY, scars });
    // neighbours: a patch of mixed strengths for each side, touching along the middle
    const svg2 = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg2.classList.add('lab-board');
    sec.appendChild(svg2);
    const nb = new BoardView(svg2, { tap: () => {}, inspect: () => {} });
    nb.setup(config, allNormal, t.style, look, id);
    nb.render(mixed, NO_OVERLAY);
    // polish pass 3: top-rank tiles (moss and lava 9s among mixed neighbours) with the old
    // glow strength, the new one, and none
    const row = document.createElement('div');
    row.className = 'lab-glow-row';
    sec.appendChild(row);
    for (const [label, scale, setting] of [['Old glow strength', OLD_GLOW_OPACITY / GLOW_CAP, 'subtle'], ['New: subtle', 1, 'subtle'], ['No glow', 1, 'off']] as const) {
      const fig = document.createElement('figure');
      const cap = document.createElement('figcaption');
      cap.textContent = label;
      const s3 = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s3.classList.add('lab-board', 'small');
      fig.append(s3, cap);
      row.appendChild(fig);
      const gv = new BoardView(s3, { tap: () => {}, inspect: () => {} });
      gv.setup(small, smallTerrain, t.style, look, id);
      gv.setGlow({ setting, effects: 'normal', reduceMotion }, scale);
      gv.render(tops, NO_OVERLAY);
    }
  }
  document.body.appendChild(page);
};
