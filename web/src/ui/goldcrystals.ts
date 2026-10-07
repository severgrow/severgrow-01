// The six crystal pairs share one small transparent atlas. Their choice, size and
// placement are keyed to the hex, so rerenders and saved games never reshuffle art.
import atlasUrl from '../assets/futasaku-gold-crystals.webp?url';
import { el, hash, hexPath } from './geom.js';

const BOUNDS = [
  [88, 138, 406, 472], [617, 120, 924, 472], [1105, 173, 1491, 457],
  [87, 567, 422, 925], [570, 627, 978, 871], [1138, 561, 1454, 912],
] as const;

// A pair lives in the side pocket of a hex when occupied. The keep-out is shared
// with optional prop placement; the centre stone always has its own clear space.
export function goldCrystalPlacement(key: string, occupied: boolean) {
  const variant = Math.floor(hash(`${key}:gold-pair`) * BOUNDS.length);
  const [x0, y0, x1, y1] = BOUNDS[variant]!;
  const width = 16.5 + hash(`${key}:gold-size`) * 1.5;
  const height = width * (y1 - y0) / (x1 - x0);
  const angle = (hash(`${key}:gold-angle`) - .5) * 14;
  const direction = hash(`${key}:gold-side`) < .5 ? -1 : 1;
  const dx = occupied ? direction * (17.3 + hash(`${key}:gold-offset`) * .6) : (hash(`${key}:gold-offset`) - .5) * 3;
  const dy = occupied ? (hash(`${key}:gold-height`) - .5) * 2.8 : (hash(`${key}:gold-height`) - .5) * 3;
  return { variant, bounds: [x0, y0, x1, y1] as const, width, height, angle, dx, dy };
}

export function goldCrystalKeepout(key: string) {
  const { dx, dy, width, height } = goldCrystalPlacement(key, true);
  return { x: dx, y: dy, r: Math.hypot(width, height) / 2 + 2.2 };
}

export function drawGoldCrystals(parent: SVGElement, key: string, x: number, y: number, occupied: boolean, settling = false) {
  const { variant, bounds: [x0, y0, x1, y1], width, height, angle, dx, dy } = goldCrystalPlacement(key, occupied);
  const px = x + dx, py = y + dy;
  const id = `gold-clear-${key.replace(',', '_')}-${occupied ? 'tile' : 'base'}`;
  const group = el('g', { class: `gold-crystals ${occupied ? 'occupied' : 'empty'}${settling ? ' settling' : ''}`, 'data-key': key,
    'data-variant': variant, 'aria-hidden': 'true' }, parent);
  const mask = el('mask', { id, maskUnits: 'userSpaceOnUse', x: x - 30, y: y - 30, width: 60, height: 60 }, el('defs', {}, group));
  el('path', { d: hexPath(key, 27, 'flat'), fill: 'white' }, mask);
  if (occupied) el('circle', { cx: x, cy: y, r: 9.2, fill: 'black' }, mask);
  const clipped = el('g', { mask: `url(#${id})` }, group);
  const visual = el('g', { transform: `rotate(${angle.toFixed(2)} ${px.toFixed(2)} ${py.toFixed(2)})` }, clipped);
  el('ellipse', { cx: px, cy: py + height * .14, rx: width * .68, ry: height * .57, class: 'gold-crystal-bed' }, visual);
  const art = el('svg', { x: px - width / 2, y: py - height / 2, width, height,
    viewBox: `${x0} ${y0} ${x1 - x0} ${y1 - y0}`, preserveAspectRatio: 'xMidYMid meet', overflow: 'hidden', class: 'gold-crystal-art' }, visual);
  el('image', { href: atlasUrl, x: 0, y: 0, width: 1536, height: 1024 }, art);
  return group;
}
