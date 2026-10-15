// The generated /privacy page must carry the whole policy, or Google's OAuth branding verification
// rejects the app again ("does not have sufficient content"). This asserts the bytes the build writes
// (web/vite.config.ts calls writePrivacyPage), generated from PRIVACY in src/strings.ts — so a change
// to the policy that never reaches the page, or a section that gets dropped, fails here.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PRIVACY } from '../../src/strings.js';
import { PRIVACY_PAGE_PATH, renderPrivacyPage, writePrivacyPage } from '../src/privacy-page.js';

// Write the page exactly as the build does, into a throwaway dist, and read the real file back.
const dist = mkdtempSync(join(tmpdir(), 'futasaku-privacy-'));
const file = writePrivacyPage(PRIVACY, dist);
afterAll(() => rmSync(dist, { recursive: true, force: true }));

const html = readFileSync(file, 'utf8');

describe('/privacy static page', () => {
  it('is emitted at the crawlable path privacy/index.html', () => {
    expect(PRIVACY_PAGE_PATH).toBe('privacy/index.html');
    expect(file.endsWith(join('privacy', 'index.html'))).toBe(true);
    expect(html.startsWith('<!doctype html>')).toBe(true);
  });

  it('carries every section heading and line of the policy', () => {
    for (const section of PRIVACY.sections) {
      expect(html, `missing heading: ${section.heading}`).toContain(section.heading);
      for (const line of section.lines) expect(html, `missing line under ${section.heading}: ${line}`).toContain(line);
    }
  });

  it('names the operator and the contact email, and the update date, in the text', () => {
    expect(html).toContain('Patryk Socha');
    expect(html).toContain('info@futasaku.com');
    expect(html).toContain(PRIVACY.updated);
  });

  it('has a real title and meta description', () => {
    expect(html).toMatch(/<title>[^<]*Privacy[^<]*<\/title>/);
    expect(html).toMatch(/<meta name="description" content="[^"]+"/);
    expect(html).toContain(PRIVACY.intro);
  });

  it('renders with no JavaScript and no external asset (styling is inline)', () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/rel=["']?stylesheet/i);
    expect(html).not.toMatch(/<img|<iframe|<source|<video|<audio|\ssrc=/i);
    expect(html).toMatch(/<style>[\s\S]*<\/style>/);
  });

  it('is fully derived from PRIVACY: changing the policy changes the page', () => {
    const changed = renderPrivacyPage({ ...PRIVACY, updated: 'Last updated 1 January 2099' });
    expect(changed).toContain('Last updated 1 January 2099');
    expect(changed).not.toContain(PRIVACY.updated);
  });
});
