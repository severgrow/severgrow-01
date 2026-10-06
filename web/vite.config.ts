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
  // the release channel: "live" (main, the site root) or "test" (dev, /test/); web/src/channel.ts
  define: { __CHANNEL__: JSON.stringify(['live', 'test', 'test2'].includes(process.env.CHANNEL ?? '') ? process.env.CHANNEL : 'live') },
  plugins: [{ name: 'test2-brand-name', transformIndexHtml(html) {
    return process.env.CHANNEL === 'test2' ? html.replaceAll('Severor', 'Futasaku') : html;
  } }, { name: 'isolate-development-art', configResolved(config) { output = resolve(config.root, config.build.outDir); }, closeBundle() {
    if (process.env.CHANNEL === 'test2') {
      const path = resolve(output, 'manifest.webmanifest');
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      manifest.name = manifest.short_name = 'Futasaku';
      writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
    }
    if (process.env.CHANNEL !== 'test') rmSync(resolve(output, 'design-v2'), { recursive: true, force: true });
    mkdirSync(resolve(output, 'licenses'), { recursive: true });
    cpSync(fileURLToPath(new URL('./src/fonts/LICENSE-alegreya-sans.txt', import.meta.url)), resolve(output, 'licenses/LICENSE-alegreya-sans.txt'));
    if (process.env.CHANNEL === 'test' || process.env.CHANNEL === 'test2') {
      for (const name of ['besley', 'commissioner']) cpSync(fileURLToPath(new URL(`./src/fonts/v2/LICENSE-${name}.txt`, import.meta.url)), resolve(output, `licenses/LICENSE-${name}.txt`));
    }
  } }],
  build: { outDir: 'dist', emptyOutDir: true },
});
