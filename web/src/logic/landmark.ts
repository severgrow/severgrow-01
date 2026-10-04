// Step 4: the two homes as landmarks: my tree (round, soft, organic) and the opponent's volcano
// (angular, faceted). Pure logic only: the landmark's box on its tile, its deterministic
// variation, which motions run, and the Strangle finish timeline. The drawing is in
// ui/landmarks.ts. Everything here comes from public information.
import type { Orient } from './orient.js';

export type LandmarkKind = 'tree' | 'volcano';
export type Box = { x0: number; y0: number; x1: number; y1: number };

/** The number plate drawn on a tile (centre offset and radius), as ui/board.ts draws it. */
export const numberPlate = (S = 30) => ({ dy: -0.06 * S, r: 0.34 * S });

/**
 * The landmark's box, relative to its tile's centre (screen units, y down). v0.8 UI pass: the
 * homes are drawn top-down (a tree canopy seen from above, a volcano's crater from a 3/4 aerial
 * view), so the box lies wholly inside the home's own hex in both orientations: it never rises
 * above the tile and never reaches a neighbour's number plate or a Bloom ghost's number.
 */
export const landmarkBox = (_kind: LandmarkKind, _orient: Orient, S = 30): Box => ({ x0: -0.6 * S, y0: -0.6 * S, x1: 0.6 * S, y1: 0.56 * S });

/** A small, deterministic look for a home from its tile's key (never Math.random). */
export const landmarkVariant = (key: string) => {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  const r = (n: number) => {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    return (h % 1000) / 1000 / n;
  };
  return {
    /** sway amount and phase (tree), smoke drift (volcano), 0..1 */
    sway: r(1),
    phase: r(1),
    /** which of three leaf-cluster arrangements / rivulet patterns */
    form: Math.floor(r(1) * 3),
    /** a slight lean, -1..1 */
    lean: r(1) * 2 - 1,
  };
};

export type MotionSettings = { reduceMotion: boolean; effects: 'low' | 'normal' | 'high' | string };

/**
 * Which motions run: idle (sway, smoke, breathing glow, the odd ember or leaf) needs motion on
 * and Effects above Low; the danger ring always shows when in danger; the worried motion
 * (trembling leaves, the low rumble) only with motion on.
 */
export const landmarkMotion = (s: MotionSettings, danger: boolean) => {
  const moving = !s.reduceMotion && s.effects !== 'low';
  return { idle: moving, ring: danger, worried: danger && moving };
};

/** The Strangle finish is never longer than this at Normal speed. */
export const FINISH_CAP_MS = 2000;

export type FinishBeat = { k: 'pulse' | 'hold' | 'smother' | 'bloom' | 'wither' | 'roar'; ms: number };

/**
 * The Strangle finish for the home that was surrounded: the surrounding tiles pulse inward, a
 * slow beat, then the volcano is smothered by moss while the winner's tree blooms, or the tree
 * withers while the volcano roars. `speed` is the animation speed factor (0 = off). Tap or
 * Skip fast-forwards it (the page simply jumps to the end state).
 */
export const strangleFinish = (o: { speed: number; reduceMotion: boolean }, loser: LandmarkKind): FinishBeat[] => {
  if (o.speed <= 0) return [];
  const f = o.speed;
  if (o.reduceMotion) return [{ k: loser === 'volcano' ? 'smother' : 'wither', ms: Math.round(500 * Math.min(1, f)) }];
  const beats: FinishBeat[] =
    loser === 'volcano'
      ? [
          { k: 'pulse', ms: 380 },
          { k: 'hold', ms: 260 },
          { k: 'smother', ms: 820 },
          { k: 'bloom', ms: 480 },
        ]
      : [
          { k: 'pulse', ms: 380 },
          { k: 'hold', ms: 260 },
          { k: 'wither', ms: 820 },
          { k: 'roar', ms: 480 },
        ];
  const total = beats.reduce((n, b) => n + b.ms, 0);
  const k = Math.min(1, FINISH_CAP_MS / total) * f;
  return beats.map((b) => ({ ...b, ms: Math.round(b.ms * k) }));
};
