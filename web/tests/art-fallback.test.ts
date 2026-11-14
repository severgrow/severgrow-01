// The board must never draw a picture that failed to load.
//
// iPhone Safari paints its OWN "broken image" placeholder over an `<image>` whose file did not
// load: a light-blue tile with a white question mark, drawn at the image's box and rotated with
// the tile it replaced. That is exactly what the owner saw on the board (2026-10-14). The same
// rule the skin loader already follows applies here: a file that fails is dropped, the renderer
// falls back to the look it has before its art arrives (a flat territory tile), and nothing is
// left for the browser to draw a placeholder over.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Minimal HTMLImageElement stand-in: a synchronous `load`/`error` event on `src`. */
type Handler = (event: Event) => void;

const record = { asked: [] as string[], removed: [] as string[] };

class FakeImage {
  decoding = '';
  private handlers = new Map<string, Handler[]>();
  private url = '';

  constructor(private readonly fails: (url: string) => boolean) {}

  addEventListener(type: string, cb: Handler): void {
    const list = this.handlers.get(type) ?? [];
    list.push(cb);
    this.handlers.set(type, list);
  }
  removeEventListener(): void { /* nothing to undo in the stand-in */ }
  decode(): Promise<void> { return Promise.resolve(); }

  get src(): string { return this.url; }
  set src(value: string) {
    this.url = value;
    record.asked.push(value);
    this.dispatch(this.fails(value) ? 'error' : 'load');
  }
  private dispatch(type: string): void {
    for (const cb of this.handlers.get(type) ?? []) cb(new Event(type));
  }
}

/** Enough of a document for the board's "take the failed picture back out" step. */
const installDocument = (): void => {
  const images = (): Array<{ getAttribute: (n: string) => string | null; remove: () => void }> =>
    record.asked.slice(-1).map((href) => ({
      getAttribute: (name: string) => (name === 'href' ? href : null),
      remove: () => record.removed.push(href),
    }));
  vi.stubGlobal('document', { querySelectorAll: () => images() });
};

const importModule = async (fails: (url: string) => boolean) => {
  vi.stubGlobal('Image', class extends FakeImage { constructor() { super(fails); } });
  const mod = await import('../src/ui/defaultArtBoard.js');
  return mod;
};

describe('board art that fails to load', () => {
  beforeEach(() => {
    record.asked = [];
    record.removed = [];
    vi.resetModules();
    installDocument();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is dropped, so no broken-image placeholder can be painted', async () => {
    const mod = await importModule(() => true);
    expect(record.asked.length).toBeGreaterThan(0);
    for (const url of record.asked) expect(mod.artUnavailable(url)).toBe(true);
    // An `<image>` already drawn for that file is taken back out of the board.
    expect(record.removed.length).toBeGreaterThan(0);
    expect(record.asked).toContain(record.removed[0]);
  });

  it('leaves art that loaded on the board', async () => {
    const mod = await importModule(() => false);
    expect(record.asked.length).toBeGreaterThan(0);
    for (const url of record.asked) expect(mod.artUnavailable(url)).toBe(false);
    expect(record.removed).toEqual([]);
  });

  it('does not treat a URL it never asked for as missing (art still loading is drawn)', async () => {
    const mod = await importModule(() => true);
    expect(mod.artUnavailable('/assets/never-requested.webp')).toBe(false);
    expect(mod.artUnavailable(undefined)).toBe(false);
  });

  // The painted board background used to be the one picture the board drew without asking for it
  // (FA_ALL_URLS never held `bg-*`), so `artUnavailable(bg)` could never be true and a 404 painted a
  // broken-image tile on all 37 cells. It is requested now, like every other picture.
  it('requests the board background it paints, so a failed one is dropped too', async () => {
    const mod = await importModule(() => true);
    const ash = await import('../src/ui/forestAsh.js');
    const bg = ash.faBackgroundUrl();
    expect(bg).toBeTruthy();
    expect(record.asked).toContain(bg);
    expect(mod.artUnavailable(bg ?? undefined)).toBe(true);
    expect(record.removed).toContain(bg);
  });
});
