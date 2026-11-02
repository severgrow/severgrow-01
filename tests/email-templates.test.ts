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

const DIR = join(import.meta.dirname, '..', 'server', 'email-templates');

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
    // render inline SVG; images are blocked by default. Each of these fails invisibly, in one client.
    const forbidden: [RegExp, string][] = [
      [/<style[\s>]/i, 'a <style> block'],
      [/<img[\s>]/i, 'an image'],
      [/<svg[\s>]/i, 'inline SVG'],
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

  it('stays on the FUTASAKU palette and layout', () => {
    for (const type of Object.keys(CONTRACT)) {
      const html = read(type);
      expect(html, `${type}: page ground`).toContain('#101112');
      expect(html, `${type}: card ground`).toContain('#18191a');
      expect(html, `${type}: button fill`).toContain('#efe5cb');
      expect(html, `${type}: wordmark tone`).toContain('#b7a98a');
      expect(html, `${type}: width cap`).toContain('max-width:520px');
      expect(html, `${type}: footer`).toContain('futasaku.com');
      expect(html, `${type}: table layout`).toMatch(/<table[\s>]/i);
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
});
