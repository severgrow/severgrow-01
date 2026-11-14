// THE ROOM'S LIGHT: one big, very slow pool behind everything the game draws, and the background's
// answer to a big action.
//
// Owner, 2026-11-14: "the plain black background behind the board is a bit too dark, make it have
// some big light going on slowly never leak into the board --- all screen sizes -- has to be
// integrated with background color actions during big actions in game". Asked to pick a character:
// ONE big soft light, very slow drift; and on the action link "all of it": it pulses with big
// actions AND takes the action's colour briefly.
//
// The layer itself (element, gradient, drift keyframes, the veil gate, Reduce motion) is CSS in
// `web/src/style.css`, next to #texture and #spores: it is part of the page's background stack, not
// a screen. This module owns the three things CSS cannot do:
//   - building the element at boot (so a channel that is not the product never builds it),
//   - the one-shot pulse, driven by ONE `element.animate()` on opacity (never a frame loop),
//   - the action -> tone contract below.
//
// COLOUR: never a second palette. Every tone is a `LightTone` from the cockpit's ONE LIGHT contract
// (player/light.ts), and the tint is that tone's own `bloom` ink — the exact colour the display's
// baked glow and the outcome light already use. Cut takes the cut red, Blast and Bomb the warm
// amber. Nothing here publishes a tone: the board's own effects keep the room they had.
import { LIGHT_TONES } from '../player/light.js';
import type { LightTone } from '../player/light.js';

export const AMBIENT_LIGHT_ID = 'futa04-ambient-light';

/** The three big actions the background answers. */
export type AmbientAction = 'cut' | 'blast' | 'bomb';

/**
 * The action -> tone map. `red` is the cut's own colour (the same ink as the damage light) and
 * `amber` is the display's default and the Blast/Bomb warmth. Both live in LIGHT_TONES.
 */
export const AMBIENT_ACTION_TONE: Readonly<Record<AmbientAction, LightTone>> = {
  cut: 'red',
  blast: 'amber',
  bomb: 'amber',
};

/**
 * How long the pulse takes to rise and settle, ms (scaled by the caller's speed factor).
 *
 * The board's own animations run at the player's Speed setting (Fast is half the time), but a
 * full-screen colour wash must not become a 200 ms flash at that setting: it reads as a strobe, not
 * as a room. So the speed factor is clamped to [0.8, 2] — the pulse keeps pace with the board
 * without ever getting faster than this.
 */
export const AMBIENT_ACTION_MS: Readonly<Record<AmbientAction, number>> = {
  cut: 620,
  blast: 780,
  bomb: 620,
};

export const AMBIENT_SPEED_BOUNDS = Object.freeze({ min: 0.8, max: 2 });

/**
 * The pulse's peak opacity CEILING. The tint underneath is already a low-alpha bloom ink, so this
 * is about the same strength as the outcome light's own ceiling (.82), which the owner already
 * sees at the end of a match: a colour you can name in one glance, still low enough to read the
 * board through. Keep it here, in one number.
 */
export const AMBIENT_PULSE_CAP = 0.82;

export type AmbientPulsePlan = { tone: LightTone; tint: string; peak: number; ms: number };

export type AmbientPulseOptions = {
  /** 0..1: how big the action was (a wide Blast is brighter than a small one). */
  strength?: number;
  /** Reduce motion (the setting or the OS): no pulse at all. */
  reduced?: boolean;
  /** Effects Low: the board plays quiet, so does the room. */
  quiet?: boolean;
  /** The move's speed factor (main.ts `timeScale()`), so the pulse keeps pace with the board. */
  speed?: number;
};

const unit = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * What the pulse should be, or null for no pulse. Pure: the whole decision is testable without a
 * browser, and the DOM below only paints it.
 */
export const ambientPulsePlan = (action: AmbientAction, o: AmbientPulseOptions = {}): AmbientPulsePlan | null => {
  if (o.reduced || o.quiet) return null;
  const tone: LightTone = AMBIENT_ACTION_TONE[action] ?? 'amber';
  const strength = unit(o.strength ?? 1);
  // Even the smallest big action is felt; the widest is the ceiling and never past it.
  const peak = +(AMBIENT_PULSE_CAP * (0.6 + 0.4 * strength)).toFixed(3);
  const raw = Number.isFinite(o.speed) && (o.speed as number) > 0 ? (o.speed as number) : 1;
  const speed = Math.min(AMBIENT_SPEED_BOUNDS.max, Math.max(AMBIENT_SPEED_BOUNDS.min, raw));
  const ms = Math.round(AMBIENT_ACTION_MS[action] * speed);
  return { tone, tint: LIGHT_TONES[tone].bloom, peak, ms };
};

let layer: HTMLElement | null = null;
let pulseLayer: HTMLElement | null = null;
let running: Animation | null = null;

/**
 * Build the background layer once and put it in the page's background stack, directly before
 * #spores (above #texture and the in-game black backdrop, below every screen). Returns it, or null
 * where there is no document (unit tests, the server).
 */
export function mountAmbientLight(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  if (layer?.isConnected) return layer;
  const existing = document.getElementById(AMBIENT_LIGHT_ID);
  if (existing) {
    layer = existing;
    pulseLayer = existing.querySelector<HTMLElement>('.al-pulse');
    return existing;
  }
  const root = document.createElement('div');
  root.id = AMBIENT_LIGHT_ID;
  root.setAttribute('aria-hidden', 'true');
  const base = document.createElement('i');
  base.className = 'al-base';
  const pulse = document.createElement('i');
  pulse.className = 'al-pulse';
  root.append(base, pulse);
  const spores = document.getElementById('spores');
  if (spores?.parentElement) spores.before(root);
  else {
    const texture = document.getElementById('texture');
    if (texture) texture.after(root);
    else document.body.prepend(root);
  }
  layer = root;
  pulseLayer = pulse;
  return root;
}

/**
 * The background answers a big action: the pool brightens in the action's own colour for one short
 * beat, then settles. ONE style write (the tint) and ONE opacity animation — no frame loop, no
 * layout read, and nothing that survives the animation. Returns whether it played.
 *
 * The caller passes the impact's own strength and the game's speed factor, so the background moves
 * with the board instead of beside it.
 */
export function pulseAmbientLight(action: AmbientAction, o: AmbientPulseOptions = {}): boolean {
  if (typeof document === 'undefined') return false;
  // Reduce motion is a hard no, whatever the caller says (the same belt-and-braces the outcome
  // light uses): the pool stays a still wash.
  if (document.documentElement.classList.contains('reduce-motion')
    || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return false;
  const plan = ambientPulsePlan(action, o);
  if (!plan) return false;
  const el = pulseLayer?.isConnected ? pulseLayer : (mountAmbientLight()?.querySelector<HTMLElement>('.al-pulse') ?? null);
  if (!el || typeof el.animate !== 'function') return false;
  // The tint is one paint, before the animation starts: the gradient is re-rasterised once, then
  // only its opacity moves on the compositor.
  el.style.setProperty('--ambient-tint', plan.tint);
  running?.cancel();
  const beat = el.animate([
    { opacity: 0 },
    { opacity: plan.peak, offset: 0.16 },
    { opacity: plan.peak * 0.42, offset: 0.5 },
    { opacity: 0 },
  ], { duration: plan.ms, easing: 'cubic-bezier(.2,.55,.35,1)' });
  running = beat;
  const settle = () => { if (running === beat) running = null; };
  beat.addEventListener('finish', settle);
  beat.addEventListener('cancel', settle);
  return true;
}
