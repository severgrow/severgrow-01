#!/usr/bin/env node
/**
 * Render the transactional email templates to PNGs at 600px wide, so a person (or an agent) can
 * look at them before they go live.
 *
 *   node scripts/render-email-templates.mjs            # all templates, dark + light
 *   node scripts/render-email-templates.mjs recovery   # one template
 *
 * Writes /tmp/futasaku-email-<type>.png, /tmp/futasaku-email-<type>-light.png and
 * /tmp/futasaku-email-<type>-html/<type>.html (the substituted HTML, for inspection).
 * Uses playwright-core, already a devDependency; set PW_CHROMIUM to a Chromium binary if the
 * Playwright cache is missing.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

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

const executablePath = cachedChromium();
const browser = await chromium.launch(executablePath ? { executablePath } : {});

try {
  for (const type of types) {
    const html = substitute(type, readFileSync(join(DIR, `${type}.html`), 'utf8'));
    const dir = join(OUT, `futasaku-email-${type}-html`);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${type}.html`);
    writeFileSync(file, html);

    for (const scheme of ['dark', 'light']) {
      // Tall viewport + an explicit clip: content height is not known until the page lays out, and
      // fullPage capture with a device pixel ratio can stitch the same band twice.
      const page = await browser.newPage({ viewport: { width: 600, height: 2000 }, deviceScaleFactor: 2, colorScheme: scheme });
      await page.goto(`file://${file}`);
      const size = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: Math.ceil(document.body.getBoundingClientRect().height),
      }));
      const shot = join(OUT, `futasaku-email-${type}${scheme === 'light' ? '-light' : ''}.png`);
      await page.screenshot({ path: shot, clip: { x: 0, y: 0, width: size.width, height: size.height } });
      console.log(`${type.padEnd(16)} ${scheme.padEnd(5)} ${String(size.width).padStart(4)}x${String(size.height).padStart(4)}  ${shot}`);
      await page.close();
    }

    // A phone is the usual reader. Measure it rather than guess: no sideways scroll allowed.
    // 320px is the narrowest phone the game itself supports, so it is the real floor.
    for (const width of [360, 320]) {
      const phone = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: 2 });
      await phone.goto(`file://${file}`);
      const narrow = await phone.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        card: document.querySelector('table[width="520"]')?.getBoundingClientRect().width ?? 0,
      }));
      if (narrow.scroll > width) console.log(`${type.padEnd(16)} MOBILE ${width}: OVERFLOW ${narrow.scroll}px`);
      else console.log(`${type.padEnd(16)} mobile ${width} fits (card ${Math.round(narrow.card)}px)`);
      await phone.close();
    }
  }
} finally {
  await browser.close();
}
