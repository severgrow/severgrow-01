/**
 * ONE LIGHT contract for the cockpit's light.
 *
 * The display is the only emitter in the cockpit. Everything that catches its light
 * (the baked bloom around the dots, the legal-target rim, a hover catch, the lesson
 * pointer and the outcome light) reads the same six-tone vocabulary from here, and
 * every tone is `{ core, bloom, angle }`:
 *
 *   core  the lit-dot ink (identical to the glyph fill the LED painter draws)
 *   bloom a LOW-ALPHA tint of that ink, for rims/shadows/halos — never a fill colour
 *   angle the direction of the soft falloff, degrees clockwise from +x
 *
 * `publishLight` puts the active tone on the root element as
 * `--light-core`, `--light-bloom`, `--light-angle` (and the capped rest opacity
 * `--light-bloom-op`). It writes only when the tone actually changes: the bloom must
 * never re-bake or change strength per frame.
 *
 * Ownership colours are never replaced. The light only ever adds a low-alpha rim on top
 * of the owner's own material. A top-rank tile's glow is NOT part of this contract: it
 * belongs to that tile (its rank and its owner's material) and must never follow the
 * display's tone, or every top tile would swing colour as the display talks.
 */
import type { LedTone } from './led-cells.js';

/** The six reachable light tones. `score` is a display mode, not a room colour. */
export type LightTone = Exclude<LedTone, 'score'>;

export type LightSpec = {
  core: string;
  bloom: string;
  angle: number;
  /** rest opacity of the baked bloom (never above `LIGHT_CAPS.bloomPeak`) */
  peak: number;
};

/** The one angle the whole light leans at: a touch clockwise, never sideways enough to smear. */
export const LIGHT_ANGLE = 22;

/* The bloom's rest strength. Owner, 2026-10-20: "the display glow is too strong right now,
   reduce its intensity by around 35%". Each peak is the old value x 0.65 (.44->.286,
   .46->.299, .42->.273); the colour, the angle and the falloff shape are untouched, and the
   photosensitivity ceiling (`LIGHT_CAPS.bloomPeak`) is unchanged. */
export const LIGHT_TONES: Record<LightTone, LightSpec> = {
  amber: { core: '#f5d8a4', bloom: 'rgba(255,195,104,.30)', angle: LIGHT_ANGLE, peak: .286 },
  red: { core: '#e4705e', bloom: 'rgba(234,68,48,.32)', angle: LIGHT_ANGLE, peak: .299 },
  green: { core: '#a9d886', bloom: 'rgba(143,210,111,.28)', angle: LIGHT_ANGLE, peak: .286 },
  ivory: { core: '#f5ead1', bloom: 'rgba(255,233,182,.26)', angle: LIGHT_ANGLE, peak: .273 },
  pink: { core: '#edabc0', bloom: 'rgba(237,150,178,.26)', angle: LIGHT_ANGLE, peak: .273 },
  cyan: { core: '#a7d3d0', bloom: 'rgba(132,209,206,.24)', angle: LIGHT_ANGLE, peak: .273 },
};

/**
 * Hard caps from the owner's brief. Everything that animates light is checked against
 * these, in code and in `web/tests/light.test.ts`:
 *   - a flash is at most 60 ms and never more than 35% white;
 *   - the alarm keeps its 1.2 s beat (no strobe);
 *   - the baked bloom's peak is capped;
 *   - a major event may catch the display's bezel, but only by an opacity step on the
 *     already-baked sprite, and never past the bloom cap.
 */
export const LIGHT_CAPS = {
  flashMs: 60,
  flashWhite: .35,
  alarmMs: 1200,
  bloomPeak: .55,
  reflect: 1.18,
  /** how far the baked bloom reaches from a lit dot, in CSS px along the angle */
  reach: 52,
  /**
   * The light reaches this much further BELOW a lit dot than above it (owner, 2026-10-20:
   * "stretch it out a tiny bit more downwards - on to the undo and match intel buttons"). The
   * reach above is unchanged, so the bloom keeps its shape and its soft rim; only the lower tail
   * is stretched, by a quarter, so it can catch the keys under the display. Not a wash: the
   * falloff is the same curve, just 25% longer on the way down.
   */
  reachDown: 1.25,
} as const;

/** The LED glyph inks. One map for the painter and the light, so they cannot drift. */
export const LED_INK: Record<LightTone, { fill: string; glow: string }> = {
  amber: { fill: LIGHT_TONES.amber.core, glow: 'rgba(255,195,104,.78)' },
  red: { fill: LIGHT_TONES.red.core, glow: 'rgba(234,68,48,.82)' },
  green: { fill: LIGHT_TONES.green.core, glow: 'rgba(143,210,111,.70)' },
  ivory: { fill: LIGHT_TONES.ivory.core, glow: 'rgba(255,233,182,.66)' },
  pink: { fill: LIGHT_TONES.pink.core, glow: 'rgba(237,150,178,.65)' },
  cyan: { fill: LIGHT_TONES.cyan.core, glow: 'rgba(132,209,206,.58)' },
};

const KNOWN = LIGHT_TONES as Record<string, LightSpec | undefined>;

/** Any tone (including `score`, which borrows amber) as its light tone, never unknown. */
export const toneFor = (tone: LedTone | string): LightTone =>
  (tone === 'score' ? 'amber' : (KNOWN[tone] ? tone : 'amber')) as LightTone;

/** The contract for a tone. An unrecognised tone falls back to amber rather than throwing mid-frame. */
export const lightTone = (tone: LedTone | string): LightSpec => LIGHT_TONES[toneFor(tone)];

/**
 * The baked bloom's alpha as a function of normalised distance from a lit dot (0 at the
 * dot, 1 at the edge of the reach). A 1.5-power falloff: a bright core with a long, gently
 * fading tail that still reaches zero exactly at the edge. Strictly monotonic, so the
 * sprite never draws a ring, and shallow enough at the rim that the last step is invisible.
 */
export const bloomProfile = (t: number): number => {
  if (!(t > 0)) return 1;
  if (t >= 1) return 0;
  return Math.pow(1 - t, 1.5);
};

let published: LightTone | null = null;
/** The tone the DISPLAY owns. An outcome may borrow the room for its beat, then hand it back. */
let displayTone: LightTone = 'amber';

/**
 * Publish the active tone on the root element. Called when the display's mode (or an
 * outcome) changes — never per frame. Returns the contract it published.
 */
export function publishLight(tone: LedTone | string): LightSpec {
  const key = toneFor(tone);
  const spec = LIGHT_TONES[key];
  if (published !== key && typeof document !== 'undefined') {
    const root = document.documentElement;
    root.style.setProperty('--light-core', spec.core);
    root.style.setProperty('--light-bloom', spec.bloom);
    root.style.setProperty('--light-angle', `${spec.angle}deg`);
    root.style.setProperty('--light-bloom-op', String(spec.peak));
  }
  published = key;
  return spec;
}

/** The display's own tone: remembered so a borrowed outcome tone can be handed back. */
export function publishDisplayLight(tone: LedTone | string): LightSpec {
  displayTone = toneFor(tone);
  return publishLight(displayTone);
}

/** Hand the room back to the display after an outcome beat. One write, not a loop. */
export const restoreDisplayLight = (): LightSpec => publishLight(displayTone);

/** The tone currently published (amber until the display says otherwise). */
export const activeLightTone = (): LightTone => published ?? 'amber';

/** The contract currently published, for canvas work that cannot read CSS variables. */
export const activeLight = (): LightSpec => LIGHT_TONES[activeLightTone()];

/** Test-only reset, so a suite can start from a known publication. */
export const resetLightForTests = () => { published = null; displayTone = 'amber'; };
