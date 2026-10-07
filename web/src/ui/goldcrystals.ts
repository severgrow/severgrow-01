// The six crystal pairs share one small transparent atlas. Their choice, size and
// placement are keyed to the hex, so rerenders and saved games never reshuffle art.
import atlasUrl from '../assets/futasaku-gold-crystals.webp?url';
import { el, hash } from './geom.js';

const BOUNDS = [
  [88, 138, 406, 472], [617, 120, 924, 472], [1105, 173, 1491, 457],
  [87, 567, 422, 925], [570, 627, 978, 871], [1138, 561, 1454, 912],
] as const;

export function drawGoldCrystals(parent: SVGElement, key: string, x: number, y: number, occupied: boolean) {
  const variant = Math.floor(hash(`${key}:gold-pair`) * BOUNDS.length);
  const [x0, y0, x1, y1] = BOUNDS[variant]!;
  const width = 20 + hash(`${key}:gold-size`) * 3.5;
  const height = width * (y1 - y0) / (x1 - x0);
  const angle = (hash(`${key}:gold-angle`) - .5) * 25;
  const direction = hash(`${key}:gold-side`) < .5 ? -1 : 1;
  const px = x + (occupied ? direction * (10.5 + hash(`${key}:gold-offset`) * 1.5) : (hash(`${key}:gold-offset`) - .5) * 4);
  const py = y + (occupied ? (hash(`${key}:gold-height`) - .5) * 11 : (hash(`${key}:gold-height`) - .5) * 5);
  const group = el('g', { class: `gold-crystals ${occupied ? 'occupied' : 'empty'}`, 'data-key': key,
    'data-variant': variant, 'aria-hidden': 'true', transform: `rotate(${angle.toFixed(2)} ${px.toFixed(2)} ${py.toFixed(2)})` }, parent);
  const art = el('svg', { x: px - width / 2, y: py - height / 2, width, height,
    viewBox: `${x0} ${y0} ${x1 - x0} ${y1 - y0}`, preserveAspectRatio: 'xMidYMid meet', overflow: 'hidden' }, group);
  el('image', { href: atlasUrl, x: 0, y: 0, width: 1536, height: 1024 }, art);
  return group;
}
