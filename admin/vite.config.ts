// The admin dashboard: its own Vite root and its own output directory.
//
// WHY A SEPARATE BUILD (docs/ADMIN.md): the dashboard must never be part of the player bundle. Its
// sources live in `admin/`, outside `web/src/`, and this config emits `web/dist-admin` — a sibling
// of `web/dist-live` / `web/dist-campaign`, exactly like those precedents. Nothing in `web/src`
// imports anything from here, and nothing here imports the game's UI: the separation is structural,
// not a convention (see admin/tests/isolation.test.ts).
//
// The public API base comes from the same build variable the game uses (VITE_DUEL_API_URL), so the
// deployed dashboard talks to the same duel API with the player's own bearer token. No key of any
// kind is baked in: there is no service-role key and no database credential anywhere in this build.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  // The page is served from /admin/ on the site, so relative asset paths are required (the same
  // reason the game's build uses base './').
  build: {
    outDir: fileURLToPath(new URL('../web/dist-admin', import.meta.url)),
    emptyOutDir: true,
    // The dashboard is not a game: it must not register a service worker, and it must not be
    // preloaded by the player's. `manifest: false` keeps it out of any install flow.
    manifest: false,
    target: 'es2022',
    rollupOptions: {
      output: {
        // One predictable asset name, so a support note can name the exact file the owner loaded.
        entryFileNames: 'admin.js',
        chunkFileNames: 'admin-[name].js',
        assetFileNames: 'admin.[ext]',
      },
    },
  },
  server: { host: '127.0.0.1', port: 5174, strictPort: false },
  preview: { host: '127.0.0.1', port: 4174, strictPort: false },
});
