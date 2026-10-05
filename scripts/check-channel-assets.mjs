import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
const channel = process.env.CHANNEL ?? 'live';
const dir = process.env.BUILD_DIR ?? 'web/dist';
const names = readdirSync(`${dir}/assets`);
if (channel !== 'test') {
  assert(!existsSync(`${dir}/design-v2`), 'DESIGN public assets leaked');
  for (const n of names) assert(!/fontbake|bakeoff|designBoard|panel-|lab-|fraunces|jakarta|bricolage|figtree/i.test(n), n);
  const js = names.filter(n => n.endsWith('.js')).map(n => readFileSync(`${dir}/assets/${n}`, 'utf8')).join('\n');
  for (const marker of ['menu-lab', 'menu-design', 'Apply and play', 'font bake-off', 'forest_strength_', 'lab-presets']) assert(!js.includes(marker), `development code leaked: ${marker}`);
}
if (channel === 'live') for (const n of names) assert(!/besley|commissioner|guide-|thumb-|camera-|player-css|fonts-/i.test(n), n);
if (channel === 'test2') for (const prefix of ['besley-', 'commissioner-', 'guide-', 'thumb-', 'camera-']) assert(names.some(n=>n.startsWith(prefix)), `missing ${prefix}`);
console.log(`${channel}: asset isolation passed (${names.length} files)`);
