// THE HOME GROWS — the drawing half. The player's own home (the tree / garden) is drawn a stage
// older or younger according to the history in logic/home-growth.ts.
//
// WHY THIS LIVES BESIDE THE LANDMARK: the product board paints the human home with the garden
// sprite (ui/defaultArtBoard.ts) and the opponent's with the fortress; the procedural landmark
// body is removed there. So the growth is its own small top-down tree, drawn in the same palette
// and vocabulary as the procedural landmark (ui/landmarks.ts): a lobed canopy seen from above,
// a short trunk, a few apples. It never leaves the home's own hex and it is drawn once per board.
//
// CHEAP BY CONSTRUCTION: the layers are static SVG. The one growth moment is a finite
// transform/opacity animation (css `lm-growth-in` / `lm-growth-out`), never a loop and never a
// filter. The idle tree has no animation of its own: the product board's idle cost does not grow.
import { el } from './geom.js';
import { landmarkVariant } from '../logic/landmark.js';
import {
  GROWTH_MOMENT_MS,
  growthVisit,
  parseGrowthSeen,
} from '../logic/home-growth.js';
import type { GrowthVisit, HomeGrowthStage } from '../logic/home-growth.js';

type Colors = Record<string, string>;

/** What the caller can tell us, asked once per board setup. */
export type HomeGrowthSource = () => {
  /** The stage this history has earned. */
  earned: HomeGrowthStage;
  /** The raw stored record (`severgrow.homes.growth.v1`), or null. */
  seenRaw: string | null;
  /** Reduce motion / Speed Off already applied: no one-shot moment. */
  motion: boolean;
  /** The board is on screen and settled (not behind the menu or the Who-starts ritual). */
  ready: boolean;
  /** Remember that `stage` was put on screen. Called exactly once per earned stage. */
  record: (stage: HomeGrowthStage) => void;
};

let source: HomeGrowthSource | null = null;

/** Installed once by the page for the Futasaku channels; a null source draws nothing. */
export const setHomeGrowthSource = (next: HomeGrowthSource | null): void => {
  source = next;
};

/** The tree crown's radius per stage, in board units (a tile is 60 units tall). */
export const STAGE_CROWN_RADIUS: Readonly<Record<HomeGrowthStage, number>> = Object.freeze({ 1: 6.4, 2: 10.2, 3: 13.4, 4: 16.2 });
const LOBES: Record<HomeGrowthStage, number> = { 1: 4, 2: 6, 3: 8, 4: 10 };
const CROWNS: Record<HomeGrowthStage, number> = { 1: 10, 2: 18, 3: 28, 4: 38 };
const APPLES: Record<HomeGrowthStage, number> = { 1: 1, 2: 2, 3: 3, 4: 5 };
const TRUNK_W: Record<HomeGrowthStage, number> = { 1: 1.3, 2: 1.8, 3: 2.2, 4: 2.7 };

const f = (n: number) => n.toFixed(1);

/** One stage's tree, drawn into `layer`. Deterministic: the shape varies only by the home key. */
const drawStage = (layer: SVGGElement, stage: HomeGrowthStage, key: string, c: Colors): void => {
  const v = landmarkVariant(key);
  const R = STAGE_CROWN_RADIUS[stage];
  const turn = v.phase * Math.PI * 2;
  const moss = c.moss ?? '#58b64e';
  const deep = c.mossDeep ?? '#22562a';
  const top = c.mossTop ?? '#98d65e';
  // The shadow sits under the canopy, pushed down-right (the light is top-left, like the homes).
  el('circle', { cx: 1.2, cy: 2.2, r: f(R + 1), class: 'lm-growth-shadow', fill: c.shadow ?? '#000' }, layer);
  const g = el('g', { class: 'lm-growth-crown' }, layer);
  // Roots whisper into the soil from stage 3 on: the wood is older than the leaves.
  if (stage >= 3) {
    for (const [dx, dy] of [[-4.6, 0.8], [-2.2, 2.2], [2.8, 1.8], [4.8, 0.4]] as const) {
      el('path', {
        d: `M0,${f(R * 0.3)} Q${f(dx * 0.55)},${f(R + dy - 0.6)} ${f(dx)},${f(R + dy)}`,
        fill: 'none', stroke: '#57452b', 'stroke-width': 1.1, 'stroke-linecap': 'round', 'stroke-opacity': 0.78, class: 'lm-growth-root',
      }, g);
    }
  }
  // The trunk reaches down to the tile's base; the canopy covers its top.
  const w = TRUNK_W[stage];
  const baseY = Math.min(R + 3.4, 16.4);
  el('path', {
    d: `M${f(-w / 2)},${f(-R * 0.08)} L${f(-w * 0.8)},${f(baseY)} L${f(w * 0.8)},${f(baseY)} L${f(w / 2)},${f(-R * 0.08)} Z`,
    class: 'lm-growth-trunk', fill: '#57452b', stroke: '#2c291d', 'stroke-width': 0.5,
  }, g);
  // A dark silhouette first, so the canopy reads against the bright garden beneath it.
  el('circle', { cx: 0, cy: 0, r: f(R), class: 'lm-growth-base', fill: deep, stroke: '#16391a', 'stroke-opacity': 0.5, 'stroke-width': 0.55 }, g);
  const n = LOBES[stage];
  const ring = (r: number, lr: number, fill: string, off = 0, squash = 0.96) => {
    for (let i = 0; i < n; i++) {
      const a = turn + off + (i / n) * Math.PI * 2;
      el('circle', { cx: f(Math.cos(a) * r), cy: f(Math.sin(a) * r * squash), r: f(lr), fill }, g);
    }
  };
  ring(R * 0.83, R * 0.45, deep);
  ring(R * 0.74, R * 0.39, moss, 0.35);
  if (stage >= 2) {
    // the light catches the top-left of the canopy
    ring(R * 0.48, R * 0.26, top, 0.9);
    el('circle', { cx: f(-R * 0.24), cy: f(-R * 0.27), r: f(R * 0.35), fill: top, 'fill-opacity': 0.86 }, g);
  }
  // Overlapping leaf crowns roughen the silhouette: a flat disc would read as a sticker.
  // Positions are fixed for a given home, so nothing shimmers and nothing animates.
  for (let i = 0; i < CROWNS[stage]; i++) {
    const a = turn + i * 2.39996;
    const r = Math.sqrt((i + 0.5) / CROWNS[stage]) * R * 0.95;
    const x = Math.cos(a) * r - R * 0.04;
    const y = Math.sin(a) * r * 0.95 - R * 0.05;
    const shade = i % 5 === 0 ? deep : i % 3 === 0 ? top : moss;
    el('circle', {
      cx: f(x), cy: f(y), r: f(1.05 + R * 0.075), fill: shade,
      'fill-opacity': i % 5 === 0 ? 0.72 : 0.86, class: 'lm-growth-leaf',
    }, g);
  }
  // A few apples: the same jewel the full landmark uses, and the same class the winner's
  // petal burst already animates (`.lm-flower` under `.landmark.won`).
  const spots = [[-0.55, -0.3], [0.42, -0.55], [0.6, 0.3], [-0.3, 0.6], [0.05, 0.05]] as const;
  for (let i = 0; i < APPLES[stage]; i++) {
    const [sx, sy] = spots[i]!;
    const ax = sx * R + v.lean * 0.6;
    const ay = sy * R * 0.94;
    const ar = stage === 1 ? 1.25 : 1.55;
    el('circle', { cx: f(ax + 0.25), cy: f(ay + 0.35), r: f(ar), class: 'lm-growth-apple', fill: '#8e1f2a' }, g);
    el('circle', { cx: f(ax), cy: f(ay), r: f(ar * 0.9), class: 'lm-growth-apple lm-flower', fill: '#c8323c' }, g);
  }
};

const makeLayer = (stage: HomeGrowthStage, key: string, c: Colors, cls: string): SVGGElement => {
  const layer = el('g', { class: `lm-growth ${cls}`, 'data-stage': String(stage), 'aria-hidden': 'true' });
  drawStage(layer, stage, key, c);
  return layer;
};

type Mounted = { to: HomeGrowthStage; pending: boolean; record: (stage: HomeGrowthStage) => void };
const mounted = new WeakMap<SVGGElement, Mounted>();

/**
 * Compose the growth layers into one home. Called from the board's `drawHome` for the player's
 * own home only. The opponent never gets one: their history is not on this device.
 *
 * When a growth is due, BOTH stages are drawn now and the change waits for `playHomeGrowth` (the
 * board must be on screen and settled first). Otherwise only the settled stage is drawn.
 */
/**
 * OFF (owner, 2026-10-29: "default skin should be the only thing that shows - look at the home
 * tile"). The tree below is procedural art drawn over the default garden sprite, so on the live board
 * it read as another skin. Nothing is drawn while this is false; the growth history logic is kept.
 * web/tests/default-skin-only.test.ts pins it.
 */
export const HOME_GROWTH_DRAWN = false;

export const mountHomeGrowth = (home: SVGGElement, key: string, c: Colors): void => {
  if (!HOME_GROWTH_DRAWN) return;
  const read = source;
  if (!read) return;
  const s = read();
  const visit: GrowthVisit = growthVisit(s.earned, parseGrowthSeen(s.seenRaw), s.motion);
  home.querySelectorAll('.lm-growth').forEach((n) => n.remove());
  mounted.delete(home);
  const insert = (layer: SVGGElement) => {
    const ring = home.querySelector('.lm-ring');
    if (ring) home.insertBefore(layer, ring);
    else home.appendChild(layer);
  };
  if (visit.grows) {
    insert(makeLayer(visit.from, key, c, 'lm-growth-from'));
    insert(makeLayer(visit.to, key, c, 'lm-growth-to'));
    home.dataset.growthStage = String(visit.from);
    home.dataset.growthPending = '1';
    mounted.set(home, { to: visit.to, pending: true, record: s.record });
    return;
  }
  insert(makeLayer(visit.to, key, c, 'lm-growth-settled'));
  home.dataset.growthStage = String(visit.to);
  delete home.dataset.growthPending;
  // The settled stage was put on the board now, so it must never be offered again.
  if (visit.record) s.record(visit.to);
};

/**
 * Play the one growth moment, once the board is genuinely on screen. Safe to call often (every
 * `setHomes`): after the first call the home has nothing pending, so it can never replay — not on
 * the next render, not on the next game, not on a rotation.
 */
export const playHomeGrowth = (home: SVGGElement | undefined): boolean => {
  if (!home) return false;
  const m = mounted.get(home);
  if (!m || !m.pending) return false;
  if (typeof document !== 'undefined' && document.hidden) return false;
  if (!source?.().ready) return false;
  // A board that is still hidden by the menu / a screen has no box to animate in.
  if (home.getBoundingClientRect().width <= 0) return false;
  m.pending = false;
  const from = home.querySelector<SVGGElement>('.lm-growth-from');
  const to = home.querySelector<SVGGElement>('.lm-growth-to');
  home.dataset.growthStage = String(m.to);
  delete home.dataset.growthPending;
  home.classList.add('lm-growing');
  // Remembered as soon as the moment is actually launched, so an interrupted page cannot replay it.
  m.record(m.to);
  window.setTimeout(() => {
    home.classList.remove('lm-growing');
    from?.remove();
    if (to) {
      to.classList.remove('lm-growth-to');
      to.classList.add('lm-growth-settled');
    }
  }, GROWTH_MOMENT_MS);
  return true;
};
