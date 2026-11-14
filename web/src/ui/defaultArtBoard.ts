// The fast default board: the FOREST & ASH skin (owner, 2026-11-13). Upright sprites cut from the
// supplied sheets (ui/forestAsh.ts) for both territories, both homes, rocks and gold frames, over the
// existing empty ground, with the physical number stones. BoardView's hitboxes, overlays and game
// interactions are unchanged: the hex stays the only hit area, art never takes a tap.
//
// ART THAT SPILLS (owner, 2026-11-13): grass tips, the fruit tree, the volcano's smoke and rock bumps
// reach past their own hex and cover what is behind them. Drawing order decides who covers whom:
//   empty ground and empty gold frames  <  Forest/Ash tiles, lower rows over upper rows
//   <  rocks  <  homes (owner: "home tile covers anything, rock tiles cover anything else but home")
//   <  the fringe of a tile below a home, over the home's lower edge (the one exception).
// So grass tips lie over the empty ground or grass above them, and under a rock or a home.
//
// HIGHLIGHTS GO AROUND THE HOMES (owner: "the selection goes around the hex but inwards around the
// tree / smoke"; "just home tiles"). The tree's and the volcano's outlines were traced once at build
// time (forestAshData.ts), a little outside the art and as smooth curves. A highlight on a cell the
// canopy or smoke reaches is masked by that outline and gets a rim along it in its own style, so a
// legal tile above the tree lights up around the canopy. Grass tips and rock bumps simply lie on top.
// Nothing is traced at runtime: the mask is rebuilt only when which tiles stand where changes.
import { allCoords, allNeighbors, coordKey, hexDistance, parseKey } from '../../../src/engine/index.js';
import type { Player, Terrain, Tile } from '../../../src/engine/index.js';
import { BoardView } from './board.js';
import { S, SQ3, centerOf, cornerPts, el, flatCentreOf, hash, hexPath, latticeCentre } from './geom.js';
import { drawLandmark } from './landmarks.js';
import { getOrient } from '../logic/orient.js';
import { materialsOf } from '../logic/materials.js';
import { drawSeedStone } from './seedstone.js';
import { drawGoldFrame } from './goldframes.js';
import { DEFAULT_ART_SPRITES } from './defaultArtSprites.js';
import { FA_ALL_URLS, FA_ROCKS, faBackgroundUrl, faBaseColour, faRockSprite, faTileSprite, faVariants, neighbourToward } from './forestAsh.js';
import type { FaSprite, FaVariants } from './forestAsh.js';
// The replay's canvas pictures paint the same faces; they read this list from the module the board
// already loaded, so neither the poster nor the video pulls a second copy of the sprite URLs.
export { DEFAULT_ART_SPRITES };
// Board ground lives with the game assets.
import groundUrl from '../assets/board/empty_ground_01.webp';

// The replay's canvas pictures paint the same board; they read these URLs from the module the board
// already loaded, so neither the poster nor the video pulls a second copy of them.
export const BOARD_GROUND = groundUrl;
export const BOARD_ROCKS: readonly string[] = FA_ROCKS.map((r) => r.url);
// A bonus hex's gold frame (its only marker in Futasaku) rides the same hand-over, so the
// replay's canvas pictures draw the same gold the board does.
export { GOLD_FRAME_ATLAS, goldFrameCrop } from './goldframes.js';

/**
 * Board pictures that could not be loaded, so the board never asks for them again.
 *
 * WebKit (iPhone Safari) paints its OWN "broken image" placeholder over an `<image>` whose file
 * failed to load: a light-blue tile with a white question mark, drawn at the image's box — so a
 * dropped connection, a 404 or a stale cache put a row of blue "?" tiles on the board, rotated
 * with the tile they replaced (owner's iPhone screenshot, 2026-10-14: three of them).
 *
 * This loader follows the same rule as the skin loader in `ui/skin/assets.ts`: a file that fails
 * to load is dropped and the renderer falls back. Here the fallback is the look the board already
 * has before its art arrives — the tile keeps its flat territory colour, the home keeps its
 * landmark, the rock simply is not there — so no browser placeholder can ever be painted.
 */
const missingArt = new Set<string>();

/** True when this picture failed to load and must not be drawn (unknown URLs may still arrive). */
export const artUnavailable = (url: string | undefined): boolean => !!url && missingArt.has(url);

/** Take `<image>`s for this URL back out of the board: a picture that failed must not be shown. */
const dropArt = (url: string): void => {
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
  for (const node of Array.from(document.querySelectorAll('svg image'))) {
    if (node.getAttribute('href') === url) node.remove();
  }
};

/** One picture failed: remember it, and remove it if a cell already drew it. */
const noteArtFailure = (url: string): void => {
  if (missingArt.has(url)) return;
  missingArt.add(url);
  dropArt(url);
};

// The small sprites start downloading while the menu is visible. Once decoded, every repeat of a
// variant shares the browser's image cache (one decode per file, however many tiles use it).
const artDecodes: Promise<unknown>[] = [];
if (typeof Image !== 'undefined') {
  for (const url of [...FA_ALL_URLS, groundUrl]) {
    const img = new Image();
    img.decoding = 'async';
    // The `error` event is the failure signal (a rejected `decode()` alone is not: it can reject
    // for an intact file too, and dropping good art would be worse than the placeholder).
    img.addEventListener('error', () => noteArtFailure(url));
    img.src = url;
    artDecodes.push(img.decode().catch(() => undefined));
  }
}

/**
 * Resolves when every picture the first board composes is decoded (or has failed): the ground,
 * both homes, the territory faces, the rocks and the gold frames. The downloads already started
 * above, so waiting on this is a decode wait, not a second request. Never rejects.
 */
export const boardArtReady: Promise<void> = Promise.all(artDecodes).then(() => undefined);

const f = (n: number) => n.toFixed(2);


/** How much the bent board shrinks a cell here (1 on a flat board): its mean corner distance / S. */
const cellScale = (key: string) => {
  const { x, y } = centerOf(key);
  const pts = cornerPts(key, S);
  return pts.reduce((sum, [px, py]) => sum + Math.hypot(px - x, py - y), 0) / pts.length / S;
};

/** A traced spill outline moved onto a cell: scaled about the hex centre, then placed. */
const placePath = (d: string, x: number, y: number, k: number) =>
  d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, a: string, b: string) => `${f(x + Number(a) * k)},${f(y + Number(b) * k)}`);

/**
 * A rim or shade takes its highlight's look as computed (stroke, glow, motion), not its classes: the
 * highlight's own rules (kinds, nearness, breathing) apply unchanged, and every query that counts
 * `.target`, `.selected` or `.dim` still counts only highlights.
 */
// Not `opacity`: read at creation it is the first frame of the highlight's own fade-in (0); the
// copied animation brings the rim in with it instead. Spills themselves are never dimmed: art that
// reaches past its hex always shows at full strength (owner, 2026-11-14).
const RIM_PROPS = ['stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linejoin', 'filter',
  'animation-name', 'animation-duration', 'animation-delay', 'animation-timing-function', 'animation-iteration-count',
  'animation-direction', 'animation-fill-mode'] as const;
const copyStroke = (to: SVGElement, cs: CSSStyleDeclaration) => {
  let style = 'fill:none;';
  for (const prop of RIM_PROPS) {
    const value = cs.getPropertyValue(prop);
    if (value) style += `${prop}:${value};`;
  }
  to.setAttribute('style', style);
};

/** What stands on a cell, for the drawing order: later kinds cover earlier ones. */
const enum Kind { Empty = 0, Ground = 1, Rock = 2, Home = 3 }

type Spill = { key: string; kind: Kind; d: string };

export class DefaultArtBoardView extends BoardView {
  protected override usesWorldLayer() { return false; }

  private fa: FaVariants = { tile: new Map(), rock: new Map() };
  private rockKeys = new Set<string>();
  private rockLayer: SVGGElement | null = null;
  /** Spills that are visible on each cell (drawn later than what stands there). */
  private spillOn = new Map<string, Spill[]>();
  private spillSignature = '';

  /** Rows top to bottom (then left to right): a lower tile's grass lies over the tile above. */
  protected override orderKeys(keys: string[]) {
    this.fa = faVariants(keys);
    this.rockKeys.clear();
    this.rockLayer = null;
    this.centreKey = null;
    this.spillSignature = '';
    this.spillOn.clear();
    const at = new Map(keys.map((k) => [k, centerOf(k)] as const));
    return [...keys].sort((a, b) => at.get(a)!.y - at.get(b)!.y || at.get(a)!.x - at.get(b)!.x);
  }

  /** One upright sprite, its hex centre on the cell's centre (art never takes a tap). */
  private art(parent: SVGElement, sprite: FaSprite, x: number, y: number, k: number, cls: string) {
    // A picture that failed to load is never drawn: the browser would paint its own placeholder.
    if (artUnavailable(sprite.url)) return null;
    return el('image', {
      href: sprite.url, x: f(x + sprite.x * k), y: f(y + sprite.y * k),
      width: f(sprite.w * k), height: f(sprite.h * k), class: `fa-art ${cls}`,
    }, parent);
  }

  protected override drawCell(g: SVGGElement, key: string, terrain: Terrain) {
    const defs = this.svg.querySelector('defs')!;
    const id = this.id('default-ground');
    const bg = faBackgroundUrl();
    if (bg && !artUnavailable(bg)) this.paintedGround(g, key, bg);
    // A failed ground picture is dropped: the cell keeps the flat look and no placeholder is drawn.
    else if (!artUnavailable(groundUrl)) {
      if (!defs.querySelector(`#${id}`)) {
        const pattern = el('pattern', { id, x: 0, y: 0, width: 360, height: 360, patternUnits: 'userSpaceOnUse' }, defs);
        el('image', { href: groundUrl, x: 0, y: 0, width: 360, height: 360 }, pattern);
      }
      el('path', { d: hexPath(key, S * 1.015, 'flat'), fill: this.url('default-ground'), class: 'default-ground-art' }, g);
    }
    el('path', { d: hexPath(key, S - 1.1, 'flat'), fill: 'none',
      stroke: 'rgba(178,174,163,0.18)', 'stroke-width': 0.75, class: 'default-cell-rim' }, g);
    if (terrain === 'rock') {
      this.rockKeys.add(key);
      // Rocks have their own layer above the tiles (their bumps lie over any neighbour), in row order.
      if (!this.rockLayer) {
        this.rockLayer = el('g', { class: 'l-fa-rocks', 'aria-hidden': 'true', 'pointer-events': 'none' });
        this.svg.insertBefore(this.rockLayer, this.layers.glow);
      }
      const { x, y } = centerOf(key);
      this.art(this.rockLayer, faRockSprite(this.fa, key), x, y, cellScale(key), 'default-rock-art');
    }
  }

  /** The board's centre cell (the painted background's middle hex sits on it). */
  private centreKey: string | null = null;

  /**
   * One cell of a painted background (owner, 2026-11-14): the background is a painted radius-3
   * board, 11 radii wide and 7 sqrt(3) tall, each hex with its own tone. The cell shows the painted
   * hex at its own offset from the board's centre cell, placed on the cell as drawn (so the curved
   * board keeps every painted hex on its cell). A cell beyond the painted 37 borrows one of them,
   * fixed by its key. Drawn once per setup with the static ground.
   */
  private paintedGround(g: SVGGElement, key: string, url: string) {
    if (!this.centreKey) {
      const flats = this.keys.map((k) => flatCentreOf(k));
      const mx = flats.reduce((a, p) => a + p.x, 0) / flats.length, my = flats.reduce((a, p) => a + p.y, 0) / flats.length;
      let best = Infinity;
      this.keys.forEach((k, i) => { const d = Math.hypot(flats[i]!.x - mx, flats[i]!.y - my); if (d < best) { best = d; this.centreKey = k; } });
    }
    const c0 = parseKey(this.centreKey!), c = parseKey(key);
    let rel = { q: c.q - c0.q, r: c.r - c0.r };
    if (hexDistance(rel, { q: 0, r: 0 }) > 3) {
      const inner = allCoords(3);
      rel = inner[Math.floor(hash(`${key}:fa-bg`) * inner.length)]!;
    }
    const o = latticeCentre(0, 0), p = latticeCentre(rel.q, rel.r);
    const fx = p.x - o.x, fy = p.y - o.y;
    const { x, y } = centerOf(key);
    const k = cellScale(key);
    const W = 11 * S, H = 7 * SQ3 * S;
    const clipId = this.id(`fa-bg-${key.replace(',', '_')}`);
    const defs = this.svg.querySelector('defs')!;
    if (!defs.querySelector(`#${clipId}`)) el('path', { d: hexPath(key, S * 1.015, 'flat') }, el('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' }, defs));
    el('image', {
      href: url, x: f(x - k * (fx + W / 2)), y: f(y - k * (fy + H / 2)), width: f(k * W), height: f(k * H),
      // At half strength over the board's dark base (owner, 2026-11-14: "50% of what's here").
      preserveAspectRatio: 'none', 'clip-path': `url(#${clipId})`, opacity: 0.5, class: 'default-ground-art fa-painted-ground',
    }, g);
  }

  protected override drawHome(player: Player, key: string) {
    const home = drawLandmark(this.layers.homes, player === 0 ? 'tree' : 'volcano', key,
      centerOf(key), getOrient(), materialsOf(this.paletteId).colors, this.look);
    home.querySelector('.lm-body')?.remove();
    // The landmark is translated onto the hex centre: the art sits around (0, 0), and the home's
    // breath (style.css: scale about the art's centre) is pinned to the hex centre instead.
    const art = el('g', { class: 'default-home-art fa-home-art' }, home);
    el('path', { d: hexPath('0,0', S, 'flat'), fill: faBaseColour(player), class: 'fa-home-base' }, art);
    this.art(art, faTileSprite(this.fa, key, player, true), 0, 0, cellScale(key), 'default-art-sprite');
    const ring = home.querySelector('.lm-ring');
    if (ring) home.appendChild(ring);
    return home;
  }

  protected override afterSetup(_terrain: Record<string, Terrain>) {
    this.svg.classList.add('fa-board');
    // Empty gold frames lie on the ground, under any tile art that spills over them; an occupied
    // gold tile draws its own frame over its art (drawTile).
    this.svg.insertBefore(this.layers.rich, this.layers.tiles);
    // The territory's outline runs under the homes: the canopy and the smoke cover it.
    this.svg.insertBefore(this.layers.contour, this.layers.homes);
    // THE ONE EXCEPTION (owner, 2026-11-14: "the tile below the home tile still covers the home
    // tile with its top fringe"): a tile below a home lays its grass fringe over the home's lower
    // edge. Its picture is drawn again just above the homes, clipped to the home's hex, so only the
    // fringe shows there. Two homes, at most three neighbours each: redrawn when those change.
    this.frontLayer = el('g', { class: 'l-fa-front', 'aria-hidden': 'true', 'pointer-events': 'none' });
    this.layers.homes.after(this.frontLayer);
    this.frontSignature = '';
    const defs = this.svg.querySelector('defs')!;
    for (const p of [0, 1] as const) {
      const home = this.rootKey(p);
      el('path', { d: hexPath(home, S, 'flat') }, el('clipPath', { id: this.id(`fa-home-clip-${p}`), clipPathUnits: 'userSpaceOnUse' }, defs));
    }
  }

  private frontLayer: SVGGElement | null = null;
  private frontSignature = '';

  /** The fringe of the tiles below each home, over the home's lower edge. */
  private updateFront(board: Record<string, Tile | null>) {
    const layer = this.frontLayer;
    if (!layer) return;
    const below = ([0, 1] as const).map((p) => {
      const home = this.rootKey(p);
      const at = centerOf(home);
      return { p, keys: allNeighbors(parseKey(home)).map(coordKey).filter((k) => centerOf(k).y > at.y + 1 && board[k] && !board[k]!.root) };
    });
    const signature = below.map(({ keys }) => keys.map((k) => `${k}:${board[k]!.owner}`).join(',')).join('|');
    if (signature === this.frontSignature) return;
    this.frontSignature = signature;
    layer.replaceChildren();
    for (const { p, keys } of below) {
      if (!keys.length) continue;
      const g = el('g', { 'clip-path': this.url(`fa-home-clip-${p}`) }, layer);
      for (const k of keys) {
        const { x, y } = centerOf(k);
        this.art(g, faTileSprite(this.fa, k, board[k]!.owner, false), x, y, cellScale(k), 'default-art-sprite');
      }
    }
  }

  protected override drawTile(parent: SVGGElement, key: string, tile: Tile, _maxRank: number) {
    const owner = tile.owner;
    const { x, y } = centerOf(key);
    const group = el('g', { class: `tile ${owner === 0 ? 'you' : 'bot'}${tile.root ? ' root' : ''} default-art-tile`, 'data-key': key }, parent);
    // The home's art lives on the home layer, above every tile.
    if (tile.root) return group;
    // The territory colour under the art fills its softened corners; the art itself is unclipped.
    el('path', { d: hexPath(key, S, 'flat'), fill: faBaseColour(owner), class: 'fa-tile-base' }, group);
    this.art(group, faTileSprite(this.fa, key, owner, false), x, y, cellScale(key), 'default-art-sprite');
    // A gold tile keeps its frame over its own art (and under the stone).
    if (this.richKeys.has(key)) drawGoldFrame(group, key, x, y, true);
    drawSeedStone(group, key, x, y, tile.strength, owner);
    return group;
  }

  // ---- spills: the mask and rims that let highlights go around the art ----

  override render(board: Record<string, Tile | null>, o: Parameters<BoardView['render']>[1]) {
    this.updateSpills(board);
    super.render(board, o);
    this.updateFront(board);
  }

  /** What covers a cell, as a drawing rank: a spill is visible on a cell drawn before it. */
  private rank(board: Record<string, Tile | null>, key: string, order: Map<string, number>): number {
    const t = board[key];
    const kind = t?.root ? Kind.Home : this.rockKeys.has(key) ? Kind.Rock : t ? Kind.Ground : Kind.Empty;
    return kind * 10_000 + (order.get(key) ?? 0);
  }

  private updateSpills(board: Record<string, Tile | null>) {
    const signature = this.keys.map((k) => { const t = board[k]; return t ? `${t.owner}${t.root ? 'r' : ''}` : '-'; }).join('');
    if (signature === this.spillSignature) return;
    this.spillSignature = signature;
    this.spillOn.clear();
    const order = new Map(this.keys.map((k, i) => [k, i] as const));
    const masks: string[] = [];
    for (const key of this.keys) {
      const t = board[key];
      const rock = this.rockKeys.has(key);
      if (!t && !rock) continue;
      const sprite = t ? faTileSprite(this.fa, key, t.owner, !!t.root) : faRockSprite(this.fa, key);
      if (!sprite.spill || artUnavailable(sprite.url)) continue;
      const kind: Kind = t?.root ? Kind.Home : rock ? Kind.Rock : Kind.Ground;
      const mine = this.rank(board, key, order);
      const covers: string[] = [];
      for (const dir of sprite.reach) {
        const n = neighbourToward(key, dir, centerOf);
        if (!n || !order.has(n)) continue;
        // Hidden under what stands there when that is drawn later (grass under a rock or a home).
        if (mine > this.rank(board, n, order)) covers.push(n);
      }
      if (!covers.length) continue;
      const { x, y } = centerOf(key);
      const d = placePath(sprite.spill, x, y, cellScale(key));
      masks.push(d);
      for (const n of covers) {
        const list = this.spillOn.get(n) ?? [];
        list.push({ key, kind, d });
        this.spillOn.set(n, list);
      }
    }
    const defs = this.svg.querySelector('defs')!;
    const id = this.id('fa-spill');
    defs.querySelector(`#${id}`)?.remove();
    const vb = this.svg.viewBox.baseVal;
    const pad = S * 2;
    const box = { x: vb.x - pad, y: vb.y - pad, width: vb.width + pad * 2, height: vb.height + pad * 2 };
    const mask = el('mask', { id, maskUnits: 'userSpaceOnUse', maskContentUnits: 'userSpaceOnUse', ...box }, defs);
    el('rect', { ...box, fill: '#fff' }, mask);
    // One path for every spill: the union is black, so overlapping spills never cancel out.
    if (masks.length) el('path', { d: masks.join(''), fill: '#000' }, mask);
  }

  /** A hex clip for one cell, inset like the highlights (shared by every rim on that cell). */
  private cellClip(key: string) {
    const id = this.id(`fa-cell-${key.replace(',', '_')}`);
    const defs = this.svg.querySelector('defs')!;
    if (!defs.querySelector(`#${id}`)) el('path', { d: hexPath(key, S - 2, 'flat') }, el('clipPath', { id, clipPathUnits: 'userSpaceOnUse' }, defs));
    return `url(#${id})`;
  }

  protected override hl<T extends SVGElement>(node: T, key: string): T {
    const cls = node.getAttribute('class') ?? '';
    // No hex-shaped overlay on a home (owner, 2026-11-14): the tree and the volcano stand whole,
    // never cut into a lit or dimmed hexagon. Only the keyboard focus ring stays (accessibility).
    if ((key === this.rootKey(0) || key === this.rootKey(1)) && !/(^|\s)focus(\s|$)/.test(cls)) {
      node.setAttribute('display', 'none');
      return node;
    }
    const on = this.spillOn.get(key);
    const dim = /(^|\s)dim(\s|$)/.test(cls);
    if (on?.length) {
      node.setAttribute('mask', this.url('fa-spill'));
      // The rim: the art's own edge inside this cell, in the highlight's own stroke (and motion).
      const cs = !dim && !/draw-unavailable|available/.test(cls) && typeof getComputedStyle === 'function' ? getComputedStyle(node) : null;
      if (cs && cs.stroke !== 'none' && parseFloat(cs.strokeWidth) > 0) {
        const rim = el('path', { d: on.map((s) => s.d).join(''), class: 'fa-rim', 'clip-path': this.cellClip(key), 'aria-hidden': 'true' });
        node.after(rim);
        copyStroke(rim, cs);
      }
    }
    return node;
  }
}
