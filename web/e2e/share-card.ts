// THE SHARE CARD, EXPORTED FOR THE OWNER'S PICK (owner brief, 2026-11-12): a 1080x1350 picture for
// Instagram 4:5 / a phone gallery. Two or three LAYOUTS, each a real exported image — this script
// runs the REAL drawing path (`ui/sharecard.ts` `drawShareCard`, the same function the Share key
// calls) in Chromium and writes the PNGs outside the repo for the owner to review.
//
//   npx tsx web/e2e/share-card.ts            # writes /tmp/sharpen-share/layout-{a,b,c}.png (+ checks)
//
// THE SKY IS THE GAME'S SKY: the card draws it with `SphereRenderer.sky()`, the shader the menu and
// the board already use. THE CANVAS IS NATIVE: 1080x1350, vector edges and text at 1:1, the sky
// copied at 1:1 — nothing is a smaller bitmap scaled up. The script measures an edge to prove it.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { allCoords, coordKey } from '../../src/engine/index.js';
import type { Player, Tile } from '../../src/engine/index.js';
import { RESULT } from '../../src/strings.js';
import { SHARE_H, SHARE_W, SHARE_LAYOUTS } from '../src/logic/share.js';
import type { ShareData, ShareLayoutId } from '../src/logic/share.js';

const OUT = process.env.SHARE_OUT ?? '/tmp/sharpen-share';
const PORT = Number(process.env.PORT ?? 5199);

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

mkdirSync(OUT, { recursive: true });

const axial = (a: { q: number; r: number }, b: { q: number; r: number }) =>
  (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

/** A real-looking finished board: the player's green holding west of centre, the rival's east. */
const board = (): Record<string, Tile | null> => {
  const out: Record<string, Tile | null> = {};
  for (const c of allCoords(4)) {
    const key = coordKey(c);
    if (axial(c, { q: -1, r: 0 }) <= 2) {
      out[key] = { owner: 0 as Player, strength: 1 + ((c.q * 3 + c.r * 5 + 9) % 9), ...(c.q === -1 && c.r === 0 ? { root: true } : {}) };
    } else if (axial(c, { q: 2, r: -1 }) <= 1) {
      out[key] = { owner: 1 as Player, strength: 1 + ((c.q + c.r + 7) % 9), ...(c.q === 2 && c.r === -1 ? { root: true } : {}) };
    } else {
      out[key] = null;
    }
  }
  return out;
};

const base = (o: Partial<ShareData> = {}): ShareData => ({
  game: 'Futasaku',
  title: RESULT.won,
  sub: 'vs WillowBirch',
  score: [24, 17],
  highlights: [],
  board: board(),
  radius: 4,
  me: 0,
  names: ['You', 'WillowBirch'],
  ...o,
});

/** The cards the owner asked to be checked: a win, a LOSS, a DRAW, and a very long name. */
const VARIANTS: readonly { suffix: string; data: ShareData }[] = [
  { suffix: '', data: base() },
  { suffix: '-loss', data: base({ title: RESULT.lost, score: [9, 21] }) },
  { suffix: '-draw', data: base({ title: RESULT.draw, score: [16, 16] }) },
  { suffix: '-long', data: base({ names: ['RYKTHEMAGNIFICENT', 'BartholomewQuicksilver'] }) },
];

const server = await createServer({ configFile: 'web/vite.config.ts', server: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
const origin = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? `http://127.0.0.1:${PORT}`;

const browser = await chromium.launch(process.env.PW_CHROMIUM
  ? { executablePath: process.env.PW_CHROMIUM }
  : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

try {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
  // The card uses the product's faces and its CSS tokens: wait for both.
  await page.evaluate(async () => {
    const fonts = (document as Document & { fonts: FontFaceSet }).fonts;
    await Promise.all([fonts.load('600 46px "Fragment Mono"'), fonts.load('400 32px "Besley"')]).catch(() => undefined);
    await fonts.ready;
  });

  /** Render one card through the REAL export path and hand back the PNG plus its measurements. */
  const render = async (data: ShareData, layout: ShareLayoutId): Promise<{
    png: string; width: number; height: number; maxJump: number; over40: number;
    meanLuma: number; stars: number; green: number; ember: number; creamMark: number; crop: string;
  }> => page.evaluate(`(async (args) => {
    const m = await import('/src/ui/sharecard.ts');
    // The export path itself (shareCard() calls exactly this, then toBlob).
    const canvas = m.drawShareCard(args.data, args.layout);
    const png = canvas.toDataURL('image/png');
    // EDGE MEASUREMENT: a horizontal line through the planet. A native vector edge steps by a lot
    // in one or two pixels; an upscaled bitmap would spread the same step over several.
    const ctx = canvas.getContext('2d');
    const y = Math.round(canvas.height * 0.66);
    const row = ctx.getImageData(0, y, canvas.width, 1).data;
    let maxJump = 0, over40 = 0;
    for (let x = 1; x < canvas.width; x++) {
      const a = row[(x - 1) * 4] * 0.3 + row[(x - 1) * 4 + 1] * 0.59 + row[(x - 1) * 4 + 2] * 0.11;
      const b = row[x * 4] * 0.3 + row[x * 4 + 1] * 0.59 + row[x * 4 + 2] * 0.11;
      const jump = Math.abs(b - a);
      if (jump > maxJump) maxJump = jump;
      if (jump > 40) over40++;
    }
    // A 1:1 crop of the planet's rim, so the owner can inspect the tile and text edges by eye.
    const crop = document.createElement('canvas');
    crop.width = 240; crop.height = 240;
    crop.getContext('2d').drawImage(canvas, Math.round(canvas.width * 0.3), Math.round(canvas.height * 0.62), 240, 240, 0, 0, 240, 240);
    // STRUCTURE, sampled: the card is dark space, it carries the game's two tile colours on the
    // planet, it has stars outside it, and the wordmark's cream is really there.
    const all = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0, n = 0, stars = 0, green = 0, ember = 0, creamMark = 0;
    for (let yy = 2; yy < canvas.height - 2; yy += 2) {
      for (let xx = 2; xx < canvas.width - 2; xx += 2) {
        const i = (yy * canvas.width + xx) * 4;
        const r = all[i], g = all[i + 1], b = all[i + 2];
        const luma = r * 0.3 + g * 0.59 + b * 0.11;
        sum += luma; n++;
        if (luma > 110) stars++;
        if (g > r + 22 && g > b + 12) green++;
        if (r > g + 45 && r > b + 45) ember++;
        if (yy >= 96 && yy <= 170 && r > 180 && g > 170 && b > 140) creamMark++;
      }
    }
    return {
      png, width: canvas.width, height: canvas.height, maxJump: Math.round(maxJump), over40,
      meanLuma: Math.round(sum / n), stars, green, ember, creamMark, crop: crop.toDataURL('image/png'),
    };
  })(${JSON.stringify({ data, layout })})`) as never;

  for (const layout of SHARE_LAYOUTS) {
    for (const variant of VARIANTS) {
      const r = await render(variant.data, layout);
      check(`[${layout}${variant.suffix}] the canvas is natively ${SHARE_W}x${SHARE_H}`, r.width === SHARE_W && r.height === SHARE_H, `${r.width}x${r.height}`);
      check(`[${layout}${variant.suffix}] the picture is drawn, not blank`, r.maxJump >= 60 && r.over40 >= 2, `max jump ${r.maxJump}, ${r.over40} steep pairs`);
      check(`[${layout}${variant.suffix}] it is dark space`, r.meanLuma < 70, `mean luma ${r.meanLuma}`);
      check(`[${layout}${variant.suffix}] the game’s sky has stars in it`, r.stars >= 40, `${r.stars} lit samples`);
      check(`[${layout}${variant.suffix}] the planet carries the two sides’ tile colours`, r.green >= 400 && r.ember >= 100, `green ${r.green} · ember ${r.ember}`);
      check(`[${layout}${variant.suffix}] the wordmark is really painted in cream`, r.creamMark >= 60, `${r.creamMark} cream samples`);
      const bytes = Buffer.from(r.png.split(',')[1]!, 'base64');
      // PNG header: width/height straight off the file (no image library).
      check(`[${layout}${variant.suffix}] the PNG header says ${SHARE_W}x${SHARE_H}`, bytes.readUInt32BE(16) === SHARE_W && bytes.readUInt32BE(20) === SHARE_H, `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`);
      const name = `layout-${layout}${variant.suffix}`;
      writeFileSync(`${OUT}/${name}.png`, bytes);
      if (!variant.suffix) writeFileSync(`${OUT}/detail-${layout}.png`, Buffer.from(r.crop.split(',')[1]!, 'base64'));
      console.log(`    wrote ${OUT}/${name}.png (${Math.round(bytes.length / 1024)} kB)`);
    }
  }
  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
} finally {
  await browser.close();
  await server.close();
}

console.log(`\n${failed ? `FAILED: ${failed}` : `All share-card exports passed. Pictures in ${OUT}`}`);
process.exit(failed ? 1 : 0);
