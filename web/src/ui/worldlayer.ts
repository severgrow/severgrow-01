// Material pass 2: the material layer as one world-space picture of the whole board, shown
// through an SVG pattern that every moss and lava tile is filled with, so the texture runs on
// from tile to tile. Painted once, then only the areas that changed (a tile placed, replaced,
// strengthened or cut off) are repainted, in small slices so a frame is never held up. When
// a repaint lands, the tiles that changed cross-fade from their old look to the new one.
import { paintRect, rectFor } from '../logic/worldpaint.js';
import type { PaintTile, Rect } from '../logic/worldpaint.js';
import type { ThemeId } from '../logic/themes.js';
import { BLEND, S } from '../logic/vigour.js';
import { el } from './geom.js';

type Box = { x0: number; y0: number; w: number; h: number };
const same = (a: PaintTile | undefined, b: PaintTile | undefined) => !!a && !!b && a.owner === b.owner && Math.abs(a.t - b.t) < 1e-6 && !!a.dead === !!b.dead && !!a.root === !!b.root;
/** How far a tile's look reaches into its neighbours, board units (see sync). */
export const REACH = BLEND / 2 + S * 0.4 + 1;
/** Canvas rows per slice of work (about 10k pixels: a few ms). */
const BAND_PX = 16;
/** A full paint taking longer than this (work only) switches the layer to Low detail. */
export const SLOW_FULL_MS = 2500;

export class WorldLayer {
  private canvas: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private image: SVGImageElement;
  private prevImage: SVGImageElement;
  private tiles = new Map<string, PaintTile>();
  private queue: Rect[] = [];
  private changed = new Set<string>();
  private running = false;
  private url: string | null = null;
  private palette: ThemeId = 'soil';
  private detail: 'low' | 'normal' = 'normal';
  /** ms the last full repaint took (for the performance report) */
  lastPaintMs = 0;
  /** for the performance report: how long each full and each partial repaint took (ms, work only) */
  readonly stats = { full: [] as number[], partial: [] as number[], canvasBytes: 0 };
  private fullPending = false;
  /** set when a full paint was too slow on this device: from then on, Low detail */
  slowDevice = false;
  private workMs = 0;
  /** called when new pixels are on screen, with the hexes that changed (for the cross-fade) */
  onSwap: (keys: string[]) => void = () => {};
  /** called once, when the first picture is ready (the board redraws its tiles with it) */
  onFirst: () => void = () => {};

  constructor(
    defs: SVGDefsElement,
    readonly patternId: string,
    readonly prevId: string,
    private box: Box,
    private scale: number,
  ) {
    const mk = (id: string) => {
      const p = el('pattern', { id, patternUnits: 'userSpaceOnUse', x: box.x0, y: box.y0, width: box.w, height: box.h }, defs);
      // (inside a pattern, positions count from the pattern's own corner)
      return el('image', { x: 0, y: 0, width: box.w, height: box.h, preserveAspectRatio: 'none' }, p);
    };
    this.image = mk(patternId);
    this.prevImage = mk(prevId);
    try {
      const c = document.createElement('canvas');
      c.width = Math.ceil(box.w * scale);
      c.height = Math.ceil(box.h * scale);
      const g = c.getContext('2d');
      if (g) {
        this.canvas = c;
        this.stats.canvasBytes = c.width * c.height * 4;
        this.g = g;
      }
    } catch {
      /* no canvas (tests): tiles keep their plain fill */
    }
  }

  get ready(): boolean {
    return this.url !== null;
  }

  /** The tiles to show now; repaints whatever differs from last time (and the blend band around it). */
  sync(tiles: ReadonlyMap<string, PaintTile>, palette: ThemeId, detail: 'low' | 'normal') {
    if (!this.g) return;
    if (this.slowDevice) detail = 'low';
    const full = palette !== this.palette || detail !== this.detail || this.url === null;
    this.palette = palette;
    this.detail = detail;
    // Only the changed tiles are repainted, with a margin that covers everything they can
    // affect in their neighbours: the blend band (BLEND / 2) plus the longest root or blade
    // anchored inside it (0.4 of a tile). Outside that, every pixel is exactly as before.
    const changed: string[] = [];
    const keys = new Set([...tiles.keys(), ...this.tiles.keys()]);
    for (const k of keys) if (full || !same(tiles.get(k), this.tiles.get(k))) changed.push(k);
    this.tiles = new Map(tiles);
    if (changed.length === 0) return;
    if (full) {
      this.fullPending = true;
      this.queueBands({ x0: this.box.x0, y0: this.box.y0, w: this.box.w, h: this.box.h });
    } else {
      for (const k of changed) this.changed.add(k);
      // one box around all of them when they sit close together (a cut chain), else one each
      const one = rectFor(changed, 1, REACH);
      const each = changed.map((k) => rectFor([k], 1, REACH));
      const area = (x: Rect) => x.w * x.h;
      for (const x of area(one) <= each.reduce((s, e) => s + area(e), 0) ? [one] : each) this.queueBands(x);
    }
    this.pump();
  }

  /** Queues a world box as thin bands of canvas rows, so no single slice holds up a frame. */
  private queueBands(b: Box) {
    const band = BAND_PX / this.scale;
    for (let y = 0; y < b.h; y += band) this.queue.push(this.snap({ x0: b.x0, y0: b.y0 + y, w: b.w, h: Math.min(band, b.h - y) }));
  }

  /** Snaps a world box to whole canvas pixels. */
  private snap(b: Box): Rect {
    const px0 = Math.floor((b.x0 - this.box.x0) * this.scale);
    const py0 = Math.floor((b.y0 - this.box.y0) * this.scale);
    const px1 = Math.ceil((b.x0 + b.w - this.box.x0) * this.scale);
    const py1 = Math.ceil((b.y0 + b.h - this.box.y0) * this.scale);
    return { x0: this.box.x0 + px0 / this.scale, y0: this.box.y0 + py0 / this.scale, w: px1 - px0, h: py1 - py0, scale: this.scale };
  }

  private pump() {
    if (this.running) return;
    this.running = true;
    this.workMs = 0;
    const step = () => {
      const r = this.queue.shift();
      if (!r) {
        this.running = false;
        this.lastPaintMs = this.workMs;
        (this.fullPending ? this.stats.full : this.stats.partial).push(Math.round(this.workMs * 10) / 10);
        // the Low fallback: a slow device gets the lighter texture (fewer blades, no flowers
        // or roots) from the next repaint on
        if (this.fullPending && this.detail === 'normal' && this.workMs > SLOW_FULL_MS) {
          this.slowDevice = true;
          this.fullPending = false;
          this.publish();
          this.sync(this.tiles, this.palette, 'low');
          return;
        }
        this.fullPending = false;
        this.publish();
        return;
      }
      const s = this.snap({ x0: r.x0, y0: r.y0, w: r.w / r.scale, h: r.h / r.scale });
      const px = Math.round((s.x0 - this.box.x0) * this.scale);
      const py = Math.round((s.y0 - this.box.y0) * this.scale);
      const w = Math.min(s.w, this.canvas!.width - px);
      const h = Math.min(s.h, this.canvas!.height - py);
      const t0 = performance.now();
      if (w > 0 && h > 0) {
        const data = paintRect({ tiles: this.tiles, palette: this.palette, detail: this.detail }, { ...s, w, h });
        this.g!.putImageData(new ImageData(new Uint8ClampedArray(data), w, h), Math.max(0, px), Math.max(0, py));
      }
      this.workMs += performance.now() - t0;
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
  }

  /** Swaps the new pixels in (the old picture stays as the "previous" pattern for a cross-fade). */
  private publish() {
    const land = (next: string, revoke: boolean) => {
      const old = this.url;
      if (old) this.prevImage.setAttribute('href', old);
      this.image.setAttribute('href', next);
      this.url = next;
      const keys = [...this.changed];
      this.changed.clear();
      if (!old) this.onFirst();
      else this.onSwap(keys);
      // free the old picture once the cross-fade is over
      if (old && revoke && old.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(old), 1500);
    };
    // Some browsers (iPhone Safari with a large canvas) hand back no blob: fall back to a data URL,
    // so the material still appears instead of the board quietly keeping the older tile look.
    const viaDataUrl = () => {
      try {
        land(this.canvas!.toDataURL('image/png'), false);
      } catch {
        /* no picture: tiles keep their plain look */
      }
    };
    try {
      this.canvas!.toBlob((blob) => (blob ? land(URL.createObjectURL(blob), true) : viaDataUrl()));
    } catch {
      viaDataUrl();
    }
  }
}
