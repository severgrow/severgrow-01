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
if (channel !== 'test2') for (const n of names) assert(!/^(information|help|atmosphere)-/.test(n), `Test2 presentation leaked: ${n}`);
if (channel !== 'test2') for (const n of names) assert(!/^(branding|futasaku-white)-/.test(n), `Test2 brand leaked: ${n}`);
const html = readFileSync(`${dir}/index.html`, 'utf8');
const manifest = JSON.parse(readFileSync(`${dir}/manifest.webmanifest`, 'utf8'));
assert.equal(manifest.name, 'Futasaku', 'channel app name');
assert(html.includes('<title>Futasaku</title>'), 'channel browser title');
if (channel === 'test2') for (const prefix of ['besley-', 'commissioner-', 'guide-', 'thumb-', 'camera-', 'information-', 'help-', 'atmosphere-']) assert(names.some(n=>n.startsWith(prefix)), `missing ${prefix}`);
if (existsSync(`${dir}/design-v3/manifest.json`)) {
  // the art manifest lists a content hash per file (the game asks for file?v=hash, so no cache can serve a stale picture)
  const { createHash } = await import('node:crypto');
  const m = JSON.parse(readFileSync(`${dir}/design-v3/manifest.json`, 'utf8'));
  for (const t of ['lo', 'hi']) for (const f of m.tiers[t]) assert.equal(m.hash?.[t]?.[f], createHash('sha1').update(readFileSync(`${dir}/design-v3/${t}/${f}`)).digest('hex').slice(0, 10), `design-v3 manifest out of date for ${t}/${f}: run npm run skin:manifest`);
}
console.log(`${channel}: asset isolation passed (${names.length} files)`);
