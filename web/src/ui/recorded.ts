// THE RECORDED SOUNDS (owner, 2026-11-05: "let's do some sound work - 10/10 tactile responsive fun
// and excellent"). 174 takes cut from the owner's own one-take recording (web/public/audio/sfx/),
// and the owner's map of which game moment plays which set (sfx-map.json, from the handover).
//
// How it plays (the handover's own rules):
//   * one AudioContext (ui/sound.ts owns it); every take is fetched and decoded ONCE, after the first
//     tap, the quiet UI takes first so the very next key already has its click;
//   * a moment picks one take of its set, never the same take twice in a row, at its volume, with
//     a small pitch wobble (`pitchJitter`), all from a counter, so a replay sounds the same;
//   * at most 4 copies of one set sound at once (extras are dropped, never queued);
//   * MP3 starts with a short silent gap (encoder padding). Each decoded take remembers where its
//     sound really starts and plays from there, so a tap is heard on the tap, iPhone Safari included.
// Nothing here allocates while playing except one buffer source and one gain per voice.
import MAP from './sfx-map.json';

export type SfxEvent = { sounds: string[]; volume: number; pitchJitter: number; when: string };
export type StabPack = { side: string; grow: string[]; run: string[]; bomb: string; blast: string; recordedGap: number };
/**
 * THE STABS (owner, 2026-11-05, futasaku-sfx-2): short synth stabs stacked on top of the recorded
 * Cut, Bloom, Bomb and Blast. 8 packs; the player draws from its own packs, the opponent from its
 * own, two packs are shared. An action takes one pack for all its notes, never the pack its side used
 * last nor one the other side is ringing. Owner's mix: a bit under the recordings (0.6).
 */
export const STAB_PACKS: Readonly<Record<string, StabPack>> = MAP.stabs.packs as Record<string, StabPack>;
export const PLAYER_PACKS: readonly string[] = MAP.stabs.playerPacks;
export const OPPONENT_PACKS: readonly string[] = MAP.stabs.opponentPacks;
export const STAB_VOLUME = 0.6;
/** A Bloom's notes: up to 4 cards 1,2,3,4; then the run wraps (5+ cards: 1,2,3,4,1,2...). */
export const bloomNote = (i: number): number => (Math.max(0, i) % 4) + 1;
export const SFX_SETS: Readonly<Record<string, readonly string[]>> = MAP.sets;
export const SFX_EVENTS: Readonly<Record<string, SfxEvent>> = MAP.events as Record<string, SfxEvent>;
/** Where the takes are served, relative to the page (works at the root and at /test/). */
export const SFX_FOLDER = 'audio/sfx/';
/** The most copies of one set that may sound at once (the handover's rule). */
export const SET_CAP = 4;
/** Below this the start of a take is the MP3's padding, not the sound. */
const ONSET = 0.004;
/** A short fade in and out on every voice, so a trimmed take never clicks. */
const FADE = 0.004;

/** The order takes are loaded in: what a first tap needs first, the rare big moments last. */
const FIRST: readonly string[] = ['ui_press', 'ui_release', 'ui_clack', 'ui_key', 'ui_dull_click', 'rock_click', 'card_flick', 'tile_land', 'tile_land_opp', 'wood_drop'];

/** Decoded before the first tap (see `warm`): the takes a key press needs. */
const WARM: readonly string[] = ['ui_press', 'ui_release', 'ui_clack', 'ui_dull_click'];

/** A semitone step as a playback rate (`rate = 2^(n/12)`). */
export const semitones = (n: number): number => 2 ** (n / 12);

/** A small deterministic wobble in [1 - spread, 1 + spread] (golden-ratio sequence). */
const wobble = (n: number, spread: number): number => (spread <= 0 ? 1 : 1 + spread * (((n * 0.6180339887) % 1) * 2 - 1));

export type PlayOpts = {
  /** Seconds from now. */
  delay?: number;
  /** Pitch shift in semitones (on top of the moment's own wobble). */
  semis?: number;
  /** Volume multiplier on the moment's own volume. */
  gain?: number;
  /** A fixed take (1-based, as in the file name) instead of a fresh pick. */
  take?: number;
  /** Which of the moment's sets (index into `sounds`); default the first. */
  set?: number;
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

export class RecordedFx {
  private ctx: AudioContext | null = null;
  private out: AudioNode | null = null;
  private readonly buffers = new Map<string, Loaded>();
  private loading = false;
  private counter = 0;
  private readonly last = new Map<string, number>();
  private readonly live = new Map<string, number[]>();
  /** Every file, in load order (tests read it). */
  readonly files: readonly string[];

  constructor(
    private readonly fetchBytes: (url: string) => Promise<ArrayBuffer> = (url) => fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.arrayBuffer();
    }),
    private readonly base: () => string = () => (typeof document === 'undefined' ? '' : new URL(SFX_FOLDER, document.baseURI).href),
  ) {
    const sets = Object.keys(SFX_SETS);
    const ordered = [...FIRST.filter((s) => sets.includes(s)), ...sets.filter((s) => !FIRST.includes(s))];
    const stabs = Object.values(STAB_PACKS).flatMap((p) => [...p.grow, ...p.run, p.bomb, p.blast]);
    this.files = [...ordered.flatMap((s) => SFX_SETS[s] ?? []), ...stabs];
  }

  /** A take's address: the stabs sit beside the effects (audio/stabs/ next to audio/sfx/). */
  private url(file: string): string {
    return this.base() + (file.startsWith('stab_') ? '../stabs/' : '') + file;
  }

  /** Called by the engine once its context exists (after the first tap). Starts loading. */
  attach(ctx: AudioContext, out: AudioNode): void {
    this.ctx = ctx;
    this.out = out;
    // Whatever is decoded already (the warmed key takes) is playable on this very tap.
    for (const file of this.files) {
      const ready = done.get(this.url(file));
      if (ready) this.buffers.set(file, ready);
    }
    if (this.loading) return;
    this.loading = true;
    void this.loadAll();
  }

  /**
   * THE FIRST TAP IS A RECORDING TOO. Before any gesture there is no AudioContext, but an offline
   * context may decode: while the menu is idle, the key takes (press, release, clack, dull click:
   * about 40 KB) are fetched and decoded into the shared cache, so the very first press plays the
   * owner's take instead of the synthesized stand-in. Nothing sounds, nothing else loads.
   */
  warm(): void {
    if (typeof OfflineAudioContext === 'undefined') return;
    let offline: OfflineAudioContext;
    try { offline = new OfflineAudioContext(1, 1, 44100); } catch { return; }
    for (const set of WARM) {
      for (const file of SFX_SETS[set] ?? []) {
        const key = this.base() + file;
        if (shared.has(key)) continue;
        remember(key, this.fetchBytes(key)
          .then((bytes) => offline.decodeAudioData(bytes))
          .then((buffer) => ({ buffer, offset: onsetOf(buffer) }))
          .catch(() => null));
      }
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
        const key = this.url(file);
        let job = shared.get(key);
        if (!job) {
          job = remember(key, this.fetchBytes(key)
            .then((bytes) => ctx.decodeAudioData(bytes))
            .then((buffer) => ({ buffer, offset: onsetOf(buffer) }))
            // a missing take is a quiet moment, never an error
            .catch(() => null));
        }
        const loaded = await job;
        if (loaded) this.buffers.set(file, loaded);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  }

  /** The take a moment plays next: never the one it played last (unless the set has only one). */
  pick(set: string, take?: number): string | null {
    const files = SFX_SETS[set];
    if (!files?.length) return null;
    if (take !== undefined) return files[Math.max(0, Math.min(files.length - 1, take - 1))]!;
    const n = ++this.counter;
    let i = Math.floor(((n * 0.7548776662) % 1) * files.length);
    if (files.length > 1 && i === this.last.get(set)) i = (i + 1) % files.length;
    this.last.set(set, i);
    return files[i]!;
  }

  /** Play one moment from the owner's map. Returns false when it did not sound. */
  play(event: string, opts: PlayOpts = {}): boolean {
    const def = SFX_EVENTS[event];
    if (!def) return false;
    const set = def.sounds[opts.set ?? 0] ?? def.sounds[0]!;
    return this.playSet(set, def.volume * (opts.gain ?? 1), def.pitchJitter, opts);
  }

  /** Play a take of a set directly (for the moments the map leaves open). */
  playSet(set: string, volume: number, jitter: number, opts: PlayOpts = {}): boolean {
    const ctx = this.ctx, out = this.out;
    if (!ctx || !out) return false;
    const file = this.pick(set, opts.take);
    return file ? this.playFile(file, set, volume, jitter, opts) !== null : false;
  }

  /** One decoded file through one source and one gain. Returns when it stops ringing, or null. */
  private playFile(file: string, capKey: string, volume: number, jitter: number, opts: PlayOpts = {}): number | null {
    const ctx = this.ctx, out = this.out;
    if (!ctx || !out) return null;
    const loaded = this.buffers.get(file);
    if (!loaded) return null;
    const set = capKey;
    const now = ctx.currentTime;
    const live = (this.live.get(set) ?? []).filter((end) => end > now);
    if (live.length >= SET_CAP) { this.live.set(set, live); return null; }
    const rate = Math.max(0.25, Math.min(4, semitones(opts.semis ?? 0) * wobble(this.counter * 7 + 3, jitter)));
    const t0 = now + Math.max(0, opts.delay ?? 0);
    const dur = (loaded.buffer.duration - loaded.offset) / rate;
    const peak = Math.max(0, Math.min(1, volume));
    const src = ctx.createBufferSource();
    src.buffer = loaded.buffer;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + FADE);
    g.gain.setValueAtTime(peak, t0 + Math.max(FADE + 0.001, dur - FADE));
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    src.connect(g).connect(out);
    src.start(t0, loaded.offset);
    src.stop(t0 + dur + 0.01);
    live.push(t0 + dur);
    this.live.set(set, live);
    return t0 + dur;
  }

  private readonly lastPack = new Map<boolean, string>();
  private readonly ringing = new Map<string, number>();
  private readonly bloomPack = new Map<boolean, string>();

  /** The pack for a new action of one side (see STAB_PACKS). */
  pickPack(mine: boolean): string {
    const list = mine ? PLAYER_PACKS : OPPONENT_PACKS;
    const now = this.ctx?.currentTime ?? 0;
    const busy = (p: string) => (this.ringing.get(p) ?? 0) > now;
    const last = this.lastPack.get(mine);
    let pool = list.filter((p) => p !== last && !busy(p));
    if (!pool.length) pool = list.filter((p) => p !== last);
    const n = ++this.counter;
    const pack = pool[Math.floor(((n * 0.5698402910) % 1) * pool.length)] ?? list[0]!;
    this.lastPack.set(mine, pack);
    return pack;
  }

  private ring(pack: string, file: string, opts: PlayOpts): boolean {
    const end = this.playFile(file, file, STAB_VOLUME * (opts.gain ?? 1), 0, opts); // max 4 copies of one stab
    if (end === null) return false;
    this.ringing.set(pack, Math.max(this.ringing.get(pack) ?? 0, end));
    return true;
  }

  /** A grow that cuts their territory: one grow note (1-5) of a fresh pack. */
  stabCut(mine: boolean, opts: PlayOpts = {}): boolean {
    const pack = STAB_PACKS[this.pickPack(mine)]!;
    const note = Math.floor(((++this.counter * 0.7548776662) % 1) * pack.grow.length);
    return this.ring(this.lastPack.get(mine)!, pack.grow[note]!, opts);
  }

  /** The Bomb's or the Blast's stab, from a fresh pack. */
  stabHit(kind: 'bomb' | 'blast', mine: boolean, opts: PlayOpts = {}): boolean {
    const name = this.pickPack(mine);
    return this.ring(name, STAB_PACKS[name]![kind], opts);
  }

  /**
   * One note of a Bloom, as its tile lands: run notes 1,2,3,4 (wrapping for 5+ cards) from ONE pack
   * for the whole Bloom; the LAST note plays the grow file of the same number, which has the full tail.
   */
  stabBloom(index: number, total: number, mine: boolean, opts: PlayOpts = {}): boolean {
    if (index === 0 || !this.bloomPack.has(mine)) this.bloomPack.set(mine, this.pickPack(mine));
    const name = this.bloomPack.get(mine)!;
    const pack = STAB_PACKS[name]!;
    const note = bloomNote(index);
    const last = index >= total - 1;
    return this.ring(name, (last ? pack.grow : pack.run)[note - 1]!, opts);
  }

  /** Restart the take counters, so a replay sounds exactly like the first play. */
  reset(): void {
    this.counter = 0;
    this.last.clear();
    this.lastPack.clear();
    this.bloomPack.clear();
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
