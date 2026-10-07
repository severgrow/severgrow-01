// Physical strength counters, kept separate from tile artwork so a changing value
// can swap its stone without repainting the terrain. The atlas holds light 1-9 in
// rows 0-2 and charcoal 1-9 in rows 3-5. The source and cropped viewport stay in
// SVG, so mobile uses one decoded image for all counters.
import atlasUrl from '../assets/futasaku-stone-atlas.png?url';
import type { Player } from '../../../src/engine/index.js';
import { el } from './geom.js';

const BOUNDS: readonly [number, number, number, number][] = [
  [96,36,324,264], [399,36,642,266], [696,35,930,267],
  [95,287,325,521], [400,292,638,520], [707,281,932,530],
  [101,548,326,774], [399,545,637,770], [700,541,932,774],
  [86,784,327,1024], [386,777,646,1026], [700,780,947,1025],
  [93,1038,329,1274], [393,1036,647,1277], [700,1033,945,1277],
  [90,1280,331,1512], [397,1281,642,1515], [697,1285,949,1508],
];

const stoneViewBox = (owner: Player, strength: number) => {
  const index = (owner === 0 ? 0 : 9) + Math.max(1, Math.min(9, strength)) - 1;
  const [x0,y0,x1,y1] = BOUNDS[index]!;
  const size = Math.max(x1-x0,y1-y0) + 12;
  return `${((x0+x1-size)/2).toFixed(1)} ${((y0+y1-size)/2).toFixed(1)} ${size} ${size}`;
};

export function setSeedStoneStrength(stone: SVGGElement | null, strength: number) {
  if (!stone) return;
  const owner: Player = stone.dataset.owner === '1' ? 1 : 0;
  stone.dataset.strength = String(strength);
  const art = stone.querySelector<SVGSVGElement>('.seed-stone-art');
  art?.setAttribute('viewBox', stoneViewBox(owner, strength));
  const value = stone.querySelector('.tile-num');
  if (value) value.textContent = String(strength);
}

export function drawSeedStone(parent: SVGGElement, key: string, x: number, y: number, strength: number, owner: Player) {
  const stone = el('g', { class: 'seed-stone', transform: `translate(${x.toFixed(2)},${y.toFixed(2)})`,
    'data-key': key, 'data-owner': owner, 'data-strength': strength }, parent);
  el('ellipse', { cx: 0, cy: 8.7, rx: 8.7, ry: 2, class: 'seed-stone-shadow' }, stone);
  const art = el('svg', { x: -10.5, y: -10.5, width: 21, height: 21,
    viewBox: stoneViewBox(owner,strength), class: 'seed-stone-art', overflow: 'hidden', 'aria-hidden': 'true' }, stone);
  el('image', { href: atlasUrl, x: 0, y: 0, width: 1024, height: 1536 }, art);
  // This live value is the source for the existing Strengthen tick and board checks.
  el('text', { class: 'tile-num seed-stone-value', 'aria-hidden': 'true' }, stone).textContent = String(strength);
  return stone;
}
