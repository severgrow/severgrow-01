#!/usr/bin/env node
/**
 * Render the transactional email templates to PNGs at 600px wide, so a person (or an agent) can
 * look at them before they go live.
 *
 *   node scripts/render-email-templates.mjs            # all templates, dark + light
 *   node scripts/render-email-templates.mjs recovery   # one template
 *   node scripts/render-email-templates.mjs --blocked  # what a client with images off shows
 *
 * The wordmark is an absolute URL in the mail (`https://www.futasaku.com/email/…`). A local file://
 * preview cannot fetch it, so by default the render points that ONE img at the committed local copy
 * — otherwise every preview would show the blocked state instead of the design. `--blocked` does the
 * opposite on purpose: it points the img at a host that cannot resolve, so the alt-text fallback,
 * the reserved box and the layout can be judged exactly as a first-time recipient sees them.
 *
 * Writes /tmp/futasaku-email-<type>.png, /tmp/futasaku-email-<type>-light.png,
 * /tmp/futasaku-email-<type>-blocked.png and /tmp/futasaku-email-<type>-html/<type>.html (the
 * substituted HTML, for inspection). Uses playwright-core, already a devDependency; set
 * PW_CHROMIUM to a Chromium binary if the Playwright cache is missing.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

/** The one hosted asset the templates reference. Kept in step with the HTML by the unit test. */
const LOGO_URL = 'https://www.futasaku.com/email/futasaku-wordmark.png';
const LOGO_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'public', 'email', 'futasaku-wordmark.png');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'server', 'email-templates');
const OUT = '/tmp';

/** Dummy values that look like the real thing, so wrapping and spacing are honest. */
const SAMPLE = {
  ConfirmationURL:
    'https://wbfrbeedlvjercrukngn.supabase.co/auth/v1/verify?token=pkce_9f2c41d7a8b3e6f04c5d&type=signup&redirect_to=https%3A%2F%2Fwww.futasaku.com%2Ftest%2F',
  Token: '48291573',
  Email: 'player@example.com',
  NewEmail: 'new.address@example.com',
  SiteURL: 'https://www.futasaku.com',
  RedirectTo: 'https://www.futasaku.com/test/',
  TokenHash: '9f2c41d7a8b3e6f04c5d',
};

const TYPES = ['confirmation', 'recovery', 'magic_link', 'email_change', 'invite', 'reauthentication'];

function substitute(type, html) {
  const out = html.replace(/\{\{\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (whole, name) => {
    if (!(name in SAMPLE)) throw new Error(`${type}: no sample value for {{ .${name} }}`);
    return SAMPLE[name];
  });
  if (out.includes('{{')) throw new Error(`${type}: malformed variable left in the template`);
  return out;
}

/** playwright-core finds the browser in its cache; fall back to any cached Chrome build. */
function cachedChromium() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const base = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  let entries = [];
  try {
    entries = readdirSync(base).filter((name) => name.startsWith('chromium-')).sort().reverse();
  } catch {
    return null;
  }
  for (const name of entries) {
    const root = join(base, name, 'chrome-mac-arm64');
    for (const bundle of ['Google Chrome for Testing.app', 'Chromium.app']) {
      for (const binary of ['Google Chrome for Testing', 'Chromium']) {
        const path = join(root, bundle, 'Contents', 'MacOS', binary);
        try {
          readFileSync(path);
          return path;
        } catch {
          /* try the next one */
        }
      }
    }
  }
  return null;
}

const only = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const types = only.length ? TYPES.filter((type) => only.includes(type)) : TYPES;
if (!types.length) {
  console.error(`Unknown template. Choose from: ${TYPES.join(', ')}`);
  process.exit(1);
}

/** `--blocked` renders the images-off state, deterministically (a host that cannot resolve). */
const blocked = process.argv.includes('--blocked');
if (!blocked && !existsSync(LOGO_FILE)) {
  console.error(`Missing ${LOGO_FILE} — run node scripts/build-email-wordmark.mjs first.`);
  process.exit(1);
}
const logoSrc = blocked ? 'https://images-off.invalid/futasaku-wordmark.png' : pathToFileURL(LOGO_FILE).href;

const executablePath = cachedChromium();
const browser = await chromium.launch(executablePath ? { executablePath } : {});

try {
  for (const type of types) {
    // Substitute Supabase variables first, then swap only the logo URL for this preview.
    let html = substitute(type, readFileSync(join(DIR, `${type}.html`), 'utf8'));
    if (!html.includes(LOGO_URL) && !blocked) console.warn(`WARN  ${type}: no ${LOGO_URL} in the template`);
    html = html.replaceAll(LOGO_URL, logoSrc);
    const dir = join(OUT, `futasaku-email-${type}-html`);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${type}${blocked ? '-blocked' : ''}.html`);
    writeFileSync(file, html);

    for (const scheme of blocked ? ['dark'] : ['dark', 'light']) {
      // Tall viewport + an explicit clip: content height is not known until the page lays out, and
      // fullPage capture with a device pixel ratio can stitch the same band twice.
      const page = await browser.newPage({ viewport: { width: 600, height: 2000 }, deviceScaleFactor: 2, colorScheme: scheme });
      await page.goto(`file://${file}`);
      // The img has explicit dimensions, so a missing file must not move anything; wait for the
      // browser to settle its blocked-image state before the shot.
      await page.waitForTimeout(150);
      const size = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: Math.ceil(document.body.getBoundingClientRect().height),
        image: (() => {
          const img = document.querySelector('img');
          if (!img) return null;
          const box = img.getBoundingClientRect();
          return { loaded: img.complete && img.naturalWidth > 0, width: Math.round(box.width), height: Math.round(box.height) };
        })(),
      }));
      const shot = join(OUT, `futasaku-email-${type}${blocked ? '-blocked' : scheme === 'light' ? '-light' : ''}.png`);
      await page.screenshot({ path: shot, clip: { x: 0, y: 0, width: size.width, height: size.height } });
      const image = size.image ? `${size.image.loaded ? 'logo' : 'NO LOGO'} ${size.image.width}x${size.image.height}` : 'no img';
      console.log(`${type.padEnd(16)} ${scheme.padEnd(5)} ${String(size.width).padStart(4)}x${String(size.height).padStart(4)}  ${image.padEnd(14)} ${shot}`);
      await page.close();
    }

    if (blocked) continue;

    // A phone is the usual reader. Measure it rather than guess: no sideways scroll allowed, the
    // cream button must stay on one line, and nothing inside the card may poke past its edge (a
    // previous pass shipped both an overflowing code plate and a wrapped button).
    // 320px is the narrowest phone the game itself supports, so it is the real floor; 390 is the
    // common iPhone width.
    for (const width of [390, 320]) {
      const phone = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: 2 });
      await phone.goto(`file://${file}`);
      const narrow = await phone.evaluate(() => {
        const cardTable = document.querySelector('table[width="520"]');
        const card = cardTable?.getBoundingClientRect();
        const button = document.querySelector('td[bgcolor="#efe5cb"] a')?.getBoundingClientRect();
        const plate = document.querySelector('td[align="center"][style*="SFMono-Regular"]');
        const escaped = card && cardTable
          ? [...cardTable.querySelectorAll('td, p, h1, a, img')]
              .filter((el) => {
                const box = el.getBoundingClientRect();
                return box.width > 0 && (box.right > card.right + 1 || box.left < card.left - 1);
              })
              .map((el) => el.tagName.toLowerCase())
          : [];
        return {
          scroll: document.documentElement.scrollWidth,
          card: card?.width ?? 0,
          button: button ? { width: Math.round(button.width), height: Math.round(button.height) } : null,
          plateOverflow: plate ? plate.scrollWidth - plate.clientWidth : 0,
          escaped,
        };
      });
      const notes = [];
      if (narrow.scroll > width) notes.push(`OVERFLOW ${narrow.scroll}px`);
      if (narrow.button && narrow.button.height > 50) notes.push(`BUTTON WRAPPED ${narrow.button.height}px`);
      if (narrow.plateOverflow > 0) notes.push(`CODE PLATE OVERFLOWS ${narrow.plateOverflow}px`);
      if (narrow.escaped.length) notes.push(`ESCAPES CARD: ${[...new Set(narrow.escaped)].join(', ')}`);
      const button = narrow.button ? `button ${narrow.button.width}x${narrow.button.height}` : 'no button';
      console.log(`${type.padEnd(16)} mobile ${width} ${notes.length ? `FAIL ${notes.join('; ')}` : `fits (card ${Math.round(narrow.card)}px, ${button})`}`);
      // Keep the phone view too: a number that fits is not the same as a layout that reads.
      const phoneShot = join(OUT, `futasaku-email-${type}-${width}.png`);
      const height = await phone.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height));
      await phone.screenshot({ path: phoneShot, clip: { x: 0, y: 0, width, height } });
      await phone.close();
    }
  }
} finally {
  await browser.close();
}
