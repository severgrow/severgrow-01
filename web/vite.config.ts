import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The playable web version. Builds to web/dist with relative paths so it works
// from any GitHub Pages URL.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  // the release channel: "live" (main, the site root) or "test" (dev, /test/); web/src/channel.ts
  define: { __CHANNEL__: JSON.stringify(process.env.CHANNEL === 'test' ? 'test' : 'live') },
  build: { outDir: 'dist', emptyOutDir: true },
});
