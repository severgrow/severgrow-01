// A code-rendered strength marker. The four silhouettes have the same footprint and
// contrast; only their ceramic edge changes, deterministically by hex coordinate.
import { el, hash } from './geom.js';

const SHAPES = [
  'M-11,-1 C-11,-6 -7,-9 0,-9 C7,-9 11,-6 11,-1 C11,4 8,9 0,9 C-8,9 -11,5 -11,-1Z',
  'M-11,-1 C-11,-6 -8,-8.5 -1,-9 C6,-9.5 11,-6 11,-1 C11,4 7.5,9 0,9 C-7.5,9 -11,5 -11,-1Z',
  'M-11,-1 C-10.5,-6 -7,-9 0,-9 C7,-9 11,-5.5 11,-.5 C11,4.5 7,9 0,9 C-7.5,9 -11,4.5 -11,-1Z',
  'M-11,-1 C-11,-5.5 -7.5,-9 0,-9 C7,-9 10.5,-6 11,-1 C11,4 8,8.5 0,9 C-8,9.5 -11,4 -11,-1Z',
];

export function seedStoneDefs(defs: SVGDefsElement, id: string) {
  const glaze = el('linearGradient', { id, x1: '0', y1: '0', x2: '.18', y2: '1', gradientUnits: 'objectBoundingBox' }, defs);
  el('stop', { offset: '0%', 'stop-color': '#fffaf0' }, glaze);
  el('stop', { offset: '54%', 'stop-color': '#f1e9d7' }, glaze);
  el('stop', { offset: '100%', 'stop-color': '#d7ceba' }, glaze);
}

export function drawSeedStone(parent: SVGGElement, key: string, x: number, y: number, strength: number, glazeId: string) {
  const stone = el('g', { class: 'seed-stone', transform: `translate(${x.toFixed(2)},${y.toFixed(2)})` }, parent);
  el('ellipse', { cx: 0, cy: 8.3, rx: 10, ry: 2.3, class: 'seed-stone-shadow' }, stone);
  el('path', { d: SHAPES[Math.floor(hash(`stone:${key}`) * SHAPES.length)]!, fill: `url(#${glazeId})`, class: 'seed-stone-body' }, stone);
  el('ellipse', { cx: -4.2, cy: -4.8, rx: 4, ry: 1.5, class: 'seed-stone-glint' }, stone);
  el('text', { x: 0, y: 0.4, class: 'num tile-num seed-stone-num' }, stone).textContent = String(strength);
  return stone;
}
