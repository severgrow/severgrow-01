// The skin's runtime files for ONE tier at a time. The runtime manifest (`<root>/manifest.json`,
// written by `npm run skin:manifest`) lists what each tier really has, so a missing file is never
// requested (no 404s): the renderer falls back instead. Switching tier drops every image of the
// old tier (bitmaps closed), so lo and hi are never decoded together.
import type { SkinDef, Tier } from './types.js';

type Manifest = { version?: string; tiers: Record<Tier, string[]> };
const manifests = new Map<string, Promise<Manifest | null>>();

const loadManifest = (root: string) => {
  let m = manifests.get(root);
  if (!m) {
    m = fetch(`${root}/manifest.json`, { cache: 'no-cache' })
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
      this.loading = null;
      this.loadingTier = null;
    });
    return this.loading;
  }

  private release() {
    for (const p of this.images.values()) void p.then((b) => (b && 'close' in b ? b.close() : undefined));
    this.images.clear();
    this.masks.clear();
    this.jsons.clear();
  }

  /** Every image this tier has under a folder (prefix), sorted. */
  list(prefix: string): string[] {
    return [...this.files].filter((f) => f.startsWith(prefix) && /\.(png|webp|avif|jpe?g)$/i.test(f)).sort();
  }

  has(path: string | undefined): path is string {
    return !!path && this.files.has(path);
  }
  url(path: string) {
    return `${this.skin.root}/${this.tier}/${path}`;
  }

  /** A decoded image of this tier, or null when the file is missing or broken. */
  image(path: string | undefined): Promise<ImageBitmap | HTMLImageElement | null> {
    if (!this.has(path)) return Promise.resolve(null);
    let p = this.images.get(path);
    if (!p) {
      const img = new Image();
      img.decoding = 'async';
      img.src = this.url(path);
      p = img
        .decode()
        .then(() => (typeof createImageBitmap === 'function' ? createImageBitmap(img).catch(() => img) : img))
        .catch(() => null);
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
