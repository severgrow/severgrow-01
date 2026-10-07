// The skin's runtime files for ONE tier at a time. The runtime manifest (`<root>/manifest.json`,
// written by `npm run skin:manifest`) lists what each tier really has, so a missing file is never
// requested (no 404s): the renderer falls back instead. Switching tier drops every image of the
// old tier (bitmaps closed), so lo and hi are never decoded together.
//
// Freshness: the manifest is always fetched from the network (a unique address, so no cache can
// answer it), and every file is asked for as `file?v=<content hash>`: a changed picture is a new
// address, so a stale copy can never be shown. A file that fails to load is dropped (has() turns
// false) and the renderer falls back: never a broken-image icon. preload() decodes a whole set up
// front, so a tile placed later shows its art at once.
import type { SkinDef, Tier } from './types.js';

type Manifest = { version?: string; tiers: Record<Tier, string[]>; hash?: Partial<Record<Tier, Record<string, string>>> };
const manifests = new Map<string, Promise<Manifest | null>>();

const loadManifest = (root: string) => {
  let m = manifests.get(root);
  if (!m) {
    m = fetch(`${root}/manifest.json?r=${Date.now().toString(36)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
      .catch(() => null);
    manifests.set(root, m);
  }
  return m;
};

/** A greyscale mask turned into alpha (white = 1), or its inverse. */
const toAlpha = (img: CanvasImageSource & { width: number; height: number }, invert: boolean) => {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = d.data[i]!;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = 255;
    d.data[i + 3] = invert ? 255 - v : v;
  }
  g.putImageData(d, 0, 0);
  return c;
};

export class SkinAssets {
  tier: Tier | null = null;
  private files = new Set<string>();
  private hashes: Record<string, string> = {};
  /** in-memory copies (blob: URLs) of loaded files: the board draws from these, no network */
  private blobs = new Map<string, string>();
  /** files of this tier that failed to load (treated as missing) */
  private bad = new Set<string>();
  private images = new Map<string, Promise<ImageBitmap | HTMLImageElement | null>>();
  private masks = new Map<string, Promise<HTMLCanvasElement | null>>();
  private jsons = new Map<string, Promise<unknown>>();
  private loading: Promise<void> | null = null;
  private loadingTier: Tier | null = null;

  constructor(readonly skin: SkinDef) {}

  /** Switches to a tier (resolves when its manifest is in); the old tier's images are released. */
  setTier(t: Tier): Promise<void> {
    if (t === this.tier && !this.loading) return Promise.resolve();
    if (t === this.loadingTier && this.loading) return this.loading;
    this.loadingTier = t;
    this.loading = loadManifest(this.skin.root).then((m) => {
      if (this.loadingTier !== t) return;
      this.release();
      this.tier = t;
      this.files = new Set(m?.tiers?.[t] ?? []);
      this.hashes = m?.hash?.[t] ?? {};
      this.bad = new Set();
      this.loading = null;
      this.loadingTier = null;
    });
    return this.loading;
  }

  private release() {
    for (const p of this.images.values()) void p.then((b) => (b && 'close' in b ? b.close() : undefined));
    for (const u of this.blobs.values()) URL.revokeObjectURL(u);
    this.blobs.clear();
    this.images.clear();
    this.masks.clear();
    this.jsons.clear();
  }

  /** Every image this tier has under a folder (prefix), sorted. */
  list(prefix: string): string[] {
    return [...this.files].filter((f) => f.startsWith(prefix) && !this.bad.has(f) && /\.(png|webp|avif|jpe?g)$/i.test(f)).sort();
  }

  has(path: string | undefined): path is string {
    return !!path && this.files.has(path) && !this.bad.has(path);
  }
  /** Where to draw a file from: its in-memory copy once loaded, else its content-addressed URL. */
  url(path: string) {
    const b = this.blobs.get(path);
    if (b) return b;
    return this.net(path);
  }
  private net(path: string) {
    const v = this.hashes[path];
    return `${this.skin.root}/${this.tier}/${path}${v ? `?v=${v}` : ''}`;
  }

  /**
   * Downloads and decodes every image of this tier under these folders (a few at a time), so
   * art drawn later appears at once. Files that fail are marked missing. Resolves when all are
   * settled, or after `maxMs` (the rest keep loading in the background).
   */
  preload(prefixes: string[], maxMs = 8000): Promise<void> {
    const tier = this.tier;
    const priority = (file: string) => prefixes.findIndex(prefix => file.startsWith(prefix));
    const todo = [...this.files].filter((f) => priority(f) >= 0 && /\.(png|webp|avif|jpe?g)$/i.test(f))
      .sort((a, b) => priority(a) - priority(b));
    let i = 0;
    const worker = async () => {
      while (i < todo.length && this.tier === tier) await this.image(todo[i++]);
    };
    const all = Promise.all(Array.from({ length: 6 }, worker)).then(() => undefined);
    return Promise.race([all, new Promise<void>((r) => setTimeout(r, maxMs))]);
  }

  /** A decoded image of this tier, or null when the file is missing or broken. */
  image(path: string | undefined): Promise<ImageBitmap | HTMLImageElement | null> {
    if (!this.has(path)) return Promise.resolve(null);
    let p = this.images.get(path);
    if (!p) {
      const tier = this.tier;
      const img = new Image();
      img.decoding = 'async';
      p = fetch(this.net(path))
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
        .then((blob) => {
          const u = URL.createObjectURL(blob);
          if (this.tier === tier) this.blobs.set(path, u);
          img.src = u;
          return img.decode();
        })
        .then(() => (typeof createImageBitmap === 'function' ? createImageBitmap(img).catch(() => img) : img))
        .catch(() => {
          if (this.tier === tier) this.bad.add(path);
          return null;
        });
      this.images.set(path, p);
    }
    return p;
  }

  /** A greyscale mask as an alpha canvas (`invert`: black = 1). */
  mask(path: string, invert = false): Promise<HTMLCanvasElement | null> {
    const k = `${path}|${invert}`;
    let p = this.masks.get(k);
    if (!p) {
      p = this.image(path).then((img) => (img ? toAlpha(img, invert) : null));
      this.masks.set(k, p);
    }
    return p;
  }

  json<T>(path: string): Promise<T | null> {
    if (!this.has(path)) return Promise.resolve(null);
    let p = this.jsons.get(path);
    if (!p) {
      p = fetch(this.url(path))
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      this.jsons.set(path, p);
    }
    return p as Promise<T | null>;
  }
}
