// The photo-like grass and lava images (painted in code by logic/photo.ts), turned into
// image URLs once and shared by every board. Painting takes a moment on a phone, so it
// runs in small slices in the background after the page shows; until an image is ready
// the board draws its plain vector look, and listeners are told when all are ready.
import { materialsOf } from '../logic/materials.js';
import { GRASS_VARIANTS, LAVA_VARIANTS, grassImage, lavaImages } from '../logic/photo.js';

/** Pixels per side: sharp at phone size (a tile is about 60 CSS px, x3 on dense screens). */
const SIZE = 176;
// The grass and lava colours are the same in every palette, so one set serves them all.
const COLORS = materialsOf('soil').colors;

const urls = new Map<string, string>();
let state: 'idle' | 'running' | 'ready' | 'unavailable' = 'idle';
const listeners: (() => void)[] = [];

const key = (kind: 'grass' | 'lava', variant: number, level = 0) => `${kind}:${variant}:${level}`;

/** The image for a tile, or null while it is still being painted (or with no canvas). */
export const photoUrl = (kind: 'grass' | 'lava', variant: number, level = 0): string | null => urls.get(key(kind, variant, level)) ?? null;

const toUrl = (px: Uint8ClampedArray): string => {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const x = c.getContext('2d');
  if (!x) throw new Error('no 2d canvas');
  x.putImageData(new ImageData(new Uint8ClampedArray(px), SIZE, SIZE), 0, 0);
  return c.toDataURL('image/png');
};

const jobs = (): (() => void)[] => [
  ...Array.from({ length: LAVA_VARIANTS }, (_, v) => () => lavaImages(SIZE, v, COLORS).forEach((px, lv) => urls.set(key('lava', v, lv), toUrl(px)))),
  ...Array.from({ length: GRASS_VARIANTS }, (_, v) => () => void urls.set(key('grass', v), toUrl(grassImage(SIZE, v, COLORS)))),
];

const done = (ok: boolean) => {
  state = ok ? 'ready' : 'unavailable';
  if (ok) for (const fn of listeners.splice(0)) fn();
};

/** Paints every image in the background (one slice at a time), then tells the listeners. */
export const warmPhotos = () => {
  if (state !== 'idle') return;
  state = 'running';
  const queue = jobs();
  const next = () => {
    const job = queue.shift();
    if (!job) return done(true);
    try {
      job();
    } catch {
      return done(false); // no canvas: the vector look stays
    }
    setTimeout(next, 0);
  };
  setTimeout(next, 30);
};

/** Paints everything right now (the material lab). */
export const warmPhotosNow = () => {
  if (state === 'ready' || state === 'unavailable') return;
  try {
    for (const job of jobs()) job();
    done(true);
  } catch {
    done(false);
  }
};

/** Calls `fn` once all images are ready (straight away if they already are). */
export const onPhotosReady = (fn: () => void) => {
  if (state === 'ready') fn();
  else if (state !== 'unavailable') listeners.push(fn);
};
