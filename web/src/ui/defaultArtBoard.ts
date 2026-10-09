// The fast default board: small cropped sprites for both territories and homes, with
// the existing V3 empty ground, rocks, gold frames and physical number stones.
// It keeps BoardView's hitboxes, overlays and game interactions unchanged.
import type { Player, Terrain, Tile } from '../../../src/engine/index.js';
import { getOrient, toScreen } from '../logic/orient.js';
import { BoardView } from './board.js';
import { S, centerOf, el, hash, hexPath } from './geom.js';
import { drawLandmark } from './landmarks.js';
import { materialsOf } from '../logic/materials.js';
import { drawSeedStone } from './seedstone.js';
import { DEFAULT_ART_SPRITES } from './defaultArtSprites.js';

// Territory art fills the cell. The framed homes instead fit their complete
// masonry/wood border inside that same cell, including its six corners.
const artSize = (index: number) => index >= 18 ? 68 : index < 9 ? 80 : 76;
const v3 = (path: string) => new URL(`design-v3/lo/${path}`,
  typeof document === 'undefined' ? 'http://localhost/' : document.baseURI).href;
const groundUrl = v3('textures/empty_ground_01.webp');
const rockUrls = Array.from({ length: 5 }, (_, i) => v3(`props/rock/rock_hex_0${i + 1}.webp`));

// The small home and tile images start downloading while the menu is visible.
// Once decoded, every repeat of a variant shares the browser's image cache.
if (typeof Image !== 'undefined') {
  for (const url of [...DEFAULT_ART_SPRITES, groundUrl, ...rockUrls]) {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    void img.decode().catch(() => undefined);
  }
}

/** The supplied hex art's upper-right edge is its visual base. Turn that edge
 * onto the board's bottom side without rotating the board or its hitboxes. */
const artAngle = () => {
  const axis = toScreen(1, 0);
  return Math.atan2(axis.y, axis.x) * 180 / Math.PI + 120;
};
const f = (n: number) => n.toFixed(2);

export class DefaultArtBoardView extends BoardView {
  protected override usesWorldLayer() { return false; }

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
      // The art uses the same exact perimeter as the board's hex lattice.
      // Adjacent tiles touch at their sides without painting over one another.
      el('path', { d: hexPath(local ? '0,0' : key, S, 'flat') }, clip);
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
      // The five source clusters have point-up silhouettes. A half hex turn
      // brings their broad faces onto this flat-top lattice; the small inset
      // keeps every irregular variant inside its own cell.
      const rocks = el('g', { transform: `translate(${f(x)},${f(y)}) rotate(-30)` }, g);
      el('image', { href: rock, x: -27, y: -27, width: 54, height: 54, class: 'default-rock-art' }, rocks);
    }
  }

  protected override drawHome(player: Player, key: string) {
    const home = drawLandmark(this.layers.homes, player === 0 ? 'tree' : 'volcano', key,
      centerOf(key), getOrient(), materialsOf(this.paletteId).colors, this.look);
    home.querySelector('.lm-body')?.remove();
    const index = player === 0 ? 18 : 19;
    const clipped = el('g', { class: 'default-home-art', 'clip-path': this.artClip(key, true) }, home);
    el('path', { d: hexPath('0,0', S, 'flat'), fill: player === 0 ? '#315321' : '#302c2c' }, clipped);
    const art = el('g', { transform: `rotate(${artAngle().toFixed(2)})` }, clipped);
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
    // Both territories use identical geometry and a single painted layer.
    el('path', { d: hexPath(key, S, 'flat'), fill: owner === 0 ? '#315321' : '#302c2c' }, group);
    const clipped = el('g', { 'clip-path': this.artClip(key) }, group);
    const art = el('g', { transform: `translate(${f(x)},${f(y)}) rotate(${artAngle().toFixed(2)})` }, clipped);
    this.artCell(art, index);
    drawSeedStone(group, key, x, y, tile.strength, owner);
    return group;
  }
}
