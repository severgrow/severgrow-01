// A quiet metal rim for bonus terrain. The three supplied frame treatments
// share one transparent atlas; a tile key picks its frame for the whole game.
import atlasUrl from '../assets/futasaku-gold-frames.png?url';
import { el, hash, S, SQ3 } from './geom.js';
import { getOrient } from '../logic/orient.js';

const CELL = 724;
const ATLAS_WIDTH = CELL * 3;
const BOUNDS = [
  [17, 48, 714, 650],
  [15, 63, 710, 684],
  [15, 49, 707, 666],
] as const;

export function drawGoldFrame(parent: SVGElement, key: string, x: number, y: number, occupied: boolean) {
  const variant = Math.floor(hash(`${key}:gold-frame`) * BOUNDS.length);
  const [x0, y0, x1, y1] = BOUNDS[variant]!;
  const pad = 6;
  const width = S * 2.02;
  const height = S * SQ3 * 1.01;
  const group = el('g', {
    class: `gold-frame ${occupied ? 'occupied' : 'empty'}`,
    'data-key': key,
    'data-variant': variant,
    'aria-hidden': 'true',
    ...(getOrient() === 'pointy' ? { transform: `rotate(-30 ${x} ${y})` } : {}),
  }, parent);
  const viewport = el('svg', {
    x: x - width / 2, y: y - height / 2, width, height,
    viewBox: `${variant * CELL + x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`,
    preserveAspectRatio: 'none', overflow: 'hidden', class: 'gold-frame-art',
  }, group);
  el('image', { href: atlasUrl, x: 0, y: 0, width: ATLAS_WIDTH, height: CELL }, viewport);
  return group;
}
