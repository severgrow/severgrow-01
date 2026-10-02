// Dev preview of the painted materials: writes raw RGBA files plus timing, for tuning.
//   npx tsx web/e2e/photo-preview.ts <outdir>
import { writeFileSync } from 'node:fs';
import { materialsOf } from '../src/logic/materials.js';
import { GRASS_VARIANTS, LAVA_VARIANTS, grassImage, lavaImages } from '../src/logic/photo.js';

const dir = process.argv[2] ?? '.';
const SIZE = 176;
const m = materialsOf('soil').colors;
let t = performance.now();
for (let v = 0; v < LAVA_VARIANTS; v++) lavaImages(SIZE, v, m).forEach((px, l) => writeFileSync(`${dir}/lava-${v}-${l}.rgba`, px));
console.log('lava ms per variant (3 levels)', ((performance.now() - t) / LAVA_VARIANTS).toFixed(1));
t = performance.now();
for (let v = 0; v < GRASS_VARIANTS; v++) writeFileSync(`${dir}/grass-${v}.rgba`, grassImage(SIZE, v, m));
console.log('grass ms each', ((performance.now() - t) / GRASS_VARIANTS).toFixed(1));
