// The cinematic CUT (UI overhaul, Part 2): one pure generator that turns a cut (which tiles,
// where it started, whose they were) into a timeline of stages the page plays. Pure and
// deterministic, so the same cut always looks the same, a test can check every limit, and a
// replay plays exactly the same sequence (slower).
//
// Stages, in order: anticipation, impact hit-stop (with a small local flash and a micro zoom),
// a pulse along the cut vein, the snap (with a short shake), the slow-motion ripple (the tiles
// die one ring at a time), the crumble with a ground scar, and the payoff (the floating number,
// the score tally, a banner for big ones, the haptic, the audio duck).
import { parseKey } from '../../../src/engine/index.js';
import type { FeedbackEvent } from './feedback.js';

/** Tier thresholds (config values): tiles cut, and the share of the victim's tiles that makes any cut Huge. */
export type CutTiers = { medium: number; big: number; huge: number; hugeShare: number };
export const CUT_TIERS: Readonly<CutTiers> = Object.freeze({ medium: 3, big: 5, huge: 8, hugeShare: 0.5 });
/** A whole cut (or every cut of one move) lasts at most this long at Normal speed. */
export const CUT_CAP_MS = 1800;
/** Photosensitivity: the flash lasts at most 60ms, at most 35% white, and only around the cut. */
export const FLASH_MAX_MS = 60;
export const FLASH_MAX_ALPHA = 0.35;
/** The ripple: one ring of tiles every 70ms, never more than 700ms in all. */
export const RIPPLE_STEP_MS = 70;
export const RIPPLE_CAP_MS = 700;
export const HITSTOP_MS = 100;
/** Replays play at half speed. */
export const CUT_REPLAY_SPEED = 0.5;

export type CutTier = 'small' | 'medium' | 'big' | 'huge';

export const cutTier = (tiles: number, victimTilesBefore: number, t: Readonly<CutTiers> = CUT_TIERS): CutTier => {
  if (tiles >= t.huge || (victimTilesBefore > 0 && tiles >= 2 && tiles / victimTilesBefore >= t.hugeShare)) return 'huge';
  if (tiles >= t.big) return 'big';
  if (tiles >= t.medium) return 'medium';
  return 'small';
};

export type CutInput = {
  /** the hex where the network was cut (the replaced or removed link) */
  origin: string;
  /** the tiles that die */
  keys: readonly string[];
  /** how many non-root tiles the victim had before the cut */
  victimTiles: number;
  /** true when the tiles are mine (the opponent cuts me, or my own Fruit): the calmer variant */
  mine: boolean;
  kind?: 'cut' | 'fruit';
};

export type CutOptions = {
  /** the page's time scale (1 Normal, 0.5 Fast, 1.6 Slow; 0 = animations off) */
  speed: number;
  reduceMotion: boolean;
  effects: 'low' | 'normal' | 'high';
  replay?: boolean;
};

export type StageName = 'anticipation' | 'hitstop' | 'flash' | 'zoom' | 'pulse' | 'snap' | 'ripple' | 'crumble' | 'payoff' | 'fade';
export type Stage = { name: StageName; at: number; dur: number };

export type CutPlan = {
  tier: CutTier;
  calm: boolean;
  stages: Stage[];
  /** when each tile starts to die, and for how long (ripple outward from the origin) */
  tiles: { key: string; at: number; dur: number; ring: number }[];
  shakePx: number;
  flash: { ms: number; alpha: number; radius: number };
  zoom: number;
  banner: string | null;
  float: string;
  haptic: FeedbackEvent | null;
  duckMs: number;
  /** the whole sequence, ms (at the given speed) */
  total: number;
};

const dist = (a: string, b: string) => {
  const p = parseKey(a);
  const q = parseKey(b);
  return Math.max(Math.abs(p.q - q.q), Math.abs(p.r - q.r), Math.abs(p.q + p.r - q.q - q.r));
};

const LOOK: Record<CutTier, { anticipation: number; hitstop: number; flashAlpha: number; zoom: number; pulse: number; shake: number; death: number; crumble: number; payoff: number }> = {
  small: { anticipation: 0, hitstop: 60, flashAlpha: 0.15, zoom: 1, pulse: 90, shake: 2, death: 320, crumble: 220, payoff: 300 },
  medium: { anticipation: 90, hitstop: HITSTOP_MS, flashAlpha: 0.22, zoom: 1.01, pulse: 110, shake: 3, death: 360, crumble: 260, payoff: 360 },
  big: { anticipation: 140, hitstop: HITSTOP_MS, flashAlpha: 0.28, zoom: 1.02, pulse: 130, shake: 5, death: 380, crumble: 280, payoff: 400 },
  huge: { anticipation: 180, hitstop: HITSTOP_MS + 20, flashAlpha: FLASH_MAX_ALPHA, zoom: 1.03, pulse: 150, shake: 6, death: 400, crumble: 300, payoff: 420 },
};

const HAPTIC: Record<CutTier, FeedbackEvent> = { small: 'cutSmall', medium: 'cutMedium', big: 'cutBig', huge: 'cutHuge' };

/** The plan for one cut. `first`: the first cut of the move (only it gets the anticipation beat). */
export const cutPlan = (c: CutInput, o: CutOptions, first = true): CutPlan => {
  const n = c.keys.length;
  const tier = cutTier(n, c.victimTiles);
  const calm = c.mine;
  const L = LOOK[tier];
  const fruit = c.kind === 'fruit';
  const float = `−${n}`;
  const banner = calm ? (tier === 'huge' && !fruit ? `Lost ${n} tiles` : null) : fruit ? null : tier === 'big' || tier === 'huge' ? `Cut off ${n}!` : null;
  const haptic: FeedbackEvent | null = calm ? 'cutMe' : HAPTIC[tier];
  const speed = (o.speed > 0 ? o.speed : 0) * (o.replay ? 1 / CUT_REPLAY_SPEED : 1);
  const rings = c.keys.map((k) => ({ key: k, ring: dist(k, c.origin) })).sort((a, b) => a.ring - b.ring || (a.key < b.key ? -1 : 1));

  if (o.reduceMotion) {
    // Reduce motion: one plain fade, everything at once; no shake, flash or zoom.
    const dur = 300;
    const total = Math.round((dur + 200) * speed);
    return {
      tier,
      calm,
      stages: [{ name: 'fade', at: 0, dur: Math.round(dur * speed) }, { name: 'payoff', at: Math.round(dur * speed), dur: Math.round(200 * speed) }],
      tiles: rings.map((r) => ({ key: r.key, at: 0, dur: Math.round(dur * speed), ring: r.ring })),
      shakePx: 0,
      flash: { ms: 0, alpha: 0, radius: 0 },
      zoom: 1,
      banner,
      float,
      haptic,
      duckMs: total,
      total,
    };
  }

  const low = o.effects === 'low';
  // Only a major sever moves the board. The link flash carries smaller cuts.
  const shake = calm || low || (tier !== 'big' && tier !== 'huge') ? 0 : Math.min(6, L.shake + (o.effects === 'high' && tier !== 'huge' ? 1 : 0));
  const flashAlpha = calm || low ? 0 : Math.min(FLASH_MAX_ALPHA, L.flashAlpha);
  const zoom = calm || low ? 1 : L.zoom;

  // the timeline at Normal speed
  let t = 0;
  const stages: Stage[] = [];
  const push = (name: StageName, dur: number, advance = true) => {
    stages.push({ name, at: t, dur });
    if (advance) t += dur;
  };
  const antic = first && !calm ? L.anticipation : 0;
  if (antic) push('anticipation', antic);
  const hit = calm ? 0 : low ? 40 : L.hitstop;
  if (zoom > 1) push('zoom', hit + L.pulse, false);
  if (hit) push('hitstop', hit);
  push('pulse', L.pulse);
  if (flashAlpha > 0) push('flash', Math.min(FLASH_MAX_MS, hit), false);
  push('snap', 120, false);
  const maxRing = Math.max(0, ...rings.map((r) => r.ring));
  const step = maxRing > 0 ? Math.min(RIPPLE_STEP_MS, RIPPLE_CAP_MS / maxRing) : 0;
  const rippleAt = t + 60;
  const tiles = rings.map((r) => ({ key: r.key, at: Math.round(rippleAt + r.ring * step), dur: L.death, ring: r.ring }));
  const rippleLen = Math.round(maxRing * step) + L.death;
  stages.push({ name: 'ripple', at: rippleAt, dur: rippleLen });
  t = rippleAt + rippleLen;
  push('crumble', L.crumble, false);
  stages.push({ name: 'payoff', at: t, dur: L.payoff });
  let total = Math.max(t + L.crumble, ...stages.map((s) => s.at + s.dur));

  // the cap: squeeze everything but the hit-stop (keeps its ~100ms) into 1.8s
  let k = 1;
  if (total > CUT_CAP_MS) k = CUT_CAP_MS / total;
  const sc = (x: number) => Math.round(x * k * speed);
  const out: CutPlan = {
    tier,
    calm,
    stages: stages.map((s) => ({ name: s.name, at: sc(s.at), dur: s.name === 'flash' ? Math.min(FLASH_MAX_MS, Math.round(s.dur * speed)) : sc(s.dur) })),
    tiles: tiles.map((x) => ({ key: x.key, at: sc(x.at), dur: sc(x.dur), ring: x.ring })),
    shakePx: shake,
    flash: { ms: flashAlpha > 0 ? Math.min(FLASH_MAX_MS, Math.round(Math.min(FLASH_MAX_MS, hit) * speed)) : 0, alpha: flashAlpha, radius: tier === 'huge' ? 2.5 : tier === 'big' ? 2 : 1.4 },
    zoom,
    banner,
    float,
    haptic,
    duckMs: 0,
    total: 0,
  };
  total = Math.max(...out.stages.map((s) => s.at + s.dur), ...out.tiles.map((x) => x.at + x.dur));
  out.total = total;
  out.duckMs = total;
  return out;
};

/**
 * Every cut of one move (a chain, or one placement cutting two networks): they follow each
 * other, each starting while the last one crumbles. The whole move stays within the cap at
 * Normal speed.
 */
export const cutTimeline = (cuts: readonly CutInput[], o: CutOptions): { start: number; plan: CutPlan }[] => {
  const plans = cuts.map((c, i) => cutPlan(c, { ...o, speed: 1, replay: false }, i === 0));
  const starts: number[] = [];
  let at = 0;
  for (const p of plans) {
    starts.push(at);
    const ripple = p.stages.find((s) => s.name === 'ripple' || s.name === 'fade')!;
    at += Math.round(ripple.at + ripple.dur * 0.7);
  }
  const end = Math.max(0, ...plans.map((p, i) => starts[i]! + p.total));
  const k = end > CUT_CAP_MS ? CUT_CAP_MS / end : 1;
  const speed = (o.speed > 0 ? o.speed : 0) * (o.replay ? 1 / CUT_REPLAY_SPEED : 1);
  return cuts.map((c, i) => {
    // re-plan at the squeezed speed so every limit still holds per cut
    const plan = cutPlan(c, { ...o, speed: speed * k, replay: false }, i === 0);
    return { start: Math.round(starts[i]! * k * speed), plan };
  });
};
