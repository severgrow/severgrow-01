// CONTENT-STAMPED HEAD ASSETS (owner, 2026-11-10: "both .com and /test are showing old favicons -
// why? fix and make sure we don't regress like that anywhere else").
//
// Why it happened: the new tab icons kept the old FILE NAMES. Browsers keep tab icons (and installed
// app icons) in a long-lived store keyed by address, so anyone who had seen the old icon kept seeing
// it, while the server already sent the new one. The share image had the same problem and was
// patched by a hand-bumped `?v=7`.
//
// The rule now: the build stamps every tab icon, the home-screen icon, the manifest (and the icons
// it lists) and the share image with a fingerprint of the file's own bytes. A changed file is a
// changed address, so no browser can hold on to an old one, and nobody has to remember to bump
// anything. scripts/check-channel-assets.mjs fails a build whose stamps are missing or wrong.
import { createHash } from 'node:crypto';

/** A short fingerprint of a file's bytes (10 hex characters). */
export const contentVersion = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex').slice(0, 10);

/** `./file.png` or `file.png` (optionally with an old ?v=) -> the bare public file name. */
const fileOf = (href: string): string => href.replace(/^\.\//, '').replace(/^https:\/\/www\.futasaku\.com\//, '').replace(/\?.*$/, '');

/** The same address with `?v=<fingerprint>` (replacing any older ?v=), or unchanged if unknown. */
const stamp = (href: string, hashOf: (file: string) => string | null): string => {
  const v = hashOf(fileOf(href));
  return v ? `${href.replace(/\?.*$/, '')}?v=${v}` : href;
};

/** The <link> rels that browsers cache by address, and the share-image metas. */
const LINK = /<link\b[^>]*\brel="(?:icon|shortcut icon|apple-touch-icon|apple-touch-icon-precomposed|mask-icon|manifest)"[^>]*>/g;
const META = /<meta\b[^>]*\b(?:property="og:image"|name="twitter:image")[^>]*>/g;

/** Stamp the head's icons, manifest and share image. Idempotent. */
export const versionHeadAssets = (html: string, hashOf: (file: string) => string | null): string =>
  html
    .replace(LINK, (tag) => tag.replace(/\bhref="([^"]+)"/, (_m, href: string) => `href="${stamp(href, hashOf)}"`))
    .replace(META, (tag) => tag.replace(/\bcontent="([^"]+)"/, (_m, url: string) => `content="${stamp(url, hashOf)}"`));

/** Stamp the icons a web manifest lists (the installed app, the Android home screen). */
export const versionManifestIcons = <M extends { icons?: { src: string }[] }>(manifest: M, hashOf: (file: string) => string | null): M => ({
  ...manifest,
  ...(manifest.icons ? { icons: manifest.icons.map((icon) => ({ ...icon, src: stamp(icon.src, hashOf) })) } : {}),
});
