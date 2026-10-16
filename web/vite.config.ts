import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { PRIVACY } from '../src/strings.js';
import { writePrivacyPage } from './src/privacy-page.js';

// The playable web version. Builds to web/dist with relative paths so it works
// from any GitHub Pages URL.
let output = fileURLToPath(new URL('./dist', import.meta.url));

// `/futa0.5/` (the online preview) MUST ship its public online config, or the client cannot reach
// the duel API and every online tap shows a generic error. Enforce this in the BUILD itself — not
// only in the post-build `check-channel-assets.mjs` — because a stale workflow copy on another ref
// (e.g. `futa0.4`) runs that checker with `|| true` and would swallow a failure. `npm run web:build`
// is never `|| true`-guarded, so a throw here always fails the deploy.
if ((process.env.CHANNEL ?? '') === 'futa05') {
  const required = ['VITE_DUEL_API_URL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const;
  const missing = required.filter((key) => !(process.env[key] ?? '').trim());
  if (missing.length > 0) {
    throw new Error(
      `CHANNEL=futa05 build requires ${missing.join(', ')} — without it the built bundle would carry no online config.`,
    );
  }
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  // Default product build is Futasaku 0.4. `futa-test` is the experiment copy.
  define: { __CHANNEL__: JSON.stringify(['live', 'test', 'futa04', 'futa-test', 'futa05'].includes(process.env.CHANNEL ?? '') ? process.env.CHANNEL : 'futa04') },
  plugins: [{ name: 'futasaku-preview-icons', transformIndexHtml: { order: 'pre', handler(html) {
    const modern = process.env.CHANNEL === 'futa04' || process.env.CHANNEL === 'futa-test'
      || process.env.CHANNEL === 'futa05' || !process.env.CHANNEL;
    return modern ? html
      .replace('<html lang="en"', '<html lang="en" class="test-typography-v2"')
      .replace('    <div id="splash" class="splash" hidden aria-hidden="true"></div>\n', '') : html
      .replace('./futasaku-icon-192.png', './icon-192.png')
      .replace('./futasaku-icon-180.png', './icon-180.png')
      .replace('    <link rel="stylesheet" href="./src/fonts-futa04.css" />\n', '')
      .replace(/<link rel="preload" href="[^"]*(?:besley|commissioner|fragment-mono)[^"]*"[^>]*>/g, '');
  } } }, { name: 'isolate-development-art', configResolved(config) { output = resolve(config.root, config.build.outDir); }, closeBundle() {
    const channel = process.env.CHANNEL ?? 'futa04';
    // The static /privacy page — real HTML at the real path, on every channel. Google's OAuth
    // verification crawls it with JavaScript off, so it is generated from src/strings.ts PRIVACY
    // (one source of truth) and carries no external script or stylesheet.
    writePrivacyPage(PRIVACY, output);
    if (channel === 'futa04' || channel === 'futa-test' || channel === 'futa05') {
      const path = resolve(output, 'manifest.webmanifest');
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      manifest.icons = [
        { src: 'futasaku-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'futasaku-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'futasaku-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ];
      if (channel === 'futa-test') {
        manifest.name = 'Futasaku TEST';
        manifest.short_name = 'Futa TEST';
      }
      for (const icon of ['futasaku-icon-180.png', ...manifest.icons.map((entry: { src: string }) => entry.src)])
        cpSync(fileURLToPath(new URL(`./src/assets/futa04-icons/${icon}`, import.meta.url)), resolve(output, icon));
      writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
    }
    // V3 art archived; never ship design-v2/v3 from product builds.
    rmSync(resolve(output, 'design-v2'), { recursive: true, force: true });
    rmSync(resolve(output, 'design-v3'), { recursive: true, force: true });
    mkdirSync(resolve(output, 'licenses'), { recursive: true });
    cpSync(fileURLToPath(new URL('./src/fonts/LICENSE-alegreya-sans.txt', import.meta.url)), resolve(output, 'licenses/LICENSE-alegreya-sans.txt'));
    if (channel === 'test' || channel === 'futa04' || channel === 'futa-test' || channel === 'futa05') {
      for (const name of ['besley', 'fragment-mono']) cpSync(fileURLToPath(new URL(`./src/fonts/v2/LICENSE-${name}.txt`, import.meta.url)), resolve(output, `licenses/LICENSE-${name}.txt`));
    }
  } }],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // WebKit (Safari) logs a spurious "Origin … is not allowed by Access-Control-Allow-Origin"
    // console error for a font loaded from a data: URI. Vite inlines assets under 4KB, and the
    // small Futasaku Numerals font (2.3KB) was being inlined. Keep fonts as real files on the
    // futa05 channel so the console stays honest; other channels keep the default inlining.
    ...(process.env.CHANNEL === 'futa05'
      ? { assetsInlineLimit: (filePath: string): boolean | undefined => (filePath.endsWith('.woff2') ? false : undefined) }
      : {}),
  },
});
