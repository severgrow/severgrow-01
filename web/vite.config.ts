import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';
import { defineConfig } from 'vite';

// The playable web version. Builds to web/dist with relative paths so it works
// from any GitHub Pages URL.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  // the release channel: "live" (main, the site root) or "test" (dev, /test/); web/src/channel.ts
  define: { __CHANNEL__: JSON.stringify(['live', 'test', 'test2'].includes(process.env.CHANNEL ?? '') ? process.env.CHANNEL : 'live') },
  plugins: [{ name: 'isolate-development-art', closeBundle() {
    if (process.env.CHANNEL !== 'test') rmSync(fileURLToPath(new URL('./dist/design-v2', import.meta.url)), { recursive: true, force: true });
  } }],
  build: { outDir: 'dist', emptyOutDir: true },
});
