// Screenshots AND measures the film grain, at the densities where it is actually seen.
//
//   BASE=https://www.futasaku.com/ npx tsx scripts/grain-look.ts
//
// Why measure as well as screenshot: "too faint to see" and "still present but subtle" look the same
// in a description and are hard to judge in a downscaled image. The strength is computed as the
// difference between a patch with the film shown and the same patch with it hidden, so the number is
// the grain itself, not the background it sits on. Local sd on a 0-255 luminance scale.
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'https://www.futasaku.com/';
const PATCH = { x: 60, y: 300, width: 200, height: 140 };
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

const shots = [
  { name: 'desktop-1440x900-dpr2', w: 1440, h: 900, dpr: 2 },
  { name: 'phone-390x844-dpr3', w: 390, h: 844, dpr: 3 },
];

for (const s of shots) {
  const context = await browser.newContext({
    viewport: { width: s.w, height: s.h },
    deviceScaleFactor: s.dpr,
    isMobile: s.w < 500,
    hasTouch: s.w < 500,
  });
  const page = await context.newPage();
  // tsx labels named function expressions with a __name helper the page does not have.
  await page.addInitScript(() => {
    (window as unknown as { __name: (f: unknown) => unknown }).__name = (f) => f;
  });
  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => !!document.getElementById('futa04-film-grain'), undefined, { timeout: 20000 });
  await page.waitForTimeout(900);

  const info = await page.evaluate(() => {
    const film = document.getElementById('futa04-film-grain') as HTMLElement;
    const cs = getComputedStyle(film);
    return { size: cs.backgroundSize, opacity: cs.opacity, blend: cs.mixBlendMode, z: cs.zIndex, pointer: cs.pointerEvents, dpr: window.devicePixelRatio };
  });
  console.log(`\n  ${s.name}  dpr=${info.dpr}  size=${info.size}  opacity=${info.opacity}  blend=${info.blend}  pointer=${info.pointer}`);

  const setFilm = async (shown: boolean) => {
    await page.evaluate((v: { shown: boolean }) => {
      (document.getElementById('futa04-film-grain') as HTMLElement).style.display = v.shown ? 'block' : 'none';
    }, { shown });
    await page.waitForTimeout(400);
  };

  await setFilm(false);
  const off = (await page.screenshot({ clip: PATCH })).toString('base64');
  await setFilm(true);
  const on = (await page.screenshot({ clip: PATCH })).toString('base64');

  const sd = await page.evaluate(async (v: { a: string; b: string }) => {
    const load = (b64: string) => new Promise<HTMLImageElement>((res) => {
      const img = new Image();
      img.onload = () => res(img);
      img.src = `data:image/png;base64,${b64}`;
    });
    const [ia, ib] = await Promise.all([load(v.a), load(v.b)]);
    const w = ia.width, h = ia.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(ia, 0, 0);
    const da = ctx.getImageData(0, 0, w, h).data;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(ib, 0, 0);
    const db = ctx.getImageData(0, 0, w, h).data;
    let sum = 0;
    const diff: number[] = [];
    for (let p = 0; p < w * h; p++) {
      const la = 0.2126 * da[p * 4]! + 0.7152 * da[p * 4 + 1]! + 0.0722 * da[p * 4 + 2]!;
      const lb = 0.2126 * db[p * 4]! + 0.7152 * db[p * 4 + 1]! + 0.0722 * db[p * 4 + 2]!;
      diff.push(lb - la);
      sum += lb - la;
    }
    const mean = sum / diff.length;
    let varr = 0;
    for (const d of diff) varr += (d - mean) ** 2;
    return Math.sqrt(varr / diff.length);
  }, { a: off, b: on });

  // For scale: a measured reference from earlier today was sd 3.638 at opacity .16 (DPR2), and the
  // same texture at half the opacity should land near half that, because sd scales with opacity.
  console.log(`    measured grain strength: sd ${sd.toFixed(3)}  (at opacity ${info.opacity})`);
  console.log(`    reference: .16 measured sd 3.638 at DPR2, so .085 should be about ${(3.638 * 0.085 / 0.16).toFixed(2)}`);
  console.log(`    verdict: ${sd < 0.35 ? 'TOO FAINT TO REGISTER - worth raising' : sd < 1.2 ? 'subtle but present (lowkey, as asked)' : 'clearly visible'}`);

  await page.screenshot({ path: `/tmp/grain-${s.name}.png` });
  await page.screenshot({ path: `/tmp/grain-${s.name}-crop.png`, clip: PATCH });
  await context.close();
}
console.log('\n  full screenshots: /tmp/grain-*.png   close crops: /tmp/grain-*-crop.png');
await browser.close();
