import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { FEEDBACK, PRIVACY } from '../src/strings.js';
import { writePrivacyPage } from './src/privacy-page.js';
import { contentVersion, versionHeadAssets, versionManifestIcons } from './build-asset-versions.js';

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
  plugins: [{
    // The menu's "last deploy" time (web/src/feedback/deploy.ts). Stamped at BUILD time only: the
    // deploy workflow builds right before it publishes, so this is when the build went live. A dev
    // server stamps nothing, and DEPLOYED_AT overrides the clock when a workflow wants to pin it.
    name: 'futasaku-deployed-at',
    config: (_config, { command }) => ({
      define: { __DEPLOYED_AT__: JSON.stringify(command === 'build' ? (process.env.DEPLOYED_AT || new Date().toISOString()) : '') },
    }),
  }, { name: 'futasaku-preview-icons', transformIndexHtml: { order: 'pre', handler(html) {
    const modern = process.env.CHANNEL === 'futa04' || process.env.CHANNEL === 'futa-test'
      || process.env.CHANNEL === 'futa05' || !process.env.CHANNEL;
    // The product menu is now usable before the module runs (see the "FIRST PAINT" block in
    // style.css). `world-reserved` reserves TERRITORY's slot at first paint only when this build
    // really has an online endpoint (the same build-time fact `onlineBuildEnabled()` reads), so the
    // key appears later into a space that is already the right size and the column never jumps.
    const worldReserved = !!(process.env.VITE_DUEL_API_URL ?? '').trim();
    // NO FLASH AT START-UP (0.75, owner: "stars from the very first frame, with no plain background
    // while loading"): the live game paints a still star field in CSS before any script runs; the
    // shared space shader takes over as soon as it has drawn (web/src/player/space-backdrop.ts).
    const spaceFirst = process.env.CHANNEL === 'futa05';
    const htmlClass = `test-typography-v2${worldReserved ? ' world-reserved' : ''}${spaceFirst ? ' space-first v075' : ''}`;
    // The beta line is static words from `src/strings.ts` (no network, no storage), and it used to
    // be the LAST thing to appear on the menu: `paintBetaLine` reveals it during the module's first
    // layout. Painting it into the built HTML puts it on the first frame with the wordmark, which
    // also means the column's final height is there from the start — PLAY does not jump down when
    // the line arrives. `paintBetaLine` reuses the button and its early-click guard.
    const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    const betaLine = `<p id="menu-beta" class="tagline">${escapeHtml(FEEDBACK.betaNote(FEEDBACK.betaVersion))} <button type="button" data-fb="menu-link">${escapeHtml(FEEDBACK.betaLink)}</button></p>`;
    return modern ? html
      .replace('<html lang="en"', `<html lang="en" class="${htmlClass}"`)
      .replace('<p id="menu-beta" class="tagline" hidden></p>', betaLine)
      // PLAY is the product's one way in, and on these channels FEATURES.campaign is true. It ships
      // `hidden` (main.ts owns the flag) but the menu now paints before the module, so the attribute
      // is dropped for a real, focusable key at first paint. The JS assignment stays the authority.
      .replace(/(<button id="menu-play"[^>]*?) hidden>/, '$1>')
      .replace('    <div id="splash" class="splash" hidden aria-hidden="true"></div>\n', '') : html
      .replace('./futasaku-icon-192.png', './icon-192.png')
      .replace('./futasaku-icon-180.png', './icon-180.png')
      .replace('    <link rel="stylesheet" href="./src/fonts-futa04.css" />\n', '')
      .replace(/<link rel="preload" href="[^"]*(?:besley|commissioner|fragment-mono)[^"]*"[^>]*>/g, '');
  } } }, { name: 'planet-launch-preload', transformIndexHtml: { order:'post', handler(html,context) {
    if(process.env.CHANNEL!=='futa05')return html;
    const tags: {tag:string;attrs:Record<string,string>;injectTo:'head'}[] = [];
    // The menu needs these two dynamic modules at first paint, not after all game UI mounts.
    for(const chunk of Object.values(context.bundle??{}))if(chunk.type==='chunk'&&
      /\/(?:sphere\/planet|online\/lobby-ui)\.ts$/.test(chunk.facadeModuleId??'')&&
      !html.includes(`href="./${chunk.fileName}"`))tags.push({tag:'link',attrs:{rel:'modulepreload',href:`./${chunk.fileName}`},injectTo:'head'});
    return {html,tags};
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
      for (const icon of [
        'futasaku-icon-180.png',
        'futasaku-favicon-192.png',
        ...manifest.icons.map((entry: { src: string }) => entry.src),
      ])
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
    // LAST: stamp every icon, the manifest and the share image with their own content fingerprint
    // (build-asset-versions.ts: a changed icon is a changed address, so no browser keeps an old one).
    // The manifest first, so its own stamp covers its final (stamped) contents.
    const hashOf = (file: string): string | null => {
      const path = resolve(output, file);
      return file && existsSync(path) ? contentVersion(readFileSync(path)) : null;
    };
    const manifestPath = resolve(output, 'manifest.webmanifest');
    if (existsSync(manifestPath)) {
      const stamped = versionManifestIcons(JSON.parse(readFileSync(manifestPath, 'utf8')), hashOf);
      writeFileSync(manifestPath, JSON.stringify(stamped, null, 2) + '\n');
    }
    const pages = readdirSync(output).filter((n) => n.endsWith('.html')).map((n) => resolve(output, n));
    if (existsSync(resolve(output, 'privacy/index.html'))) pages.push(resolve(output, 'privacy/index.html'));
    for (const page of pages) {
      const html = readFileSync(page, 'utf8');
      const stamped = versionHeadAssets(html, hashOf);
      if (stamped !== html) writeFileSync(page, stamped);
    }
  } }],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Never inline brand SVGs (PLAIN is ~2.5KB and would otherwise become an anonymous data: URI,
    // which breaks the branding e2e "plain-wordmark" identity check and makes HUD marks harder to
    // cache/debug). On futa05 also keep .woff2 as real files: WebKit logs a spurious CORS error for
    // fonts loaded from data: URIs.
    assetsInlineLimit: (filePath: string): boolean | undefined => {
      if (filePath.includes(`${sep}brand${sep}`) && filePath.endsWith('.svg')) return false;
      if (process.env.CHANNEL === 'futa05' && filePath.endsWith('.woff2')) return false;
      return undefined;
    },
  },
});

