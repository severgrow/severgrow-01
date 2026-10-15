// The static /privacy page — real, crawlable HTML with the whole policy in the document body.
//
// WHY THIS EXISTS: Google's OAuth branding verification rejected the app because
// https://futasaku.com/privacy "does not have sufficient content" — there was no such page at all.
// The only policy was the in-app panel at futasaku.com/#privacy, a hash fragment a crawler does not
// treat as a page and which needs JavaScript to render. This module emits a self-contained
// `privacy/index.html` at build time so a crawler with JavaScript off sees every line.
//
// ONE SOURCE OF TRUTH: the content is generated from `PRIVACY` in src/strings.ts (see vite.config.ts
// and web/tests/privacy-page.test.ts). Never retype the policy here — a hand-copied duplicate drifts
// and the verification is rejected again. There is no external script or stylesheet: the page must
// render for a crawler, so its styling is one inline <style> block and nothing else is fetched.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Where the page lands inside the built site: `<outDir>/privacy/index.html` -> `https://…/privacy`. */
export const PRIVACY_PAGE_PATH = 'privacy/index.html';

/** The shape this renderer needs from `PRIVACY` (src/strings.ts). Structural, so the two cannot drift. */
export type PrivacyPolicy = {
  readonly title: string;
  readonly updated: string;
  readonly intro: string;
  readonly sections: readonly {
    readonly heading: string;
    readonly lines: readonly string[];
  }[];
};

/** Escape text for HTML content. */
const esc = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Escape text for an HTML attribute value. */
const attr = (value: string): string => esc(value).replace(/"/g, '&quot;');

/**
 * The FUTASAKU tonal family, restrained: dark charcoal ground, warm cream ink, no web fonts and no
 * images. Everything is inline so the document is complete on its own and nothing can 404 it.
 */
const STYLE = `:root { color-scheme: dark; }
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  background: #0e100f;
  color: #ece2cd;
  font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-text-size-adjust: 100%;
}
main { max-width: 46rem; margin: 0 auto; padding: clamp(1.25rem, 4vw, 3.5rem) clamp(1rem, 5vw, 2rem) 4rem; }
.wordmark { display: inline-block; margin: 0 0 2rem; color: #b7a98a; font: 700 0.85rem/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: 0.16em; text-decoration: none; }
h1 { margin: 0 0 0.35rem; color: #f6ecd8; font-size: clamp(1.7rem, 6vw, 2.4rem); letter-spacing: 0.02em; }
.updated { margin: 0 0 1.5rem; color: #b7a98a; font-size: 0.9rem; letter-spacing: 0.04em; }
.intro { margin: 0 0 0.5rem; color: #f0e9dc; font-size: 1.05rem; }
section { margin: 2rem 0 0; padding-top: 1.5rem; border-top: 1px solid rgba(214, 204, 177, 0.16); }
h2 { margin: 0 0 0.75rem; color: #e2d4b4; font-size: 1.15rem; letter-spacing: 0.04em; }
ul { margin: 0; padding-left: 1.15rem; display: grid; gap: 0.5rem; }
li { color: #ece2cd; }
a { color: #cfe0a6; text-decoration: underline; text-underline-offset: 3px; }
footer { margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid rgba(214, 204, 177, 0.16); color: #b7a98a; font-size: 0.85rem; }
`;

/**
 * Render the whole `/privacy` document from the policy data. Deterministic and dependency-free:
 * one inline <style>, no <script>, no external <link>, no images.
 */
export function renderPrivacyPage(privacy: PrivacyPolicy): string {
  const sections = privacy.sections
    .map(
      (section) => `      <section>
        <h2>${esc(section.heading)}</h2>
        <ul>
${section.lines.map((line) => `          <li>${esc(line)}</li>`).join('\n')}
        </ul>
      </section>`,
    )
    .join('\n');

  // The in-app document and this one must be the same policy, so the panel additionally links here.
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(privacy.title)} — Futasaku</title>
    <meta name="description" content="${attr(privacy.intro)}" />
    <link rel="canonical" href="https://www.futasaku.com/privacy" />
    <style>
${STYLE}    </style>
  </head>
  <body>
    <main>
      <a class="wordmark" href="../">FUTASAKU</a>
      <h1>${esc(privacy.title)}</h1>
      <p class="updated">${esc(privacy.updated)}</p>
      <p class="intro">${esc(privacy.intro)}</p>
${sections}
      <footer>The in-app policy sits in Settings; this page is the same document at futasaku.com/privacy.</footer>
    </main>
  </body>
</html>
`;
}

/**
 * Write the generated page into a built site: `<distDir>/privacy/index.html`. Returns the file path.
 * The build (`web/vite.config.ts`) calls this, and web/tests/privacy-page.test.ts asserts the bytes.
 */
export function writePrivacyPage(privacy: PrivacyPolicy, distDir: string): string {
  const file = join(distDir, PRIVACY_PAGE_PATH);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, renderPrivacyPage(privacy), 'utf8');
  return file;
}
