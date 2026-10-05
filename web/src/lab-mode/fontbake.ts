// The font bake-off (test copy, material lab ?lab=1): four pairings side by side, each on the
// same game pieces: a header line, the step words large and small, small labels, tile numerals
// on moss and lava at the smallest tile size in every palette (with the tree and the volcano),
// cards, and a 360px-wide line that says whether it overflows. Only this page loads the
// candidates that lost (web/src/fonts/bakeoff, SIL OFL).
import { allCoords, coordKey, newGame } from '../../../src/engine/index.js';
import type { Player, Terrain, Tile } from '../../../src/engine/index.js';
import { THEMES, THEME_IDS, cssVars } from '../logic/themes.js';
import { MATERIAL_TOKENS, materialLook, materialsOf } from '../logic/materials.js';
import { BoardView, NO_OVERLAY } from '../ui/board.js';
import { cardFace } from '../ui/effects.js';
import { installFonts } from './fonts.js';
import bricolage from '../fonts/bakeoff2/bricolage-grotesque-wght.woff2?url';
import figtree from '../fonts/bakeoff2/figtree-wght.woff2?url';
import manrope from '../fonts/bakeoff2/manrope-wght.woff2?url';
import outfit from '../fonts/bakeoff2/outfit-wght.woff2?url';

type Pair = { id: string; name: string; display: string; text: string; num: string; upper?: boolean };
const PAIRS: Pair[] = [
  { id: 'E', name: 'E: Fraunces Soft + Plus Jakarta Sans (chosen)', display: "'Fraunces Soft'", text: "'Plus Jakarta Sans'", num: "'Plus Jakarta Sans'" },
  { id: 'F', name: 'F: Manrope', display: "'Manrope'", text: "'Manrope'", num: "'Manrope'" },
  { id: 'G', name: 'G: Outfit + Manrope', display: "'Outfit'", text: "'Manrope'", num: "'Outfit'" },
  { id: 'A', name: 'A: Bricolage Grotesque + Figtree (last pick)', display: "'Bricolage Grotesque'", text: "'Figtree'", num: "'Bricolage Grotesque'" },
  { id: 'D', name: 'D: Alegreya Sans (original)', display: "'Alegreya Sans'", text: "'Alegreya Sans'", num: "'Alegreya Sans'" },
]

const k = (q: number, r: number) => coordKey({ q, r });

export const bakeOff = (page: HTMLElement) => {
  installFonts();
  const css = document.createElement('style');
  css.textContent = `
@font-face { font-family: 'Bricolage Grotesque'; src: url('${bricolage}') format('woff2'); font-weight: 200 800; font-display: swap; }
@font-face { font-family: 'Figtree'; src: url('${figtree}') format('woff2'); font-weight: 300 900; font-display: swap; }
@font-face { font-family: 'Manrope'; src: url('${manrope}') format('woff2'); font-weight: 200 800; font-display: swap; }
@font-face { font-family: 'Outfit'; src: url('${outfit}') format('woff2'); font-weight: 100 900; font-display: swap; }
.fb { display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 16px; margin: 16px 0 32px; }
.fb-col { border: 1px solid var(--c-line); border-radius: 14px; padding: 12px; font-family: var(--fb-text); background: var(--c-surface); min-width: 0; }
.fb-col h3 { font-family: var(--fb-display); margin: 0 0 8px; font-size: 1.05rem; }
.fb-col .num, .fb-col .tile-num, .fb-col .c-num { font-family: var(--fb-num) !important; font-variant-numeric: lining-nums tabular-nums; font-feature-settings: 'tnum' 1, 'lnum' 1; }
.fb-head { width: 360px; max-width: 100%; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; padding: 6px 8px; border: 1px dashed var(--c-line); border-radius: 10px; overflow: hidden; white-space: nowrap; }
.fb-head .you { color: var(--c-you); } .fb-head .bot { color: var(--c-bot); }
.fb-head b { font-family: var(--fb-num); font-size: 1.6rem; font-weight: 800; }
.fb-pill { text-align: center; line-height: 1.1; }
.fb-pill b { display: block; font-family: var(--fb-display); color: var(--c-you); font-weight: 700; }
.fb-pill small { font-size: 0.78rem; opacity: 0.8; }
.fb-flag { font-size: 11px; margin: 2px 0 8px; }
.fb-flag.bad { color: var(--c-bot); font-weight: 700; }
.fb-step { font-family: var(--fb-display); font-weight: 650; line-height: 1.15; }
.fb-plates { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px; margin: 6px 0; border-radius: 12px; background: #2a2d29; }
.fb-cue { position: static; transform: none; --font-display: var(--fb-display); }
.fb-cue .cue-text { font-family: var(--fb-display); } .fb-cue .cue-kicker { font-family: var(--fb-text); }
.fb-step.big { font-size: 1.55rem; } .fb-step.small { font-size: 0.9rem; opacity: 0.85; }
.fb-labels { display: flex; flex-wrap: wrap; gap: 6px 12px; margin: 8px 0; }
.fb-labels span { font-size: 11px; } .fb-labels span.l12 { font-size: 12px; }
.fb-tab { font-family: var(--fb-num); font-weight: 800; font-size: 1.1rem; line-height: 1.15; }
.fb-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px; }
.fb-tiles figure { margin: 0; }
.fb-tiles svg { width: 100%; height: auto; display: block; }
.fb-tiles figcaption { font-size: 11px; opacity: 0.7; }
.fb-cards { display: flex; gap: 6px; margin-top: 8px; }
.fb-cards .card { position: relative; width: 44px; height: 62px; flex: none; }
`;
  document.head.append(css);
  const sec = document.createElement('section');
  sec.className = 'lab-section fb-section';
  sec.innerHTML = '<h2>Font bake-off</h2><p class="muted small">Each pairing on the same pieces. Tile numerals at about 14pt (the smallest tiles), in every palette; the header line is 360px wide (red note if it overflows).</p>';
  const grid = document.createElement('div');
  grid.className = 'fb';
  sec.appendChild(grid);
  page.prepend(sec);
  // a radius-2 board at the smallest tile size: moss and lava 1-9, both homes
  const config = { ...newGame(1).config, boardRadius: 2 };
  const terrain: Record<string, Terrain> = Object.fromEntries(allCoords(2).map((c) => [coordKey(c), 'normal' as Terrain]));
  const board: Record<string, Tile | null> = Object.fromEntries(allCoords(2).map((c) => [coordKey(c), null]));
  const put = (key: string, owner: Player, strength: number, root = false) => (board[key] = root ? { owner, strength: 0, root: true } : { owner, strength });
  put(k(0, 2), 0, 0, true);
  put(k(0, -2), 1, 0, true);
  const moss = [k(-2, 2), k(-1, 2), k(-2, 1), k(-1, 1), k(0, 1), k(1, 1), k(-2, 0), k(-1, 0), k(0, 0)];
  const lava = [k(1, 0), k(2, 0), k(-1, -1), k(0, -1), k(1, -1), k(2, -1), k(1, -2), k(2, -2), k(1, 2)];
  moss.forEach((key, i) => put(key, 0, i + 1));
  lava.forEach((key, i) => put(key, 1, 9 - i));
  for (const p of PAIRS) {
    const col = document.createElement('div');
    col.className = 'fb-col';
    col.dataset.pair = p.id;
    col.style.setProperty('--fb-display', `${p.display}, system-ui, sans-serif`);
    col.style.setProperty('--fb-text', `${p.text}, system-ui, sans-serif`);
    col.style.setProperty('--fb-num', `${p.num}, system-ui, sans-serif`);
    col.innerHTML = `<h3>${p.name}</h3>
      <div class="fb-head"><span class="you">You <b class="num">12</b></span><span class="fb-pill"><b>Your turn</b><small>Level 7 · 22 turns left</small></span><span class="bot"><b class="num">14</b> Opponent</span></div>
      <p class="fb-flag"></p>
      <div class="fb-plates"><div class="step-cue fb-cue" data-level="hi" data-step="draw"><div class="cue-plate"><span class="cue-icon"><svg viewBox="0 0 24 24"><rect x="6.5" y="8" width="11" height="14" rx="2"/><path d="M12 2.5v8M8.8 5.7 12 2.5l3.2 3.2"/></svg></span><span class="cue-words"><span class="cue-kicker">Step 1 of 3</span><span class="cue-text">Draw a card</span></span><span class="cue-pips"><i data-p="draw"></i><i data-p="grow"></i><i data-p="throw"></i></span></div></div><div class="step-cue fb-cue" data-level="hi" data-step="grow"><div class="cue-plate"><span class="cue-icon"><svg viewBox="0 0 24 24"><path d="M12 21v-8"/><path d="M12 13c0-4 2.6-6.6 7-6.6 0 4.2-2.8 6.6-7 6.6Z"/></svg></span><span class="cue-words"><span class="cue-kicker">Step 2 of 3</span><span class="cue-text">Play or skip</span></span><span class="cue-pips"><i data-p="draw"></i><i data-p="grow"></i><i data-p="throw"></i></span></div></div></div>
      <div class="fb-step big">Throw one card</div><div class="fb-step small">Opponent · Play or skip</div>
      <div class="fb-labels"><span>Deck</span><span>Throw pile</span><span>Skip sprout</span><span>Bloom 3 tiles</span><span class="l12">Opponent</span><span class="l12">22 turns left</span><span class="l12">Whole map</span></div>
      <div class="fb-tab num">1111 · 8888 · 2019</div><div class="fb-tab num">4747 · 0000 · 9631</div>
      <div class="fb-tiles"></div><div class="fb-cards"></div>`;
    grid.appendChild(col);
    const tiles = col.querySelector('.fb-tiles')!;
    for (const id of THEME_IDS) {
      const t = THEMES[id];
      const fig = document.createElement('figure');
      for (const [name, v] of Object.entries(cssVars(t))) if (name !== '--font') fig.style.setProperty(name, v);
      const m = materialsOf(id);
      for (const tok of MATERIAL_TOKENS) fig.style.setProperty(`--m-${tok}`, m.colors[tok]);
      const look = materialLook(id, 'normal', true);
      fig.style.setProperty('--m-intensity', String(look.intensity));
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      fig.appendChild(svg);
      const cap = document.createElement('figcaption');
      cap.textContent = t.name;
      fig.appendChild(cap);
      tiles.appendChild(fig);
      const v = new BoardView(svg, { tap: () => {}, inspect: () => {} });
      v.setup(config, terrain, t.style, look, id);
      v.render(board, NO_OVERLAY);
    }
    const cards = col.querySelector('.fb-cards')!;
    for (const c of [{ rank: 1, suit: 0 }, { rank: 4, suit: 1 }, { rank: 7, suit: 2 }, { rank: 9, suit: 3 }, { rank: 0, suit: null }] as const) {
      const d = document.createElement('div');
      d.className = `card ${c.suit === null ? 'fruit' : `s${c.suit}`}`;
      d.innerHTML = cardFace(c as Parameters<typeof cardFace>[0]);
      cards.appendChild(d);
    }
  }
  // after the fonts load: does the 360px header line overflow?
  void document.fonts.ready.then(() => {
    for (const col of grid.querySelectorAll<HTMLElement>('.fb-col')) {
      const head = col.querySelector<HTMLElement>('.fb-head')!;
      const flag = col.querySelector<HTMLElement>('.fb-flag')!;
      const over = head.scrollWidth > head.clientWidth + 1;
      flag.textContent = over ? `Overflows at 360px by ${head.scrollWidth - head.clientWidth}px` : 'Fits at 360px';
      flag.classList.toggle('bad', over);
      col.dataset.overflow = String(over);
    }
  });
};
