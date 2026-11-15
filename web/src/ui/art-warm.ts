// DECODE THE BOARD'S PICTURES ONCE, AT SETUP — never in the middle of a move.
//
// The board's ground pictures are per-cell sprites (`ui/forestAsh.ts`): a cell wears one of nine
// Forest or nine Ash variants, so a tile that grows onto a cell shows a picture the page may not
// have drawn before. Measured on a 390x844 Chromium profile (probe: probe/frames-cost.ts, Chrome
// trace around one real tap): the first time a variant is rasterised at the tile's own size, that
// very frame pays `GpuImageDecodeCache::DecodeImage` ~62-68 ms (old build with its 14 pictures:
// ~37-39 ms), on the raster thread, so the tile the player just grew lands late. That is exactly
// the shape of the owner's report ("after tapping the tile it takes way longer to grow"), even
// though the JS and layout that answer the tap are unchanged and fast.
//
// So: after the board's art has decoded, rasterise every picture it can ever draw — once, at the
// size it is really drawn at (cell box x devicePixelRatio) — into offscreen canvases. The browser
// then already holds those exact rasterisations, and a move that reveals a new variant costs its
// animation and nothing else.
//
// Rules kept:
//   * once per page (a Set of URLs), and only after the board exists: never on the menu's path;
//   * it never throws: no canvas, no 2D context, a refused decode or a decode timeout simply
//     leaves the lazy path exactly as it was;
//   * it holds only the rasterisations, and only the ones the board can draw (its own set);
//   * no gameplay, state, timer or render is touched.
export type WarmSize = { width: number; height: number };

export type WarmDeps = {
  /** Build an image element; resolved with a decoded one or null. */
  readonly decode?: (url: string) => Promise<CanvasImageSource | null>;
  /** A canvas of this pixel size, or null when the platform refuses one. */
  readonly canvas?: (width: number, height: number) => { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D | null } | null;
  /** The device pixel ratio the board is rasterised at. */
  readonly ratio?: () => number;
};

/** Everything warmed on this page, held so the browser keeps the rasterisations. */
const kept: HTMLCanvasElement[] = [];
const warmed = new Set<string>();
let running = false;

/** True once a URL's picture has been rasterised at the board's own size. */
export const isWarm = (url: string): boolean => warmed.has(url);

/** How many rasterisations this page holds (tests/diagnostics). */
export const warmCount = (): number => kept.length;

const defaultDecode = async (url: string): Promise<CanvasImageSource | null> => {
  if (typeof Image === 'undefined') return null;
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try {
    if (typeof img.decode === 'function') await img.decode();
    return img.complete && img.naturalWidth > 0 ? img : null;
  } catch {
    return null;
  }
};

const defaultCanvas = (width: number, height: number) => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return { canvas, context: canvas.getContext('2d') };
};

/**
 * Rasterise each picture once at `size` (CSS px) times the device ratio. Resolves to how many are
 * held after this call; never rejects. Cheap to call again: only unseen URLs are decoded.
 */
export const warmBoardArt = async (urls: readonly string[], size: WarmSize, deps: WarmDeps = {}): Promise<number> => {
  if (running) return kept.length;
  running = true;
  try {
    const decode = deps.decode ?? defaultDecode;
    const makeCanvas = deps.canvas ?? defaultCanvas;
    const ratio = deps.ratio ? deps.ratio() : (typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1);
    // One pixel of slack: a fractional cell box (a scaled camera) must never force a second
    // rasterisation of the same picture at 1px more.
    const width = Math.ceil(Math.max(1, size.width) * ratio) + 1;
    const height = Math.ceil(Math.max(1, size.height) * ratio) + 1;
    for (const url of urls) {
      if (!url || warmed.has(url)) continue;
      const source = await decode(url);
      if (!source) continue;
      const made = makeCanvas(width, height);
      if (!made?.context) continue;
      try {
        made.context.drawImage(source, 0, 0, made.canvas.width, made.canvas.height);
      } catch {
        continue; // a picture that cannot be drawn keeps the lazy path
      }
      warmed.add(url);
      kept.push(made.canvas);
    }
  } catch {
    /* warming is an optimisation: it can never break the board */
  } finally {
    running = false;
  }
  return kept.length;
};

/** Tests only: forget what has been warmed. */
export const resetBoardArtWarm = (): void => {
  warmed.clear();
  kept.length = 0;
  running = false;
};
