// OLD TAB ICONS (owner, 2026-11-10: "both .com and /test are showing old favicons - why? fix and make
// sure we don't regress like that anywhere else"). The server sent the new icons, but they kept the
// old FILE NAMES, and browsers keep tab icons in a long-lived store keyed by address, so anyone who had
// seen the old icon kept seeing it. Every icon, the manifest and the share image now carry a fingerprint
// of their own contents (?v=...), stamped by the build: a changed file is a changed address.
import { describe, expect, it } from 'vitest';
import { contentVersion, versionHeadAssets, versionManifestIcons } from '../build-asset-versions.js';

const hashes: Record<string, string> = {
  'futasaku-tab-16.png': 'aaaa1111', 'futasaku-tab-dark-16.png': 'bbbb2222', 'futasaku-icon-180.png': 'cccc3333',
  'manifest.webmanifest': 'dddd4444', 'og.jpg': 'eeee5555',
};
const hashOf = (file: string) => hashes[file] ?? null;

describe('every icon address carries its contents fingerprint', () => {
  it('stamps tab icons, the home-screen icon, the manifest and the share image', () => {
    const html = [
      '<link rel="icon" type="image/png" sizes="16x16" href="./futasaku-tab-16.png" />',
      '<link rel="icon" type="image/png" sizes="16x16" href="./futasaku-tab-dark-16.png" media="(prefers-color-scheme: light)" />',
      '<link rel="manifest" href="./manifest.webmanifest" />',
      '<link rel="apple-touch-icon" href="./futasaku-icon-180.png" />',
      '<meta property="og:image" content="https://www.futasaku.com/og.jpg?v=7" />',
      '<meta name="twitter:image" content="https://www.futasaku.com/og.jpg?v=7" />',
      '<link rel="preload" href="./src/fonts/x.woff2" as="font" />',
    ].join('\n');
    const out = versionHeadAssets(html, hashOf);
    expect(out).toContain('href="./futasaku-tab-16.png?v=aaaa1111"');
    expect(out).toContain('href="./futasaku-tab-dark-16.png?v=bbbb2222" media="(prefers-color-scheme: light)"');
    expect(out).toContain('href="./manifest.webmanifest?v=dddd4444"');
    expect(out).toContain('href="./futasaku-icon-180.png?v=cccc3333"');
    expect(out.match(/og\.jpg\?v=eeee5555/g)).toHaveLength(2); // the hand-bumped ?v=7 is replaced
    expect(out).toContain('href="./src/fonts/x.woff2"'); // only icons, the manifest and the share image
  });
  it('is idempotent and never stamps a file it cannot find', () => {
    const once = versionHeadAssets('<link rel="icon" href="./futasaku-tab-16.png" />', hashOf);
    expect(versionHeadAssets(once, hashOf)).toBe(once);
    expect(versionHeadAssets('<link rel="icon" href="./missing.png" />', hashOf)).toBe('<link rel="icon" href="./missing.png" />');
  });
  it('stamps the manifest icons (the installed app and Android home screen)', () => {
    const m = { icons: [{ src: 'futasaku-tab-16.png', sizes: '16x16' }, { src: 'missing.png' }] };
    expect(versionManifestIcons(m, hashOf).icons).toEqual([{ src: 'futasaku-tab-16.png?v=aaaa1111', sizes: '16x16' }, { src: 'missing.png' }]);
  });
  it('the fingerprint follows the bytes: the same file, the same address; one byte more, a new one', () => {
    const a = contentVersion(Buffer.from('icon-a'));
    expect(a).toMatch(/^[0-9a-f]{10}$/);
    expect(contentVersion(Buffer.from('icon-a'))).toBe(a);
    expect(contentVersion(Buffer.from('icon-b'))).not.toBe(a);
  });
});
