// Material pass 2, Part 7: the "Your turn" / "Bot's turn" pill as a small pure state machine.
// The page feeds it the time that passed (tick) and the events (a new turn, the bot's first
// move); it says what to show. No timers here, so it is easy to test and can never drift.
import type { Player } from '../../../src/engine/index.js';
import { speedFactor } from './settings.js';
import type { Effects, Settings } from './settings.js';

export const BANNER_MS = Object.freeze({ in: 250, hold: 700, out: 250 });
/** Reduce motion: a plain quick fade. */
const QUICK = 120;

export type BannerOpts = {
  /** 1 = Normal; >1 slower (Slow), <1 faster (Fast). */
  speed: number;
  reduceMotion: boolean;
  /** "Skip animations": the banner appears and disappears instantly. */
  skip: boolean;
  /** "Effects" setting: Low gives a plain pill (no sweep, no edge wash). */
  effects: Effects;
};

/** The banner's options from the player's settings. */
export const bannerOpts = (s: Settings): BannerOpts => ({
  speed: s.speed === 'skip' ? 1 : speedFactor(s.speed),
  reduceMotion: s.reduceMotion,
  skip: s.speed === 'skip',
  effects: s.effects,
});

export type BannerState = {
  player: Player | null;
  phase: 'in' | 'hold' | 'out' | 'hidden';
  /** ms spent in the current phase */
  t: number;
  opts: BannerOpts;
  /** the bot is still choosing its first move */
  thinking: boolean;
};

export const HIDDEN: BannerState = Object.freeze({ player: null, phase: 'hidden', t: 0, opts: { speed: 1, reduceMotion: false, skip: false, effects: 'normal' }, thinking: false }) as BannerState;

const dur = (s: BannerState, phase: 'in' | 'hold' | 'out') =>
  s.opts.reduceMotion ? (phase === 'hold' ? BANNER_MS.hold * s.opts.speed : QUICK * s.opts.speed) : BANNER_MS[phase] * s.opts.speed;

/** A new turn starts: the latest one always wins (nothing stacks). */
export const showTurn = (_s: BannerState, player: Player, opts: BannerOpts): BannerState => ({
  player,
  phase: opts.skip ? 'hidden' : 'in',
  t: 0,
  opts,
  thinking: player === 1,
});

/** The bot's first move appeared: the thinking dots go. */
export const botMoved = (s: BannerState): BannerState => ({ ...s, thinking: false });

export const tick = (s: BannerState, ms: number): BannerState => {
  if (s.phase === 'hidden') return s;
  let phase: BannerState['phase'] = s.phase;
  let t = s.t + ms;
  while (phase !== 'hidden' && t >= dur(s, phase)) {
    t -= dur(s, phase);
    phase = phase === 'in' ? 'hold' : phase === 'hold' ? 'out' : 'hidden';
  }
  return { ...s, phase, t: phase === 'hidden' ? 0 : t };
};

export type BannerView = {
  visible: boolean;
  label: string;
  marker: 'circle' | 'diamond';
  phase: BannerState['phase'];
  opacity: number;
  /** px it has still to slide in (0 with Reduce motion) */
  slide: number;
  /** the thin line sweeping once along the pill's edge (while holding) */
  sweep: boolean;
  fadeOnly: boolean;
  /** a faint wash of colour along the board's edge on that player's side (null: none) */
  wash: 'you' | 'bot' | null;
  thinking: boolean;
  /** never: no urgency flashing */
  flash: false;
};

export const bannerView = (s: BannerState): BannerView => {
  const p = s.phase === 'hidden' ? 1 : Math.min(1, s.t / Math.max(1, dur(s, s.phase as 'in' | 'hold' | 'out')));
  const ease = 1 - (1 - p) ** 3; // ease-out
  const opacity = s.phase === 'in' ? ease : s.phase === 'hold' ? 1 : s.phase === 'out' ? 1 - p : 0;
  const rm = s.opts.reduceMotion;
  const plain = rm || s.opts.effects === 'low';
  return {
    visible: s.phase !== 'hidden',
    label: s.player === 1 ? "Bot's turn" : 'Your turn',
    marker: s.player === 1 ? 'diamond' : 'circle',
    phase: s.phase,
    opacity,
    slide: rm || s.phase !== 'in' ? 0 : 6 * (1 - ease),
    sweep: !plain && s.phase === 'hold',
    fadeOnly: rm,
    wash: plain || s.phase === 'hidden' ? null : s.player === 1 ? 'bot' : 'you',
    thinking: s.thinking,
    flash: false,
  };
};

export type TurnTone = { notes: [number, number]; gain: number; ms: number };

/**
 * The two soft tones (multiples of the palette's base pitch): a gentle rise for my turn,
 * a lower, settling pair for the bot's. Quiet and short; none when animations are skipped.
 */
export const turnTone = (player: Player, opts: BannerOpts): TurnTone | null =>
  opts.skip ? null : player === 1 ? { notes: [1.5, 1.25], gain: 0.04, ms: 320 } : { notes: [2, 2.5], gain: 0.05, ms: 320 };
