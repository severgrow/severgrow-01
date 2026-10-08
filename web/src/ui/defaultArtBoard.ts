// The fast default board: small cropped sprites for both territories and homes, with
// the existing V3 empty ground, rocks, gold frames and physical number stones.
// It keeps BoardView's hitboxes, overlays and game interactions unchanged.
import { allNeighbors, connectedKeys, coordKey, parseKey } from '../../../src/engine/index.js';
import type { Player, Terrain, Tile } from '../../../src/engine/index.js';
import { getOrient, toScreen } from '../logic/orient.js';
import { BoardView } from './board.js';
import { S, centerOf, cornerPts, el, hash, hexPath } from './geom.js';
import { drawGoldFrame } from './goldframes.js';
import { drawLandmark } from './landmarks.js';
import { materialsOf } from '../logic/materials.js';
import { drawSeedStone } from './seedstone.js';
import { DEFAULT_ART_SPRITES } from './defaultArtSprites.js';
import meadowGround from '../assets/default-skin/meadow-ground.webp?url';

// The source paintings include transparent breathing room. These sizes cover
// the whole hex, including its corners, without changing the board geometry.
const artSize = (index: number) => index < 9 ? 80 : 76;
const v3 = (path: string) => new URL(`design-v3/lo/${path}`,
  typeof document === 'undefined' ? 'http://localhost/' : document.baseURI).href;
const groundUrl = v3('textures/empty_ground_01.webp');
const rockUrls = Array.from({ length: 5 }, (_, i) => v3(`props/rock/rock_hex_0${i + 1}.webp`));

// The small home and tile images start downloading while the menu is visible.
// Once decoded, every repeat of a variant shares the browser's image cache.
if (typeof Image !== 'undefined') {
  for (const url of [...DEFAULT_ART_SPRITES, meadowGround, groundUrl, ...rockUrls]) {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    void img.decode().catch(() => undefined);
  }
}

/** The grass paintings remain upright on screen; the ash keeps its tile angle. */
const artAngle = (index: number) => {
  if (index < 9 || index === 18) return 90; // undo the crop's quarter turn
  const axis = toScreen(1, 0);
  return Math.atan2(axis.y, axis.x) * 180 / Math.PI + 180;
};

const f = (n: number) => n.toFixed(2);
type Point = readonly [number, number];

/** Match each visual side to its actual neighbouring hex, in either orientation. */
const sidesOf = (key: string) => {
  const centre = centerOf(key);
  const corners = cornerPts(key, S * 1.055);
  const neighbours = allNeighbors(parseKey(key)).map(coordKey);
  return corners.map((start, i) => {
    const end = corners[(i + 1) % 6]!;
    const mx = (start[0] + end[0]) / 2 - centre.x;
    const my = (start[1] + end[1]) / 2 - centre.y;
    const keyAcross = neighbours.reduce((best, candidate) => {
      const b = centerOf(best), c = centerOf(candidate);
      return (c.x - centre.x) * mx + (c.y - centre.y) * my >
        (b.x - centre.x) * mx + (b.y - centre.y) * my ? candidate : best;
    });
    return { start, end, across: keyAcross, nx: mx / Math.hypot(mx, my), ny: my / Math.hypot(mx, my) };
  });
};

/** One gentle bend and a small tuft-like lift on an exposed grass side. */
const sideLine = (side: ReturnType<typeof sidesOf>[number], organic: boolean) => {
  const { start: a, end: b, nx, ny } = side;
  if (!organic) return `L${f(b[0])},${f(b[1])}`;
  const at = (t: number, lift: number): Point => [a[0] + (b[0] - a[0]) * t + nx * lift,
    a[1] + (b[1] - a[1]) * t + ny * lift];
  const p = (t: number, lift: number) => { const [x, y] = at(t, lift); return `${f(x)},${f(y)}`; };
  return `Q${p(.15, 1.0)} ${p(.29, .2)} Q${p(.47, -.45)} ${p(.61, .25)} Q${p(.78, 1.35)} ${p(1, 0)}`;
};

const grassShape = (sides: ReturnType<typeof sidesOf>, board: Record<string, Tile | null>) => {
  return `M${f(sides[0]!.start[0])},${f(sides[0]!.start[1])}` +
    sides.map(side => sideLine(side, board[side.across]?.owner !== 0)).join('') + 'Z';
};

export class DefaultArtBoardView extends BoardView {
  private contourLayer: SVGGElement | null = null;
  private sideCache = new Map<string, ReturnType<typeof sidesOf>>();
  private meadowReady = false;
  protected override usesWorldLayer() { return false; }

  protected override afterSetup() {
    this.sideCache.clear();
    this.meadowReady = false;
    this.contourLayer = el('g', { class: 'default-territory-contour', 'pointer-events': 'none' }, this.layers.homes);
  }

  private sides(key: string) {
    let value = this.sideCache.get(key);
    if (!value) { value = sidesOf(key); this.sideCache.set(key, value); }
    return value;
  }

  override render(board: Record<string, Tile | null>, overlay: Parameters<BoardView['render']>[1]) {
    super.render(board, overlay);
    const layer = this.contourLayer;
    if (!layer) return;
    layer.replaceChildren();
    for (const owner of [0, 1] as const) {
      const joined = connectedKeys(board, this.config, owner);
      for (const key of joined) {
        const home = !!board[key]?.root;
        for (const side of this.sides(key)) {
          if (joined.has(side.across)) continue;
          const d = `M${f(side.start[0])},${f(side.start[1])}${sideLine(side, owner === 0 && !home)}`;
          el('path', { d, fill: 'none', stroke: owner === 0 ? 'rgba(196,224,160,.36)' : 'rgba(193,149,128,.38)',
            'stroke-width': .57, 'stroke-linecap': 'round' }, layer);
        }
      }
    }
  }

  private meadowDefs() {
    if (this.meadowReady) return;
    const defs = this.svg.querySelector('defs')!;
    const patternId = this.id('meadow-ground');
    if (defs.querySelector(`#${patternId}`)) { this.meadowReady = true; return; }
    // The same image coordinates run through every occupied grass hex.
    const pattern = el('pattern', { id: patternId, x: 0, y: 0, width: 160, height: 160,
      patternUnits: 'userSpaceOnUse' }, defs);
    el('image', { href: meadowGround, x: 0, y: 0, width: 160, height: 160 }, pattern);
    const gradient = el('radialGradient', { id: this.id('meadow-detail-fade'), gradientUnits: 'userSpaceOnUse',
      cx: 0, cy: 0, r: 34 }, defs);
    for (const [offset, opacity] of [[0, .82], [.52, .72], [.79, .34], [1, 0]] as const)
      el('stop', { offset, 'stop-color': 'white', 'stop-opacity': opacity }, gradient);
    const mask = el('mask', { id: this.id('meadow-detail-mask'), maskUnits: 'userSpaceOnUse',
      maskContentUnits: 'userSpaceOnUse', x: -41, y: -41, width: 82, height: 82 }, defs);
    el('circle', { cx: 0, cy: 0, r: 34, fill: this.url('meadow-detail-fade') }, mask);
    this.meadowReady = true;
  }

  private grassTufts(group: SVGGElement, key: string, board: Record<string, Tile | null>) {
    for (const [i, side] of this.sides(key).entries()) {
      if (board[side.across]?.owner === 0) continue;
      const { start: a, end: b, nx, ny } = side;
      const t = .36 + hash(`${key}:fringe:${i}`) * .31;
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      const tx = (b[0] - a[0]) / Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ty = (b[1] - a[1]) / Math.hypot(b[0] - a[0], b[1] - a[1]);
      el('path', { d: `M${f(x - tx * .7)},${f(y - ty * .7)} Q${f(x + nx * 2.4)},${f(y + ny * 2.4)} ${f(x + tx * .7)},${f(y + ty * .7)}Z`,
        fill: this.url('meadow-ground'), opacity: .83, class: 'default-grass-tuft' }, group);
    }
  }

  private artCell(parent: SVGGElement, index: number) {
    const size = artSize(index);
    el('image', { href: DEFAULT_ART_SPRITES[index]!, x: -size / 2, y: -size / 2,
      width: size, height: size, class: 'default-art-sprite' }, parent);
  }

  private artClip(key: string, local = false) {
    const id = this.id(`default-art-clip-${local ? 'home-' : ''}${key.replace(',', '-')}`);
    const defs = this.svg.querySelector('defs')!;
    if (!defs.querySelector(`#${id}`)) {
      const clip = el('clipPath', { id, clipPathUnits: 'userSpaceOnUse' }, defs);
      // Slight overlap absorbs antialiasing at shared hex edges. The mask
      // stays independent of the painting and never changes hit geometry.
      el('path', { d: hexPath(local ? '0,0' : key, S * 1.055, 'flat') }, clip);
    }
    return this.url(`default-art-clip-${local ? 'home-' : ''}${key.replace(',', '-')}`);
  }

  protected override drawCell(g: SVGGElement, key: string, terrain: Terrain) {
    const defs = this.svg.querySelector('defs')!;
    const id = this.id('default-ground');
    if (!defs.querySelector(`#${id}`)) {
      const pattern = el('pattern', { id, x: 0, y: 0, width: 360, height: 360, patternUnits: 'userSpaceOnUse' }, defs);
      el('image', { href: groundUrl, x: 0, y: 0, width: 360, height: 360 }, pattern);
    }
    el('path', { d: hexPath(key, S * 1.015, 'flat'), fill: this.url('default-ground'), class: 'default-ground-art' }, g);
    el('path', { d: hexPath(key, S - 1.1, 'flat'), fill: 'none',
      stroke: 'rgba(178,174,163,0.18)', 'stroke-width': 0.75, class: 'default-cell-rim' }, g);
    if (terrain === 'rock') {
      const { x, y } = centerOf(key);
      const rock = rockUrls[Math.floor(hash(`${key}:v3-rock`) * rockUrls.length)]!;
      el('ellipse', { cx: x, cy: y + 7, rx: 22, ry: 13, fill: 'rgba(0,0,0,.17)', class: 'default-rock-shadow' }, g);
      el('image', { href: rock, x: x - 29, y: y - 29, width: 58, height: 58, class: 'default-rock-art' }, g);
    }
  }

  protected override drawHome(player: Player, key: string) {
    const home = drawLandmark(this.layers.homes, player === 0 ? 'tree' : 'volcano', key,
      centerOf(key), getOrient(), materialsOf(this.paletteId).colors, this.look);
    home.querySelector('.lm-body')?.remove();
    const index = player === 0 ? 18 : 19;
    const clipped = el('g', { class: 'default-home-art', 'clip-path': this.artClip(key, true) }, home);
    const art = el('g', { transform: `rotate(${artAngle(index).toFixed(2)})` }, clipped);
    this.artCell(art, index);
    const ring = home.querySelector('.lm-ring');
    if (ring) home.appendChild(ring);
    return home;
  }

  protected override drawTile(parent: SVGGElement, key: string, tile: Tile, _maxRank: number) {
    const owner = tile.owner;
    const { x, y } = centerOf(key);
    const group = el('g', { class: `tile ${owner === 0 ? 'you' : 'bot'}${tile.root ? ' root' : ''} default-art-tile`, 'data-key': key }, parent);
    // The separate garden/fortress home art fills its hex on the home layer.
    if (tile.root) return group;
    const variant = Math.floor(hash(`${key}:default-tile`) * 9);
    const index = owner * 9 + variant;
    if (owner === 0) {
      this.meadowDefs();
      const d = grassShape(this.sides(key), this.lastRender?.[0] ?? {});
      el('path', { d, fill: '#3d7427' }, group);
      el('path', { d, fill: this.url('meadow-ground'), class: 'default-grass-ground' }, group);
      this.grassTufts(group, key, this.lastRender?.[0] ?? {});
      const clipped = el('g', { 'clip-path': this.artClip(key) }, group);
      const art = el('g', { transform: `translate(${f(x)},${f(y)}) rotate(${artAngle(index).toFixed(2)})` }, clipped);
      const detail = el('g', { mask: this.url('meadow-detail-mask') }, art);
      this.artCell(detail, index);
    } else {
      // Quiet colour beneath the cutout prevents a flash while its sprite decodes.
      el('path', { d: hexPath(key, S * 1.055, 'flat'), fill: '#302c2c' }, group);
      const clipped = el('g', { 'clip-path': this.artClip(key) }, group);
      const art = el('g', { transform: `translate(${f(x)},${f(y)}) rotate(${artAngle(index).toFixed(2)})` }, clipped);
      this.artCell(art, index);
    }
    if (this.richKeys.has(key)) drawGoldFrame(group, key, x, y, true);
    drawSeedStone(group, key, x, y, tile.strength, owner);
    return group;
  }
}
