// The material lab (dev only, open the page with ?lab=1): every board material in every
// palette, drawn by the real board code, so the look can be judged quickly on a phone.
// Rows: grass strengths 1-9, lava strengths 1-9, both roots, rock, an empty hex, a gold
// hex (empty and under a tile), and a cut-off chain for each side (dried grass, cooled lava).
import { allCoords, coordKey, newGame } from '../../src/engine/index.js';
import type { Player, Terrain, Tile } from '../../src/engine/index.js';
import { THEMES, THEME_IDS, cssVars } from './logic/themes.js';
import { MATERIAL_TOKENS, materialLook, materialsOf } from './logic/materials.js';
import type { Detail } from './logic/materials.js';
import { BoardView, NO_OVERLAY } from './ui/board.js';

const k = (q: number, r: number) => coordKey({ q, r });

export const showLab = (detail: Detail = 'normal', reduceMotion = false) => {
  const page = document.createElement('main');
  page.className = 'lab';
  page.innerHTML = `<h1>Material lab</h1><p class="muted small">Grass 1-9 · lava 1-9 · roots, rock, empty, gold · cut-off chains (dried grass, cooled lava). Detail: ${detail}.</p>`;
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
  const scars = [
    ...[-4, -3, -2].map((q) => ({ key: k(q, 0), owner: 0 as Player })),
    ...[2, 3, 4].map((q) => ({ key: k(q, 0), owner: 1 as Player })),
  ];
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
    view.setup(config, terrain, t.style, look);
    view.render(board, { ...NO_OVERLAY, scars });
  }
  document.body.appendChild(page);
};
