// Checks the built game (web/dist) after `npm run web:build`: the Futasaku pieces are all there,
// and nothing archived in the 0.4 cleanup (old channels, Lab, DESIGN, V3 skin, bake-off fonts)
// has crept back in. Usage: node scripts/check-build-assets.mjs [distDir]
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? process.env.BUILD_DIR ?? 'web/dist';
const names = readdirSync(join(dir, 'assets'));

// archived folders and files
for (const gone of ['design-v2', 'design-v3', 'sw.js']) assert(!existsSync(join(dir, gone)), `archived file in the build: ${gone}`);
for (const n of names) assert(!/fontbake|bakeoff|designBoard|SkinBoardView|forestVolcano|panel-|lab-|fraunces|jakarta|bricolage|figtree/i.test(n), `archived asset in the build: ${n}`);
const js = names.filter((n) => n.endsWith('.js')).map((n) => readFileSync(join(dir, 'assets', n), 'utf8')).join('\n');
for (const marker of ['menu-lab', 'menu-design', 'Apply and play', 'font bake-off', 'forest_strength_', 'skin-preview', 'design-v3/']) assert(!js.includes(marker), `archived code in the build: ${marker}`);

// the Futasaku pieces
for (const prefix of ['besley-', 'commissioner-', 'guide-', 'thumb-', 'camera-', 'information-', 'help-', 'atmosphere-'])
  assert(names.some((n) => n.startsWith(prefix)), `missing ${prefix}* in the build`);
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.webmanifest'), 'utf8'));
assert.equal(manifest.name, 'Futasaku', 'app name');
assert(html.includes('<title>Futasaku</title>'), 'browser title');
assert(existsSync(join(dir, 'futa04-sw.js')), 'offline worker');
for (const icon of manifest.icons) assert(existsSync(join(dir, icon.src)), `manifest icon ${icon.src}`);

const size = (p) => statSync(p).isDirectory() ? readdirSync(p).reduce((t, n) => t + size(join(p, n)), 0) : statSync(p).size;
const mb = size(dir) / 1e6;
assert(mb < 8, `the build is ${mb.toFixed(1)} MB; expected under 8 MB`);
console.log(`Futasaku build check passed (${names.length} assets, ${mb.toFixed(1)} MB)`);
