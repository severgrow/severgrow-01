// The "juice budget": how big each moment's effects are. Small moves get small effects,
// big moments get big ones, and the screen never turns into noise. Pure decisions; the
// page draws them. Effects only decorate: the board shown is always the engine's.
import type { Phase } from '../../../src/engine/index.js';
import type { Step } from './anim.js';
import type { Effects } from './settings.js';

export type Tier = 'none' | 'small' | 'medium' | 'big';

/** How big one action's moment is, from its animation steps (built from engine events). */
export const moveTier = (steps: readonly Step[], isGold: (key: string) => boolean): Tier => {
  let tier: Tier = 'none';
  const up = (t: Tier) => {
    const order: Tier[] = ['none', 'small', 'medium', 'big'];
    if (order.indexOf(t) > order.indexOf(tier)) tier = t;
  };
  for (const s of steps) {
    if (s.k === 'grow') {
      const n = s.tiles.length;
      if (n >= 5) up('big');
      else if (n >= 3 || s.tiles.some((t) => t.replaced || isGold(t.key))) up('medium');
      else up('small');
    } else if (s.k === 'sever') up(s.keys.length >= 4 ? 'big' : 'medium');
    else if (s.k === 'strangle' || s.k === 'fruit') up('big');
    else if (s.k === 'strengthen') up(s.to >= 9 ? 'medium' : 'small');
  }
  return tier;
};

/** A short banner for big moments only, or null. */
export const tierBanner = (steps: readonly Step[]): string | null => {
  if (steps.some((s) => s.k === 'strangle')) return 'Strangled!';
  if (steps.some((s) => s.k === 'fruit')) return 'Fruited!';
  const cut = Math.max(0, ...steps.map((s) => (s.k === 'sever' ? s.keys.length : 0)));
  if (cut >= 4) return `Cut off ${cut}!`;
  if (steps.some((s) => s.k === 'grow' && s.tiles.length >= 5)) return 'Big grow!';
  return null;
};

export type Budget = {
  particles: number; // sparks for the whole moment (capped at 60 on screen anyway)
  shake: number; // screen shake in px (0 = none)
  hitStopMs: number; // a brief freeze on impact
  anticipationMs: number; // a short beat before the impact
  banner: boolean;
  float: boolean; // floating numbers like "+3"
  thud: boolean; // the low thud
  vibrate: number[] | null;
  fadeOnly: boolean; // Reduce motion: quick fades instead of movement
};

const BASE: Record<Exclude<Tier, 'none'>, Budget> = {
  small: { particles: 6, shake: 0, hitStopMs: 0, anticipationMs: 0, banner: false, float: false, thud: false, vibrate: null, fadeOnly: false },
  medium: { particles: 14, shake: 0, hitStopMs: 0, anticipationMs: 0, banner: false, float: true, thud: false, vibrate: null, fadeOnly: false },
  big: { particles: 36, shake: 6, hitStopMs: 100, anticipationMs: 140, banner: true, float: true, thud: true, vibrate: [30, 40, 60], fadeOnly: false },
};
const NONE: Budget = { ...BASE.small, particles: 0 };

/** The effects for a moment, scaled by the Effects setting and Reduce motion. */
export const effectBudget = (tier: Tier, intensity: Effects, reduceMotion: boolean): Budget => {
  if (tier === 'none') return NONE;
  const b = { ...BASE[tier] };
  if (intensity === 'low') {
    b.particles = Math.round(b.particles * 0.4);
    b.shake = 0;
    b.hitStopMs = 0;
    b.anticipationMs = 0;
  } else if (intensity === 'high') {
    b.particles = Math.min(60, Math.round(b.particles * 1.6));
    b.shake = Math.round(b.shake * 1.4);
    if (tier === 'medium') b.vibrate = [20];
  }
  if (reduceMotion) {
    b.particles = 0;
    b.shake = 0;
    b.anticipationMs = 0;
    b.fadeOnly = true;
  }
  return b;
};

// Steps of a major pentatonic scale in semitones (always pleasant, however many notes);
// after 8 notes the steps shrink so long lines stay under two octaves.
const STEPS = [2, 2, 3, 2, 3, 2, 2, 3];

/** Pitch multipliers for n tiles growing one after another; `chain` 1 is a little higher. */
export const pitchLadder = (n: number, chain: number): number[] => {
  const out: number[] = [];
  let semis = 2 * chain;
  for (let i = 0; i < n; i++) {
    if (i > 0) semis += STEPS[i - 1] ?? 0.5;
    out.push(2 ** (semis / 12));
  }
  return out;
};

/** Keeps the number of particles on screen under a cap. */
export class ParticleBudget {
  alive = 0;
  peak = 0;
  constructor(readonly cap = 60) {}
  /** Asks for n particles; returns how many may be made now. */
  take(n: number): number {
    const k = Math.max(0, Math.min(n, this.cap - this.alive));
    this.alive += k;
    this.peak = Math.max(this.peak, this.alive);
    return k;
  }
  free(n: number) {
    this.alive = Math.max(0, this.alive - n);
  }
}

/** What to pulse quietly after about 8 seconds without a tap (never on the bot's turn). */
export const idleTarget = (phase: Phase, myTurn: boolean, hasPending: boolean): 'deck' | 'hand' | 'confirm' | null => {
  if (!myTurn) return null;
  if (phase === 'DRAW') return 'deck';
  if (phase === 'DISCARD') return 'hand';
  if (phase === 'ACT') return hasPending ? 'confirm' : 'hand';
  return null;
};
