// The fast default board: small cropped sprites for both territories and homes, with
// the existing V3 empty ground, rocks, gold frames and physical number stones.
// It keeps BoardView's hitboxes, overlays and game interactions unchanged.
import type { Player, Terrain, Tile } from '../../../src/engine/index.js';
import { getOrient, toScreen } from '../logic/orient.js';
import { BoardView } from './board.js';
import { S, centerOf, el, hash, hexPath } from './geom.js';
import { drawGoldFrame } from './goldframes.js';
import { drawLandmark } from './landmarks.js';
import { materialsOf } from '../logic/materials.js';
import { drawSeedStone } from './seedstone.js';
import { DEFAULT_ART_SPRITES } from './defaultArtSprites.js';

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
  for (const url of [...DEFAULT_ART_SPRITES, groundUrl, ...rockUrls]) {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    void img.decode().catch(() => undefined);
  }
}

/** The source's upper-right edge becomes the board hex's bottom edge. */
const artAngle = (index: number) => {
  const axis = toScreen(1, 0);
  // Meadow/homes were cut from flat-top art and turned -90 degrees; Ash was
  // already point-up. The portrait board's axis is -30 degrees, so these
  // offsets put each original upper-right edge on the lower horizontal side.
  return Math.atan2(axis.y, axis.x) * 180 / Math.PI + (index < 9 || index >= 18 ? -120 : 180);
};

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
    // The quiet colour beneath each cutout prevents a flash while its sprite decodes.
    el('path', { d: hexPath(key, S * 1.055, 'flat'), fill: owner === 0 ? '#2e4025' : '#302c2c' }, group);
    const clipped = el('g', { 'clip-path': this.artClip(key) }, group);
    const variant = Math.floor(hash(`${key}:default-tile`) * 9);
    const index = owner * 9 + variant;
    const art = el('g', { transform: `translate(${x.toFixed(2)},${y.toFixed(2)}) rotate(${artAngle(index).toFixed(2)})` }, clipped);
    this.artCell(art, index);
    if (this.richKeys.has(key)) drawGoldFrame(group, key, x, y, true);
    drawSeedStone(group, key, x, y, tile.strength, owner);
    return group;
  }
}
