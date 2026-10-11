import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { cpSync, mkdirSync } from 'node:fs';
import { defineConfig } from 'vite';

// The playable game. Builds to web/dist with relative paths so it works from any GitHub Pages
// address (/futa0.4/ and the test copy /futa-test/ alike).
let output = fileURLToPath(new URL('./dist', import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [{ name: 'font-licenses', configResolved(config) { output = resolve(config.root, config.build.outDir); }, closeBundle() {
    mkdirSync(resolve(output, 'licenses'), { recursive: true });
    cpSync(fileURLToPath(new URL('./src/fonts/LICENSE-alegreya-sans.txt', import.meta.url)), resolve(output, 'licenses/LICENSE-alegreya-sans.txt'));
    for (const name of ['besley', 'commissioner']) cpSync(fileURLToPath(new URL(`./src/fonts/v2/LICENSE-${name}.txt`, import.meta.url)), resolve(output, `licenses/LICENSE-${name}.txt`));
  } }],
  build: { outDir: 'dist', emptyOutDir: true },
});
