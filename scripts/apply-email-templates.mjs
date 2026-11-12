#!/usr/bin/env node
/**
 * Apply the FUTASAKU transactional email templates to Supabase Auth.
 *
 * The HTML in `server/email-templates/` is the source of truth. This script reads it, checks it
 * against the rules an inbox actually enforces, then PATCHes the project's Auth config fields
 * `mailer_subjects_<type>` and `mailer_templates_<type>_content`. It never touches SMTP, rate
 * limits or `mailer_otp_exp`.
 *
 *   node scripts/apply-email-templates.mjs --dry-run   # validate locally, no network
 *   node scripts/apply-email-templates.mjs             # apply, then read back and verify
 *   node scripts/apply-email-templates.mjs --verify    # read back only
 *
 * The management token comes from SUPABASE_ACCESS_TOKEN or the git-ignored `.env`; it is never
 * printed. Templates are idempotent: unchanged fields are not PATCHed.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'server', 'email-templates');
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'wbfrbeedlvjercrukngn';
const API = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;

/**
 * The Supabase variables each template may use — exactly. A typo (`{{ .Tokn }}`) or a copy of the
 * wrong template's variable would silently break sign-up, so the list is closed, not a suggestion:
 * anything outside it fails validation, and every required one must be present.
 */
const TYPES = {
  confirmation: { vars: ['ConfirmationURL', 'Token'], purpose: 'finish a new account' },
  recovery: { vars: ['ConfirmationURL'], purpose: 'reset a password' },
  magic_link: { vars: ['ConfirmationURL', 'Token'], purpose: 'sign in' },
  email_change: { vars: ['ConfirmationURL', 'Email', 'NewEmail'], purpose: 'confirm a new address' },
  invite: { vars: ['ConfirmationURL'], purpose: 'accept an invitation' },
  reauthentication: { vars: ['Token'], purpose: 'reauthenticate' },
};

/** Marks this suite of emails as one family; the apply step refuses a file that drifts from it. */
const REQUIRED_MARKERS = [
  ['#101112', 'the page ground'],
  ['#18191a', 'the card ground'],
  ['#efe5cb', 'the primary button fill'],
  ['#b7a98a', 'the quiet brass label tone'],
  ['futasaku.com', 'the footer link'],
  ['max-width:520px', 'the 600px-max width rule'],
];

/**
 * The one image the mail may carry: the game's treeless wordmark, hosted from the site (not a
 * hashed bundle path — an email is read long after that build is gone), 150x46 CSS px backed by a
 * committed 300x92 file, alt text that reads as the wordmark when images are off.
 */
const LOGO_URL = 'https://www.futasaku.com/email/futasaku-wordmark.png';
const LOGO_FILE = join(ROOT, 'web', 'public', 'email', 'futasaku-wordmark.png');
const LOGO_BOX = { width: 150, height: 46 };

const FORBIDDEN = [
  [/<style[\s>]/i, 'a <style> block (Gmail strips it)'],
  [/<svg[\s>]/i, 'inline SVG (Gmail does not render it)'],
  [/<picture[\s>]/i, 'a <picture> element (not one image contract)'],
  [/background-image/i, 'a CSS background image (blocked with images)'],
  [/srcset=/i, 'a srcset (one fixed 2x file is enough)'],
  [/backdrop-filter/i, 'backdrop-filter (no email client supports it)'],
  [/var\(--/i, 'a CSS variable (most clients do not support them)'],
  [/@media/i, 'a media query (keep one layout that works everywhere)'],
  [/@import/i, 'an @import (no external stylesheets in email)'],
  [/fonts\.googleapis|font-face/i, 'a web font (it will not load)'],
  [/url\(/i, 'a url() background (blocked with images)'],
  [/position:\s*(fixed|absolute)/i, 'absolute positioning (no email client lays out like that)'],
];

/** The committed PNG's real size, checked once: the template's box must be exactly half of it. */
function logoSize() {
  const buffer = readFileSync(LOGO_FILE);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readEnv() {
  let text = '';
  try {
    text = readFileSync(join(ROOT, '.env'), 'utf8');
  } catch {
    return {};
  }
  const out = {};
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!match) continue;
    let value = match[2].trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    out[match[1]] = value;
  }
  return out;
}

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exitCode = 1;
}

/** Validate one template against the inbox rules and its own variable contract. */
function checkTemplate(type, html, vars) {
  const problems = [];
  // The authoring comments name the rules ("no <style>"), so judge the real markup only.
  const markup = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const [pattern, what] of FORBIDDEN) {
    if (pattern.test(markup)) problems.push(`contains ${what}`);
  }
  for (const [marker, what] of REQUIRED_MARKERS) {
    if (!html.includes(marker)) problems.push(`missing ${what} (${marker})`);
  }
  if (!/<table[\s>]/i.test(markup)) problems.push('is not table-based');
  if (!/<meta name="viewport"/i.test(markup)) problems.push('has no viewport meta');

  // Exactly one image, and it is THE wordmark: the absolute site URL, fixed 150x46 box, alt text
  // that still names the brand when an inbox blocks it. Anything else is a second failure mode.
  const images = [...markup.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  if (images.length !== 1) problems.push(`must carry exactly one image (found ${images.length})`);
  for (const tag of images) {
    if (!tag.includes(`src="${LOGO_URL}"`)) problems.push(`the image is not ${LOGO_URL}`);
    if (!/alt="FUTASAKU"/.test(tag)) problems.push('the image has no meaningful alt text');
    if (!tag.includes(`width="${LOGO_BOX.width}"`) || !tag.includes(`height="${LOGO_BOX.height}"`)) {
      problems.push(`the image must declare width="${LOGO_BOX.width}" height="${LOGO_BOX.height}"`);
    }
    if (!tag.includes(`width:${LOGO_BOX.width}px`) || !tag.includes(`height:${LOGO_BOX.height}px`)) {
      problems.push('the image must also reserve that box in inline CSS');
    }
    if (!tag.includes('display:block')) problems.push('the image must be display:block');
  }

  const found = [...html.matchAll(/\{\{\s*(?:\.\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)].map((m) => m[1]);
  const braces = (html.match(/\{\{/g) || []).length;
  if (braces !== found.length) problems.push('has a malformed {{ … }} variable');
  for (const name of found) {
    if (!vars.includes(name)) problems.push(`uses {{ .${name} }} — not allowed in ${type}`);
  }
  for (const name of vars) {
    // The variable must appear as the exact Supabase token: no URL-encoding, no reformatting.
    if (!html.includes(`{{ .${name} }}`)) problems.push(`is missing the exact token {{ .${name} }}`);
  }
  return problems;
}

function load() {
  const subjects = JSON.parse(readFileSync(join(DIR, 'subjects.json'), 'utf8'));
  // The templates point at the committed asset; refuse a missing or re-exported-at-another-size file
  // instead of sending a mail whose box would squeeze the mark.
  const size = logoSize();
  if (!size) fail('web/public/email/futasaku-wordmark.png is missing — run node scripts/build-email-wordmark.mjs');
  else if (size.width !== LOGO_BOX.width * 2 || size.height !== LOGO_BOX.height * 2) {
    fail(`the wordmark is ${size.width}x${size.height}; the templates display ${LOGO_BOX.width}x${LOGO_BOX.height}, so it must be exactly ${LOGO_BOX.width * 2}x${LOGO_BOX.height * 2}`);
  }
  const files = [];
  for (const [type, { vars, purpose }] of Object.entries(TYPES)) {
    const subject = subjects[type];
    if (!subject) {
      fail(`${type}: no subject in subjects.json`);
      continue;
    }
    const html = readFileSync(join(DIR, `${type}.html`), 'utf8');
    const problems = checkTemplate(type, html, vars);
    if (problems.length) {
      fail(`${type}: ${problems.join('; ')}`);
      continue;
    }
    files.push({ type, subject, html, purpose });
  }
  return files;
}

async function request(token, init) {
  const response = await fetch(API, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message = typeof body?.message === 'string' ? body.message : `HTTP ${response.status}`;
    throw new Error(message.slice(0, 200));
  }
  return body ?? {};
}

/** Is the wordmark actually served? A 404 here means every recipient gets the alt-text fallback. */
async function logoStatus() {
  try {
    const response = await fetch(LOGO_URL, { method: 'HEAD', redirect: 'follow' });
    return `HTTP ${response.status}`;
  } catch (error) {
    return `unreachable (${(error instanceof Error ? error.message : String(error)).slice(0, 80)})`;
  }
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const verifyOnly = args.has('--verify');

const templates = load();
if (!templates.length) {
  console.error('No valid templates — nothing to do.');
  process.exit(1);
}

if (dryRun) {
  for (const { type, subject, html, purpose } of templates) {
    const words = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').length;
    console.log(`OK    ${type.padEnd(16)} ${String(html.length).padStart(5)} B  ${String(words).padStart(3)} words  ${purpose}`);
    console.log(`      subject: ${subject}`);
  }
  console.log(`      wordmark: ${LOGO_URL} (${LOGO_BOX.width}x${LOGO_BOX.height}, file ${LOGO_BOX.width * 2}x${LOGO_BOX.height * 2})`);
  console.log(`\n${templates.length} templates valid. Nothing was sent to Supabase.`);
  process.exit(0);
}

const env = readEnv();
const token = process.env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('FAIL  no SUPABASE_ACCESS_TOKEN (set it, or put it in .env).');
  process.exit(1);
}

const fields = (t) => ({
  [`mailer_subjects_${t.type}`]: t.subject,
  [`mailer_templates_${t.type}_content`]: t.html,
});

try {
  // A 200 from Supabase is not proof a recipient sees the mark: the file has to be served too.
  // This is a report, not a gate — the asset ships in the same commit as the templates, and before
  // the site publishes it every mailbox shows the styled alt-text wordmark (never an empty box).
  const logo = await logoStatus();
  console.log(`LOGO  ${LOGO_URL} → ${logo}${logo === 'HTTP 200' ? '' : '  (until it is published, mail shows the alt-text wordmark)'}\n`);

  const current = await request(token, { method: 'GET' });
  // The copy says "one hour". That has to match the project's real expiry, not last month's config:
  // never promise a duration the server does not honour.
  const expiry = current.mailer_otp_exp;
  if (typeof expiry === 'number' && expiry !== 3600) {
    console.warn(`WARN  mailer_otp_exp is ${expiry}s, but the templates say "one hour" — update the copy.`);
  }
  const plan = [];
  for (const t of templates) {
    const wanted = fields(t);
    const changed = Object.entries(wanted).filter(([key, value]) => current[key] !== value);
    plan.push({ t, wanted, changed });
    const was = typeof current[`mailer_subjects_${t.type}`] === 'string' ? ` was "${current[`mailer_subjects_${t.type}`]}"` : '';
    console.log(`${changed.length ? 'UPDATE' : 'SAME  '}  ${t.type.padEnd(16)} ${changed.length ? `${changed.length} field(s)` : 'already current'}${was}`);
  }

  const body = {};
  for (const { wanted, changed } of plan) {
    for (const [key, value] of Object.entries(wanted)) {
      if (changed.some(([k]) => k === key)) body[key] = value;
    }
  }

  if (!verifyOnly && Object.keys(body).length) {
    await request(token, { method: 'PATCH', body: JSON.stringify(body) });
    console.log(`\nPATCHed ${Object.keys(body).length} field(s) on ${PROJECT_REF}.`);
  } else if (!verifyOnly) {
    console.log('\nNothing to PATCH.');
  }

  // Read back: a 200 from PATCH is not proof the fields stored what we sent.
  const after = await request(token, { method: 'GET' });
  let bad = 0;
  console.log('\nVerify');
  for (const t of templates) {
    const subject = after[`mailer_subjects_${t.type}`];
    const content = after[`mailer_templates_${t.type}_content`];
    const ok = subject === t.subject && typeof content === 'string' && content.trim() === t.html.trim();
    if (!ok) bad++;
    console.log(`${ok ? 'OK  ' : 'FAIL'}  ${t.type.padEnd(16)} subject "${subject ?? ''}" · ${content ? `${content.length} B` : 'EMPTY'}`);
  }
  process.exitCode = bad ? 1 : 0;
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
