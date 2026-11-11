// THE ART LAB's own build (futasaku.com/art): a separate pass that writes only into dist/art/, so the
// game's build, chunks and first load are exactly what they are without the lab. Run after the game's
// build by scripts/build-art-lab.mjs (only for the live game's channel).
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('./art', import.meta.url)),
  base: './',
  publicDir: fileURLToPath(new URL('./art/public', import.meta.url)),
  define: { __CHANNEL__: JSON.stringify('futa05'), __DEPLOYED_AT__: JSON.stringify('') },
  server: { fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
  build: {
    outDir: fileURLToPath(new URL('./dist/art', import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
});
