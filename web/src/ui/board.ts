// Draws the hex board as SVG: terrain, the two networks (tiles plus the veins that
// join them back to each root), and overlays (targets, previews, weak spots).
// Also holds the board's animation effects. It never changes game state: it draws
// whatever board it is given.
import { FEATURES, IS_TEST2 } from '../channel.js';
import { allNeighbors, boardCoords, connectedKeys, coordKey, homeCoord, parseKey } from '../../../src/engine/index.js';
import type { Player, RulesConfig, Terrain, Tile } from '../../../src/engine/index.js';
import type { Ghost } from '../logic/preview.js';
import type { Spot } from '../logic/weakspots.js';
import { looseEdges, networkEdges, veinLook } from '../logic/network.js';
import type { ThemeStyle } from '../logic/themes.js';
import type { MaterialLook } from '../logic/materials.js';
import { FULL_LOOK, S, centerOf, el, hash, hexPath, noiseTile, star } from './geom.js';
import { drawMaterial, materialDefs } from './materials.js';
import { WorldLayer } from './worldlayer.js';
import { boardUnits } from '../logic/layout.js';
import { getOrient } from '../logic/orient.js';
import type { AmbientPlan } from '../logic/ambient.js';
import type { PaintTile } from '../logic/worldpaint.js';
import { numberStyle, vigour } from '../logic/vigour.js';
import { topGlow } from '../logic/topglow.js';
import type { GlowOpts } from '../logic/topglow.js';
import { glowSprite } from './glowsprite.js';
import type { ThemeId } from '../logic/themes.js';
import type { DrawCtx } from './materials.js';
import { materialFor } from '../logic/materials.js';
import { drawLandmark, setLandmarkState } from './landmarks.js';
import { materialsOf } from '../logic/materials.js';
import { drawSeedStone } from './seedstone.js';
import { drawGoldCrystals } from './goldcrystals.js';

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
  /** what cut-off tiles leave; `age` in turns (0 = this turn): older scars are fainter */
  scars: { key: string; owner: Player; age?: number }[];
  /** UX pass: hexes the opponent changed on its last turn (shown until I change the board) */
  fresh?: string[];
  usable: boolean;
  /** My most dangerous weak spot, pulsing gently with its "-4" (a setting). */
  pulse: Spot | null;
  /** Show the bot's fragile links flickering ("Bot's weak links" is on). */
  botFragile: boolean;
  /** v0.5: what each target does: grow on empty, replace a bot tile (⇆), strengthen mine (+). */
  targetKinds?: Record<string, 'grow' | 'replace' | 'strengthen' | 'fruit'>;
  /** polish pass 3: the picked tiles are the game's suggestion (soft "−" markers, not numbers) */
  /** v0.5 Fruit flow: tiles that can be picked, tiles picked so far (in order), the target. */
  /** overhaul item 10: the veins the previewed move would grow (pairs of keys) */
  ghostLinks?: [string, string][];
  /** overhaul item 10: after the previewed move, my weakest tile and how many tiles a cut there takes */
  atRisk?: { key: string; loss: number } | null;
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
  /** a long-press on touch (opens and pins the tile card); falls back to a brief inspect */
  hold?: (key: string) => void;
};

/** Pointer events in board units while drawing (one code path for touch, mouse and pen). */
export type DrawHandlers = {
  down: (p: { x: number; y: number }, e: PointerEvent) => void;
  move: (p: { x: number; y: number }, e: PointerEvent) => void;
  up: (p: { x: number; y: number }, e: PointerEvent, inside: boolean) => void;
  cancel: () => void;
};

/** What the painting ghost shows: tiles (with numbers; "can't" style when not ok), unavailable hexes, a cursor. */
export type GhostView = {
  tiles: { key: string; strength: number; ok: boolean }[];
  blocked: boolean;
  /** hexes this Bloom uses that cannot take the number they would get now (marked, with a reason elsewhere) */
  unavailable?: string[];
  cursor: string | null;
};

export class BoardView {
  protected config!: RulesConfig;
  protected style!: ThemeStyle;
  protected keys: string[] = [];
  /** Bonus terrain stays in engine state; this set only controls its visual crystals. */
  protected richKeys = new Set<string>();
  protected layers!: Record<'base' | 'scars' | 'veins' | 'homes' | 'tiles' | 'glow' | 'amb' | 'marks' | 'dim' | 'over' | 'draw' | 'fx', SVGGElement>;
  /** Polish pass 3: drawing mode (lines and clumps drawn with a finger or the mouse). */
  private drawing = false;
  private drawHandlers: DrawHandlers | null = null;
  /** Polish pass 3: the top-rank glow settings (and a strength multiplier, for the lab's comparison). */
  private glowOpts: GlowOpts = { setting: 'subtle', effects: 'normal', reduceMotion: false };
  private glowScale = 1;
  private glowKeys: Set<string> | null = null;
  protected tileEls = new Map<string, SVGGElement>();
  protected veinEls: { a: string; b: string; owner: Player; el: SVGElement }[] = [];
  protected shownVeins = new Set<string>(); // veins on screen last time, to draw new ones on
  private pressTimer: ReturnType<typeof setTimeout> | undefined;
  private pressed: string | null = null;
  private longPressed = false;
  protected look: MaterialLook = FULL_LOOK;
  /** Material pass 2: the world-space material picture (null without a canvas). */
  protected world: WorldLayer | null = null;
  protected paletteId: ThemeId = 'soil';
  /** Ids are unique per board, so several boards (the material lab) can share a page. */
  private readonly uid = `b${++boardCount}`;
  protected id = (name: string) => `${this.uid}-${name}`;
  protected url = (name: string) => `url(#${this.id(name)})`;

  constructor(
    readonly svg: SVGSVGElement,
    private handlers: BoardHandlers,
  ) {
    // drawing: the board itself listens, so a drag can run across hexes and gaps
    const at = (e: PointerEvent) => {
      const ctm = svg.getScreenCTM();
      if (!ctm) return { x: 0, y: 0 };
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      return { x: p.x, y: p.y };
    };
    const inside = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    };
    svg.addEventListener('pointerdown', (e) => {
      if (!this.drawing || !this.drawHandlers) return;
      // capture every pointer (the mouse too), so a release outside the board still arrives
      svg.setPointerCapture?.(e.pointerId);
      this.drawHandlers.down(at(e), e);
    });
    svg.addEventListener('pointermove', (e) => {
      if (this.drawing && this.drawHandlers) this.drawHandlers.move(at(e), e);
    });
    svg.addEventListener('pointerup', (e) => {
      if (this.drawing && this.drawHandlers) this.drawHandlers.up(at(e), e, inside(e));
    });
    svg.addEventListener('pointercancel', () => {
      if (this.drawing && this.drawHandlers) this.drawHandlers.cancel();
    });
    svg.addEventListener('contextmenu', (e) => {
      if (!this.drawing || !this.drawHandlers) return;
      e.preventDefault();
      this.drawHandlers.cancel();
    });
  }

  /** Drawing mode on or off. While on, the board takes the pointer (no pinch or scroll starts a drawing). */
  setDrawing(on: boolean, h: DrawHandlers | null) {
    this.drawing = on;
    this.drawHandlers = on ? h : null;
    this.svg.classList.toggle('drawing', on);
    if (!on) this.layers?.draw.replaceChildren();
  }

  /** Draws the drawing ghost on its own layer (nothing else is redrawn). */
  ghost(g: GhostView | null) {
    const layer = this.layers.draw;
    layer.replaceChildren();
    if (!g) return;
    const st = this.style;
    const maxRank = this.config.maxRank;
    for (const t of g.tiles) {
      const gg = el('g', { class: `ghost draw-ghost${t.ok ? '' : ' cant'}${g.blocked ? ' blocked' : ''}`, 'data-key': t.key }, layer);
      el('path', { d: hexPath(t.key, S * tileScale(t.strength, maxRank), st.tileShape), class: 'ghost-tile' }, gg);
      const { x, y } = centerOf(t.key);
      if (IS_TEST2) drawSeedStone(gg, t.key, x, y, t.strength, 0);
      else el('text', { x, y: y + 1, class: 'ghost-num' }, gg).textContent = String(t.strength);
    }
    for (const k of g.unavailable ?? []) el('path', { d: hexPath(k, S * 0.9, st.tileShape), class: 'draw-unavailable', 'data-key': k }, layer);
    if (g.cursor) el('path', { d: hexPath(g.cursor, S - 1.5, st.tileShape), class: 'draw-cursor' }, layer);
  }

  /** A small shake of the ghost: lifting the finger on a shape that can't be placed does nothing else. */
  shake(reduceMotion: boolean) {
    if (reduceMotion) return;
    this.layers.draw.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 220 });
  }

  /** Builds the static parts (terrain) for a game and theme. */
  setup(config: RulesConfig, terrain: Record<string, Terrain>, style: ThemeStyle, look: MaterialLook = FULL_LOOK, paletteId: ThemeId = 'soil') {
    this.paletteId = paletteId;
    this.config = config;
    this.style = style;
    this.look = look;
    this.shownVeins = new Set();
    const svg = this.svg;
    svg.replaceChildren();
    const coords = boardCoords(config);
    this.keys = coords.map(coordKey);
    this.richKeys = new Set(this.keys.filter(key => terrain[key] === 'rich'));
    // Step 3: just the tiles, a thin margin and headroom for the homes, in the board's orientation
    const u = boardUnits(config.boardRadius, getOrient());
    svg.setAttribute('viewBox', `${u.x0.toFixed(1)} ${u.y0.toFixed(1)} ${u.w.toFixed(1)} ${u.h.toFixed(1)}`);
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
    // Step 3 item 6: a calm, fine grain of tiny dots for gold hexes (recognisable without
    // colour, with the "2" badge), no strong stripes
    const weave = el('pattern', { id: this.id('pat-gold'), width: 4.5, height: 4.5, patternUnits: 'userSpaceOnUse' }, defs);
    el('circle', { cx: 1.1, cy: 1.1, r: 0.62, class: 'gold-weave' }, weave);
    el('circle', { cx: 3.35, cy: 3.35, r: 0.62, class: 'gold-weave' }, weave);
    const glow = el('filter', { id: this.id('glow'), x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
    el('feGaussianBlur', { stdDeviation: 2.4, result: 'b' }, glow);
    const merge = el('feMerge', {}, glow);
    el('feMergeNode', { in: 'b' }, merge);
    el('feMergeNode', { in: 'SourceGraphic' }, merge);

    materialDefs(defs, this.id, look);
    // Material pass 2: one world-space picture for every moss and lava tile (seamless).
    this.world = null;
    if (this.usesWorldLayer()) {
      const vb = svg.viewBox.baseVal;
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      this.world = new WorldLayer(defs, this.id('world'), this.id('world-prev'), { x0: vb.x, y0: vb.y, w: vb.width, h: vb.height }, Math.min(2.4, Math.max(1, dpr * 0.95)));
      this.world.onSwap = (keys) => this.crossFade(keys);
      // the number plate: a soft round disc behind the digit
      for (const kind of ['moss', 'lava'] as const) {
        const col = numberStyle(kind, 1, paletteId).plate;
        const gr = el('radialGradient', { id: this.id(`plate-${kind}`), cx: 0.5, cy: 0.5, r: 0.5 }, defs);
        el('stop', { offset: 0, 'stop-color': col, 'stop-opacity': 1 }, gr);
        el('stop', { offset: 0.62, 'stop-color': col, 'stop-opacity': 0.92 }, gr);
        el('stop', { offset: 1, 'stop-color': col, 'stop-opacity': 0 }, gr);
      }
      // UX pass: the tiles fade in with their landscape, never the plain look first
      svg.classList.add('warming');
      const warm = () => svg.classList.remove('warming');
      setTimeout(warm, 1500);
      this.world.onFirst = () => {
        if (this.lastRender) this.render(...this.lastRender);
        warm();
      };
    }
    svg.style.setProperty("--m-depth", `${look.depth}px`);
    svg.style.setProperty("--m-shadow", String(look.shadow));

    // Step 3 item 5: no outer frame, rim or corner pins; the board is its tiles (the empty
    // hexes keep their faint soil and a slightly lighter edge, so the grid reads in sunlight)
    if (look.textures) {
      // soil grain in the empty hexes: a few specks, the same everywhere (one pattern)
      const soil = el('pattern', { id: this.id('soil'), width: 11, height: 11, patternUnits: 'userSpaceOnUse' }, defs);
      for (const [cx, cy, r] of [[2, 3, 0.8], [7.5, 1.5, 0.55], [5, 8, 0.7], [9.5, 6.5, 0.45], [1, 9.5, 0.5]] as const) el('circle', { cx, cy, r, class: 'soil-speck' }, soil);
    }

    this.layers = {
      base: el('g', { class: 'l-base' }, svg),
      scars: el('g', { class: 'l-scars' }, svg),
      tiles: el('g', { class: 'l-tiles' }, svg),
      glow: el('g', { class: 'l-glow' }, svg),
      veins: el('g', { class: 'l-veins' }, svg),
      homes: el('g', { class: 'l-homes' }, svg),
      amb: el('g', { class: 'l-amb', 'aria-hidden': 'true' }, svg),
      marks: el('g', { class: 'l-marks' }, svg),
      dim: el('g', { class: 'l-dim', 'aria-hidden': 'true' }, svg),
      over: el('g', { class: 'l-over' }, svg),
      draw: el('g', { class: 'l-draw' }, svg),
      fx: el('g', { class: 'l-fx' }, svg),
    };
    for (const key of this.keys) {
      const t = terrain[key] ?? 'normal';
      const g = el('g', { class: `hex-cell ${t}`, 'data-key': key }, this.layers.base);
      el('path', { d: hexPath(key, S - 1.2, style.tileShape), class: `hex ${t}` }, g);
      this.drawCell(g, key, t);
      if (t === 'rich' && IS_TEST2) {
        const { x, y } = centerOf(key);
        drawGoldCrystals(g, key, x, y, false);
      }
      if (t === 'rich' && !IS_TEST2) {
        // The "2" badge sits above the tiles, so it stays visible when a tile is here.
        const { x, y } = centerOf(key);
        const b = el('g', { class: 'gold-badge', 'data-key': key }, this.layers.marks);
        // lower right, clear of the weak-link badges above the hex and the owner mark below
        el('circle', { cx: x + S * 0.58, cy: y + S * 0.42, r: 6.2, class: 'gold-badge-bg' }, b);
        el('text', { x: x + S * 0.58, y: y + S * 0.42 + 0.4, class: 'gold-badge-text num' }, b).textContent = '2';
      }
      this.bindHex(g, key);
    }
    // Step 4: the homes as landmarks (my tree, the opponent's volcano), drawn once, kept across renders
    this.homeEls = ([0, 1] as const).map((p) => this.drawHome(p, coordKey(homeCoord(p, config))));
    this.afterSetup(terrain);
  }

  // ---- drawing steps a skinned board (ui/skin/) can replace; these defaults are the board's own look ----

  /** Whether tiles use the painted world layer (Material pass 2). */
  protected usesWorldLayer() {
    return true;
  }
  /** The material of one empty, gold or rock hex (under everything). */
  protected drawCell(g: SVGGElement, key: string, t: Terrain) {
    const visibleTerrain = IS_TEST2 && t === 'rich' ? 'normal' : t;
    drawMaterial(materialFor(null, visibleTerrain), 'cell', this.ctx(g, key));
    if (visibleTerrain === 'normal' && this.look.textures) el('path', { d: hexPath(key, S - 3, this.style.tileShape), class: 'soil-grain', fill: this.url('soil') }, g);
  }
  /** A home landmark (kept across renders; setLandmarkState drives its states). */
  protected drawHome(p: Player, key: string): SVGGElement {
    return drawLandmark(this.layers.homes, p === 0 ? 'tree' : 'volcano', key, centerOf(key), getOrient(), materialsOf(this.paletteId).colors, this.look);
  }
  /** Called at the end of setup (the layers and homes exist). */
  protected afterSetup(_terrain: Record<string, Terrain>) {}

  /** Step 4: the two home landmarks (index = player), for their states and reactions. */
  homeEls: SVGGElement[] = [];

  /** Sets each home's state (danger ring, worried, tapped, strangled) from public information. */
  setHomes(states: Parameters<typeof setLandmarkState>[1][]) {
    states.forEach((s, p) => {
      const g = this.homeEls[p];
      if (g) setLandmarkState(g, s);
    });
  }

  /** What a material drawer needs for one hex. */
  protected ctx(parent: SVGGElement, key: string, radius = S, strength = 1): DrawCtx {
    return { parent, key, look: this.look, shape: this.style.tileShape, url: this.url, radius, strength, maxRank: this.config.maxRank };
  }

  private bindHex(g: SVGGElement, key: string) {
    g.addEventListener('pointerdown', (e) => {
      if (this.drawing) return;
      this.pressed = key;
      this.longPressed = false;
      clearTimeout(this.pressTimer);
      if (e.pointerType !== 'mouse') {
        this.pressTimer = setTimeout(() => {
          this.longPressed = true;
          if (this.handlers.hold) this.handlers.hold(key);
          else this.handlers.inspect(key);
        }, 450);
      }
    });
    g.addEventListener('pointerup', () => {
      clearTimeout(this.pressTimer);
      if (this.drawing) return;
      if (this.pressed === key && !this.longPressed) this.handlers.tap(key);
      if (this.longPressed && !this.handlers.hold) setTimeout(() => this.handlers.inspect(null), 1600);
      this.pressed = null;
    });
    g.addEventListener('pointercancel', () => clearTimeout(this.pressTimer));
    g.addEventListener('pointerleave', (e) => {
      clearTimeout(this.pressTimer);
      if (e.pointerType === 'mouse') this.handlers.inspect(null);
    });
    g.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse' && !this.drawing) this.handlers.inspect(key);
    });
  }

  /** Material pass 2: repaint timings and canvas size (for the performance report). */
  get worldStats() {
    return this.world?.stats ?? null;
  }

  get boardKeys() {
    return this.keys;
  }

  /** Redraws the networks and overlays for `board`. */
  protected lastRender: [Record<string, Tile | null>, Overlay] | null = null;

  render(board: Record<string, Tile | null>, o: Overlay) {
    this.lastRender = [board, o];
    const { veins, tiles, over, scars } = this.layers;
    if (this.world) {
      const paint = new Map<string, PaintTile>();
      for (const [k, t] of Object.entries(board)) if (t && !t.root) paint.set(k, { owner: t.owner, t: vigour(t.strength, this.config.maxRank) });
      this.world.sync(paint, this.paletteId, this.look.textures ? 'normal' : 'low');
    }
    veins.replaceChildren();
    tiles.replaceChildren();
    over.replaceChildren();
    scars.replaceChildren();
    this.tileEls.clear();
    this.veinEls = [];

    this.drawScars(board, o, scars);

    this.drawVeins(board, o, veins);

    const maxRank = this.config.maxRank;
    for (const key of this.keys) {
      const t = board[key];
      if (!t) continue;
      this.tileEls.set(key, this.drawTile(tiles, key, t, maxRank));
    }
    this.drawGlows(board);
    this.renderOverlays(board, o);
  }

  /** What cut-off tiles leave (empty hexes). */
  protected drawScars(board: Record<string, Tile | null>, o: Overlay, scars: SVGGElement) {
    for (const s of o.scars) {
      if (board[s.key]) continue;
      // what a cut-off tile leaves: dried moss (mine) or burnt-out ash (the bot's), fading over two turns
      const g = el('g', { class: `scar-g age-${Math.min(2, s.age ?? 0)}` }, scars);
      drawMaterial(materialFor({ owner: s.owner }, 'normal'), 'scar', this.ctx(g, s.key));
    }
  }

  /** Futasaku 0.3 lets adjacent tile art carry territory; no permanent connector is drawn. */
  protected drawVeins(board: Record<string, Tile | null>, o: Overlay, veins: SVGGElement) {
    if (IS_TEST2) { this.shownVeins.clear(); return; }
    const st = this.style;
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
  }

  /** Gold badges on tiles, targets, previews, badges and marks (the same for every skin). */
  private renderOverlays(board: Record<string, Tile | null>, o: Overlay) {
    const { over } = this.layers;
    const st = this.style;
    const maxRank = this.config.maxRank;
    // Only one crystal pair is visible per bonus hex: the base pair gives way to
    // the pair drawn over an occupied tile, below that tile's strength stone.
    if (IS_TEST2) {
      for (const crystal of this.layers.base.querySelectorAll<SVGGElement>('.gold-crystals.empty')) {
        crystal.style.display = board[crystal.dataset.key ?? ''] ? 'none' : '';
      }
    } else {
      for (const badge of this.layers.marks.querySelectorAll<SVGGElement>('.gold-badge')) badge.classList.toggle('on-tile', !!board[badge.dataset.key ?? badge.getAttribute('data-key') ?? '']);
    }

    // ---- overlays ----
    if (o.targets) {
      for (const key of this.keys) {
        if (o.targets.has(key) || key === o.selectedHex) continue;
        el('path', { d: hexPath(key, S - 1.2, st.tileShape), class: 'dim' }, over);
      }
      for (const key of o.targets) {
        const kind = o.targetKinds?.[key] ?? 'grow';
        el('path', { d: hexPath(key, S - 3, st.tileShape), class: `target kind-${kind}`, 'data-key': key, 'data-kind': kind }, over);
        // a shape, not only a colour: + strengthens my tile, ⇆ replaces a bot tile
        // (a Fruit card's targets keep a calm ring, no badge)
        if (kind !== 'grow' && kind !== 'fruit') this.markBadge(over, key, kind === 'strengthen' ? '+' : '⇆', kind);
      }
    }
    for (const key of o.cutKeys) el('path', { d: hexPath(key, S * 0.7, st.tileShape), class: 'will-cut' }, over);
    // overhaul item 10: the veins the move would grow, drawn on before the tiles
    for (const [a, b] of IS_TEST2 ? [] : (o.ghostLinks ?? [])) {
      const A = centerOf(a);
      const B = centerOf(b);
      const t = 0.28;
      el('path', { d: `M${(A.x + (B.x - A.x) * t).toFixed(1)},${(A.y + (B.y - A.y) * t).toFixed(1)}L${(B.x - (B.x - A.x) * t).toFixed(1)},${(B.y - (B.y - A.y) * t).toFixed(1)}`, class: 'ghost-vein' }, over);
    }
    for (const g of o.ghosts) {
      const gg = el('g', { class: `ghost${g.replaces ? ' replaces' : ''}` }, over);
      el('path', { d: hexPath(g.key, S * tileScale(g.strength, maxRank), st.tileShape), class: 'ghost-tile' }, gg);
      const { x, y } = centerOf(g.key);
      if (IS_TEST2) drawSeedStone(gg, g.key, x, y, g.strength, 0);
      else el('text', { x, y: y + 1, class: 'ghost-num' }, gg).textContent = String(g.strength);
      if (g.replaces) el('path', { d: star(x + S * 0.5, y - S * 0.5, 6), class: 'spark-mark' }, gg);
    }
    // The coach's hint is a circle (not a hex outline), so it never looks like gold.
    for (const key of o.coachHexes) {
      const { x, y } = centerOf(key);
      el('circle', { cx: x, cy: y, r: S * 0.86, class: 'coach-ring' }, over);
    }
    if (o.selectedHex) el('path', { d: hexPath(o.selectedHex, S - 2, st.tileShape), class: 'selected' }, over);
    // overhaul item 10: "−N" on my tile the move leaves weakest, and on the opponent tiles it cuts
    if (o.atRisk) this.badge(over, o.atRisk.key, `−${o.atRisk.loss}`, 'weak at-risk');
    if (o.cutKeys.length > 0 && o.ghosts.length > 0) this.badge(over, [...o.cutKeys].sort()[0]!, `−${o.cutKeys.length}`, 'opp cut-gain');
    for (const w of o.weak) this.badge(over, w.key, `−${w.loss}`, 'weak');
    if (o.pulse && !o.weak.some((w) => w.key === o.pulse!.key)) this.badge(over, o.pulse.key, `−${o.pulse.loss}`, 'weak pulse');
    for (const w of o.opps) this.badge(over, w.key, `−${w.loss}`, 'opp');
    if (o.focusKey) el('path', { d: hexPath(o.focusKey, S - 1, st.tileShape), class: 'focus' }, over);
    // UX pass: what the opponent changed last turn: a small spark at the top of each hex
    for (const key of o.fresh ?? []) {
      if (!board[key]) continue;
      const { x, y } = centerOf(key);
      const g = el('g', { class: `fresh-mark${this.look.motion ? ' arrive' : ''}`, 'data-key': key }, over);
      el('circle', { cx: x, cy: y - S * 0.7, r: 4.2, class: 'fresh-halo' }, g);
      el('circle', { cx: x, cy: y - S * 0.7, r: 2.2, class: 'fresh-dot' }, g);
    }
    this.svg.classList.toggle('usable', o.usable);
  }

  /** A small round badge with a symbol at the top-right of a hex (target kinds, Fruit picks). */
  private markBadge(parent: SVGGElement, key: string, text: string, cls: string) {
    const { x, y } = centerOf(key);
    const g = el('g', { class: `mark-badge ${cls}` }, parent);
    el('circle', { cx: x + S * 0.48, cy: y - S * 0.5, r: 6.2 }, g);
    el('text', { x: x + S * 0.48, y: y - S * 0.5 + 0.5 }, g).textContent = text;
  }

  protected vein(g: SVGGElement, a: string, b: string, owner: Player, kind: 'live' | 'fragile' | 'loose', width: number, opacity: number, grow: boolean) {
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

  protected drawTile(parent: SVGGElement, key: string, t: Tile, maxRank: number): SVGGElement {
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
    if (this.world?.ready) {
      // Material pass 2: the shared landscape, the full hex, the strength in the material itself.
      const tt = vigour(t.strength, maxRank);
      const d = hexPath(key, S * 0.995, st.tileShape);
      const kind = t.owner === 0 ? 'moss' : 'lava';
      el('path', { d, class: 'world-fill', fill: this.url('world') }, g);
      el('path', { d, class: 'tile-edge' }, g);
      const ns = numberStyle(kind, tt, this.paletteId);
      if (IS_TEST2 && this.richKeys.has(key)) drawGoldCrystals(g, key, x, y, true);
      if (IS_TEST2) drawSeedStone(g, key, x, y, t.strength, t.owner);
      else {
        el('circle', { cx: x, cy: y - S * 0.06, r: S * 0.34, class: 'num-plate', fill: this.url(`plate-${kind}`), style: `opacity:${ns.plateAlpha.toFixed(2)}` }, g);
        el('text', { x, y: y - S * 0.06, class: 'num tile-num world', style: `fill:${ns.ink}` }, g).textContent = String(t.strength);
      }
      this.mark(g, x, y + S * 0.52, t.owner === 0 ? st.youMark : st.botMark);
      return g;
    }
    // The material (moss or fire) with its lowkey depth; then the number and marker, crisp on top.
    drawMaterial(mat, 'tile', this.ctx(g, key, S * k, t.strength));
    if (IS_TEST2 && this.richKeys.has(key)) drawGoldCrystals(g, key, x, y, true);
    if (IS_TEST2) drawSeedStone(g, key, x, y, t.strength, t.owner);
    else el('text', { x, y: y - S * 0.06, class: 'num tile-num' }, g).textContent = String(t.strength);
    this.mark(g, x, y + S * k * 0.52, t.owner === 0 ? st.youMark : st.botMark);
    return g;
  }

  /** Changes the top-rank glow (settings), redrawing it; `scale` is only for the lab's comparison rows. */
  setGlow(o: GlowOpts, scale = 1) {
    this.glowOpts = o;
    this.glowScale = scale;
    if (this.lastRender) this.drawGlows(this.lastRender[0]);
  }

  /** The slight glow on top-rank tiles: a faint pre-rendered halo, above the tiles, under everything else. */
  protected drawGlows(board: Record<string, Tile | null>) {
    const layer = this.layers.glow;
    layer.replaceChildren();
    const now = new Set<string>();
    for (const key of this.keys) {
      const t = board[key];
      if (!t || t.root) continue;
      const kind = t.owner === 0 ? 'moss' : 'lava';
      const glow = topGlow(vigour(t.strength, this.config.maxRank), kind, this.glowOpts);
      if (!glow) continue;
      const sprite = glowSprite(glow.color, glow.blur, this.style.tileShape);
      if (!sprite) continue;
      now.add(key);
      const { x, y } = centerOf(key);
      const e = sprite.extent;
      const img = el('image', { href: sprite.url, x: x - e, y: y - e, width: e * 2, height: e * 2, class: `top-glow ${kind}`, 'data-key': key, style: `--op:${Math.min(1, glow.opacity * this.glowScale).toFixed(3)}` }, layer);
      // newly at the top (a Strengthen, or a tile grown at the top rank): fade in, nothing else
      if (this.glowKeys && !this.glowKeys.has(key)) img.classList.add('glow-in');
      if (glow.breathe) {
        img.classList.add('breathe');
        img.style.setProperty('--breathe', String(1 - glow.breathe.amount));
        img.style.setProperty('--breathe-ms', `${glow.breathe.periodMs}ms`);
      }
    }
    this.glowKeys = now;
  }

  /** New material pixels landed: the changed tiles fade from their old look to the new one. */
  private crossFade(keys: string[]) {
    if (!this.look.motion) return;
    for (const k of keys) {
      const g = this.tileEls.get(k);
      const fill = g?.querySelector('.world-fill');
      if (!g || !fill) continue;
      const old = fill.cloneNode() as SVGPathElement;
      old.setAttribute('fill', this.url('world-prev'));
      old.classList.add('world-prev');
      fill.after(old);
      const a = old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: 'ease-out', fill: 'forwards' });
      a.onfinish = () => old.remove();
    }
  }

  protected mark(g: SVGGElement, x: number, y: number, kind: string) {
    // the test copy: no owner marks on tiles (moss and lava already say whose tile it is)
    if (!FEATURES.ownershipMarks) return;
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

  private badge(parent: SVGGElement, key: string, text: string, kind: 'weak' | 'opp' | 'weak pulse' | 'weak at-risk' | 'opp cut-gain') {
    const { x, y } = centerOf(key);
    const g = el('g', { class: `badge ${kind}` }, parent);
    el('path', { d: hexPath(key, S - 3, this.style.tileShape), class: 'badge-ring' }, g);
    el('rect', { x: x + 2, y: y - S * 0.95, width: 22, height: 15, rx: 7.5, class: 'badge-bg' }, g);
    el('text', { x: x + 13, y: y - S * 0.95 + 8, class: 'badge-text num' }, g).textContent = text;
  }

  tile(key: string) {
    return this.tileEls.get(key);
  }

  /** Overhaul item 19: dim the board except these hexes (null: no dimming). */
  focus(keys: readonly string[] | null) {
    const g = this.layers.dim;
    if (!keys || keys.length === 0) {
      g.classList.remove('on');
      return;
    }
    const vb = this.svg.viewBox.baseVal;
    const holes = keys.map((k) => hexPath(k, S + 1, this.style.tileShape)).join('');
    g.replaceChildren();
    el('path', { d: `M${vb.x},${vb.y}h${vb.width}v${vb.height}h${-vb.width}Z${holes}`, 'fill-rule': 'evenodd', class: 'dim-mask' }, g);
    g.classList.add('on');
  }

  /** Overhaul item 16: ambient life (pure CSS animations of a few small shapes; see logic/ambient.ts). */
  ambient(plan: AmbientPlan | null) {
    const g = this.layers.amb;
    g.replaceChildren();
    this.svg.classList.toggle('sway', !!plan?.sway);
    if (!plan) return;
    if (IS_TEST2) {
      if (plan.sway) this.drawTerritoryPulses(g);
    } else for (const p of plan.pulses) {
      const A = centerOf(p.from);
      const B = centerOf(p.to);
      el('path', { d: `M${A.x.toFixed(1)},${A.y.toFixed(1)}L${B.x.toFixed(1)},${B.y.toFixed(1)}`, class: 'amb-pulse', pathLength: 100, style: `animation-delay:${p.delay}s` }, g);
    }
    for (const gl of plan.glints) {
      const { x, y } = centerOf(gl.key);
      el('path', { d: star(x - S * 0.3, y - S * 0.35, 5), class: 'amb-glint', style: `animation-delay:${gl.delay}s` }, g);
    }
    for (const b of plan.bubbles) {
      const { x, y } = centerOf(b.key);
      el('circle', { cx: (x + b.dx * S).toFixed(1), cy: (y + b.dy * S).toFixed(1), r: 2.2, class: 'amb-bubble', style: `animation-delay:${b.delay}s` }, g);
    }
    for (const e of IS_TEST2 ? [] : plan.embers) {
      const { x, y } = centerOf(e.key);
      el('circle', { cx: (x + e.dx * S).toFixed(1), cy: (y - S * 0.2).toFixed(1), r: 1.1, class: 'amb-ember', style: `animation-delay:${e.delay}s` }, g);
    }
  }

  /** One moving, clipped pool of light per living territory. Its motion path has no stroke:
   * the highlight only appears on owned tile surfaces, never as a connector in a gap. */
  private drawTerritoryPulses(layer: SVGGElement) {
    const board = this.lastRender?.[0];
    const defs = this.svg.querySelector('defs');
    if (!board || !defs) return;
    for (const owner of [0, 1] as const) {
      let joined: Set<string>;
      try { joined = connectedKeys(board, this.config, owner); }
      catch { continue; }
      const root = this.rootKey(owner);
      if (!joined.has(root) || joined.size < 2) continue;
      const route: string[] = [root];
      const seen = new Set([root]);
      const walk = (key: string) => {
        for (const next of allNeighbors(parseKey(key)).map(coordKey).filter(k => joined.has(k) && !seen.has(k)).sort()) {
          seen.add(next); route.push(next); walk(next); route.push(key);
        }
      };
      walk(root);
      const clipId = this.id(`territory-clip-${owner}`);
      const glowId = this.id(`territory-light-${owner}`);
      defs.querySelector(`#${clipId}`)?.remove();
      let gradient = defs.querySelector(`#${glowId}`);
      if (!gradient) {
        gradient = el('radialGradient', { id: glowId }, defs);
        el('stop', { offset: '0%', 'stop-color': owner === 0 ? '#f8ffe7' : '#ffe2a5', 'stop-opacity': owner === 0 ? .45 : .6 }, gradient);
        el('stop', { offset: '48%', 'stop-color': owner === 0 ? '#cfffaa' : '#ff913f', 'stop-opacity': owner === 0 ? .18 : .22 }, gradient);
        el('stop', { offset: '100%', 'stop-color': owner === 0 ? '#cfffaa' : '#ff782f', 'stop-opacity': 0 }, gradient);
      }
      const clip = el('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' }, defs);
      for (const key of joined) el('path', { d: hexPath(key, S * 1.01, this.style.tileShape) }, clip);
      const surface = el('g', { class: `territory-pulse p${owner}`, 'clip-path': `url(#${clipId})` }, layer);
      const light = el('g', { opacity: 0 }, surface);
      el('circle', { cx: 0, cy: 0, r: S * (owner === 0 ? 1.08 : .88), fill: `url(#${glowId})` }, light);
      // A narrower magma glint gives the volcano a little more bite, but it still
      // appears only while the travelling pool of light is on that tile's surface.
      if (owner === 1) el('circle', { cx: 0, cy: 0, r: S * .3, fill: `url(#${glowId})`, opacity: .62 }, light);
      const points = route.map(key => centerOf(key));
      const path = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join('');
      const duration = `${Math.min(21, Math.max(7, route.length * .38)).toFixed(1)}s`;
      const begin = owner ? '-3.2s' : '0s';
      el('animateMotion', { path, dur: duration, begin, repeatCount: 'indefinite', calcMode: 'linear' }, light);
      el('animate', { attributeName: 'opacity', values: '0;.74;.74;0', keyTimes: '0;.08;.88;1', dur: duration, begin, repeatCount: 'indefinite' }, light);
    }
  }
  veinsTouching(keys: Set<string>) {
    return this.veinEls.filter((v) => keys.has(v.a) || keys.has(v.b)).map((v) => v.el);
  }
  get fx() {
    return this.layers.fx;
  }
  rootKey(p: Player) {
    return coordKey(homeCoord(p, this.config));
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
