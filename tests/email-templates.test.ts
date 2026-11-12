/**
 * Pins the transactional email templates in `server/email-templates/`.
 *
 * WHY THIS EXISTS: these files are the live copy of Supabase Auth's mailer. A typo in a variable
 * (`.Tokn`, `.ConfirmationUrl`, a URL-encoded placeholder) does not fail a build anywhere — it
 * silently sends an email with no working link, and the only symptom is a player who cannot
 * finish signing up. The same goes for a `<style>` block or an `<svg>`: they render in a browser
 * preview and disappear in Gmail.
 *
 * `scripts/apply-email-templates.mjs` checks the same rules before it PATCHes Supabase; this test
 * checks them on every `npm run check`, so a reviewable edit cannot drift from what gets sent.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const DIR = join(ROOT, 'server', 'email-templates');

/**
 * The one hosted image every template carries: the game's own treeless wordmark, exported at 2x by
 * `scripts/build-email-wordmark.mjs` into the site's public folder. Absolute, on the custom domain,
 * never a hashed bundle path (an email is read months later, from a different build).
 */
const LOGO_URL = 'https://www.futasaku.com/email/futasaku-wordmark.png';
const LOGO_FILE = join(ROOT, 'web', 'public', 'email', 'futasaku-wordmark.png');
/** The intended display size, and therefore half the committed file's pixels. */
const LOGO_BOX = { width: 150, height: 46 };

/** The variables each template may use — exactly. Closed list: anything else is a typo. */
const CONTRACT: Record<string, string[]> = {
  confirmation: ['ConfirmationURL', 'Token'],
  recovery: ['ConfirmationURL'],
  magic_link: ['ConfirmationURL', 'Token'],
  email_change: ['ConfirmationURL', 'Email', 'NewEmail'],
  invite: ['ConfirmationURL'],
  reauthentication: ['Token'],
};

const subjects = JSON.parse(readFileSync(join(DIR, 'subjects.json'), 'utf8')) as Record<string, string>;
const read = (type: string) => readFileSync(join(DIR, `${type}.html`), 'utf8');
const markupOnly = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

function pngSize(file: string): { width: number; height: number } {
  const buffer = readFileSync(file);
  expect(buffer.subarray(0, 8), `${file} is not a PNG`).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('transactional email templates', () => {
  it('has a template and a subject for every email type the game sends', () => {
    expect(Object.keys(subjects).sort()).toEqual(Object.keys(CONTRACT).sort());
    for (const type of Object.keys(CONTRACT)) {
      expect(read(type).length, `${type}.html is empty`).toBeGreaterThan(1500);
      expect(subjects[type]!.trim(), `${type} has no subject`).not.toBe('');
    }
  });

  it('keeps every Supabase variable exact, and invents none', () => {
    for (const [type, vars] of Object.entries(CONTRACT)) {
      const html = read(type);
      for (const name of vars) {
        // Spacing and the leading dot are part of the token: `{{.Token}}` is not what Supabase parses.
        expect(html, `${type} must contain the exact token {{ .${name} }}`).toContain(`{{ .${name} }}`);
      }
      const used = [...html.matchAll(/\{\{\s*([\s\S]*?)\s*\}\}/g)].map((m) => m[1]!.trim());
      expect(used.length, `${type} has a malformed {{ … }} variable`).toBe((html.match(/\{\{/g) ?? []).length);
      for (const token of used) {
        const name = token.replace(/^\.\s*/, '');
        expect(vars, `${type} uses {{ ${token} }} — not a variable this template provides`).toContain(name);
      }
    }
  });

  it('uses nothing a mail client strips', () => {
    // Gmail drops <style>; most clients have no CSS variables or backdrop filters; Gmail does not
    // render inline SVG. The single raster wordmark is the deliberate exception and is pinned below.
    const forbidden: [RegExp, string][] = [
      [/<style[\s>]/i, 'a <style> block'],
      [/<svg[\s>]/i, 'inline SVG'],
      [/<picture[\s>]/i, 'a <picture> element'],
      [/background-image/i, 'a CSS background image'],
      [/srcset=/i, 'a srcset (one fixed 2x file is enough)'],
      [/backdrop-filter/i, 'backdrop-filter'],
      [/var\(--/i, 'a CSS variable'],
      [/url\(/i, 'a url() background'],
      [/@media/i, 'a media query'],
      [/@import/i, 'an @import'],
      [/font-face/i, 'a web font'],
      [/position:\s*(fixed|absolute)/i, 'absolute positioning'],
    ];
    for (const type of Object.keys(CONTRACT)) {
      const markup = markupOnly(read(type));
      for (const [pattern, what] of forbidden) {
        expect(pattern.test(markup), `${type}.html contains ${what}, which an inbox will strip`).toBe(false);
      }
    }
  });

  it('carries the real wordmark as one fixed-size, 2x image with a deliberate fallback', () => {
    const file = pngSize(LOGO_FILE);
    expect(file, 'the committed wordmark must be exactly 2x the displayed 150x46').toEqual({
      width: LOGO_BOX.width * 2,
      height: LOGO_BOX.height * 2,
    });

    for (const type of Object.keys(CONTRACT)) {
      const markup = markupOnly(read(type));
      const images = [...markup.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
      expect(images.length, `${type} must carry exactly one image (the wordmark)`).toBe(1);
      const tag = images[0]!;

      // The absolute URL, never a relative or hashed one: mail is read long after the build.
      expect(tag, `${type}: hosted wordmark URL`).toContain(`src="${LOGO_URL}"`);
      // Meaningful alt text: with images blocked this is what the header says.
      expect(tag, `${type}: the image needs alt text`).toMatch(/alt="FUTASAKU"/);
      // Fixed attributes AND an inline size, so a blocked image reserves its own box in every client
      // (Outlook's Word engine lays out from the attributes; browsers honour the style).
      expect(tag, `${type}: fixed width attribute`).toContain(`width="${LOGO_BOX.width}"`);
      expect(tag, `${type}: fixed height attribute`).toContain(`height="${LOGO_BOX.height}"`);
      expect(tag, `${type}: inline width`).toContain(`width:${LOGO_BOX.width}px`);
      expect(tag, `${type}: inline height`).toContain(`height:${LOGO_BOX.height}px`);
      expect(tag, `${type}: no image border`).toContain('border:0');
      expect(tag, `${type}: block layout keeps the header from gaining a text baseline gap`).toContain('display:block');
      // Cream alt text must still read as the wordmark when the image never arrives.
      expect(tag, `${type}: styled alt text`).toContain('color:#efe5cb');
      expect(tag, `${type}: tracked alt text`).toMatch(/letter-spacing:0?\.\d+em/);
    }
  });

  it('stays on the FUTASAKU palette and layout', () => {
    for (const type of Object.keys(CONTRACT)) {
      const html = read(type);
      expect(html, `${type}: page ground`).toContain('#101112');
      expect(html, `${type}: card ground`).toContain('#18191a');
      if (CONTRACT[type]!.includes('Token')) expect(html, `${type}: code plate`).toContain('#232425');
      expect(html, `${type}: button fill`).toContain('#efe5cb');
      expect(html, `${type}: quiet brass label tone`).toContain('#b7a98a');
      expect(html, `${type}: width cap`).toContain('max-width:520px');
      expect(html, `${type}: footer`).toContain('futasaku.com');
      expect(html, `${type}: table layout`).toMatch(/<table[\s>]/i);
      // The game's display face, in its email-safe form, and the system UI face for prose.
      expect(html, `${type}: serif display heading`).toContain("font-family:Georgia,'Times New Roman',Times,serif");
    }
  });

  it('is dark by default, even where a client forces light mode', () => {
    for (const type of Object.keys(CONTRACT)) {
      const html = read(type);
      // The declared scheme plus an explicit ground on BOTH the body and the outer table: nothing is
      // left for a light-mode client to invert into a white box.
      expect(html, `${type}: dark scheme meta`).toContain('<meta name="color-scheme" content="dark">');
      expect(html, `${type}: dark scheme support`).toContain('<meta name="supported-color-schemes" content="dark">');
      expect(html, `${type}: body ground`).toMatch(/<body style="[^"]*background-color:#101112/);
      expect(html, `${type}: outer table ground`).toMatch(/<table[^>]*bgcolor="#101112"[^>]*background-color:#101112/);
      expect(html, `${type}: iOS reformatting opt-out`).toContain('x-apple-disable-message-reformatting');
    }
  });

  it('has one quiet subject per type', () => {
    const list = Object.values(subjects);
    expect(new Set(list).size, 'two email types must not share a subject').toBe(list.length);
    for (const [type, subject] of Object.entries(subjects)) {
      expect(subject, `${type}: keep it short`).toMatch(/^.{8,58}$/);
      expect(subject, `${type}: no shouting`).not.toContain('!');
      expect(subject, `${type}: lowercase or sentence case`).toBe(subject.toLowerCase());
    }
  });

  it('keeps the copy plain: no exclamation marks, no greeting filler', () => {
    for (const type of Object.keys(CONTRACT)) {
      const text = markupOnly(read(type)).replace(/<[^>]+>/g, ' ');
      expect(text, `${type}: exclamation mark`).not.toContain('!');
      expect(text, `${type}: greeting filler`).not.toMatch(/hey there|hi there|hello there/i);
    }
  });

  it('promises only the expiry the project actually has', () => {
    // `mailer_otp_exp` is 3600s (docs/EMAIL-ACCOUNTS.md). The apply script warns if that changes;
    // this pin keeps the words in the mail from drifting away from the one hour they promise.
    for (const type of Object.keys(CONTRACT)) {
      const text = markupOnly(read(type)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      expect(text, `${type}: says how long the code/link lasts`).toMatch(/VALID FOR ONE HOUR/i);
    }
  });
});
