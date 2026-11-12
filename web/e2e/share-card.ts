// THE SHARE CARD, EXPORTED FOR THE OWNER (owner brief, 2026-11-12): a 1080x1350 picture for
// Instagram 4:5 / a phone gallery. Three LAYOUTS, each a real exported image — this script runs the
// REAL drawing path (`ui/sharecard.ts` `drawShareCard`, the function the Share key calls) in
// Chromium and writes the PNGs outside the repo for review.
//
//   npx tsx web/e2e/share-card.ts            # /tmp/sharpen-share/layout-*.png (+ measured checks)
//
// WHAT IS PROVEN HERE, FROM NUMBERS RATHER THAN BY EYE:
//   · the page GRID: every box is a span of it, and the two sums add up to 1080x1350;
//   · each NAME's centre x equals its own SCORE's centre x (layout A);
//   · layout A draws NO circle: pixels sampled on the fit radius are sky, while layout B's ring is
//     a bright circle at the same radius;
//   · the FONTS really resolved: `document.fonts.load` returns the Besley and Fragment Mono faces,
//     and the same string measures differently in the real face than in a fallback;
//   · the canvas is native 1080x1350 and the PNG header agrees.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { allCoords, coordKey } from '../../src/engine/index.js';
import type { Player, Tile } from '../../src/engine/index.js';
import { RESULT } from '../../src/strings.js';
import { SHARE_GRID, SHARE_H, SHARE_W, SHARE_LAYOUTS } from '../src/logic/share.js';
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

type Metrics = {
  png: string; width: number; height: number; maxJump: number; over40: number;
  meanLuma: number; stars: number; green: number; ember: number; creamMark: number;
  ringLuma: number; ringSky: number; crop: string;
};

try {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });

  // ---- THE FONT PROOF: the real faces are declared, load, and really shape the text ------------
  const fonts = await page.evaluate(`(async () => {
    const readToken = (name) => getComputedStyle(document.body).getPropertyValue(name).trim() || getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const besley = await document.fonts.load('600 168px "Besley"');
    const besleyUi = await document.fonts.load('400 34px "Besley"');
    const mono = await document.fonts.load('400 46px "Fragment Mono"');
    await document.fonts.ready;
    const c = document.createElement('canvas').getContext('2d');
    c.font = '600 100px "Besley", "Georgia", serif';
    const withBesley = c.measureText('YOU WON').width;
    c.font = '600 100px "Georgia", serif';
    const withoutBesley = c.measureText('YOU WON').width;
    c.font = '400 100px "Fragment Mono", ui-monospace, monospace';
    const withMono = c.measureText('FUTASAKU').width;
    c.font = '400 100px ui-monospace, monospace';
    const withoutMono = c.measureText('FUTASAKU').width;
    return {
      tokenDisplay: readToken('--font-display'), tokenUi: readToken('--font-ui'),
      besley: besley.map((f) => ({ family: f.family, weight: f.weight, status: f.status })),
      besleyUi: besleyUi.map((f) => ({ family: f.family, weight: f.weight })),
      mono: mono.map((f) => ({ family: f.family, weight: f.weight, status: f.status })),
      checkBesley: document.fonts.check('600 168px "Besley"'),
      checkMono: document.fonts.check('400 46px "Fragment Mono"'),
      withBesley, withoutBesley, withMono, withoutMono,
    };
  })()`) as {
    tokenDisplay: string; tokenUi: string;
    besley: { family: string; weight: string; status: string }[];
    besleyUi: { family: string; weight: string }[];
    mono: { family: string; weight: string; status: string }[];
    checkBesley: boolean; checkMono: boolean;
    withBesley: number; withoutBesley: number; withMono: number; withoutMono: number;
  };
  console.log(`\n--- fonts: display "${fonts.tokenDisplay}" · ui "${fonts.tokenUi}"`);
  check('the display token names Besley first', /^\s*'?"?Besley/.test(fonts.tokenDisplay), fonts.tokenDisplay);
  check('the ui token names Fragment Mono first', /^\s*'?"?Fragment Mono/.test(fonts.tokenUi), fonts.tokenUi);
  check('Besley 600 is a real declared face (load returned it)', fonts.besley.length > 0 && fonts.besley.every((f) => f.family === 'Besley' && f.status === 'loaded'), JSON.stringify(fonts.besley));
  check('Fragment Mono 400 is a real declared face', fonts.mono.length > 0 && fonts.mono.every((f) => f.family === 'Fragment Mono' && f.status === 'loaded'), JSON.stringify(fonts.mono));
  check('both faces pass document.fonts.check', fonts.checkBesley && fonts.checkMono);
  // A width difference proves the webfont, not a system fallback, shaped the string.
  check('the text is shaped by Besley, not by Georgia', Math.abs(fonts.withBesley - fonts.withoutBesley) > 2, `${fonts.withBesley.toFixed(1)} vs ${fonts.withoutBesley.toFixed(1)}`);
  check('the text is shaped by Fragment Mono, not by the system mono', Math.abs(fonts.withMono - fonts.withoutMono) > 2, `${fonts.withMono.toFixed(1)} vs ${fonts.withoutMono.toFixed(1)}`);

  /** Render one card through the REAL export path and hand back the PNG plus its measurements. */
  const render = async (data: ShareData, layout: ShareLayoutId): Promise<Metrics> => page.evaluate(`(async (args) => {
    const m = await import('/src/ui/sharecard.ts');
    const layoutModule = await import('/src/logic/share.ts');
    const L = layoutModule.shareLayout(args.data, args.layout);
    // The export path itself (shareCard() calls exactly this, then toBlob).
    const canvas = await m.drawShareCard(args.data, args.layout);
    const png = canvas.toDataURL('image/png');
    // EDGE MEASUREMENT: a horizontal line THROUGH THE PLANET (its own centre row, where tile edges
    // meet the sky). A native vector edge steps by a lot in one or two pixels; an upscaled bitmap
    // would spread the same step over several.
    const ctx = canvas.getContext('2d');
    const y = Math.round(L.planet.cy);
    const row = ctx.getImageData(0, y, canvas.width, 1).data;
    let maxJump = 0, over40 = 0;
    for (let x = 1; x < canvas.width; x++) {
      const a = row[(x - 1) * 4] * 0.3 + row[(x - 1) * 4 + 1] * 0.59 + row[(x - 1) * 4 + 2] * 0.11;
      const b = row[x * 4] * 0.3 + row[x * 4 + 1] * 0.59 + row[x * 4 + 2] * 0.11;
      const jump = Math.abs(b - a);
      if (jump > maxJump) maxJump = jump;
      if (jump > 40) over40++;
    }
    // A 1:1 crop of the planet, so the tile and text edges can be inspected by eye.
    const crop = document.createElement('canvas');
    crop.width = 540; crop.height = 540;
    crop.getContext('2d').drawImage(canvas, Math.round(L.planet.cx - 270), Math.round(L.planet.cy - 270), 540, 540, 0, 0, 540, 540);
    // STRUCTURE, sampled: dark space, the game's two tile colours on the planet, stars, cream mark.
    const all = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const lumaAt = (x, y) => {
      const i = (Math.round(y) * canvas.width + Math.round(x)) * 4;
      return all[i] * 0.3 + all[i + 1] * 0.59 + all[i + 2] * 0.11;
    };
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
        if (yy >= 96 && yy <= 190 && r > 180 && g > 170 && b > 140) creamMark++;
      }
    }
    // NO-CIRCLE PROOF: sample the FIT RADIUS all the way round the planet. A drawn rim is a bright
    // circle there; a tile mass that ends inside the radius leaves sky, so the ring is dark.
    let ringLuma = 0, ringSky = 0;
    for (let a = 0; a < 360; a += 3) {
      const rad = (a * Math.PI) / 180;
      const on = lumaAt(L.planet.cx + Math.cos(rad) * (L.planet.r - 0.75), L.planet.cy + Math.sin(rad) * (L.planet.r - 0.75));
      const out = lumaAt(L.planet.cx + Math.cos(rad) * (L.planet.r + 14), L.planet.cy + Math.sin(rad) * (L.planet.r + 14));
      if (on > ringLuma) ringLuma = on;
      if (out > ringSky) ringSky = out;
    }
    return {
      png, width: canvas.width, height: canvas.height, maxJump: Math.round(maxJump), over40,
      meanLuma: Math.round(sum / n), stars, green, ember, creamMark,
      ringLuma: Math.round(ringLuma), ringSky: Math.round(ringSky), crop: crop.toDataURL('image/png'),
    };
  })(${JSON.stringify({ data, layout })})`) as never;
  /** The pure layout, as the page module computes it (the same module the app ships). */
  const layoutOf = async (data: ShareData, layout: ShareLayoutId) => page.evaluate(`(async () => {
    const m = await import('/src/logic/share.ts');
    const L = m.shareLayout(${JSON.stringify(data)}, ${JSON.stringify(layout)});
    const cx = (b) => b.x + b.w / 2;
    return {
      id: L.id, ring: L.planet.ring,
      scoreYou: cx(L.score.you), scoreOpp: cx(L.score.opp), dash: cx(L.score.dash),
      nameYou: cx(L.names.you), nameOpp: cx(L.names.opp),
      nameYouY: L.names.you.y, scoreYouBottom: L.score.you.y + L.score.you.h,
      textCount: L.texts.length,
      families: [...new Set(L.texts.map((t) => t.family))],
      weights: [...new Set(L.texts.map((t) => t.family + ':' + t.weight))],
    };
  })()`) as never;

  for (const layout of SHARE_LAYOUTS) {
    for (const variant of VARIANTS) {
      const tag = `[${layout}${variant.suffix}]`;
      const r = await render(variant.data, layout);
      const L = await layoutOf(variant.data, layout) as {
        id: string; ring: boolean; scoreYou: number; scoreOpp: number; dash: number;
        nameYou: number; nameOpp: number; nameYouY: number; scoreYouBottom: number;
        families: string[]; weights: string[];
      };
      check(`${tag} the canvas is natively ${SHARE_W}x${SHARE_H}`, r.width === SHARE_W && r.height === SHARE_H, `${r.width}x${r.height}`);
      check(`${tag} the picture is drawn, not blank`, r.maxJump >= 60 && r.over40 >= 2, `max jump ${r.maxJump}, ${r.over40} steep pairs`);
      check(`${tag} it is dark space`, r.meanLuma < 70, `mean luma ${r.meanLuma}`);
      check(`${tag} the game’s sky has stars in it`, r.stars >= 40, `${r.stars} lit samples`);
      check(`${tag} the planet carries the two sides’ tile colours`, r.green >= 400 && r.ember >= 100, `green ${r.green} · ember ${r.ember}`);
      check(`${tag} the wordmark is really painted in cream`, r.creamMark >= 60, `${r.creamMark} cream samples`);
      check(`${tag} only Besley and Fragment Mono are used`, L.families.every((f) => f === 'display' || f === 'ui'), L.families.join(','));
      check(`${tag} no text asks for a weight the face does not ship`, L.weights.every((w) => w !== 'ui:600' && w !== 'ui:700' && w !== 'ui:800' && w !== 'display:400'), L.weights.join(' '));

      if (layout === 'a') {
        // THE OWNER'S MOST IMPORTANT CORRECTION: name under its OWN number, same centre line.
        check(`${tag} YOUR name is centred under YOUR score`, L.nameYou === L.scoreYou, `${L.nameYou} vs ${L.scoreYou}`);
        check(`${tag} the OPPONENT's name is centred under THEIR score`, L.nameOpp === L.scoreOpp, `${L.nameOpp} vs ${L.scoreOpp}`);
        check(`${tag} the two sides are left and right of the dash`, L.nameYou < L.dash && L.nameOpp > L.dash, `${L.nameYou} < ${L.dash} < ${L.nameOpp}`);
        check(`${tag} the scorecard is symmetric about the page centre`, Math.round(L.nameYou + L.nameOpp) === SHARE_W, `${L.nameYou} + ${L.nameOpp}`);
        check(`${tag} the name sits one grid gutter under its number`, L.nameYouY === L.scoreYouBottom + SHARE_GRID.gutter, `${L.nameYouY} vs ${L.scoreYouBottom} + ${SHARE_GRID.gutter}`);
        // NO CIRCLE: the fit radius is sky, not a rim.
        check(`${tag} there is NO drawn circle round the board`, L.ring === false && r.ringLuma <= r.ringSky + 6, `ring luma ${r.ringLuma} vs sky ${r.ringSky}`);
        const width = SHARE_GRID.columns * SHARE_GRID.column + (SHARE_GRID.columns - 1) * SHARE_GRID.gutter + 2 * SHARE_GRID.margin;
        const height = SHARE_GRID.rows * SHARE_GRID.row + (SHARE_GRID.rows - 1) * SHARE_GRID.gutter + 2 * SHARE_GRID.margin;
        check(`${tag} the grid adds up to the page`, width === SHARE_W && height === SHARE_H, `${width}x${height}`);
      } else {
        // B and C keep the disc they shipped with — proven by the same pixel sample.
        check(`${tag} still draws its ring (unchanged alternate)`, L.ring === true && r.ringLuma > r.ringSky + 6, `ring luma ${r.ringLuma} vs sky ${r.ringSky}`);
      }

      const bytes = Buffer.from(r.png.split(',')[1]!, 'base64');
      check(`${tag} the PNG header says ${SHARE_W}x${SHARE_H}`, bytes.readUInt32BE(16) === SHARE_W && bytes.readUInt32BE(20) === SHARE_H, `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`);
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
