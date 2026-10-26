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
// The replay poster paints the same faces; it takes this list from the module the board already
// loaded, so the share image never pulls a second copy (or a second chunk) of the sprite URLs.
export { DEFAULT_ART_SPRITES };
// Board ground/rocks live with the game assets (V3 pack archived off this branch).
import groundUrl from '../assets/board/empty_ground_01.webp';
import rock1 from '../assets/board/rock_hex_01.webp';
import rock2 from '../assets/board/rock_hex_02.webp';
import rock3 from '../assets/board/rock_hex_03.webp';
import rock4 from '../assets/board/rock_hex_04.webp';
import rock5 from '../assets/board/rock_hex_05.webp';

// Territory art fills the cell. The framed homes instead fit their complete
// masonry/wood border inside that same cell, including its six corners.
const artSize = (index: number) => index >= 18 ? 68 : index < 9 ? 80 : 76;
const rockUrls = [rock1, rock2, rock3, rock4, rock5];
// The replay poster paints the same board; it reads these URLs from the module the board already
// loaded, so the share image pulls no second copy (or chunk) of them.
export const BOARD_GROUND = groundUrl;
export const BOARD_ROCKS = rockUrls;
// A bonus hex's metal frame (its only marker in Futasaku) rides the same hand-over.
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

// The small home and tile images start downloading while the menu is visible.
// Once decoded, every repeat of a variant shares the browser's image cache.
const artDecodes: Promise<unknown>[] = [];
if (typeof Image !== 'undefined') {
  for (const url of [...DEFAULT_ART_SPRITES, groundUrl, ...rockUrls]) {
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
 * both homes, the nine territory faces and the rocks. The downloads already started above, so
 * waiting on this is a decode wait, not a second request. Never rejects.
 */
export const boardArtReady: Promise<void> = Promise.all(artDecodes).then(() => undefined);

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
    const url = DEFAULT_ART_SPRITES[index];
    // A picture that failed to load is never drawn: the browser would paint its own placeholder.
    if (!url || artUnavailable(url)) return;
    const size = artSize(index);
    el('image', { href: url, x: -size / 2, y: -size / 2,
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
    // A failed ground picture is dropped: the cell keeps the flat look and no placeholder is drawn.
    if (!artUnavailable(groundUrl)) {
      if (!defs.querySelector(`#${id}`)) {
        const pattern = el('pattern', { id, x: 0, y: 0, width: 360, height: 360, patternUnits: 'userSpaceOnUse' }, defs);
        el('image', { href: groundUrl, x: 0, y: 0, width: 360, height: 360 }, pattern);
      }
      el('path', { d: hexPath(key, S * 1.015, 'flat'), fill: this.url('default-ground'), class: 'default-ground-art' }, g);
    }
    el('path', { d: hexPath(key, S - 1.1, 'flat'), fill: 'none',
      stroke: 'rgba(178,174,163,0.18)', 'stroke-width': 0.75, class: 'default-cell-rim' }, g);
    if (terrain === 'rock') {
      const { x, y } = centerOf(key);
      const rock = rockUrls[Math.floor(hash(`${key}:v3-rock`) * rockUrls.length)]!;
      // A rock picture that failed to load leaves the cell bare, never a broken-image placeholder.
      if (artUnavailable(rock)) return;
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
