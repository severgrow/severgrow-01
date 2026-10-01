// Draws the hex board as SVG: terrain, the two networks (tiles plus the veins that
// join them back to each root), and overlays (targets, previews, weak spots).
// Also holds the board's animation effects. It never changes game state: it draws
// whatever board it is given.
import { allCoords, coordKey, parseKey, rootCoord } from '../../../src/engine/index.js';
import type { Player, RulesConfig, Terrain, Tile } from '../../../src/engine/index.js';
import type { Ghost } from '../logic/preview.js';
import type { Spot } from '../logic/weakspots.js';
import { looseEdges, networkEdges } from '../logic/network.js';
import type { ThemeStyle } from '../logic/themes.js';

const NS = 'http://www.w3.org/2000/svg';
export const S = 30; // hex radius in board units
const SQ3 = Math.sqrt(3);

type Attrs = Record<string, string | number>;
export const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
};

export const centerOf = (key: string) => {
  const c = parseKey(key);
  return { x: S * SQ3 * (c.q + c.r / 2), y: S * 1.5 * c.r };
};

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
};

const cornerPts = (key: string, size: number, jitter = 0) => {
  const { x, y } = centerOf(key);
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    const r = size * (1 + (jitter ? (hash(`${key}:${i}`) - 0.5) * jitter : 0));
    return [x + r * Math.cos(a), y + r * Math.sin(a)] as const;
  });
};
const polyPoints = (pts: readonly (readonly [number, number])[]) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/** A hex outline as a path: straight (flat, chunky) or soft and slightly uneven (organic). */
const hexPath = (key: string, size: number, shape: ThemeStyle['tileShape']) => {
  if (shape !== 'organic') return `M${polyPoints(cornerPts(key, size)).replace(/ /g, 'L')}Z`;
  const pts = cornerPts(key, size, 0.12);
  const mid = (a: readonly [number, number], b: readonly [number, number], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  let d = '';
  for (let i = 0; i < 6; i++) {
    const p = pts[i]!;
    const prev = pts[(i + 5) % 6]!;
    const next = pts[(i + 1) % 6]!;
    const [ax, ay] = mid(prev, p, 0.78);
    const [bx, by] = mid(p, next, 0.22);
    d += `${i === 0 ? 'M' : 'L'}${ax!.toFixed(1)},${ay!.toFixed(1)}Q${p[0].toFixed(1)},${p[1].toFixed(1)} ${bx!.toFixed(1)},${by!.toFixed(1)}`;
  }
  return `${d}Z`;
};

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
  private pressTimer: ReturnType<typeof setTimeout> | undefined;
  private pressed: string | null = null;
  private longPressed = false;

  constructor(
    readonly svg: SVGSVGElement,
    private handlers: BoardHandlers,
  ) {}

  /** Builds the static parts (terrain) for a game and theme. */
  setup(config: RulesConfig, terrain: Record<string, Terrain>, style: ThemeStyle) {
    this.config = config;
    this.style = style;
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
    const hatch = el('pattern', { id: 'pat-hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('rect', { width: 2.2, height: 6, class: 'pat-ink' }, hatch);
    const grain = el('pattern', { id: 'pat-grain', width: 7, height: 7, patternUnits: 'userSpaceOnUse' }, defs);
    el('circle', { cx: 2, cy: 2, r: 1.2, class: 'pat-ink' }, grain);
    el('circle', { cx: 5.5, cy: 5, r: 0.9, class: 'pat-ink' }, grain);
    const stripe = el('pattern', { id: 'pat-stripe', width: 10, height: 10, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-30)' }, defs);
    el('rect', { width: 4, height: 10, class: 'pat-ink' }, stripe);
    // Stone speckle for rocks and a fine diagonal weave for gold hexes (gold is
    // recognisable by pattern and its "2" badge, not by colour alone).
    const stone = el('pattern', { id: 'pat-stone', width: 9, height: 9, patternUnits: 'userSpaceOnUse' }, defs);
    el('circle', { cx: 2, cy: 3, r: 0.9, class: 'stone-dot' }, stone);
    el('circle', { cx: 6.5, cy: 7, r: 0.7, class: 'stone-dot' }, stone);
    el('circle', { cx: 7, cy: 1.5, r: 0.5, class: 'stone-dot light' }, stone);
    const weave = el('pattern', { id: 'pat-gold', width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('rect', { width: 1.1, height: 5, class: 'gold-weave' }, weave);
    const rockGrad = el('linearGradient', { id: 'grad-rock', x1: 0, y1: 0, x2: 0.3, y2: 1 }, defs);
    el('stop', { offset: 0, class: 'rock-top' }, rockGrad);
    el('stop', { offset: 1, class: 'rock-bottom' }, rockGrad);
    const glow = el('filter', { id: 'glow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
    el('feGaussianBlur', { stdDeviation: 2.4, result: 'b' }, glow);
    const merge = el('feMerge', {}, glow);
    el('feMergeNode', { in: 'b' }, merge);
    el('feMergeNode', { in: 'SourceGraphic' }, merge);

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
      if (t === 'rock') {
        // A cool stone with depth: a darker lower edge, speckle, and light/dark facets.
        const { x, y } = centerOf(key);
        el('path', { d: hexPath(key, S * 0.82, style.tileShape), class: 'rock-base', transform: 'translate(0 2.5)' }, g);
        el('path', { d: hexPath(key, S * 0.82, style.tileShape), class: 'rock-body' }, g);
        el('path', { d: hexPath(key, S * 0.82, style.tileShape), class: 'rock-speckle' }, g);
        const pts = cornerPts(key, S * 0.62);
        el('path', { d: `M${pts[4]![0]},${pts[4]![1]}L${x - 3},${y + 2}L${pts[0]![0]},${pts[0]![1]}`, class: 'rock-facet light' }, g);
        el('path', { d: `M${x - 3},${y + 2}L${pts[2]![0]},${pts[2]![1]}`, class: 'rock-facet dark' }, g);
      }
      if (t === 'rich') {
        el('path', { d: hexPath(key, S - 1.2, style.tileShape), class: 'gold-weave-fill' }, g);
        el('path', { d: hexPath(key, S * 0.8, style.tileShape), class: 'gold-sheen', style: `animation-delay:${(-hash(key) * 4).toFixed(2)}s` }, g);
        // The "2" badge sits above the tiles, so it stays visible when a tile is here.
        const { x, y } = centerOf(key);
        const b = el('g', { class: 'gold-badge', 'data-key': key }, this.layers.marks);
        el('circle', { cx: x + S * 0.52, cy: y - S * 0.5, r: 6.2, class: 'gold-badge-bg' }, b);
        el('text', { x: x + S * 0.52, y: y - S * 0.5 + 0.4, class: 'gold-badge-text num' }, b).textContent = '2';
      }
      this.bindHex(g, key);
    }
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
      el('path', { d: hexPath(s.key, S * 0.62, st.tileShape), class: `scar ${s.owner === 0 ? 'you' : 'bot'}` }, scars);
    }

    // Veins: live links back to the root, fragile single links, and loose (cut-off) links.
    for (const p of [0, 1] as const) {
      const g = el('g', { class: `veins ${p === 0 ? 'you' : 'bot'}` }, veins);
      if (p === 0 && st.glow > 0) g.setAttribute('filter', 'url(#glow)');
      for (const e of networkEdges(board, this.config, p)) this.vein(g, e.a, e.b, p, e.fragile ? 'fragile' : 'live');
      for (const e of looseEdges(board, this.config, p)) this.vein(g, e.a, e.b, p, 'loose');
    }

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
    for (const w of o.opps) this.badge(over, w.key, `−${w.loss}`, 'opp');
    if (o.focusKey) el('path', { d: hexPath(o.focusKey, S - 1, st.tileShape), class: 'focus' }, over);
    this.svg.classList.toggle('usable', o.usable);
  }

  private vein(g: SVGGElement, a: string, b: string, owner: Player, kind: 'live' | 'fragile' | 'loose') {
    const A = centerOf(a);
    const B = centerOf(b);
    const st = this.style;
    const from = 0.3;
    const p = { x: A.x + (B.x - A.x) * from, y: A.y + (B.y - A.y) * from };
    const q = { x: A.x + (B.x - A.x) * (1 - from), y: A.y + (B.y - A.y) * (1 - from) };
    const w = st.veinWidth * (kind === 'live' ? 1 : 0.55);
    let e: SVGElement;
    if (st.tileShape === 'organic') {
      // a gently curved vein
      const bend = (hash(a + b) - 0.5) * 9;
      const nx = -(B.y - A.y) / (S * SQ3);
      const ny = (B.x - A.x) / (S * SQ3);
      const c = { x: (p.x + q.x) / 2 + nx * bend, y: (p.y + q.y) / 2 + ny * bend };
      e = el('path', { d: `M${p.x.toFixed(1)},${p.y.toFixed(1)}Q${c.x.toFixed(1)},${c.y.toFixed(1)} ${q.x.toFixed(1)},${q.y.toFixed(1)}`, class: `vein ${kind}`, 'stroke-width': w }, g);
    } else {
      e = el('line', { x1: p.x.toFixed(1), y1: p.y.toFixed(1), x2: q.x.toFixed(1), y2: q.y.toFixed(1), class: `vein ${kind}`, 'stroke-width': w }, g);
    }
    if (kind === 'fragile') (e as SVGElement & { style: CSSStyleDeclaration }).style.animationDelay = `${(-hash(a + b) * 3).toFixed(2)}s`;
    this.veinEls.push({ a, b, owner, el: e });
  }

  private drawTile(parent: SVGGElement, key: string, t: Tile, maxRank: number): SVGGElement {
    const st = this.style;
    const who = t.owner === 0 ? 'you' : 'bot';
    const g = el('g', { class: `tile ${who}${t.root ? ' root' : ''}`, 'data-key': key }, parent);
    const { x, y } = centerOf(key);
    if (t.root) {
      if (st.tileShape === 'chunky') el('circle', { cx: x, cy: y + 4, r: S * 0.8, class: 'side' }, g);
      el('circle', { cx: x, cy: y, r: S * 0.8, class: 'body' }, g);
      el('circle', { cx: x, cy: y, r: S * 0.8, class: `pat ${who}` }, g);
      el('circle', { cx: x, cy: y, r: S * 0.42, class: 'root-core' }, g);
      el('circle', { cx: x, cy: y, r: S * 0.16, class: 'root-eye' }, g);
      g.classList.add('pulse');
      g.style.animationDelay = `${t.owner * -1.3}s`;
      return g;
    }
    const k = tileScale(t.strength, maxRank);
    const d = hexPath(key, S * k, st.tileShape);
    if (st.tileShape === 'chunky') el('path', { d, class: 'side', transform: 'translate(0 4)' }, g);
    el('path', { d, class: 'body', style: `opacity:${(0.62 + 0.38 * (t.strength / maxRank)).toFixed(2)}` }, g);
    el('path', { d, class: `pat ${who}` }, g);
    if (st.tileShape === 'chunky') el('path', { d: hexPath(key, S * k * 0.82, st.tileShape), class: 'bevel' }, g);
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

  private badge(parent: SVGGElement, key: string, text: string, kind: 'weak' | 'opp') {
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

/** A small four-point spark. */
export const star = (x: number, y: number, r: number) =>
  `M${x},${y - r}L${x + r * 0.28},${y - r * 0.28}L${x + r},${y}L${x + r * 0.28},${y + r * 0.28}L${x},${y + r}L${x - r * 0.28},${y + r * 0.28}L${x - r},${y}L${x - r * 0.28},${y - r * 0.28}Z`;
