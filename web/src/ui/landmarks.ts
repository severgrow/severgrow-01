// Step 4: the two homes as small landmarks on their tiles. v0.8 UI pass: both are seen from
// above, like the board: my home is an apple TREE's round canopy (soft leaf clusters, a few red
// apples, a mint CIRCLE glowing at its heart); the opponent's home is a VOLCANO from a 3/4 aerial
// view (faceted basalt, glowing lava rivulets, a red-orange DIAMOND crater, a drift of smoke).
// Each stays wholly inside its own hex. Procedural SVG, deterministic (the look varies only by
// a hash of the tile), drawn once per board in the board's colours and kept across renders
// (only classes change: idle, danger, tapped, strangled). No live filters.
import { DIRECTIONS } from '../../../src/engine/index.js';
import { el } from './geom.js';
import { toScreen } from '../logic/orient.js';
import type { Orient } from '../logic/orient.js';
import { landmarkBox, landmarkVariant } from '../logic/landmark.js';
import type { LandmarkKind } from '../logic/landmark.js';
import type { MaterialLook, MaterialToken } from '../logic/materials.js';

type Colors = Record<MaterialToken, string>;
const f = (n: number) => n.toFixed(1);

/** The design box (S = 30): x -18..18, y -18..16.8 around the tile centre (inside the hex). */
const DESIGN_TOP = -18;
const DESIGN_HALF = 18;

/** Uniform scale that fits the design inside the landmark box for this orientation. */
const fitScale = (kind: LandmarkKind, orient: Orient) => {
  const b = landmarkBox(kind, orient, 30);
  return Math.min(1, b.x1 / DESIGN_HALF, b.y0 / DESIGN_TOP);
};

/** Points of a slightly irregular ring (deterministic from `seed`), as an SVG path. */
const blobPath = (n: number, rx: number, ry: number, cx: number, cy: number, seed: number, wobble: number) => {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const k = 1 + wobble * Math.sin(seed * 7.3 + i * 2.1);
    pts.push(`${f(cx + Math.cos(a) * rx * k)},${f(cy + Math.sin(a) * ry * k)}`);
  }
  return `M${pts.join(' L')} Z`;
};

const APPLE = '#c8323c';
const APPLE_DARK = '#8e1f2a';

const tree = (g: SVGGElement, c: Colors, look: MaterialLook, key: string) => {
  const v = landmarkVariant(key);
  const rich = look.textures;
  // a soft shadow under the canopy, cast down-right (light from the top left)
  el('circle', { cx: 2, cy: 2.6, r: 16.6, class: 'lm-shadow', fill: c.shadow }, g);
  el('path', { d: 'M-2,8 Q-1,12 -0.5,17 L3.2,17 Q2.2,12 3.6,8 Z', fill: '#57452b', stroke: '#2c291d', 'stroke-width': 0.7 }, g);
  el('path', { d: 'M0.4,10 Q1.1,13 1.4,16', fill: 'none', stroke: '#9f8252', 'stroke-width': 0.7, 'stroke-opacity': 0.7 }, g);
  const can = el('g', { class: 'lm-canopy' }, g);
  // the canopy from above: a round mass of leaf clusters, deep at the edge, lit at the top left
  const lobes = 7 + v.form;
  const turn = v.phase * Math.PI;
  const ring = (r: number, lr: number, dx: number, dy: number, fill: string, scale = 1) => {
    for (let i = 0; i < lobes; i++) {
      const a = turn + (i / lobes) * Math.PI * 2;
      el('circle', { cx: f(dx + Math.cos(a) * r), cy: f(dy + Math.sin(a) * r), r: f(lr * scale), fill }, can);
    }
  };
  el('circle', { cx: 0.6, cy: 0.8, r: 13.2, fill: c.mossDeep }, can);
  ring(11, 6, 0.6, 0.8, c.mossDeep);
  // Short limbs peek through the foliage. They make this read as one small tree,
  // rather than a flat green disc, without extending outside the home hex.
  for (const d of ['M0,5 Q-5,2 -12,-5', 'M0,5 Q6,0 11,-7', 'M0,5 Q2,8 8,12']) {
    el('path', { d, fill: 'none', stroke: '#493e27', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-opacity': 0.78 }, can);
  }
  el('circle', { cx: -0.4, cy: -0.4, r: 11.8, fill: c.moss }, can);
  ring(9.8, 5.2, -0.4, -0.4, c.moss);
  if (rich) {
    // the light catches the top-left clusters
    ring(6.4, 3.4, -2.2, -2.4, c.mossTop, 0.9);
    el('circle', { cx: -3.2, cy: -3.4, r: 4.6, fill: c.mossTop, 'fill-opacity': 0.8 }, can);
  }
  // Small overlapping leaf crowns give the simple coded tree a plush, uneven
  // silhouette. The positions are fixed for a given home, so nothing shimmers.
  for (let i = 0; i < 32; i++) {
    const a = i * 2.39996 + v.phase * 6;
    const r = Math.sqrt((i + 0.5) / 32) * 13.7;
    const x = Math.cos(a) * r - 0.6;
    const y = Math.sin(a) * r - 0.8;
    const shade = i % 5 === 0 ? c.mossDeep : i % 3 === 0 ? c.mossTop : c.moss;
    el('circle', { cx: f(x), cy: f(y), r: f(1.55 + (i % 4) * 0.28), fill: shade, 'fill-opacity': i % 5 === 0 ? 0.7 : 0.84 }, can);
  }
  for (const d of ['M-0.5,4 Q-3,1 -8,-4', 'M-0.5,4 Q3,0 7,-7', 'M-0.5,4 Q2,6 7,9']) {
    el('path', { d, fill: 'none', stroke: '#334a27', 'stroke-width': 1.15, 'stroke-linecap': 'round', 'stroke-opacity': 0.58 }, can);
  }
  // a few red apples among the leaves (they burst like petals when this home wins)
  const apples = [[-8, -4], [6.5, -8], [9, 4.5], [-4.5, 8.5], [2, 1.5], [-9.5, 5]] as const;
  for (const [x, y] of apples.slice(0, 2 + v.form)) {
    const ax = x + v.lean * 0.8;
    el('circle', { cx: f(ax + 0.3), cy: f(y + 0.4), r: 1.9, class: 'lm-flower', fill: APPLE_DARK }, can);
    el('circle', { cx: f(ax), cy: f(y), r: 1.7, class: 'lm-flower', fill: APPLE }, can);
    if (rich) el('circle', { cx: f(ax - 0.6), cy: f(y - 0.6), r: 0.5, fill: '#ffe3dc', 'fill-opacity': 0.85 }, can);
  }
  // my shape marker: a mint circle glowing in the heart of the canopy
  el('circle', { cx: -0.4, cy: -0.4, r: 3.2, class: 'lm-hollow', fill: '#0d1a14', 'fill-opacity': 0.55 }, g);
  el('circle', { cx: -0.4, cy: -0.4, r: 2.1, class: 'lm-heart' }, g);
  // a single leaf that now and then drifts off (idle motion only)
  el('ellipse', { cx: 9, cy: -9, rx: 1.6, ry: 1, class: 'lm-leaf', fill: c.mossTop }, g);
  can.style.setProperty('--lm-phase', `${(v.phase * -5).toFixed(2)}s`);
};

const volcano = (g: SVGGElement, c: Colors, look: MaterialLook, key: string) => {
  const v = landmarkVariant(key);
  const rich = look.textures;
  // seen from a 3/4 aerial view: the base below, the crater a little above the centre
  el('ellipse', { cx: 2, cy: 3.4, rx: 16.4, ry: 14.4, class: 'lm-shadow', fill: c.shadow }, g);
  const base = blobPath(10, 16.2, 14.6, 0, 1.6, v.phase * 10, 0.06);
  el('path', { d: base, class: 'lm-cone', fill: c.fireCrust }, g);
  // the faceted flanks: wedges from the crater rim out to the base, lit at the top left
  const cx = 0;
  const cy = -3;
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
    const mid = (a0 + a1) / 2;
    // light from the top left: facets facing that way are lit, the far side is in shadow
    const lit = Math.cos(mid - (-3 * Math.PI) / 4);
    if (Math.abs(lit) < 0.3) continue;
    const k = 1 + 0.06 * Math.sin(v.phase * 70 + i * 2.1);
    const p = (a: number, rx: number, ry: number, ox: number, oy: number) => `${f(ox + Math.cos(a) * rx)},${f(oy + Math.sin(a) * ry)}`;
    const d = `M${p(a0, 7.2, 5.8, cx, cy)} L${p(a0, 16.2 * k, 14.6 * k, 0, 1.6)} L${p(a1, 16.2 * k, 14.6 * k, 0, 1.6)} L${p(a1, 7.2, 5.8, cx, cy)} Z`;
    el('path', { d, class: lit > 0 ? 'lm-facet-lit' : 'lm-facet-dark', fill: lit > 0 ? c.rockLight : c.rockDark, 'fill-opacity': f(Math.min(0.9, Math.abs(lit) * 0.75)) }, g);
  }
  el('path', { d: base, class: 'lm-rim', fill: 'none', stroke: c.rimLight, 'stroke-opacity': 0.4, 'stroke-width': 1, 'stroke-linejoin': 'round' }, g);
  // glowing lava rivulets running from the crater down the flanks
  const riv = el('g', { class: 'lm-rivulets', fill: 'none', stroke: c.fire, 'stroke-linecap': 'round' }, g);
  const runs = [
    'M-5,0 Q-8.5,5 -11.5,9.5',
    'M4.6,0.6 Q8,5.5 9,11.5',
    'M-0.5,2.6 Q0.8,8 -1.2,14',
    'M6.4,-3.4 Q11,-2 14,1.5',
  ];
  const count = 2 + v.form;
  if (rich) for (const d of runs.slice(0, count)) el('path', { d, 'stroke-width': 3.6, 'stroke-opacity': 0.32 }, riv);
  for (const d of runs.slice(0, count)) el('path', { d, 'stroke-width': 1.7 }, riv);
  // the hot core of each rivulet
  for (const d of runs.slice(0, count)) el('path', { d, class: 'lm-riv-core', stroke: c.fireTip, 'stroke-width': 0.6 }, riv);
  // the crater rim, then the crater: the opponent's shape marker, a glowing DIAMOND
  el('ellipse', { cx, cy, rx: 7.6, ry: 6.2, class: 'lm-crater-rim', fill: c.rockDark }, g);
  el('path', { d: `M${cx},${cy - 5.2} L${cx + 6},${cy} L${cx},${cy + 5} L${cx - 6},${cy} Z`, class: 'lm-crater', fill: c.fire }, g);
  el('path', { d: `M${cx},${cy - 2.8} L${cx + 3.3},${cy} L${cx},${cy + 2.7} L${cx - 3.3},${cy} Z`, class: 'lm-crater-hot', fill: c.fireTip }, g);
  // a drift of smoke from the crater, carried up and to the right
  const smoke = el('g', { class: 'lm-smoke', fill: c.rockLight }, g);
  const drift = v.lean * 1.2;
  for (const [x, y, r] of [[2.5, -7, 2.6], [5.5 + drift, -10.5, 3.2], [9 + drift, -13.5, 3.6]] as const) el('circle', { cx: f(x), cy: f(y), r }, smoke);
  // an ember that pops now and then (idle motion only)
  el('circle', { cx: 1.5, cy: -4, r: 0.9, class: 'lm-ember', fill: c.fireHot }, g);
  // moss creeping over the cone (only shown when strangled); the ashen crater stays visible
  const hole = `M${cx - 7.6},${cy} a7.6,6.2 0 1 0 15.2,0 a7.6,6.2 0 1 0 -15.2,0 Z`;
  el('path', { d: `${blobPath(14, 17, 15.4, 0, 1.6, v.phase * 10 + 1, 0.08)} ${hole}`, 'fill-rule': 'evenodd', class: 'lm-smother', fill: c.moss, stroke: c.mossDeep, 'stroke-width': 0.8 }, g);
  g.style.setProperty('--lm-phase', `${(v.phase * -7).toFixed(2)}s`);
};

/**
 * Draws a home landmark at a tile centre and returns its group (kept across renders). The
 * group also holds the "sides blocked" ring, shown only in danger or when the home is tapped.
 */
export const drawLandmark = (parent: SVGGElement, kind: LandmarkKind, key: string, at: { x: number; y: number }, orient: Orient, colors: Colors, look: MaterialLook): SVGGElement => {
  const g = el('g', { class: `landmark lm-${kind}`, 'data-key': key, transform: `translate(${f(at.x)},${f(at.y)})` }, parent);
  const body = el('g', { class: 'lm-body', transform: `scale(${fitScale(kind, orient).toFixed(3)})` }, g);
  const inner = el('g', { class: 'lm-sprite' }, body);
  (kind === 'tree' ? tree : volcano)(inner, colors, look, key);
  // the ring and its count sit above the drawing, so they are never hidden by it
  const ring = el('g', { class: 'lm-ring' }, g);
  // one segment per side, centred on that neighbour's direction (engine order, either orientation)
  for (let i = 0; i < 6; i++) {
    const d = DIRECTIONS[i]!;
    const v = toScreen(Math.sqrt(3) * (d.q + d.r / 2), 1.5 * d.r);
    const mid = Math.atan2(v.y, v.x);
    const a0 = mid - (27 * Math.PI) / 180;
    const a1 = mid + (27 * Math.PI) / 180;
    const r = 31;
    el('path', { d: `M${f(Math.cos(a0) * r)},${f(Math.sin(a0) * r)} A${r},${r} 0 0 1 ${f(Math.cos(a1) * r)},${f(Math.sin(a1) * r)}`, class: 'lm-seg', 'data-i': i }, ring);
  }
  el('text', { x: 0, y: 22.5, class: 'lm-count num' }, ring);
  return g;
};

/** Updates a landmark's state classes and its ring (how many of its 6 sides are blocked). */
export const setLandmarkState = (g: SVGGElement, s: { sides: boolean[]; blocked: number; danger: boolean; ring: boolean; tapped: boolean; strangled: boolean; won: boolean; idle: boolean; worried: boolean }) => {
  g.classList.toggle('idle', s.idle && !s.strangled);
  g.classList.toggle('danger', s.danger && !s.strangled);
  g.classList.toggle('worried', s.worried && !s.strangled);
  g.classList.toggle('show-ring', (s.ring || s.tapped) && !s.strangled);
  g.classList.toggle('strangled', s.strangled);
  g.classList.toggle('won', s.won);
  g.querySelectorAll('.lm-seg').forEach((seg, i) => seg.classList.toggle('on', !!s.sides[i]));
  const t = g.querySelector('.lm-count');
  if (t) t.textContent = `${s.blocked}/6`;
};

/** A one-off reaction: the tree's heartbeat or the volcano's thump (tap), restartable. */
export const pulseLandmark = (g: SVGGElement, cls: 'tapped' | 'finish-pulse') => {
  g.classList.remove(cls);
  void (g as unknown as HTMLElement).getBoundingClientRect?.();
  g.classList.add(cls);
  setTimeout(() => g.classList.remove(cls), 900);
};
