// TERMS OF USE (launch readiness, 2026-11-12). A public game with accounts, a shared chat and an in-game
// currency needs written rules before strangers arrive: what is allowed in chat and names, what Seeds
// are (and are not), what the owner may do about abuse, and how to leave. Like the privacy policy it
// lives once, in src/strings.ts (TERMS), and is shown in two places that cannot drift: the in-app
// panel at futasaku.com/#terms and the static crawlable page at futasaku.com/terms.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PRIVACY, TERMS } from '../../src/strings.js';
import { TERMS_PAGE_PATH, renderPrivacyPage, renderTermsPage, writeTermsPage } from '../src/privacy-page.js';

const dist = mkdtempSync(join(tmpdir(), 'futasaku-terms-'));
const file = writeTermsPage(TERMS, dist);
afterAll(() => rmSync(dist, { recursive: true, force: true }));
const html = readFileSync(file, 'utf8');
const all = TERMS.sections.flatMap((s) => [s.heading, ...s.lines]).join('\n');

describe('/terms static page', () => {
  it('is emitted at terms/index.html with its own canonical address', () => {
    expect(TERMS_PAGE_PATH).toBe('terms/index.html');
    expect(file.endsWith(join('terms', 'index.html'))).toBe(true);
    expect(html).toContain('<link rel="canonical" href="https://www.futasaku.com/terms" />');
    expect(html).toMatch(/<title>Terms of use - Futasaku<\/title>/);
  });

  it('carries every section, the operator, the contact and the date, with no script', () => {
    for (const section of TERMS.sections) {
      expect(html).toContain(section.heading);
      for (const line of section.lines) expect(html).toContain(line.replace(/&/g, '&amp;'));
    }
    expect(html).toContain('Patryk Socha');
    expect(html).toContain('info@futasaku.com');
    expect(html).toContain(TERMS.updated);
    expect(html).not.toMatch(/<script/i);
  });

  it('is derived from TERMS', () => {
    expect(renderTermsPage({ ...TERMS, updated: 'Last updated 1 January 2099' })).toContain('1 January 2099');
  });

  it('the privacy page is unchanged in shape (its own canonical address)', () => {
    expect(renderPrivacyPage(PRIVACY)).toContain('<link rel="canonical" href="https://www.futasaku.com/privacy" />');
  });
});

describe('what the terms say', () => {
  it('covers chat and names, fair play, Seeds having no money value, moderation, leaving, and the age floor', () => {
    expect(all).toMatch(/chat/i);
    expect(all).toMatch(/name/i);
    expect(all).toMatch(/cheat/i);
    expect(all).toMatch(/Seeds[^.]*no (money|cash) value/i);
    expect(all).toMatch(/pause/i);
    expect(all).toMatch(/Delete my account/);
    expect(all).toMatch(/13/);
  });

  it('agrees with the privacy policy on the operator, the contact and the age floor', () => {
    const privacy = PRIVACY.sections.flatMap((s) => s.lines).join('\n');
    expect(privacy).toMatch(/under 13/);
    expect(all).toMatch(/under 13/);
  });

  it('the privacy policy now says what happens to chat messages', () => {
    const privacy = PRIVACY.sections.map((s) => [s.heading, ...s.lines].join('\n')).join('\n');
    expect(privacy).toMatch(/Chat/);
    expect(privacy).toMatch(/90 days/);
  });
});
