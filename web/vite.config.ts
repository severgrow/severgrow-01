import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// The playable web version. Builds to web/dist with relative paths so it works
// from any GitHub Pages URL.
let output = fileURLToPath(new URL('./dist', import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  // Futasaku 0.4 builds with CHANNEL=futa04; historical channels remain available for checks.
  define: { __CHANNEL__: JSON.stringify(['live', 'test', 'futa04'].includes(process.env.CHANNEL ?? '') ? process.env.CHANNEL : 'live') },
  plugins: [{ name: 'futasaku-preview-icons', transformIndexHtml: { order: 'pre', handler(html) {
    return process.env.CHANNEL === 'futa04' ? html
      .replace('<html lang="en"', '<html lang="en" class="test-typography-v2"')
      .replace('    <div id="splash" class="splash" hidden aria-hidden="true"></div>\n', '')
      .replace('Eye candy (opening splash, home heartbeat, terrarium menu, drifting spores)', 'Eye candy (home heartbeat, terrarium menu, drifting spores)') : html
      .replace('./futasaku-icon-192.png', './icon-192.png')
      .replace('./futasaku-icon-180.png', './icon-180.png')
      .replace('    <link rel="stylesheet" href="./src/fonts-futa04.css" />\n', '')
      .replace(/<link rel="preload" href="[^"]*(?:besley|commissioner)[^"]*"[^>]*>/g, '');
  } } }, { name: 'isolate-development-art', configResolved(config) { output = resolve(config.root, config.build.outDir); }, closeBundle() {
    if (process.env.CHANNEL === 'futa04') {
      const path = resolve(output, 'manifest.webmanifest');
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      manifest.icons = [
        { src: 'futasaku-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'futasaku-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'futasaku-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ];
      for (const icon of ['futasaku-icon-180.png', ...manifest.icons.map((entry: { src: string }) => entry.src)])
        cpSync(fileURLToPath(new URL(`./src/assets/futa04-icons/${icon}`, import.meta.url)), resolve(output, icon));
      writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
    }
    if (process.env.CHANNEL !== 'test') rmSync(resolve(output, 'design-v2'), { recursive: true, force: true });
    mkdirSync(resolve(output, 'licenses'), { recursive: true });
    cpSync(fileURLToPath(new URL('./src/fonts/LICENSE-alegreya-sans.txt', import.meta.url)), resolve(output, 'licenses/LICENSE-alegreya-sans.txt'));
    if (process.env.CHANNEL === 'test' || process.env.CHANNEL === 'futa04') {
      for (const name of ['besley', 'commissioner']) cpSync(fileURLToPath(new URL(`./src/fonts/v2/LICENSE-${name}.txt`, import.meta.url)), resolve(output, `licenses/LICENSE-${name}.txt`));
    }
  } }],
  build: { outDir: 'dist', emptyOutDir: true },
});
