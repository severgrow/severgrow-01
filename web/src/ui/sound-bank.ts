// The pre-rendered sound bank.
//
// Every cue is a fixed, deterministic set of short mono buffers rendered ONCE, on the player's
// first gesture. Playback then allocates nothing but one AudioBufferSourceNode + one GainNode per
// voice: no createBuffer, no oscillator, no filter during play. A five-tile Bloom therefore costs
// a handful of buffer sources instead of ten fresh buffers and ten live oscillators.
//
// The palette is the same analog, clicky, fidgety one as before: filtered noise transients and
// short low-gain bodies. Everything here is pure synthesis from a seeded LCG — no Math.random, so a
// replay builds byte-identical buffers. Playback still goes through the existing sfx bus and master
// limiter (ui/sound.ts), and each buffer is soft-limited at bake time as a second guard.
//
// Sizes: BANK_RATE is 22050 Hz (a click has no meaningful energy above that), every buffer is at
// most 120 ms, and the whole bank is well under 1.5 MB of Float32 data.

export type Wave = OscillatorType;

export type SampleDesc =
  | { kind: 'noise'; ms: number; amp: number; cutoff: number; seed: number }
  | {
      kind: 'tone';
      wave: Wave;
      ms: number;
      amp: number;
      freq: number;
      slideTo?: number;
      cutoff?: number;
      attackMs?: number;
    };

export type BankEvent = { at: number; desc: SampleDesc };

/** A cue has 2-3 deterministic variants; each variant is a short sequence of sampled voices. */
export type CueSpec = {
  id: string;
  layer: 'tick' | 'click' | 'thud' | 'body';
  variants: readonly (readonly BankEvent[])[];
};

/** The rate every buffer is baked at. Mono, short, and cheap: 1 s here is ~88 KB. */
export const BANK_RATE = 22_050;
/** The longest allowed buffer. Anything longer is split into several events instead. */
export const MAX_BUFFER_MS = 120;
/** The nominal tuning the buffers are baked at; `Sound.tune()` transposes playback from here. */
export const BANK_BASE = 330;

const N = (ms: number, amp: number, cutoff: number, seed = 7): SampleDesc => ({ kind: 'noise', ms, amp, cutoff, seed });

const T = (
  freq: number,
  ms: number,
  wave: Wave,
  amp: number,
  opts: { slideTo?: number; cutoff?: number; attackMs?: number } = {},
): SampleDesc => ({ kind: 'tone', wave, ms, amp, freq, ...opts });

const e = (atMs: number, desc: SampleDesc): BankEvent => ({ at: atMs / 1000, desc });

/** One wood tick: a noise transient plus a quick muted body that lands. */
const wood = (mult: number, ms: number, amp: number, variant: number, atMs = 0): BankEvent[] => {
  const freq = BANK_BASE * mult;
  const cutoff = variant === 1 ? 3400 : variant === 2 ? 2200 : 2800;
  const body = variant === 1 ? freq * 1.02 : variant === 2 ? freq * 0.97 : freq;
  return [
    e(atMs, N(variant === 2 ? 14 : 12, amp * 1.3, cutoff, 7 + variant * 13)),
    e(
      atMs,
      T(body, variant === 1 ? ms * 0.9 : ms, variant === 2 ? 'square' : 'triangle', variant === 2 ? amp * 0.85 : amp, {
        slideTo: body * 0.7,
        cutoff: cutoff - 400,
        attackMs: 3,
      }),
    ),
  ];
};

/** A crisp snip: the noise transient carries the cut, the body only colours it. */
const snip = (mult: number, amp: number, atMs = 0, variant = 0): BankEvent[] => [
  e(atMs, N(28, amp, 6500 + variant * 220, 31 + variant * 17)),
  e(atMs, T(BANK_BASE * mult, 40, 'triangle', 0.035, { cutoff: 3400, attackMs: 2 })),
];

/** A low, muted settle for the bigger cuts. */
const settle = (mult: number, amp: number, atMs: number, variant = 0): BankEvent[] => [
  e(atMs, T(BANK_BASE * mult, MAX_BUFFER_MS, 'sine', amp, { slideTo: BANK_BASE * mult * 0.65, cutoff: 700, attackMs: 4 })),
  e(atMs, N(20, amp * 0.4, 900, 43 + variant * 11)),
];

const variants = (n: 2 | 3, build: (v: number) => BankEvent[]): readonly (readonly BankEvent[])[] =>
  Object.freeze(Array.from({ length: n }, (_, v) => build(v)));

/** A compact expression helper for the manifest. */
const cue = (id: string, layer: CueSpec['layer'], variantsList: readonly (readonly BankEvent[])[]): CueSpec => ({
  id,
  layer,
  variants: variantsList,
});

/**
 * The bank's whole manifest: 29 cues, 2-3 variants each. Aliases (`click`, `illegal`, `fanfare`,
 * `grow`, `bloomTile`, `seedTick`) reuse one of these rather than adding a cue.
 */
export const SOUND_MANIFEST: readonly CueSpec[] = Object.freeze([
  cue('press', 'click', variants(2, (v) =>
    v === 0
      ? [
          e(0, N(14, 0.1, 3400)),
          e(0, T(BANK_BASE * 3.1, 50, 'square', 0.05, { slideTo: BANK_BASE * 2.1, cutoff: 2600, attackMs: 2 })),
        ]
      : [
          e(0, N(17, 0.09, 2600, 23)),
          e(0, T(BANK_BASE * 2.6, 60, 'triangle', 0.055, { slideTo: BANK_BASE * 1.9, cutoff: 2200, attackMs: 2 })),
        ])),
  cue('tick', 'tick', variants(2, (v) => [
    e(0, N(10, v === 0 ? 0.03 : 0.025, v === 0 ? 2800 : 2400, 61 + v * 19)),
    e(0, T(BANK_BASE * (v === 0 ? 2.4 : 2.2), 25, 'triangle', v === 0 ? 0.018 : 0.015, { cutoff: 1800, attackMs: 1 })),
  ])),
  cue('draw', 'body', variants(3, (v) => {
    const gap = v === 0 ? 36 : v === 1 ? 50 : 28;
    const hi = v === 2 ? 3.4 : 3.2;
    return [
      e(0, N(16, 0.06, 4200, 71 + v * 13)),
      e(4, T(BANK_BASE * hi, 30, 'square', 0.03, { cutoff: 3200, attackMs: 2 })),
      e(gap, N(14, 0.05, 3600, 83 + v * 13)),
      e(gap + 4, T(BANK_BASE * 2.9, 30, 'square', 0.026, { cutoff: 3000, attackMs: 2 })),
    ];
  })),
  cue('throw', 'body', variants(3, (v) => [
    e(0, N(28, v === 2 ? 0.05 : 0.06, v === 1 ? 4600 : 5600, 97 + v * 13)),
    e(0, T(BANK_BASE * (v === 2 ? 1.9 : 2.1), 50, 'triangle', 0.028, { slideTo: BANK_BASE * 3.1, cutoff: 2600, attackMs: 2 })),
    ...wood(v === 1 ? 2.1 : 1.9, 60, 0.055, v, 110),
  ])),
  cue('place', 'body', variants(3, (v) => {
    const mult = 2 * (v === 1 ? 1.02 : v === 2 ? 0.97 : 1);
    return wood(mult, 55 + v * 8, 0.055 + v * 0.008, v);
  })),
  cue('placeTop', 'thud', variants(2, (v) => [...wood(2, 65, 0.062, v), ...wood(1.4, 60, 0.05, (v + 1) % 3, 50)])),
  cue('strengthen', 'body', variants(2, (v) => [
    e(0, N(12, 0.07, 3200, 109 + v * 17)),
    e(0, T(BANK_BASE * 4, 45, 'triangle', 0.055, { slideTo: BANK_BASE * 3, cutoff: 3000, attackMs: 3 })),
    e(55, N(12, 0.06, 3200, 127 + v * 17)),
    e(55, T(BANK_BASE * 4.6, 45, 'triangle', 0.05, { slideTo: BANK_BASE * 3.4, cutoff: 3000, attackMs: 3 })),
  ])),
  cue('bloom', 'body', variants(2, (v) => [
    e(0, N(11, 0.045, 4200, 139 + v * 19)),
    e(0, T(BANK_BASE * (2.4 + v * 0.15), 30, 'square', 0.028, { cutoff: 3200, attackMs: 2 })),
  ])),
  cue('fruit', 'body', variants(2, (v) => [
    e(0, T(BANK_BASE * (1.9 + v * 0.05), 110, 'triangle', 0.09, { slideTo: BANK_BASE * 1.05, cutoff: 1600, attackMs: 3 })),
    e(0, N(20, 0.05, 2000, 151 + v * 23)),
  ])),
  cue('megaBomb', 'thud', variants(2, (v) => [
    e(0, T(BANK_BASE * 0.5, 118, 'sine', 0.2, { slideTo: BANK_BASE * 0.32, cutoff: 500, attackMs: 4 })),
    e(0, N(60, 0.09, 700, 163 + v * 29)),
    e(20, N(30, 0.06, 1200, 173 + v * 29)),
  ])),
  cue('undo', 'body', variants(2, (v) => [...wood(2.1, 55, 0.05, v), ...wood(1.5, 60, 0.045, (v + 1) % 3, 60)])),
  cue('turn', 'body', variants(2, (v) => [
    e(0, N(12, 0.045, 2800, 181 + v * 31)),
    e(0, T(BANK_BASE * 2.1, 45, 'triangle', 0.03, { slideTo: BANK_BASE * 1.6, cutoff: 2000, attackMs: 2 })),
  ])),
  cue('snap', 'body', variants(2, (v) => [
    e(0, T(BANK_BASE * 1.05, 90, 'square', 0.04, { slideTo: BANK_BASE * 0.8, cutoff: 1100, attackMs: 3 })),
    e(0, N(20, 0.045, 1200, 191 + v * 37)),
  ])),
  cue('cutSmall', 'body', variants(2, (v) => snip(2.1, 0.11, 0, v))),
  cue('cutMedium', 'thud', variants(2, (v) => [...snip(2.1, 0.11, 0, v), ...snip(1.7, 0.05, 50, v), ...settle(0.72, 0.07, 100, v)])),
  cue('cutBig', 'thud', variants(2, (v) => [...snip(2.2, 0.12, 0, v), ...snip(1.9, 0.09, 60, v), ...settle(0.85, 0.13, 120, v)])),
  cue('cutHuge', 'thud', variants(2, (v) => [
    ...snip(2.3, 0.12, 0, v),
    ...snip(2.0, 0.1, 50, v),
    ...snip(1.7, 0.085, 100, v),
    e(170, N(30, 0.05, 600, 211 + v * 41)),
    e(170, T(BANK_BASE * 0.55, 110, 'sine', 0.12, { slideTo: BANK_BASE * 0.4, cutoff: 600, attackMs: 4 })),
  ])),
  cue('cutMe', 'thud', variants(2, (v) => {
    const b = BANK_BASE * (1 + v * 0.02);
    return [
      e(0, N(30, 0.07, 2600, 223 + v * 43)),
      e(0, T(b * 1.5, 50, 'triangle', 0.03, { slideTo: b * 1.1, cutoff: 1400, attackMs: 3 })),
      e(70, N(26, 0.055, 2200, 227 + v * 43)),
      e(70, T(b * 1.2, 50, 'triangle', 0.028, { slideTo: b * 0.9, cutoff: 1200, attackMs: 3 })),
      e(110, T(b * 0.6, 110, 'sine', 0.09, { slideTo: b * 0.42, cutoff: 600, attackMs: 4 })),
    ];
  })),
  cue('rustle', 'body', variants(2, (v) => [e(0, N(40 - v * 5, 0.045, 2600, 241 + v * 47))])),
  cue('sparks', 'body', variants(2, (v) => [e(0, N(25 - v * 3, 0.05, 5200, 251 + v * 53))])),
  cue('thud', 'thud', variants(2, (v) => [
    e(0, T(BANK_BASE * 0.55, 110, 'sine', 0.16, { slideTo: BANK_BASE * 0.36, cutoff: 500, attackMs: 4 })),
    e(0, N(30, 0.06, 600, 263 + v * 59)),
  ])),
  cue('rumble', 'thud', variants(2, (v) => [
    e(0, T(BANK_BASE * 0.45, 118, 'sine', 0.12, { slideTo: BANK_BASE * 0.34, cutoff: 450, attackMs: 4 })),
    e(80, N(30, 0.05, 900, 271 + v * 61)),
    e(150, N(20, 0.04, 1200, 277 + v * 61)),
  ])),
  cue('grind', 'body', variants(2, (v) => [
    e(0, N(110, 0.07, 700, 283 + v * 67)),
    e(0, T(BANK_BASE * 0.5, 110, 'sawtooth', 0.028, { slideTo: BANK_BASE * 0.34, cutoff: 900, attackMs: 4 })),
  ])),
  cue('sigh', 'body', variants(2, (v) => [
    e(0, N(110, 0.055, 900, 293 + v * 71)),
    e(0, T(BANK_BASE * 0.6, 110, 'sine', 0.05, { slideTo: BANK_BASE * 0.42, cutoff: 700, attackMs: 5 })),
  ])),
  cue('sad', 'body', variants(2, (v) => [
    e(0, T(BANK_BASE * 0.8, 110, 'triangle', 0.06, { slideTo: BANK_BASE * 0.58, cutoff: 800, attackMs: 4 })),
    e(0, N(20, 0.04, 1000, 307 + v * 73)),
  ])),
  cue('chime', 'body', variants(2, (v) => [
    ...[2, 2.4, 2.9].flatMap((m, i) => [
      e(i * 60, N(10, 0.04, 4000, 311 + v * 79 + i * 7)),
      e(i * 60, T(BANK_BASE * m * (1 + v * 0.01), 35, 'square', 0.03, { cutoff: 3600, attackMs: 2 })),
    ]),
    ...wood(1.5, 60, 0.05, v, 190),
  ])),
  cue('win', 'body', variants(2, (v) => [
    ...[1.8, 2.2, 2.7].flatMap((m, i) => [
      e(i * 90, N(12, 0.05, 4200, 331 + v * 83 + i * 11)),
      e(i * 90, T(BANK_BASE * m * (1 + v * 0.01), 50, 'triangle', 0.045, { cutoff: 3200, attackMs: 2 })),
    ]),
    e(280, T(BANK_BASE * 0.7, 110, 'sine', 0.1, { slideTo: BANK_BASE * 0.5, cutoff: 600, attackMs: 4 })),
  ])),
  cue('lose', 'body', variants(2, (v) => [
    e(0, T(BANK_BASE * 1.3, 90, 'triangle', 0.06, { slideTo: BANK_BASE * 1.05, cutoff: 1600, attackMs: 3 })),
    e(90, T(BANK_BASE, 110, 'triangle', 0.055, { slideTo: BANK_BASE * 0.78, cutoff: 1300, attackMs: 3 })),
    ...(v === 1 ? [e(0, N(18, 0.03, 1400, 347))] : []),
  ])),
  cue('finalTurns', 'body', variants(2, (v) => [...wood(1.1, 70, 0.06, v), ...wood(0.95, 70, 0.055, (v + 1) % 3, 80)])),
]);

export const CUE_IDS: readonly string[] = Object.freeze(SOUND_MANIFEST.map((c) => c.id));

/** A stable key for a voice description, so identical voices share one buffer. Cached per
 *  description object: playback looks the key up on every voice, so no strings are built in play. */
const keyCache = new WeakMap<SampleDesc, string>();
export const sampleKey = (d: SampleDesc): string => {
  const hit = keyCache.get(d);
  if (hit !== undefined) return hit;
  const key =
    d.kind === 'noise'
      ? `n:${d.ms}:${d.amp}:${d.cutoff}:${d.seed}`
      : `t:${d.wave}:${d.ms}:${d.amp}:${d.freq.toFixed(3)}:${(d.slideTo ?? 0).toFixed(3)}:${d.cutoff ?? 0}:${d.attackMs ?? 0}`;
  keyCache.set(d, key);
  return key;
};

const cueById = new Map(SOUND_MANIFEST.map((c) => [c.id, c]));
export const cueSpec = (id: string): CueSpec | null => cueById.get(id) ?? null;

/** Every unique voice in the bank, in a stable order (the prime click first). */
export const bankSamples = (): { key: string; desc: SampleDesc; ms: number }[] => {
  const seen = new Map<string, SampleDesc>();
  seen.set(PRIME_KEY, PRIME_DESC);
  for (const c of SOUND_MANIFEST) {
    for (const variant of c.variants) {
      for (const event of variant) {
        const key = sampleKey(event.desc);
        if (!seen.has(key)) seen.set(key, event.desc);
      }
    }
  }
  return [...seen.entries()].map(([key, desc]) => ({ key, desc, ms: desc.ms }));
};

/** The dedicated first-tap click: ONE 10 ms noise transient, so priming is a single createBuffer.
 *  The full `press` cue (transient + tone) is baked in the first idle slice and plays from then on;
 *  until it exists, a missing voice falls back to this click rather than going silent. */
export const PRIME_DESC: SampleDesc = { kind: 'noise', ms: 10, amp: 0.09, cutoff: 3200, seed: 7 };
export const PRIME_KEY = sampleKey(PRIME_DESC);

/** The prime keys in PRIORITY order: the tiny click first (the brief's < 5 ms promise), then the
 *  full press/tick/thud variant-0 voices. `prime()` builds the click unconditionally and the rest
 *  only while a small time budget holds; the remainder fills in idle slices. */
export const PRIME_KEYS: readonly string[] = Object.freeze([PRIME_KEY, ...primeOrder()]);
/** How long `prime()` may spend synchronously after the click. */
export const PRIME_BUDGET_MS = 2.5;

function primeOrder(): string[] {
  const ids = ['press', 'tick', 'thud'];
  const out: string[] = [];
  for (let variant = 0; variant < 2; variant++) {
    for (const id of ids) {
      const cue = SOUND_MANIFEST.find((c) => c.id === id);
      const v = cue?.variants[variant] ?? cue?.variants[0];
      for (const event of v ?? []) {
        const key = sampleKey(event.desc);
        if (key !== PRIME_KEY && !out.includes(key)) out.push(key);
      }
    }
  }
  return out;
}

const softLimit = (x: number): number => Math.tanh(x * 1.1) / Math.tanh(1.1);

/** Render one voice to a normalized mono Float32Array. Deterministic: same desc, same samples. */
export const renderSample = (d: SampleDesc, rate = BANK_RATE): Float32Array => {
  const ms = Math.min(MAX_BUFFER_MS, Math.max(1, d.ms));
  const len = Math.max(1, Math.round((ms / 1000) * rate));
  const out = new Float32Array(len);
  if (d.kind === 'noise') {
    let seed = (d.seed | 0) || 7;
    let y = 0;
    const a = 1 - Math.exp((-2 * Math.PI * d.cutoff) / rate);
    const attack = Math.max(1, Math.round(0.001 * rate));
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      const white = (seed / 2147483647) * 2 - 1;
      y += a * (white - y);
      const env = (1 - i / len) ** 2 * Math.min(1, i / attack);
      out[i] = y * env;
    }
  } else {
    let phase = 0;
    const atk = Math.max(1, Math.round(((d.attackMs ?? 3) / 1000) * rate));
    const f0 = Math.max(1, d.freq);
    const f1 = Math.max(1, d.slideTo ?? d.freq);
    const a = d.cutoff && d.cutoff > 0 ? 1 - Math.exp((-2 * Math.PI * d.cutoff) / rate) : 1;
    let y = 0;
    for (let i = 0; i < len; i++) {
      const freq = f0 * Math.pow(f1 / f0, i / len);
      phase += (2 * Math.PI * freq) / rate;
      const s =
        d.wave === 'sine' ? Math.sin(phase)
        : d.wave === 'square' ? (Math.sin(phase) >= 0 ? 1 : -1)
        : d.wave === 'sawtooth' ? 2 * ((phase / (2 * Math.PI)) % 1) - 1
        : (2 / Math.PI) * Math.asin(Math.sin(phase));
      y += a * (s - y);
      const env = i < atk ? i / atk : Math.exp((-6 * (i - atk)) / Math.max(1, len - atk));
      out[i] = y * env;
    }
    // A 2 ms tail fade on every tone, so a sample never ends on a step.
    const tail = Math.max(1, Math.round(0.002 * rate));
    for (let i = 0; i < tail; i++) out[len - 1 - i]! *= i / tail;
  }
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]!));
  if (peak > 0) for (let i = 0; i < len; i++) out[i] = softLimit(out[i]! / peak);
  return out;
};

/** The bank's expected footprint before anything is built (used by the size test). */
export const bankFootprint = (rate = BANK_RATE): { samples: number; bytes: number; maxMs: number; cues: number; minVariants: number; maxVariants: number } => {
  const all = bankSamples();
  let bytes = 0;
  let maxMs = 0;
  let minVariants = Infinity;
  let maxVariants = 0;
  for (const s of all) {
    bytes += Math.max(1, Math.round((Math.min(MAX_BUFFER_MS, s.ms) / 1000) * rate)) * 4;
    maxMs = Math.max(maxMs, s.ms);
  }
  for (const c of SOUND_MANIFEST) {
    minVariants = Math.min(minVariants, c.variants.length);
    maxVariants = Math.max(maxVariants, c.variants.length);
  }
  return { samples: all.length, bytes, maxMs, cues: SOUND_MANIFEST.length, minVariants, maxVariants };
};

export type BankStats = {
  cues: number;
  samples: number;
  bytes: number;
  maxMs: number;
  built: number;
  /** How many of the first-tap buffers (PRIME_KEYS) were ready when the gesture was handled. */
  primed: number;
  ready: boolean;
  primeMs: number;
  /** The AudioContext's state: used by the browser suite to prove suspend-on-hidden. */
  state: string;
};

/**
 * The built bank. `prime()` creates the first-tap buffers synchronously, click first and under a
 * small budget; `fill()` creates the rest in bounded chunks, driven by an idle callback in sound.ts.
 */
export class SoundBank {
  private readonly buffers = new Map<string, AudioBuffer>();
  /** Everything left to bake, in priority order: the first-tap keys first, then the rest. */
  private readonly pending: { key: string; desc: SampleDesc }[];
  private primeMs = -1;
  private bytes = 0;

  constructor(private readonly ctx: AudioContext, private readonly rate = BANK_RATE) {
    const all = bankSamples();
    const byKey = new Map(all.map((s) => [s.key, s.desc]));
    const first = PRIME_KEYS.flatMap((key) => (byKey.has(key) ? [{ key, desc: byKey.get(key)! }] : []));
    const rest = all.filter((s) => !PRIME_KEYS.includes(s.key)).map(({ key, desc }) => ({ key, desc }));
    this.pending = [...first, ...rest];
  }

  /** Build the first-tap buffers now, click first and under a small time budget. The click is
   *  always built (it is the first key), and `primeMs` reports the time to THAT buffer — the
   *  brief's "< 5 ms" promise. Anything the budget does not reach stays at the front of `pending`,
   *  so `fill()` bakes it next, in the first idle slice. */
  prime(): boolean {
    if (this.buffers.has(PRIME_KEY)) return true;
    const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);
    const t0 = now();
    // The click is ONE small buffer, built unconditionally: this is the < 5 ms promise.
    const click = bankSamples().find((s) => s.key === PRIME_KEY);
    if (!click) return false;
    const at = this.pending.findIndex((p) => p.key === PRIME_KEY);
    if (at >= 0) this.pending.splice(at, 1);
    this.create(click.key, click.desc);
    this.primeMs = now() - t0;
    // Then the rest of the first-tap set, but only while the small budget still holds.
    while (this.pending.length > 0 && PRIME_KEYS.includes(this.pending[0]!.key)) {
      if (now() - t0 > PRIME_BUDGET_MS) break;
      const next = this.pending.shift()!;
      this.create(next.key, next.desc);
    }
    return this.buffers.has(PRIME_KEY);
  }

  /** Build up to `budget` more buffers; returns how many were built. */
  fill(budget = 8): number {
    let built = 0;
    while (built < budget && this.pending.length > 0) {
      const next = this.pending.shift()!;
      this.create(next.key, next.desc);
      built += 1;
    }
    return built;
  }

  get ready(): boolean {
    return this.pending.length === 0;
  }

  get size(): number {
    return this.buffers.size + this.pending.length;
  }

  get(key: string): AudioBuffer | null {
    return this.buffers.get(key) ?? null;
  }

  stats(): BankStats {
    const f = bankFootprint(this.rate);
    return {
      cues: f.cues,
      samples: f.samples,
      bytes: this.bytes,
      maxMs: f.maxMs,
      built: this.buffers.size,
      primed: PRIME_KEYS.filter((key) => this.buffers.has(key)).length,
      ready: this.ready && this.buffers.size === f.samples,
      primeMs: this.primeMs,
      state: this.ctx.state,
    };
  }

  private create(key: string, desc: SampleDesc): void {
    const data = renderSample(desc, this.rate);
    const buf = this.ctx.createBuffer(1, data.length, this.rate);
    buf.getChannelData(0).set(data);
    this.buffers.set(key, buf);
    this.bytes += data.length * 4;
  }
}
