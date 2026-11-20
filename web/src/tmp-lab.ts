import { ART_H, ART_W, tileSkinDef } from './ui/tileSkinArt.js';
import { TILE_SKIN_GROUNDS, TILE_SKIN_IDS } from './ui/tileSkins.js';
import type { TileSkinId } from './ui/tileSkins.js';

const NS = 'http://www.w3.org/2000/svg';
const sheet = document.getElementById('sheet')!;

const tile = (id: TileSkinId, variant: number, home = false): SVGSVGElement => {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 't');
  svg.setAttribute('viewBox', `0 0 ${ART_W} ${ART_H}`);
  const defs = document.createElementNS(NS, 'defs');
  svg.appendChild(defs);
  const ref = tileSkinDef(defs, id, variant, home);
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', `#${ref}`);
  svg.appendChild(use);
  return svg;
};

const row = (label: string, cls: string, nodes: SVGSVGElement[]) => {
  const r = document.createElement('div');
  r.className = `row ${cls}`;
  const l = document.createElement('span');
  l.className = 'lab';
  l.textContent = label;
  r.appendChild(l);
  for (const n of nodes) r.appendChild(n);
  sheet.appendChild(r);
};

for (const id of TILE_SKIN_IDS) {
  const h = document.createElement('h2');
  h.textContent = `${id} — ${TILE_SKIN_GROUNDS[id]} grounds`;
  const fam = document.createElement('div');
  fam.className = 'fam';
  fam.dataset.id = id;
  fam.appendChild(h);
  sheet.appendChild(fam);
  const variants = Array.from({ length: TILE_SKIN_GROUNDS[id] }, (_, v) => v);
  for (const [cls, label] of [['big', 'craft'], ['board', 'board'], ['small', 'planet']] as const) {
    const r = document.createElement('div');
    r.className = `row ${cls}`;
    const l = document.createElement('span');
    l.className = 'lab';
    l.textContent = label;
    r.appendChild(l);
    for (const v of [...variants.map((v) => v), -1]) r.appendChild(tile(id, Math.max(0, v), v === -1));
    fam.appendChild(r);
  }
}
document.title = 'ready';
