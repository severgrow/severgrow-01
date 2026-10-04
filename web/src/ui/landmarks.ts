// Step 4: the two homes as small landmarks standing on their tiles. My home is a small gnarled
// TREE (round, soft, organic shapes; a mint CIRCLE glowing in the hollow at its base). The
// opponent's home is a small VOLCANO (angular, faceted basalt; a red-orange DIAMOND crater).
// Procedural SVG, deterministic (the look varies only by a hash of the tile), drawn once per
// board in the board's colours and kept across renders (only classes change: idle, danger,
// tapped, strangled), always upright on screen in both board orientations. No live filters.
import { DIRECTIONS } from '../../../src/engine/index.js';
import { el } from './geom.js';
import { toScreen } from '../logic/orient.js';
import type { Orient } from '../logic/orient.js';
import { landmarkBox, landmarkVariant } from '../logic/landmark.js';
import type { LandmarkKind } from '../logic/landmark.js';
import type { MaterialLook, MaterialToken } from '../logic/materials.js';

type Colors = Record<MaterialToken, string>;
const f = (n: number) => n.toFixed(1);

/** The design box (flat orientation, S = 30): x -16.8..16.8, y -39..16.5 around the tile centre. */
const DESIGN_TOP = -39;
const DESIGN_HALF = 16.8;

/** Uniform scale that fits the design inside the landmark box for this orientation. */
const fitScale = (kind: LandmarkKind, orient: Orient) => {
  const b = landmarkBox(kind, orient, 30);
  return Math.min(1, b.x1 / DESIGN_HALF, b.y0 / DESIGN_TOP);
};

const tree = (g: SVGGElement, c: Colors, look: MaterialLook, key: string) => {
  const v = landmarkVariant(key);
  const rich = look.textures;
  el('ellipse', { cx: 1.5, cy: 13.5, rx: 13, ry: 3.4, class: 'lm-shadow', fill: c.shadow }, g);
  // roots gripping the moss
  const roots = el('g', { class: 'lm-roots', fill: 'none', stroke: c.mossDry, 'stroke-linecap': 'round' }, g);
  for (const [x2, y2, w] of [[-11, 14, 2.2], [-5, 15.5, 1.8], [7, 15, 2], [12, 12.5, 1.6]] as const) {
    el('path', { d: `M0,9 Q${f(x2 * 0.45)},${f(11 + (y2 - 11) * 0.3)} ${f(x2)},${f(y2)}`, 'stroke-width': w }, roots);
  }
  // the trunk: short, thick, a slight lean, lit from the top left
  const lean = v.lean * 1.4;
  const trunkD = `M-4.6,12 C-4,4 ${f(-3.2 + lean)},-2 ${f(-2.6 + lean)},-8 L${f(2.6 + lean)},-8 C${f(3.2 + lean)},-2 4.4,4 4.8,12 Z`;
  el('path', { d: trunkD, class: 'lm-trunk', fill: c.mossDry }, g);
  if (rich) el('path', { d: `M-4.2,11 C-3.6,4 ${f(-2.9 + lean)},-2 ${f(-2.3 + lean)},-7`, fill: 'none', stroke: c.rimLight, 'stroke-opacity': 0.35, 'stroke-width': 1 }, g);
  // the hollow, with my shape marker: a mint circle glowing inside
  el('ellipse', { cx: 0.2, cy: 5.5, rx: 2.9, ry: 3.5, class: 'lm-hollow', fill: '#120d0a' }, g);
  el('circle', { cx: 0.2, cy: 5.6, r: 2, class: 'lm-heart' }, g);
  // the canopy: layered leaf clusters, a little deeper than the moss tile, lit from the top left
  const can = el('g', { class: 'lm-canopy' }, g);
  const forms = [
    [[-8.5, -19, 8], [8, -20, 7.6], [0, -27.5, 9], [-3.5, -21, 8.8], [4.5, -24.5, 7.4]],
    [[-9, -21, 7.6], [8.5, -18.5, 7.8], [-1, -28, 8.6], [-3, -19.5, 8.6], [5, -26, 7]],
    [[-8, -18.5, 8.2], [7.5, -21.5, 7.4], [1, -27, 9.2], [-4, -22.5, 8.2], [5.5, -19, 7]],
  ] as const;
  const blobs = forms[v.form]!;
  for (const [x, y, r] of blobs) el('circle', { cx: x + 0.8, cy: y + 1, r, fill: c.mossDeep }, can);
  for (const [x, y, r] of blobs) el('circle', { cx: x, cy: y, r: r * 0.86, fill: c.moss }, can);
  if (rich) {
    for (const [x, y, r] of blobs) el('circle', { cx: x - r * 0.28, cy: y - r * 0.3, r: r * 0.46, fill: c.mossTop, 'fill-opacity': 0.75 }, can);
    // a few tiny flowers matching the moss
    for (const [x, y] of [[-7, -24], [6, -27], [9, -18], [-2, -31]] as const) el('circle', { cx: x + v.lean, cy: y, r: 1.05, class: 'lm-flower', fill: '#fff1f4' }, can);
  }
  // a single leaf that now and then falls (idle motion only)
  el('ellipse', { cx: 6, cy: -14, rx: 1.6, ry: 1, class: 'lm-leaf', fill: c.mossTop }, g);
  can.style.setProperty('--lm-phase', `${(v.phase * -5).toFixed(2)}s`);
};

const volcano = (g: SVGGElement, c: Colors, look: MaterialLook, key: string) => {
  const v = landmarkVariant(key);
  const rich = look.textures;
  el('ellipse', { cx: 1.5, cy: 13.5, rx: 15, ry: 3.4, class: 'lm-shadow', fill: c.shadow }, g);
  // the cone: dark layered basalt, faceted, lit from the top left
  el('path', { d: 'M-16,12 L-8.5,-11 L-5,-15 L5,-15 L8.5,-11 L16,12 Z', class: 'lm-cone', fill: c.fireCrust }, g);
  el('path', { d: 'M-16,12 L-8.5,-11 L-5,-15 L-1,-3 L-5,12 Z', class: 'lm-facet-lit', fill: c.rock }, g);
  el('path', { d: 'M5,-15 L8.5,-11 L16,12 L7,12 L2,-2 Z', class: 'lm-facet-dark', fill: c.rockDark }, g);
  if (rich) {
    // layers in the basalt
    for (const y of [2, 7.5] as const) el('path', { d: `M${f(-14.4 + (12 - y) * 0.0)},${y} L14.6,${y + 0.6}`, stroke: c.rockDark, 'stroke-width': 0.7, 'stroke-opacity': 0.7 }, g);
  }
  // two or three lava rivulets running down the sides
  const riv = el('g', { class: 'lm-rivulets', fill: 'none', stroke: c.fire, 'stroke-linecap': 'round' }, g);
  const paths = [
    'M-3,-14 Q-6,-6 -9,1',
    'M3.5,-14 Q5,-6 9,4',
    'M0.5,-13 Q-1,-4 1,6',
  ];
  for (const d of paths.slice(0, 2 + (v.form === 2 ? 1 : 0))) el('path', { d, 'stroke-width': 1.3 }, riv);
  // the crater: the opponent's shape marker, a glowing DIAMOND (red-orange, never amber)
  el('path', { d: 'M0,-20 L6.2,-15 L0,-10.5 L-6.2,-15 Z', class: 'lm-crater', fill: c.fire }, g);
  el('path', { d: 'M0,-17.6 L3.4,-15 L0,-12.6 L-3.4,-15 Z', class: 'lm-crater-hot', fill: c.fireTip }, g);
  // a thin wisp of smoke
  el('path', { d: `M0.5,-21 C${f(-3 + v.lean * 2)},-25 4,-29 ${f(0.5 + v.lean * 2)},-34 S-2,-37 ${f(1.5 + v.lean)},-38.5`, class: 'lm-smoke', fill: 'none', stroke: c.rockLight, 'stroke-width': 1.6, 'stroke-linecap': 'round' }, g);
  // an ember that pops now and then (idle motion only)
  el('circle', { cx: 2, cy: -19, r: 0.9, class: 'lm-ember', fill: c.fireHot }, g);
  // moss smothering the cone (only shown when strangled)
  el('path', { d: 'M-16.5,12.5 C-12,0 -7,-13 0,-16 C7,-13 12,0 16.5,12.5 Z', class: 'lm-smother', fill: c.moss }, g);
  g.style.setProperty('--lm-phase', `${(v.phase * -7).toFixed(2)}s`);
};

/**
 * Draws a home landmark at a tile centre and returns its group (kept across renders). The
 * group also holds the "sides blocked" ring, shown only in danger or when the home is tapped.
 */
export const drawLandmark = (parent: SVGGElement, kind: LandmarkKind, key: string, at: { x: number; y: number }, orient: Orient, colors: Colors, look: MaterialLook): SVGGElement => {
  const g = el('g', { class: `landmark lm-${kind}`, 'data-key': key, transform: `translate(${f(at.x)},${f(at.y)})` }, parent);
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
  el('text', { x: 0, y: 24.5, class: 'lm-count num' }, ring);
  const body = el('g', { class: 'lm-body', transform: `scale(${fitScale(kind, orient).toFixed(3)})` }, g);
  const inner = el('g', { class: 'lm-sprite' }, body);
  (kind === 'tree' ? tree : volcano)(inner, colors, look, key);
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
