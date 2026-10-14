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
const product = channel === 'futa04' || channel === 'futa-test' || channel === 'futa05';
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

// --- Icon contract ---------------------------------------------------------------------------
// Add-to-Home-Screen breaks silently: a missing icon, a wrong-size PNG or an apple-touch-icon with
// an alpha channel (iOS paints transparency solid black) never fails the build, only the phone. Pin
// the contract here so the manifest, the index.html links and the real files can never drift apart.
function pngInfo(file) {
  const buf = readFileSync(file);
  assert(buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${file} is not a PNG`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
}
for (const icon of manifest.icons ?? []) {
  const file = `${dir}/${icon.src}`;
  assert(existsSync(file), `manifest icon missing from the build: ${icon.src}`);
  const info = pngInfo(file);
  const [w, h] = String(icon.sizes ?? '').split('x').map(Number);
  assert(info.width === w && info.height === h, `${icon.src} is ${info.width}x${info.height}, manifest declares ${icon.sizes}`);
}
const apple = /<link rel="apple-touch-icon" href="\.\/([^"]+)"/.exec(html);
assert(apple, 'index.html is missing its apple-touch-icon link');
assert(existsSync(`${dir}/${apple[1]}`), `apple-touch-icon missing from the build: ${apple[1]}`);
const appleType = pngInfo(`${dir}/${apple[1]}`).colorType;
assert(appleType === 2 || appleType === 3, `apple-touch-icon ${apple[1]} carries an alpha channel (PNG colour type ${appleType}) — iOS renders transparent pixels black`);

// Regression guard for the /futa0.5/ live build (the exact class of silent failure that shipped a
// bundle with no online config, so create-duel / find-opponent showed "Something went wrong.
// Try again."). The online layer is code-split into LAZY chunks that index.html never references,
// so this MUST scan every emitted JS file (the `js` blob above does), never just the entry HTML.
if (channel === 'futa05') {
  const apiUrl = (process.env.VITE_DUEL_API_URL ?? '').trim();
  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? '').trim();
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  assert(apiUrl, 'CHANNEL=futa05 build requires VITE_DUEL_API_URL (the duel API base URL)');
  assert(supabaseUrl, 'CHANNEL=futa05 build requires VITE_SUPABASE_URL');
  assert(anonKey, 'CHANNEL=futa05 build requires VITE_SUPABASE_ANON_KEY');
  let host = '';
  try { host = new URL(supabaseUrl).hostname; } catch { assert.fail(`VITE_SUPABASE_URL is not a valid URL: ${supabaseUrl}`); }
  for (const marker of ['functions/v1/duel', 'realtime/v1/websocket', host]) {
    assert(js.includes(marker), `futa05 build is missing "${marker}" — the online config did not reach the bundle`);
  }
}

console.log(`${channel}: asset isolation passed (${names.length} files)`);
