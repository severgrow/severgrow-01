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
  // The board's pictures are asked for once the app is ready or a board is drawn, no longer at
  // module load (2026-11-16, web/tests/board-art-deferred.test.ts): start them as a board would.
  mod.preloadBoardArt();
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
  //
  // Since 2026-11-15 the board draws the GROUND copy of the background (its colour strength baked
  // in, ui/forestAsh.ts) instead of the saturated picture through a per-cell filter, so that is the
  // picture this asserts. The saturated file is still exported for the world colour chips.
  it('requests the board ground it paints, so a failed one is dropped too', async () => {
    const mod = await importModule(() => true);
    const ash = await import('../src/ui/forestAsh.js');
    const bg = ash.faGroundUrl();
    expect(bg).toBeTruthy();
    expect(record.asked).toContain(bg);
    expect(mod.artUnavailable(bg ?? undefined)).toBe(true);
    expect(record.removed).toContain(bg);
    // The saturated paintings stay for the UI that still shows them (skin chooser, world chips).
    expect(ash.faBackgroundUrl()).toBeTruthy();
    expect(ash.faBackgroundUrl()).not.toBe(bg);
  });
});

// NO BROWSER PLACEHOLDER, EVER (owner, 2026-11-15). `artUnavailable()` only protects the pictures a
// module remembers to ask about. The page has painters that never ask — the gold-frame atlas, the
// strength-stone atlas, a card over a Blast, a menu mark — and on a stale shell every one of their
// files is gone, which is how the owner got a page full of WebKit's blue "?" tiles. The rule is now
// enforced where the failure lands: the element that failed leaves the page before it can be painted.
type FakeEl = {
  localName: string;
  nodeType: number;
  removed: boolean;
  complete?: boolean;
  naturalWidth?: number;
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
  remove: () => void;
};

const fakeEl = (localName: string, attrs: Record<string, string | number> = {}): FakeEl => {
  const map = new Map<string, string>(Object.entries(attrs).map(([k, v]) => [k, String(v)]));
  const el: FakeEl = {
    localName,
    nodeType: 1,
    removed: false,
    getAttribute: (name) => map.get(name) ?? null,
    setAttribute: (name, value) => { map.set(name, value); },
    removeAttribute: (name) => { map.delete(name); },
    remove: () => { el.removed = true; },
  };
  return el;
};

/** A document and a window that can be handed a resource error, as the browser does. */
const installPage = (nodes: FakeEl[]) => {
  vi.stubGlobal('document', {
    querySelectorAll: (selector: string) => (selector === 'svg image'
      ? nodes.filter((node) => node.localName === 'image')
      : nodes.filter((node) => node.localName === 'image' || node.localName === 'img')),
  });
  const listeners: Array<(event: Event) => void> = [];
  vi.stubGlobal('window', {
    addEventListener: (type: string, cb: (event: Event) => void, capture: boolean) => {
      if (type === 'error' && capture) listeners.push(cb);
    },
  });
  return (target: unknown) => {
    for (const cb of listeners) cb({ target } as unknown as Event);
  };
};

describe('a picture the page did not ask about', () => {
  beforeEach(() => {
    vi.resetModules();
    // Intact files unless a test says otherwise: the guard must not touch art that loads.
    vi.stubGlobal('Image', class extends FakeImage { constructor() { super(() => false); } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('takes the failed <image> out of the page, so WebKit has nothing to draw a placeholder over', async () => {
    const stale = fakeEl('image', { href: '/assets/gone-1a2b.webp', width: 100, height: 100 });
    const fire = installPage([stale]);
    const mod = await import('../src/ui/defaultArtBoard.js');
    fire(stale);
    expect(stale.removed).toBe(true);
    expect(mod.artUnavailable('/assets/gone-1a2b.webp')).toBe(true);
  });

  it('clears a failed <img> but keeps its box (the layout is not ours to change)', async () => {
    const lost = fakeEl('img', { src: '/assets/card-gone.webp', width: 120, height: 160 });
    const fire = installPage([lost]);
    await import('../src/ui/defaultArtBoard.js');
    fire(lost);
    expect(lost.getAttribute('src')).toBeNull();
    expect(lost.removed).toBe(false);
    expect(lost.getAttribute('data-art-missing')).toBe('');
  });

  it('leaves a picture that loaded, and anything that is not a picture, alone', async () => {
    const good = fakeEl('image', { href: '/assets/fine.webp' });
    const script = fakeEl('script', { src: '/assets/index-abc.js' });
    const fire = installPage([good, script]);
    await import('../src/ui/defaultArtBoard.js');
    fire(script);
    expect(script.removed).toBe(false);
    expect(good.removed).toBe(false);
    expect(good.getAttribute('href')).toBe('/assets/fine.webp');
  });

  it('sweeps a picture that was already broken before the board module loaded', async () => {
    const early = fakeEl('img', { src: '/assets/menu-gone.webp' });
    early.complete = true;
    early.naturalWidth = 0;
    installPage([early]);
    const mod = await import('../src/ui/defaultArtBoard.js');
    expect(early.getAttribute('src')).toBeNull();
    expect(mod.artUnavailable('/assets/menu-gone.webp')).toBe(true);
  });
});
