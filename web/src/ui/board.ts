// Draws the hex board as SVG: terrain, the two networks (tiles plus the veins that
// join them back to each root), and overlays (targets, previews, weak spots).
// Also holds the board's animation effects. It never changes game state: it draws
// whatever board it is given.
import { allCoords, coordKey, rootCoord } from '../../../src/engine/index.js';
import type { Player, RulesConfig, Terrain, Tile } from '../../../src/engine/index.js';
import type { Ghost } from '../logic/preview.js';
import type { Spot } from '../logic/weakspots.js';
import { looseEdges, networkEdges, veinLook } from '../logic/network.js';
import type { ThemeStyle } from '../logic/themes.js';
import type { MaterialLook } from '../logic/materials.js';
import { FULL_LOOK, S, centerOf, el, hash, hexPath, noiseTile, star } from './geom.js';
import { drawMaterial, materialDefs } from './materials.js';
import type { DrawCtx } from './materials.js';
import { materialFor } from '../logic/materials.js';

export { FULL_LOOK, S, centerOf, el, noiseTile, star };

let boardCount = 0;

/** Tile size grows with strength (1 small ... max rank nearly the full hex). */
export const tileScale = (strength: number, maxRank: number) => 0.6 + 0.37 * (strength / Math.max(maxRank, 1));

export type Overlay = {
  targets: Set<string> | null;
  selectedHex: string | null;
  ghosts: Ghost[];
  cutKeys: string[];
  weak: Spot[];
  opps: Spot[];
  coachHexes: string[];
  focusKey: string | null;
  scars: { key: string; owner: Player }[];
  usable: boolean;
  /** My most dangerous weak spot, pulsing gently with its "-4" (a setting). */
  pulse: Spot | null;
  /** Show the bot's fragile links flickering ("Bot's weak links" is on). */
  botFragile: boolean;
};
export const NO_OVERLAY: Overlay = {
  targets: null,
  selectedHex: null,
  ghosts: [],
  cutKeys: [],
  weak: [],
  opps: [],
  coachHexes: [],
  focusKey: null,
  scars: [],
  usable: false,
  pulse: null,
  botFragile: false,
};

export type BoardHandlers = {
  tap: (key: string) => void;
  inspect: (key: string | null) => void;
};

export class BoardView {
  private config!: RulesConfig;
  private style!: ThemeStyle;
  private keys: string[] = [];
  private layers!: Record<'base' | 'scars' | 'veins' | 'tiles' | 'marks' | 'over' | 'fx', SVGGElement>;
  private tileEls = new Map<string, SVGGElement>();
  private veinEls: { a: string; b: string; owner: Player; el: SVGElement }[] = [];
  private shownVeins = new Set<string>(); // veins on screen last time, to draw new ones on
  private pressTimer: ReturnType<typeof setTimeout> | undefined;
  private pressed: string | null = null;
  private longPressed = false;
  private look: MaterialLook = FULL_LOOK;
  /** Ids are unique per board, so several boards (the material lab) can share a page. */
  private readonly uid = `b${++boardCount}`;
  private id = (name: string) => `${this.uid}-${name}`;
  private url = (name: string) => `url(#${this.id(name)})`;

  constructor(
    readonly svg: SVGSVGElement,
    private handlers: BoardHandlers,
  ) {}

  /** Builds the static parts (terrain) for a game and theme. */
  setup(config: RulesConfig, terrain: Record<string, Terrain>, style: ThemeStyle, look: MaterialLook = FULL_LOOK) {
    this.config = config;
    this.style = style;
    this.look = look;
    this.shownVeins = new Set();
    const svg = this.svg;
    svg.replaceChildren();
    const coords = allCoords(config.boardRadius);
    this.keys = coords.map(coordKey);
    const xs = this.keys.map((k) => centerOf(k).x);
    const ys = this.keys.map((k) => centerOf(k).y);
    const pad = S * 1.6 + 6; // room for the board's plate and frame
    const [x0, y0] = [Math.min(...xs) - pad, Math.min(...ys) - pad];
    svg.setAttribute('viewBox', `${x0} ${y0} ${Math.max(...xs) - Math.min(...xs) + 2 * pad} ${Math.max(...ys) - Math.min(...ys) + 2 * pad}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const defs = el('defs', {}, svg);
    // Bot fill patterns (colour-blind safe: the bot's tiles always carry a pattern).
    const hatch = el('pattern', { id: this.id('pat-hatch'), width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('rect', { width: 2.2, height: 6, class: 'pat-ink' }, hatch);
    const grain = el('pattern', { id: this.id('pat-grain'), width: 7, height: 7, patternUnits: 'userSpaceOnUse' }, defs);
    el('circle', { cx: 2, cy: 2, r: 1.2, class: 'pat-ink' }, grain);
    el('circle', { cx: 5.5, cy: 5, r: 0.9, class: 'pat-ink' }, grain);
    const stripe = el('pattern', { id: this.id('pat-stripe'), width: 10, height: 10, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-30)' }, defs);
    el('rect', { width: 4, height: 10, class: 'pat-ink' }, stripe);
    // A fine diagonal weave for gold hexes (gold is recognisable by pattern and its "2"
    // badge, not by colour alone).
    const weave = el('pattern', { id: this.id('pat-gold'), width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('rect', { width: 1.1, height: 5, class: 'gold-weave' }, weave);
    const glow = el('filter', { id: this.id('glow'), x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
    el('feGaussianBlur', { stdDeviation: 2.4, result: 'b' }, glow);
    const merge = el('feMerge', {}, glow);
    el('feMergeNode', { in: 'b' }, merge);
    el('feMergeNode', { in: 'SourceGraphic' }, merge);

    materialDefs(defs, this.id, look);
    svg.style.setProperty("--m-depth", `${look.depth}px`);
    svg.style.setProperty("--m-shadow", String(look.shadow));

    // The plate: a soft hexagonal tray under the board with a thin frame and corner pins,
    // so the board sits on the table instead of floating.
    const R = config.boardRadius;
    const corners = [
      { q: R, r: -R },
      { q: R, r: 0 },
      { q: 0, r: R },
      { q: -R, r: R },
      { q: -R, r: 0 },
      { q: 0, r: -R },
    ].map((c) => {
      const { x, y } = centerOf(coordKey(c));
      const d = Math.hypot(x, y) || 1;
      return { x, y, d };
    });
    const ring = (grow: number) => corners.map(({ x, y, d }) => `${(x * (1 + grow / d)).toFixed(1)},${(y * (1 + grow / d)).toFixed(1)}`).join(' ');
    const plate = el('g', { class: 'l-plate' }, svg);
    el('polygon', { points: ring(S * 1.35), class: 'plate' }, plate);
    el('polygon', { points: ring(S * 1.35), class: 'plate-rim' }, plate);
    for (const { x, y, d } of corners) el('circle', { cx: x * (1 + (S * 1.35) / d), cy: y * (1 + (S * 1.35) / d), r: 2.2, class: 'plate-pin' }, plate);

    this.layers = {
      base: el('g', { class: 'l-base' }, svg),
      scars: el('g', { class: 'l-scars' }, svg),
      tiles: el('g', { class: 'l-tiles' }, svg),
      veins: el('g', { class: 'l-veins' }, svg),
      marks: el('g', { class: 'l-marks' }, svg),
      over: el('g', { class: 'l-over' }, svg),
      fx: el('g', { class: 'l-fx' }, svg),
    };
    for (const key of this.keys) {
      const t = terrain[key] ?? 'normal';
      const g = el('g', { class: `hex-cell ${t}`, 'data-key': key }, this.layers.base);
      el('path', { d: hexPath(key, S - 1.2, style.tileShape), class: `hex ${t}` }, g);
      drawMaterial(materialFor(null, t), 'cell', this.ctx(g, key));
      if (t === 'rich') {
        // The "2" badge sits above the tiles, so it stays visible when a tile is here.
        const { x, y } = centerOf(key);
        const b = el('g', { class: 'gold-badge', 'data-key': key }, this.layers.marks);
        // lower right, clear of the weak-link badges above the hex and the owner mark below
        el('circle', { cx: x + S * 0.58, cy: y + S * 0.42, r: 6.2, class: 'gold-badge-bg' }, b);
        el('text', { x: x + S * 0.58, y: y + S * 0.42 + 0.4, class: 'gold-badge-text num' }, b).textContent = '2';
      }
      this.bindHex(g, key);
    }
  }

  /** What a material drawer needs for one hex. */
  private ctx(parent: SVGGElement, key: string, radius = S, strength = 1): DrawCtx {
    return { parent, key, look: this.look, shape: this.style.tileShape, url: this.url, radius, strength, maxRank: this.config.maxRank };
  }

  private bindHex(g: SVGGElement, key: string) {
    g.addEventListener('pointerdown', (e) => {
      this.pressed = key;
      this.longPressed = false;
      clearTimeout(this.pressTimer);
      if (e.pointerType !== 'mouse') {
        this.pressTimer = setTimeout(() => {
          this.longPressed = true;
          this.handlers.inspect(key);
        }, 450);
      }
    });
    g.addEventListener('pointerup', () => {
      clearTimeout(this.pressTimer);
      if (this.pressed === key && !this.longPressed) this.handlers.tap(key);
      if (this.longPressed) setTimeout(() => this.handlers.inspect(null), 1600);
      this.pressed = null;
    });
    g.addEventListener('pointercancel', () => clearTimeout(this.pressTimer));
    g.addEventListener('pointerleave', (e) => {
      clearTimeout(this.pressTimer);
      if (e.pointerType === 'mouse') this.handlers.inspect(null);
    });
    g.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') this.handlers.inspect(key);
    });
  }

  get boardKeys() {
    return this.keys;
  }

  /** Redraws the networks and overlays for `board`. */
  render(board: Record<string, Tile | null>, o: Overlay) {
    const { veins, tiles, over, scars } = this.layers;
    veins.replaceChildren();
    tiles.replaceChildren();
    over.replaceChildren();
    scars.replaceChildren();
    this.tileEls.clear();
    this.veinEls = [];
    const st = this.style;

    for (const s of o.scars) {
      if (board[s.key]) continue;
      // what a cut-off tile leaves: dried moss (mine) or burnt-out ash (the bot's)
      drawMaterial(materialFor({ owner: s.owner }, 'normal'), 'scar', this.ctx(scars, s.key));
    }

    // Veins: thick, glowing links back to the root. Thickness and brightness follow how
    // many tiles depend on each link; fragile links (cutting them removes tiles) are thin
    // and flicker. The bot's fragile links flicker only when "Bot's weak links" is on.
    const now = new Set<string>();
    const fresh = this.shownVeins.size > 0; // no draw-on for the very first picture
    for (const p of [0, 1] as const) {
      const g = el('g', { class: `veins ${p === 0 ? 'you' : 'bot'}` }, veins);
      if (st.glow > 0) g.setAttribute('filter', this.url('glow'));
      for (const e of networkEdges(board, this.config, p)) {
        const fragile = e.fragile && (p === 0 || o.botFragile);
        const id = `${p}:${e.a}|${e.b}`;
        now.add(id);
        const look = veinLook(e.load, fragile);
        this.vein(g, e.a, e.b, p, fragile ? 'fragile' : 'live', look.width, look.opacity, fresh && !this.shownVeins.has(id));
      }
      for (const e of looseEdges(board, this.config, p)) this.vein(g, e.a, e.b, p, 'loose', 0.55, 0.7, false);
    }
    this.shownVeins = now;

    const maxRank = this.config.maxRank;
    for (const key of this.keys) {
      const t = board[key];
      if (!t) continue;
      this.tileEls.set(key, this.drawTile(tiles, key, t, maxRank));
    }

    // ---- overlays ----
    if (o.targets) {
      for (const key of this.keys) {
        if (o.targets.has(key) || key === o.selectedHex) continue;
        el('path', { d: hexPath(key, S - 1.2, st.tileShape), class: 'dim' }, over);
      }
      for (const key of o.targets) el('path', { d: hexPath(key, S - 3, st.tileShape), class: 'target', 'data-key': key }, over);
    }
    for (const key of o.cutKeys) el('path', { d: hexPath(key, S * 0.7, st.tileShape), class: 'will-cut' }, over);
    for (const g of o.ghosts) {
      const gg = el('g', { class: `ghost${g.replaces ? ' replaces' : ''}` }, over);
      el('path', { d: hexPath(g.key, S * tileScale(g.strength, maxRank), st.tileShape), class: 'ghost-tile' }, gg);
      const { x, y } = centerOf(g.key);
      el('text', { x, y: y + 1, class: 'ghost-num' }, gg).textContent = String(g.strength);
      if (g.replaces) el('path', { d: star(x + S * 0.5, y - S * 0.5, 6), class: 'spark-mark' }, gg);
    }
    // The coach's hint is a circle (not a hex outline), so it never looks like gold.
    for (const key of o.coachHexes) {
      const { x, y } = centerOf(key);
      el('circle', { cx: x, cy: y, r: S * 0.86, class: 'coach-ring' }, over);
    }
    if (o.selectedHex) el('path', { d: hexPath(o.selectedHex, S - 2, st.tileShape), class: 'selected' }, over);
    for (const w of o.weak) this.badge(over, w.key, `−${w.loss}`, 'weak');
    if (o.pulse && !o.weak.some((w) => w.key === o.pulse!.key)) this.badge(over, o.pulse.key, `−${o.pulse.loss}`, 'weak pulse');
    for (const w of o.opps) this.badge(over, w.key, `−${w.loss}`, 'opp');
    if (o.focusKey) el('path', { d: hexPath(o.focusKey, S - 1, st.tileShape), class: 'focus' }, over);
    this.svg.classList.toggle('usable', o.usable);
  }

  private vein(g: SVGGElement, a: string, b: string, owner: Player, kind: 'live' | 'fragile' | 'loose', width: number, opacity: number, grow: boolean) {
    const A = centerOf(a);
    const B = centerOf(b);
    const st = this.style;
    const from = 0.2;
    const p = { x: A.x + (B.x - A.x) * from, y: A.y + (B.y - A.y) * from };
    const q = { x: A.x + (B.x - A.x) * (1 - from), y: A.y + (B.y - A.y) * (1 - from) };
    // An organic S-curve between the tiles (the same for this pair every time, from a hash).
    const len = Math.hypot(B.x - A.x, B.y - A.y) || 1;
    const nx = -(B.y - A.y) / len;
    const ny = (B.x - A.x) / len;
    const amp = st.tileShape === 'organic' ? 2.5 + hash(a + b) * 3.5 : 0;
    const side = hash(b + a) > 0.5 ? 1 : -1;
    const at = (t: number, k: number) => ({ x: p.x + (q.x - p.x) * t + nx * k, y: p.y + (q.y - p.y) * t + ny * k });
    const curve = (k: number) => {
      const c1 = at(1 / 3, k);
      const c2 = at(2 / 3, -k);
      return `M${p.x.toFixed(1)},${p.y.toFixed(1)}C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${q.x.toFixed(1)},${q.y.toFixed(1)}`;
    };
    const d = curve(amp * side);
    // My links are the stronger ones: a vine. The bot's: a thinner stream of flowing lava.
    const w = st.veinWidth * width * (owner === 0 ? 1.1 : 0.95);
    const add = (attrs: Record<string, string | number>) => {
      const e = el('path', { pathLength: 1, ...attrs }, g);
      this.veinEls.push({ a, b, owner, el: e });
      return e;
    };
    const growCls = grow ? ' grow-in' : '';
    if (kind !== 'loose') {
      // the bot's lava gets a soft heat glow under its crusted banks
      if (owner === 1 && this.look.textures) add({ d, class: `lava-heat${this.look.motion ? ' pulsing' : ''}`, 'stroke-width': (w * 3).toFixed(2), style: `animation-delay:${(-hash(a + b) * 3).toFixed(2)}s` });
      add({ d, class: `${owner === 0 ? 'vein-casing' : 'lava-casing'} ${kind}${growCls}`, 'stroke-width': (w + (owner === 0 ? 1.8 : 2.4)).toFixed(2), 'stroke-opacity': (opacity * 0.85).toFixed(2) });
    }
    const e = add({ d, class: `vein ${kind}${growCls}`, 'stroke-width': w.toFixed(2), 'stroke-opacity': opacity.toFixed(2) });
    if (kind === 'fragile') e.style.animationDelay = `${(-hash(a + b) * 3).toFixed(2)}s`;
    if (kind === 'loose' || !this.look.textures) return;
    if (owner === 0) {
      // a thinner tendril twisting along the vine, and two small leaves
      add({ d: curve(-amp * side * 0.8), class: `vine-tendril${growCls}`, 'stroke-width': Math.max(0.6, w * 0.35).toFixed(2) });
      let leaves = '';
      for (const [t, sgn] of [[0.36, 1], [0.66, -1]] as const) {
        const m = at(t, amp * side * (t < 0.5 ? 0.45 : -0.45));
        const ang = Math.atan2(q.y - p.y, q.x - p.x) + sgn * 0.9;
        const L = 5.5;
        const tip = { x: m.x + Math.cos(ang) * L, y: m.y + Math.sin(ang) * L };
        const ox = -Math.sin(ang) * 1.9;
        const oy = Math.cos(ang) * 1.9;
        leaves += `M${m.x.toFixed(1)},${m.y.toFixed(1)}Q${((m.x + tip.x) / 2 + ox).toFixed(1)},${((m.y + tip.y) / 2 + oy).toFixed(1)} ${tip.x.toFixed(1)},${tip.y.toFixed(1)}Q${((m.x + tip.x) / 2 - ox).toFixed(1)},${((m.y + tip.y) / 2 - oy).toFixed(1)} ${m.x.toFixed(1)},${m.y.toFixed(1)}Z`;
      }
      const lf = el('path', { d: leaves, class: 'vine-leaf' }, g);
      this.veinEls.push({ a, b, owner, el: lf });
    } else {
      // a real lava stream: bright streaks racing along the molten middle, and dark crust
      // pieces drifting slower on top (two irregular patterns at two speeds read as flow)
      const flow = this.look.motion ? ' flowing' : '';
      const delay = `animation-delay:${(-hash(a + b) * 6).toFixed(2)}s`;
      add({ d, class: `lava-streaks${flow}`, 'stroke-width': Math.max(0.6, w * 0.4).toFixed(2), style: delay });
      add({ d, class: `lava-rafts${flow}`, 'stroke-width': Math.max(0.8, w * 0.7).toFixed(2), style: delay });
    }
  }

  private drawTile(parent: SVGGElement, key: string, t: Tile, maxRank: number): SVGGElement {
    const st = this.style;
    const who = t.owner === 0 ? 'you' : 'bot';
    const g = el('g', { class: `tile ${who}${t.root ? ' root' : ''} mat-${materialFor(t, 'normal')}`, 'data-key': key }, parent);
    const { x, y } = centerOf(key);
    const mat = materialFor(t, 'normal');
    if (t.root) {
      drawMaterial(mat, 'root', this.ctx(g, key));
      return g;
    }
    const k = tileScale(t.strength, maxRank);
    // The material (moss or fire) with its lowkey depth; then the number and marker, crisp on top.
    drawMaterial(mat, 'tile', this.ctx(g, key, S * k, t.strength));
    el('text', { x, y: y - S * 0.06, class: 'num tile-num' }, g).textContent = String(t.strength);
    this.mark(g, x, y + S * k * 0.52, t.owner === 0 ? st.youMark : st.botMark);
    return g;
  }

  private mark(g: SVGGElement, x: number, y: number, kind: string) {
    const r = 3.2;
    switch (kind) {
      case 'dot':
        el('circle', { cx: x, cy: y, r, class: 'mark-ink' }, g);
        break;
      case 'ring':
        el('circle', { cx: x, cy: y, r: r + 0.4, class: 'mark-halo' }, g);
        el('circle', { cx: x, cy: y, r: r + 0.4, class: 'mark-line' }, g);
        break;
      case 'pip':
        el('circle', { cx: x, cy: y, r: r + 0.6, class: 'mark-ink' }, g);
        el('circle', { cx: x, cy: y, r: 1.3, class: 'mark-hole' }, g);
        break;
      case 'box':
        el('rect', { x: x - 3, y: y - 3, width: 6, height: 6, class: 'mark-ink' }, g);
        break;
      case 'diamond':
        el('path', { d: `M${x},${y - 4}L${x + 4},${y}L${x},${y + 4}L${x - 4},${y}Z`, class: 'mark-ink' }, g);
        break;
      case 'tri':
        el('path', { d: `M${x},${y - 4}L${x + 4.4},${y + 3.4}L${x - 4.4},${y + 3.4}Z`, class: 'mark-ink' }, g);
        break;
    }
  }

  private badge(parent: SVGGElement, key: string, text: string, kind: 'weak' | 'opp' | 'weak pulse') {
    const { x, y } = centerOf(key);
    const g = el('g', { class: `badge ${kind}` }, parent);
    el('path', { d: hexPath(key, S - 3, this.style.tileShape), class: 'badge-ring' }, g);
    el('rect', { x: x + 2, y: y - S * 0.95, width: 22, height: 15, rx: 7.5, class: 'badge-bg' }, g);
    el('text', { x: x + 13, y: y - S * 0.95 + 8, class: 'badge-text num' }, g).textContent = text;
  }

  tile(key: string) {
    return this.tileEls.get(key);
  }
  veinsTouching(keys: Set<string>) {
    return this.veinEls.filter((v) => keys.has(v.a) || keys.has(v.b)).map((v) => v.el);
  }
  get fx() {
    return this.layers.fx;
  }
  rootKey(p: Player) {
    return coordKey(rootCoord(p, this.config.rootStyle, this.config.boardRadius));
  }
  /** Where a hex is on screen (for captions and tooltips). */
  screenPoint(key: string): { x: number; y: number } {
    const { x, y } = centerOf(key);
    const m = this.svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const pt = new DOMPoint(x, y).matrixTransform(m);
    return { x: pt.x, y: pt.y };
  }
  hexPath(key: string, size: number) {
    return hexPath(key, size, this.style.tileShape);
  }
}

