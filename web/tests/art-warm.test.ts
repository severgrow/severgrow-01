// The board's pictures are rasterised once, at setup, at the size they are drawn (ui/art-warm.ts).
//
// Why it has its own test: this is a performance fix that must stay invisible and harmless. It may
// never change what the board draws, never ask for a zero-sized canvas, never decode the same
// picture twice, and never let a refused decode or a missing canvas reach the game.
import { beforeEach, describe, expect, it } from 'vitest';
import { isWarm, resetBoardArtWarm, warmBoardArt, warmCount } from '../src/ui/art-warm.js';

type FakeCanvas = { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D | null };

const drawn: { url: string; w: number; h: number }[] = [];

/** A decode stand-in that records the URL order and can refuse individual pictures. */
const decode = (refuse: (url: string) => boolean = () => false) => (url: string) => {
  if (refuse(url)) return Promise.resolve(null);
  return Promise.resolve({ __url: url } as unknown as CanvasImageSource);
};
const canvas = (allow = true) => (width: number, height: number): FakeCanvas | null => {
  if (!allow) return null;
  const c = { width: 0, height: 0 } as HTMLCanvasElement;
  c.width = width; c.height = height;
  return {
    canvas: c,
    context: { drawImage: (src: unknown) => { drawn.push({ url: (src as { __url: string }).__url, w: c.width, h: c.height }); } } as unknown as CanvasRenderingContext2D,
  };
};

beforeEach(() => {
  resetBoardArtWarm();
  drawn.length = 0;
});

describe('board art warm', () => {
  it('rasterises every picture once, at the drawn size times the device ratio', async () => {
    const urls = ['forest-01.webp', 'forest-02.webp', 'ash-01.webp'];
    const held = await warmBoardArt(urls, { width: 50, height: 44 }, { decode: decode(), canvas: canvas(), ratio: () => 2 });
    expect(held).toBe(3);
    // 50 x 2 = 100 (+1 px of slack so a fractional cell box cannot force a second pass)
    expect(drawn).toEqual([
      { url: 'forest-01.webp', w: 101, h: 89 },
      { url: 'forest-02.webp', w: 101, h: 89 },
      { url: 'ash-01.webp', w: 101, h: 89 },
    ]);
    expect(isWarm('forest-01.webp')).toBe(true);
    expect(warmCount()).toBe(3);
  });

  it('never decodes the same picture twice', async () => {
    const urls = ['forest-01.webp', 'forest-02.webp'];
    await warmBoardArt(urls, { width: 50, height: 44 }, { decode: decode(), canvas: canvas(), ratio: () => 1 });
    const again = await warmBoardArt([...urls, 'forest-03.webp'], { width: 50, height: 44 }, { decode: decode(), canvas: canvas(), ratio: () => 1 });
    expect(again).toBe(3);
    expect(drawn.map((d) => d.url)).toEqual(['forest-01.webp', 'forest-02.webp', 'forest-03.webp']);
  });

  it('keeps the lazy path when a picture cannot be decoded', async () => {
    const held = await warmBoardArt(['good.webp', 'broken.webp'], { width: 50, height: 44 }, {
      decode: decode((url) => url === 'broken.webp'), canvas: canvas(), ratio: () => 1,
    });
    expect(held).toBe(1);
    expect(isWarm('broken.webp')).toBe(false);
  });

  it('keeps the lazy path when the platform refuses a canvas', async () => {
    const held = await warmBoardArt(['a.webp'], { width: 50, height: 44 }, { decode: decode(), canvas: canvas(false), ratio: () => 1 });
    expect(held).toBe(0);
    expect(isWarm('a.webp')).toBe(false);
  });

  it('never rejects, even if a decode throws', async () => {
    const held = await warmBoardArt(['a.webp'], { width: 50, height: 44 }, {
      decode: () => { throw new Error('no decoder'); }, canvas: canvas(), ratio: () => 1,
    });
    expect(held).toBe(0);
  });

  it('asks for a canvas of at least 1px for a hidden, zero-sized board', async () => {
    const held = await warmBoardArt(['a.webp'], { width: 0, height: 0 }, { decode: decode(), canvas: canvas(), ratio: () => 2 });
    expect(held).toBe(1);
    expect(drawn[0]!.w).toBeGreaterThanOrEqual(1);
    expect(drawn[0]!.h).toBeGreaterThanOrEqual(1);
  });

  it('falls back to a ratio of 1 when the page reports none', async () => {
    const original = globalThis.devicePixelRatio;
    Object.defineProperty(globalThis, 'devicePixelRatio', { value: 0, configurable: true });
    try {
      await warmBoardArt(['a.webp'], { width: 10, height: 10 }, { decode: decode(), canvas: canvas() });
      expect(drawn[0]).toMatchObject({ w: 11, h: 11 });
    } finally {
      Object.defineProperty(globalThis, 'devicePixelRatio', { value: original, configurable: true });
    }
  });

  it('ignores an empty URL', async () => {
    const held = await warmBoardArt([''], { width: 10, height: 10 }, {
      decode: () => { throw new Error('an empty URL must never be decoded'); },
      canvas: canvas(), ratio: () => 1,
    });
    expect(held).toBe(0);
  });
});
