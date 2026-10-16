// Measures the grain objectively, and compares the NEW texture against the OLD one.
//
// The grain is isolated as the pixel DIFFERENCE between a screenshot with the film hidden and one with
// it shown - so the measurement is the grain itself, not the background it sits on. Then, for each
// version, from that difference image:
//   sd       - overall strength (how much the grain perturbs the screen)
//   nbr      - mean absolute difference between horizontally adjacent pixels (LOCAL contrast: finer
//              grain has more per-pixel variation)
//   c2 / c4  - autocorrelation at lag 2 and 4 px (BLOCKINESS: an upscaled raster repeats, so its
//              neighbours look alike and these climb)
// A better grain should raise `nbr` relative to `sd` (finer) and lower c2/c4 (less blocky).
//
//   npx tsx scripts/grain-compare.ts
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:8903/';
const DPR = Number(process.env.DPR ?? 2);
const W = 900;
const H = 640;
const PATCH = { x: 60, y: 300, width: 200, height: 140 };

// The NEW texture (from web/src/player/atmosphere.ts) and the OLD one it replaced, verbatim.
/** Build the noise data URI for a given raster size, base frequency and octave count. */
const tileFor = (svgSize: number, bf: number, octaves: number): string =>
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='" + svgSize + "' height='" + svgSize +
  "'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='" + bf + "' numOctaves='" + octaves +
  "' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .75  0 0 0 0 .75  0 0 0 0 .75  0 0 0 1.1 -.42'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E\")";

// The texture being replaced, verbatim: 220px raster shown at 220 CSS px at baseFrequency .55.
const OLD_TILE = tileFor(220, 0.55, 3);

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
const page = await context.newPage();
// tsx/esbuild labels named function expressions with a `__name(...)` helper that does not exist in
// the page, so any evaluate() containing one throws ReferenceError. The e2e suites here use the same
// shim; it is harmless and it makes the helpers below legal.
await page.addInitScript(() => {
  (window as unknown as { __name: (f: unknown) => unknown }).__name = (f) => f;
});
await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(() => !!document.getElementById('futa04-film-grain'), undefined, { timeout: 20000 });
await page.waitForTimeout(700);

/** Override the film to a given texture/opacity/size. */
const setFilm = async (tile: string, opacity: string, size: string) => {
  await page.evaluate((v: { t: string; o: string; s: string }) => {
    const el = document.getElementById('futa04-film-grain') as HTMLElement;
    el.style.backgroundImage = v.t;
    el.style.backgroundSize = v.s;
    el.style.opacity = v.o;
  }, { t: tile, o: opacity, s: size });
  await page.waitForTimeout(450);
};
const hideFilm = async (hidden: boolean) => {
  await page.evaluate((h) => {
    const el = document.getElementById('futa04-film-grain') as HTMLElement;
    el.style.display = h ? 'none' : 'block';
  }, hidden);
  await page.waitForTimeout(450);
};

const shot = async (): Promise<string> => (await page.screenshot({ clip: PATCH })).toString('base64');

// Baseline: no film at all.
await hideFilm(true);
const base = await shot();

const measure = async (tile: string, opacity: string, size: string) => {
  await hideFilm(false);
  await setFilm(tile, opacity, size);
  const withFilm = await shot();
  return page.evaluate(async (v: { a: string; b: string }) => {
    const a = v.a, b = v.b;
    const load = (b64: string) => new Promise<HTMLImageElement>((res) => {
      const img = new Image();
      img.onload = () => res(img);
      img.src = `data:image/png;base64,${b64}`;
    });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const w = ia.width, h = ia.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(ia, 0, 0);
    const da = ctx.getImageData(0, 0, w, h).data;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(ib, 0, 0);
    const db = ctx.getImageData(0, 0, w, h).data;
    // The grain = how the film version differs from the film-less one, in luminance.
    const lum = (d: Uint8ClampedArray, i: number) => 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
    const diff = new Float64Array(w * h);
    for (let p = 0; p < w * h; p++) diff[p] = lum(db, p * 4) - lum(da, p * 4);
    let mean = 0;
    for (let p = 0; p < w * h; p++) mean += diff[p]!;
    mean /= w * h;
    let varr = 0;
    for (let p = 0; p < w * h; p++) varr += (diff[p]! - mean) ** 2;
    const sd = Math.sqrt(varr / (w * h));
    let nbrSum = 0, nbrN = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) { nbrSum += Math.abs(diff[y * w + x + 1]! - diff[y * w + x]!); nbrN++; }
    const nbr = nbrSum / nbrN;
    const auto = (lag: number) => {
      let num = 0, den = 0, n = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w - lag; x++) {
        num += (diff[y * w + x]! - mean) * (diff[y * w + x + lag]! - mean);
        den += (diff[y * w + x]! - mean) ** 2;
        n++;
      }
      return den === 0 ? 0 : num / den;
    };
    return { sd, nbr, c2: auto(2), c4: auto(4), w, h };
  }, { a: base, b: withFilm });
};

console.log(`\ngrain sweep at DPR${DPR} (patch ${PATCH.width}x${PATCH.height} CSS px)`);
console.log('the tile is sized to 1024 DEVICE px, so the raster maps 1:1 and is never upscaled\n');
console.log('  variant                       sd      nbr     nbr/sd   c2      c4');
const oldM = await measure(OLD_TILE, '0.16', '220px 220px');
console.log(`  OLD 220px raster bf .55     ${oldM.sd.toFixed(3)}   ${oldM.nbr.toFixed(3)}   ${(oldM.nbr / oldM.sd).toFixed(3)}    ${oldM.c2.toFixed(3)}   ${oldM.c4.toFixed(3)}`);

// One tile is 1024 device px: 1024/DPR CSS px.
const cssSize = `${(1024 / DPR).toFixed(DPR === 3 ? 2 : 0)}px ${(1024 / DPR).toFixed(DPR === 3 ? 2 : 0)}px`;
const rows: { label: string; m: Awaited<ReturnType<typeof measure>> }[] = [];
for (const bf of [0.5, 0.65, 0.7, 0.8]) {
  for (const oct of [3]) {
    const m = await measure(tileFor(1024, bf, oct), '0.085', cssSize);
    const label = `NEW 1024px raster bf ${bf.toFixed(2)} oct ${oct}`;
    console.log(`  ${label}${' '.repeat(Math.max(0, 34 - label.length))}${m.sd.toFixed(3)}   ${m.nbr.toFixed(3)}   ${(m.nbr / m.sd).toFixed(3)}    ${m.c2.toFixed(3)}   ${m.c4.toFixed(3)}`);
    rows.push({ label, m });
  }
}
// The owner asked for FINER grain and LESS pixelation. Finer = more local variation per unit
// strength (higher nbr/sd). Less pixelated = lower lag-2/lag-4 self-similarity (less blocky).
// CORRECTED CRITERION. The old grain's c4 is NEGATIVE (-0.056), which is not "better" - a negative
// autocorrelation is the signature of a repeating block structure, so comparing c4 directly would
// have pointed the wrong way. Random grain has autocorrelation near ZERO at every lag; block
// structure shows up as a non-zero value (positive within a block, negative across the repeat).
// So: finer means a higher nbr/sd, and not-pixelated means |c2| and |c4| both small.
const better = rows.filter((r) => r.m.nbr / r.m.sd > oldM.nbr / oldM.sd && Math.abs(r.m.c2) < 0.1 && Math.abs(r.m.c4) < 0.1);
better.sort((x, y) => (y.m.nbr / y.m.sd) - (x.m.nbr / x.m.sd));
console.log(`\n  OLD blockiness reference: c2 ${oldM.c2.toFixed(3)} (well above zero = 2px repeats), c4 ${oldM.c4.toFixed(3)} (negative = the block period)`);
console.log(`  variants FINER than old AND without block structure (|c2|,|c4| < 0.1): ${better.length}`);
for (const b of better.slice(0, 3)) console.log(`    ${b.label}  (nbr/sd ${(b.m.nbr / b.m.sd).toFixed(3)} vs ${(oldM.nbr / oldM.sd).toFixed(3)}, c2 ${b.m.c2.toFixed(3)} vs ${oldM.c2.toFixed(3)})`);
console.log(`\n  strength reference: OLD sd ${oldM.sd.toFixed(3)} at opacity .16; every NEW row is opacity .085 (the owner's single uniform value)`);
await browser.close();
