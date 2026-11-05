// THE RECORDED SOUNDS (owner, 2026-11-05), NARROWED (owner, later the same day: "The sounds sound too
// real ... We need to narrow down all to nice click and taps ... It's okay if the sounds are a bit
// repetitive. There is too much going on now ... We're keeping only short pleasant taps and rings
// and drops, never play 2 at once, add some effect on turn glass to sound better"; "don't rotate -
// group - and certain type of buttons should always make a similar sound ... not variety").
//
// So the game plays a small FIXED PALETTE of the owner's own takes (web/public/audio/sfx/):
//   * one take per group, always the same take, no pitch wobble (a Bloom's cards and the Seeds count
//     still step up in pitch: that is a count, not variety);
//   * short ones only: no velcro, no zip, no gritty, no long metal, no slides; the synth stabs are
//     out for now (their files stay in audio/stabs/, unused);
//   * ONE SOUND AT A TIME: a new sound fades the one still ringing (owner: "new one cuts the old").
//     Two that land in the same instant (a Bloom card and its tile) keep the more important one;
//   * the turn ring is warm and soft: low-passed, a touch lower, a short room tail, only on YOUR turn.
// Only the palette's takes are fetched (about 25 small files); the key takes decode before the first
// tap (see `warm`), so even that tap is a recording. MP3's silent lead-in is skipped per take.
import MAP from './sfx-map.json';

/** The owner's full map (kept for reference; the game plays only `PALETTE`). */
export const SFX_SETS: Readonly<Record<string, readonly string[]>> = MAP.sets;
/** Where the takes are served, relative to the page (works at the root and at /test/). */
export const SFX_FOLDER = 'audio/sfx/';
/** Below this the start of a take is the MP3's padding, not the sound. */
const ONSET = 0.004;
/** A short fade in and out on every voice, so a trimmed take never clicks. */
const FADE = 0.004;
/** How fast a ringing sound gives way to the next one. */
const CUT = 0.008;
/** Two sounds this close together count as the same instant: the more important one keeps it. */
export const SAME_INSTANT = 0.03;

/**
 * Importance: 1 a key or a pick, 2 a move's own sound (draw, throw, a tile landing), 3 a moment
 * (Bloom, cut, Bomb, Blast, turn, win, loss). Only used to settle two sounds in the same instant.
 */
export type Priority = 1 | 2 | 3;
export type Voice = { file: string; volume: number; priority: Priority; semis?: number; warm?: boolean };

/** THE PALETTE: every sound the game makes, one fixed take each. */
export const PALETTE = Object.freeze({
  /** Every key: menu, submenus, sheets, the planet's buttons, PLAY, Back. */
  key: { file: 'ui_press_04.mp3', volume: 0.8, priority: 1 },
  /** A card in your hand picked. */
  card: { file: 'ui_key_01.mp3', volume: 0.55, priority: 1 },
  /** A hex picked. */
  hex: { file: 'rock_click_03.mp3', volume: 0.45, priority: 1 },
  toggleOn: { file: 'ui_flick_01.mp3', volume: 0.7, priority: 1 },
  toggleOff: { file: 'ui_flick_02.mp3', volume: 0.7, priority: 1 },
  /** A sheet or panel closes (the owner's favourite tape take, 04). */
  close: { file: 'ui_tape_close_04.mp3', volume: 0.55, priority: 1 },
  undo: { file: 'ui_flick_02.mp3', volume: 0.5, priority: 1 },
  illegal: { file: 'metal_dull_03.mp3', volume: 0.4, priority: 1 },
  draw: { file: 'card_flick_01.mp3', volume: 0.7, priority: 2 },
  drawPile: { file: 'card_fan_cards_01.mp3', volume: 0.6, priority: 2 },
  deal: { file: 'card_fan_01.mp3', volume: 0.6, priority: 2 },
  throw: { file: 'wood_drop_04.mp3', volume: 0.7, priority: 2 },
  land: { file: 'tile_land_01.mp3', volume: 0.7, priority: 2 },
  landTheirs: { file: 'tile_land_opp_low_03.mp3', volume: 0.65, priority: 2 },
  strengthen: { file: 'wood_stack_02.mp3', volume: 0.7, priority: 2 },
  timer: { file: 'glass_tap_soft_02.mp3', volume: 0.4, priority: 2 },
  finalTurns: { file: 'glass_tap_soft_01.mp3', volume: 0.5, priority: 2 },
  notify: { file: 'glass_tap_03.mp3', volume: 0.55, priority: 2 },
  seedTick: { file: 'glass_tap_03.mp3', volume: 0.45, priority: 2 },
  /** One card of a Bloom (steps up two semitones per card). */
  bloomCard: { file: 'wood_stack_10.mp3', volume: 0.7, priority: 3 },
  bloom: { file: 'wood_block_drop_01.mp3', volume: 0.75, priority: 3 },
  cut: { file: 'wood_drop_heavy_03.mp3', volume: 0.65, priority: 3 },
  cutMe: { file: 'metal_dull_03.mp3', volume: 0.45, priority: 3 },
  bomb: { file: 'wood_drop_heavy_04.mp3', volume: 0.8, priority: 3 },
  blast: { file: 'wood_drop_heavy_03.mp3', volume: 0.85, priority: 3, semis: -3 },
  /** Your turn: the glass ring, warm and soft (see `warmBus`). Theirs is silent. */
  turn: { file: 'glass_ring_01.mp3', volume: 0.42, priority: 3, semis: -2, warm: true },
  coins: { file: 'coins_04.mp3', volume: 0.75, priority: 3 },
  matchFound: { file: 'wood_block_drop_01.mp3', volume: 0.75, priority: 3 },
  lose: { file: 'metal_dull_01.mp3', volume: 0.55, priority: 3, semis: -3 },
} satisfies Record<string, Voice>);
export type PaletteName = keyof typeof PALETTE;

/** Decoded before the first tap (see `warm`): what a first tap can play. */
const WARM: readonly PaletteName[] = ['key', 'card', 'hex', 'toggleOn', 'toggleOff'];

/** A semitone step as a playback rate (`rate = 2^(n/12)`). */
export const semitones = (n: number): number => 2 ** (n / 12);

export type PlayOpts = {
  /** Seconds from now. */
  delay?: number;
  /** Pitch shift in semitones, on top of the voice's own. */
  semis?: number;
  /** Volume multiplier on the voice's own volume. */
  gain?: number;
};

type Loaded = { buffer: AudioBuffer; offset: number };
/**
 * ONE DOWNLOAD FOR THE WHOLE PAGE: the game and the live-duel screen each own an engine (and an
 * AudioContext), but a decoded take is shared, so every file is fetched and decoded once.
 */
const shared = new Map<string, Promise<Loaded | null>>();
/** The shared takes already decoded, readable at once (the first tap cannot wait for a promise). */
const done = new Map<string, Loaded>();
const remember = (key: string, job: Promise<Loaded | null>): Promise<Loaded | null> => {
  const kept = job.then((l) => { if (l) done.set(key, l); return l; });
  shared.set(key, kept);
  return kept;
};

type Ringing = { gain: GainNode; source: AudioBufferSourceNode; start: number; end: number; priority: Priority };

export class RecordedFx {
  private ctx: AudioContext | null = null;
  private out: AudioNode | null = null;
  private warmIn: AudioNode | null = null;
  private readonly buffers = new Map<string, Loaded>();
  private loading = false;
  private ringing: Ringing | null = null;
  /** Every file the palette plays, in load order (the first-tap takes first). */
  readonly files: readonly string[];

  constructor(
    private readonly fetchBytes: (url: string) => Promise<ArrayBuffer> = (url) => fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.arrayBuffer();
    }),
    private readonly base: () => string = () => (typeof document === 'undefined' ? '' : new URL(SFX_FOLDER, document.baseURI).href),
  ) {
    const names = [...WARM, ...(Object.keys(PALETTE) as PaletteName[]).filter((n) => !WARM.includes(n))];
    this.files = [...new Set(names.map((n) => PALETTE[n].file))];
  }

  /** Called by the engine once its context exists (after the first tap). Starts loading. */
  attach(ctx: AudioContext, out: AudioNode): void {
    this.ctx = ctx;
    this.out = out;
    this.warmIn = null;
    // Whatever is decoded already (the warmed key takes) is playable on this very tap.
    for (const file of this.files) {
      const ready = done.get(this.base() + file);
      if (ready) this.buffers.set(file, ready);
    }
    if (this.loading) return;
    this.loading = true;
    void this.loadAll();
  }

  /**
   * THE FIRST TAP IS A RECORDING TOO. Before any gesture there is no AudioContext, but an offline
   * context may decode: while the menu is idle the key takes are fetched and decoded into the shared
   * cache, so the very first press plays the owner's take. Nothing sounds, nothing else loads.
   */
  warm(): void {
    if (typeof OfflineAudioContext === 'undefined') return;
    let offline: OfflineAudioContext;
    try { offline = new OfflineAudioContext(1, 1, 44100); } catch { return; }
    for (const name of WARM) {
      const key = this.base() + PALETTE[name].file;
      if (shared.has(key)) continue;
      remember(key, this.fetchBytes(key)
        .then((bytes) => offline.decodeAudioData(bytes))
        .then((buffer) => ({ buffer, offset: onsetOf(buffer) }))
        .catch(() => null));
    }
  }

  /** How many takes are decoded (diagnostics and tests). */
  get ready(): number {
    return this.buffers.size;
  }

  private async loadAll(): Promise<void> {
    const queue = [...this.files];
    const worker = async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        const ctx = this.ctx;
        if (!ctx) return;
        const key = this.base() + file;
        const job = shared.get(key) ?? remember(key, this.fetchBytes(key)
          .then((bytes) => ctx.decodeAudioData(bytes))
          .then((buffer) => ({ buffer, offset: onsetOf(buffer) }))
          // a missing take is a quiet moment, never an error
          .catch(() => null));
        const loaded = await job;
        if (loaded) this.buffers.set(file, loaded);
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  }

  /**
   * THE WARM ROOM for the turn ring: a low-pass that takes the glassy edge off, then the dry signal
   * plus a short, soft room tail (a decaying noise impulse, built once, deterministic). Built on the
   * first warm voice; a browser without these nodes plays the ring dry.
   */
  private warmBus(): AudioNode | null {
    const ctx = this.ctx, out = this.out;
    if (!ctx || !out) return null;
    if (this.warmIn) return this.warmIn;
    try {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2200;
      lp.Q.value = 0.5;
      const dry = ctx.createGain();
      dry.gain.value = 0.8;
      const wet = ctx.createGain();
      wet.gain.value = 0.35;
      const room = ctx.createConvolver();
      const len = Math.floor(ctx.sampleRate * 0.7);
      const ir = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = ir.getChannelData(0);
      let seed = 0x2f6b1d;
      for (let i = 0; i < len; i++) {
        seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
        data[i] = ((seed / 0xffffffff) * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.16));
      }
      room.buffer = ir;
      lp.connect(dry).connect(out);
      lp.connect(room).connect(wet).connect(out);
      this.warmIn = lp;
    } catch {
      this.warmIn = out;
    }
    return this.warmIn;
  }

  /** Play one voice of the palette. True when the moment is handled (played, or kept by a more important one). */
  play(name: PaletteName, opts: PlayOpts = {}): boolean {
    const ctx = this.ctx, out = this.out;
    const voice: Voice = PALETTE[name];
    if (!ctx || !out) return false;
    const loaded = this.buffers.get(voice.file);
    if (!loaded) return false;
    const now = ctx.currentTime;
    const t0 = now + Math.max(0, opts.delay ?? 0);
    const ringing = this.ringing;
    if (ringing && ringing.end > t0) {
      // The same instant: the more important sound keeps it.
      if (Math.abs(t0 - ringing.start) < SAME_INSTANT && voice.priority <= ringing.priority) return true;
      // Otherwise the new one cuts the old: it fades in a few ms, never two at once.
      ringing.gain.gain.cancelScheduledValues(t0);
      ringing.gain.gain.setValueAtTime(ringing.gain.gain.value || 0.0001, t0);
      ringing.gain.gain.linearRampToValueAtTime(0.0001, t0 + CUT);
      try { ringing.source.stop(t0 + CUT + 0.002); } catch { /* already stopped */ }
    }
    const rate = Math.max(0.25, Math.min(4, semitones((voice.semis ?? 0) + (opts.semis ?? 0))));
    const dur = (loaded.buffer.duration - loaded.offset) / rate;
    const peak = Math.max(0, Math.min(1, voice.volume * (opts.gain ?? 1)));
    const src = ctx.createBufferSource();
    src.buffer = loaded.buffer;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + FADE);
    g.gain.setValueAtTime(peak, t0 + Math.max(FADE + 0.001, dur - FADE));
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    src.connect(g).connect((voice.warm ? this.warmBus() : null) ?? out);
    src.start(t0, loaded.offset);
    src.stop(t0 + dur + 0.01);
    this.ringing = { gain: g, source: src, start: t0, end: t0 + dur, priority: voice.priority };
    return true;
  }

  /** Nothing to restart: the palette has no rotation and no wobble. Kept for the engine's reset. */
  reset(): void {
    /* one fixed take per sound */
  }
}

/** Tests only: forget the shared decoded takes. */
export const clearSharedTakes = (): void => { shared.clear(); done.clear(); };

/** Where a decoded take's sound really starts (skips the MP3 encoder's silent lead-in). */
export const onsetOf = (buffer: AudioBuffer): number => {
  const data = buffer.getChannelData(0);
  const limit = Math.min(data.length, Math.floor(buffer.sampleRate * 0.08));
  for (let i = 0; i < limit; i++) if (Math.abs(data[i]!) > ONSET) return Math.max(0, i - 8) / buffer.sampleRate;
  return 0;
};
