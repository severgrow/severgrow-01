import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
const channel = process.env.CHANNEL ?? 'futa04';
const dir = process.env.BUILD_DIR ?? 'web/dist';
const names = readdirSync(`${dir}/assets`);
assert(!existsSync(`${dir}/design-v2`), 'DESIGN public assets leaked');
assert(!existsSync(`${dir}/design-v3`), 'archived V3 art leaked');
for (const n of names) assert(!/fontbake|bakeoff|designBoard|panel-|lab-|fraunces|jakarta|bricolage|figtree/i.test(n), n);
const js = names.filter(n => n.endsWith('.js')).map(n => readFileSync(`${dir}/assets/${n}`, 'utf8')).join('\n');
for (const marker of ['menu-lab', 'menu-design', 'Apply and play', 'font bake-off', 'forest_strength_', 'lab-presets']) assert(!js.includes(marker), `development code leaked: ${marker}`);
if (channel === 'live') for (const n of names) assert(!/besley|commissioner|fragment-mono|guide-|thumb-|camera-|player-css|fonts-/i.test(n), n);
const product = channel === 'futa04' || channel === 'futa-test';
if (!product) for (const n of names) assert(!/^(information|help|atmosphere)-/.test(n), `Futa04 presentation leaked: ${n}`);
if (!product) for (const n of names) assert(!/^(branding|futasaku-white)-/.test(n), `Futa04 brand leaked: ${n}`);
const html = readFileSync(`${dir}/index.html`, 'utf8');
const manifest = JSON.parse(readFileSync(`${dir}/manifest.webmanifest`, 'utf8'));
if (channel === 'futa-test') {
  assert.equal(manifest.name, 'Futasaku TEST', 'test copy app name');
  assert(html.includes('<title>Futasaku</title>') || html.includes('Futasaku'), 'test copy title');
} else {
  assert.equal(manifest.name, 'Futasaku', 'channel app name');
  assert(html.includes('<title>Futasaku</title>'), 'channel browser title');
}
if (product) for (const prefix of ['besley-', 'fragment-mono-', 'guide-', 'thumb-', 'camera-', 'information-', 'help-', 'atmosphere-']) assert(names.some(n=>n.startsWith(prefix)), `missing ${prefix}`);
console.log(`${channel}: asset isolation passed (${names.length} files)`);
