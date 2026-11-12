// The home-screen app opens on charcoal, never iOS's white launch screen (owner, 2026-11-06).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { splashImages } from '../src/logic/splash.js';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const html = readFileSync(at('../index.html'), 'utf8');
const pngSize = (b: Buffer): [number, number] => [b.readUInt32BE(16), b.readUInt32BE(20)];

describe('home-screen launch screen', () => {
  const images = splashImages();
  it('every modern iPhone and iPad size, both orientations', () => {
    expect(images.length).toBe(40);
    expect(images.some((i) => i.px[0] === 1179 && i.px[1] === 2556)).toBe(true); // iPhone 15/16
    expect(images.some((i) => i.px[0] === 1320 && i.px[1] === 2868)).toBe(true); // iPhone 17 Pro Max
  });
  it('index.html names each image with its exact media query, in <head>', () => {
    const head = html.slice(0, html.indexOf('</head>'));
    for (const i of images) expect(head).toContain(`<link rel="apple-touch-startup-image" media="${i.media}" href="./${i.file}" />`);
  });
  it('each image exists at its exact pixel size and is plain charcoal (#0e0f10), and is small', () => {
    for (const i of images) {
      const p = at(`../public/${i.file}`);
      expect(existsSync(p), i.file).toBe(true);
      const b = readFileSync(p);
      expect(pngSize(b)).toEqual(i.px);
      expect(b.length).toBeLessThan(40_000);
    }
  });
});
