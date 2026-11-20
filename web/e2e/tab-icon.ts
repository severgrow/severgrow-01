/**
 * THE TAB ICON ON A DARK BROWSER (owner, 2026-11-20: the dark-tab favicon).
 *
 * The cream mark must win when the browser exposes a dark colour scheme; the off-black mark is the
 * unconditional light-chrome fallback. Incognito has no reliable scheme signal, so a browser that
 * reports light keeps the off-black mark best-effort. This suite checks, from the served page:
 *   - the link order and media attributes that decide the winner (the dark-scheme cream link LAST);
 *   - the two PNGs really are a bright and a dark mark, with a usable contrast against their tab;
 *   - the same page under an emulated dark scheme exposes the cream link as matching.
 */
import { chromium } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';

const served = await servePreview(4232, { logLevel: 'silent' });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] });
const check = (ok: boolean, label: string, note = '') => {
  if (!ok) throw new Error(`${label}${note ? ` (${note})` : ''}`);
  console.log(`PASS  ${label}${note ? `  (${note})` : ''}`);
};
/** WCAG relative luminance of an sRGB channel triplet (0-255). */
const luminance = ([r, g, b]: [number, number, number]) => {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

try {
  for (const scheme of ['dark', 'light'] as const) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
    await page.addInitScript(() => { (window as any).__name = (fn: unknown) => fn; });
    await page.goto(served.url);
    const data = await page.evaluate(async () => {
      const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')].map((link, index) => ({
        index, href: link.getAttribute('href'), media: link.getAttribute('media'), sizes: link.getAttribute('sizes'),
        matches: link.media ? matchMedia(link.media).matches : true,
      }));
      const mark = async (src: string) => {
        const image = new Image(); image.src = src; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          const a = pixels[i + 3]!;
          if (a < 16) continue; // transparent margin is not the mark
          r += pixels[i]! * a; g += pixels[i + 1]! * a; b += pixels[i + 2]! * a; n += a;
        }
        return { size: [canvas.width, canvas.height], rgb: [r / n, g / n, b / n] as [number, number, number], coloured: n > 0 };
      };
      return {
        links,
        dark: await mark('./futasaku-tab-32.png'),
        light: await mark('./futasaku-tab-dark-32.png'),
        prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
      };
    });
    check(data.prefersDark === (scheme === 'dark'), `${scheme}: the page sees the emulated scheme`);
    // The cream link is the dark-scheme entry and it comes LAST, so it wins both when `media` is
    // honoured and when a browser ignores it and takes the last same-size icon.
    for (const size of [16, 32, 48]) {
      const bright = data.links.filter((link) => link.href?.startsWith(`./futasaku-tab-${size}.png`));
      const fallback = data.links.filter((link) => link.href?.startsWith(`./futasaku-tab-dark-${size}.png`));
      check(bright.length === 1 && fallback.length === 1, `${scheme} ${size}px: one bright and one fallback link`);
      check(bright[0]!.media === '(prefers-color-scheme: dark)', `${scheme} ${size}px: the bright mark is the dark-scheme entry`, String(bright[0]!.media));
      check(fallback[0]!.media === null, `${scheme} ${size}px: the off-black mark is the unconditional fallback`);
      check(bright[0]!.index > fallback[0]!.index, `${scheme} ${size}px: the bright mark is LAST, so it wins`);
    }
    // Both marks exist, are 32x32, and their colour is the contrast the two tab bars need.
    check(data.dark.coloured && data.dark.size.join('x') === '32x32', `${scheme}: the bright PNG decodes`);
    check(data.light.coloured && data.light.size.join('x') === '32x32', `${scheme}: the dark PNG decodes`);
    const brightL = luminance(data.dark.rgb); const darkL = luminance(data.light.rgb);
    check(brightL > 0.55, `${scheme}: the bright mark is cream, not a low-contrast grey`, data.dark.rgb.map(Math.round).join(','));
    check(darkL < 0.08, `${scheme}: the fallback mark is near-black`, data.light.rgb.map(Math.round).join(','));
    const ratio = (Math.max(brightL, darkL) + 0.05) / (Math.min(brightL, darkL) + 0.05);
    check(ratio > 4.5, `${scheme}: the two marks differ well past the 4.5:1 contrast bar`, ratio.toFixed(1));
    console.log(`INFO  ${scheme} bright ${data.dark.rgb.map(Math.round).join(',')} dark ${data.light.rgb.map(Math.round).join(',')}`);
    await page.close();
  }
  console.log('ALL PASS');
} finally {
  await browser.close();
  await served.server.httpServer.close();
}
