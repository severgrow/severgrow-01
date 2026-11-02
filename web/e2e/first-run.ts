// THE FIRST-RUN NUDGE (owner brief, 2026-11-01) — the browser guard.
//
//   CHANNEL=futa04 VITE_DUEL_API_URL=/functions/v1/duel npm run web:build
//   npx tsx web/e2e/first-run.ts
//
// Serves the CURRENT `web/dist` (the product build) and drives real Chromium:
//   1. a fresh, signed-out device sees ten lamps on the PLAY key, none of them lit — Source A only;
//   2. the lamps are DECORATION on the key: a tap on a lamp lands on PLAY itself (no stolen tap),
//      and the PLAY submenu that opens leads with LEVEL 1, the one cream key — so the nudge really
//      is the way to level 1;
//   3. three cleared lessons are three lit lamps, and the count is spoken on the key;
//   4. once c1-10 is cleared the strip is gone from the menu — and stays gone through a reload and
//      a trip into the PLAY submenu and back (a replay/practice cannot bring it back);
//   5. a SIGNED-IN account with cleared levels lights the lamps on a device that knows nothing
//      (the union); an account that has cleared all ten hides the nudge on a fresh device; the one
//      account read happens once and the cached answer serves the next open with NO request;
//   6. it costs geometry nothing: the menu's key heights and the gaps between them are EXACTLY what
//      they are with the strip hidden, at 320x568 and 390x844, with Large text as well;
//   7. no page error is logged.
//
// The account scenarios intercept `/v1/players/me/campaign` in Chromium, so the build just needs an
// online endpoint configured (the VITE_DUEL_API_URL above makes `duelApiUrl()` non-null). No server
// runs and no real account is touched.
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';

const DIST = process.env.FUTA_DIST ?? 'web/dist';
const PROGRESS_KEY = 'severgrow.campaign.progress.v3';
const IDENTITY_KEY = 'severgrow.duel.identity.v1';
const KEY_H = 50;
const C1 = ['c1-01', 'c1-02', 'c1-03', 'c1-04', 'c1-05', 'c1-06', 'c1-07', 'c1-08', 'c1-09', 'c1-10'];

const types: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
  let file = join(DIST, path === '/' ? 'index.html' : path);
  if (!existsSync(file) || file.endsWith('/')) file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM
    ? { executablePath: process.env.PW_CHROMIUM }
    : existsSync('/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')
      ? { executablePath: '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' }
      : {}),
  args: ['--no-sandbox'],
});

/** Everything one menu pass shows, measured from the real page. */
const MEASURE = `(() => {
  const q = (s) => document.querySelector(s);
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), bottom: +r.bottom.toFixed(1), right: +r.right.toFixed(1) }; };
  const key = q('#menu-play');
  const strip = q('#menu-play-lessons');
  const keys = [...document.querySelectorAll('#menu .menu-buttons .btn')].filter((b) => b.offsetParent !== null)
    .sort((a, b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y || a.getBoundingClientRect().x - b.getBoundingClientRect().x);
  // The owner's equal-spacing rule: the space between CONSECUTIVE keys, in visual order (a pair on
  // one row is not a vertical gap).
  const gaps = [];
  for (let i = 1; i < keys.length; i++) {
    const p = keys[i - 1].getBoundingClientRect(), c = keys[i].getBoundingClientRect();
    if (Math.abs(c.y - p.y) < 1) continue;
    gaps.push(+(c.y - p.bottom).toFixed(1));
  }
  const lamps = strip ? [...strip.children] : [];
  return {
    key: key ? { ...box(key), label: (key.textContent || '').trim(), aria: key.getAttribute('aria-label'), visible: key.offsetParent !== null } : null,
    strip: strip ? { hidden: strip.hidden, shown: strip.offsetParent !== null, ...box(strip) } : null,
    lamps: lamps.map((l) => ({ ...box(l), w: +l.getBoundingClientRect().width.toFixed(1), on: l.classList.contains('on'), filled: getComputedStyle(l).backgroundColor })),
    keys: keys.map((k) => ({ id: k.id, ...box(k) })),
    gaps,
    innerOverflow: (() => { const el = q('#menu .menu-inner'); return el ? Math.max(0, Math.round(el.scrollHeight - el.clientHeight)) : null; })(),
    screenOverflow: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
})()`;

type Box = { x: number; y: number; w: number; h: number; bottom: number; right: number };
type Measured = {
  key: (Box & { label: string; aria: string | null; visible: boolean }) | null;
  strip: (Box & { hidden: boolean; shown: boolean }) | null;
  lamps: (Box & { on: boolean; filled: string })[];
  keys: (Box & { id: string })[];
  gaps: number[];
  innerOverflow: number | null;
  screenOverflow: number;
  viewport: { w: number; h: number };
};
const measure = (page: Page) => page.evaluate(MEASURE) as Promise<Measured>;

const results: { name: string; ok: boolean; note: string }[] = [];
const check = (name: string, ok: boolean, note = '') => {
  results.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const storage = (completed: string[]) => JSON.stringify({ version: 1, unlocked: Math.min(11, completed.length + 1), completed, best: {} });

/** A fresh device: no storage at all. (The clear must be a one-off, after the page has booted and
 *  patched Storage — an init script would wipe every later navigation, including a seeded reload.) */
const openFresh = async (page: Page) => {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#menu:not([hidden])', { timeout: 30_000 });
  await page.waitForTimeout(600); // the injected typography stylesheet mounts after boot
};

/** The same device, a returning player with this campaign record on it. */
const reopenWith = async (page: Page, completed: string[]) => {
  await page.evaluate((pair) => localStorage.setItem(pair[0], pair[1]), [PROGRESS_KEY, storage(completed)] as [string, string]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#menu:not([hidden])', { timeout: 30_000 });
  await page.waitForTimeout(600);
};

/**
 * A signed-in account on a device, with the account's campaign endpoint intercepted. The answer is
 * the server's `campaignHighestLevel` shape (`{ ok, campaign: { highestLevel } }`), so this drives
 * the REAL client path (identity → one bounded GET → derive 1..N → union → repaint), not a
 * hand-written cache. `cleared` names the levels the account has finished; the device derives the
 * furthest one. `deviceCompleted` is what THIS device already knows; empty is the new-phone case.
 */
const openAccount = async (
  page: Page,
  cleared: readonly number[],
  deviceCompleted: readonly string[] = [],
) => {
  let requests = 0;
  const highest = cleared.length ? Math.max(...cleared) : null;
  await page.route('**/v1/players/me/campaign', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
        'access-control-allow-headers': '*',
      } });
      return;
    }
    requests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ ok: true, campaign: { highestLevel: highest }, serverNow: Date.now() }),
    });
  });
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await page.evaluate((pair) => {
    localStorage.clear();
    localStorage.setItem(pair[0], JSON.stringify({
      token: 'e2e-account-token', playerId: 'e2e-account', displayName: 'RYK', kind: 'account',
    }));
    if (pair[1]) localStorage.setItem(pair[2], pair[1]);
  }, [IDENTITY_KEY, deviceCompleted.length ? storage([...deviceCompleted]) : '', PROGRESS_KEY] as [string, string, string]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#menu:not([hidden])', { timeout: 30_000 });
  await page.waitForTimeout(600);
  return { requests: () => requests };
};

const VIEWPORTS = [
  { key: '320x568', width: 320, height: 568 },
  { key: '390x844', width: 390, height: 844 },
] as const;

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript({ content: 'window.__name = (f) => f;' });
  const tag = vp.key;

  // ---- 1. a new player sees the nudge, with nothing lit --------------------------------
  await openFresh(page);
  const fresh = await measure(page);
  check(`${tag}: a new player sees the ten lamps on PLAY`, !!fresh.strip && fresh.strip.shown && fresh.strip.hidden === false, JSON.stringify(fresh.strip));
  check(`${tag}: ten lamps, none of them lit`, fresh.lamps.length === 10 && fresh.lamps.every((l) => !l.on));
  check(`${tag}: the key says the count aloud, the lamps say nothing`, fresh.key?.aria === 'Play. 0 of 10 lessons completed', String(fresh.key?.aria));
  check(`${tag}: PLAY is the cream key and still reads PLAY`, fresh.key?.label === 'Play' && fresh.key?.h === KEY_H, `${fresh.key?.label} ${fresh.key?.h}px`);

  // The strip is decoration INSIDE the key, never a control of its own.
  const insideKey = !!fresh.key && !!fresh.strip && fresh.strip.y >= fresh.key.y && fresh.strip.bottom <= fresh.key.bottom
    && fresh.strip.x >= fresh.key.x && fresh.strip.right <= fresh.key.right;
  check(`${tag}: every lamp sits inside the PLAY key, above its bottom edge`, insideKey, JSON.stringify({ key: fresh.key, strip: fresh.strip }));
  const hit = await page.evaluate(() => {
    const strip = document.getElementById('menu-play-lessons')!;
    const key = document.getElementById('menu-play')!;
    const r = strip.getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { onKey: el === key || key.contains(el), tag: el?.id ?? el?.className ?? null };
  });
  check(`${tag}: a tap on a lamp belongs to the key underneath it`, hit.onKey, String(hit.tag));
  check(`${tag}: the menu does not overflow`, fresh.innerOverflow === 0 && fresh.screenOverflow === 0, `inner ${fresh.innerOverflow}, screen ${fresh.screenOverflow}`);

  // ---- 2. tapping the nudge reaches LEVEL 1 -------------------------------------------
  const lamp = fresh.lamps[Math.floor(fresh.lamps.length / 2)]!;
  await page.mouse.click(lamp.x + lamp.w / 2, lamp.y + lamp.h / 2);
  const submenu = await page.waitForSelector('#play-menu:not([hidden])', { timeout: 10_000 }).then(() => true).catch(() => false);
  check(`${tag}: tapping the lamps opens PLAY (one honest target)`, submenu);
  const entry = await page.evaluate(() => {
    const el = document.getElementById('menu-campaign')!;
    return { text: el.textContent.trim(), lead: el.classList.contains('primary'), visible: el.offsetParent !== null };
  });
  check(`${tag}: LEVEL 1 is the cream lead of that submenu`, entry.visible && entry.text === 'LEVEL 1' && entry.lead, JSON.stringify(entry));
  await page.click('#menu-campaign');
  const playing = await page.waitForSelector('#game:not([hidden])', { timeout: 20_000 }).then(() => true).catch(() => false);
  const board = await page.evaluate(() => document.querySelectorAll('#board > *').length);
  check(`${tag}: and that entry starts level 1 on a real board`, playing && board > 0, `board nodes ${board}`);

  // ---- 3. partial progress is visible in the lamps ------------------------------------
  await openFresh(page);
  await reopenWith(page, ['c1-01', 'c1-02', 'c1-03']);
  const partial = await measure(page);
  check(`${tag}: three cleared lessons light three lamps`, partial.lamps.filter((l) => l.on).length === 3 && partial.lamps.length === 10, `${partial.lamps.filter((l) => l.on).length} lit`);
  check(`${tag}: a filled lamp is the key's ink, an open one is only a ring`,
    partial.lamps.filter((l) => l.on).every((l) => l.filled === 'rgb(23, 24, 26)') && partial.lamps.filter((l) => !l.on).every((l) => l.filled === 'rgba(0, 0, 0, 0)'),
    `${partial.lamps[0]?.filled} / ${partial.lamps[9]?.filled}`);
  check(`${tag}: the lit ones are the FIRST ones (left to right, one per lesson)`,
    partial.lamps.map((l) => l.on).join(',') === 'true,true,true,false,false,false,false,false,false,false');
  check(`${tag}: the spoken count follows the lamps`, partial.key?.aria === 'Play. 3 of 10 lessons completed', String(partial.key?.aria));

  // ---- 4. the tenth lesson ends it, for good ------------------------------------------
  await reopenWith(page, C1);
  const done = await measure(page);
  check(`${tag}: after c1-10 the strip is gone from the menu`, !!done.strip && done.strip.hidden === true && done.strip.shown === false);
  check(`${tag}: and PLAY is just PLAY again`, done.key?.aria === 'Play', String(done.key?.aria));
  // The strip took no space: the keys and their gaps are identical to the new player's menu.
  check(`${tag}: every key keeps the owner's ${KEY_H}px height`,
    done.keys.every((k) => k.h === KEY_H) && fresh.keys.every((k) => k.h === KEY_H),
    done.keys.map((k) => `${k.id}:${k.h}`).join(' '));
  check(`${tag}: the key gaps are EXACTLY what they were with the lamps on screen`,
    JSON.stringify(done.gaps) === JSON.stringify(fresh.gaps) && done.gaps.length > 0,
    `${JSON.stringify(fresh.gaps)} vs ${JSON.stringify(done.gaps)}`);
  check(`${tag}: key positions are unchanged too`,
    JSON.stringify(done.keys.map((k) => [k.id, k.y, k.h])) === JSON.stringify(fresh.keys.map((k) => [k.id, k.y, k.h])));
  // A menu pass after a trip through the submenu cannot bring it back.
  await page.click('#menu-play');
  await page.waitForSelector('#play-menu:not([hidden])', { timeout: 10_000 });
  await page.click('#play-back');
  await page.waitForSelector('#menu:not([hidden])', { timeout: 10_000 });
  const back = await measure(page);
  check(`${tag}: it does not come back on the next menu pass`, !!back.strip && back.strip.shown === false && back.lamps.every((l) => !l.on));

  // ---- 5. Large text moves nothing ----------------------------------------------------
  await openFresh(page);
  const beforeText = await measure(page);
  await page.evaluate(() => document.documentElement.classList.add('large-text'));
  await page.waitForTimeout(300);
  const afterText = await measure(page);
  // The key itself may sit lower (Large text changes the column around it); what must not change is
  // the strip's place ON the key — same size, same inset from the key's own edges, same order.
  const onKey = (m: Measured) => ({
    inset: m.strip && m.key ? +(m.key.bottom - m.strip.bottom).toFixed(1) : null,
    width: m.strip?.w ?? null,
    lamps: m.lamps.map((l) => [l.w, +(l.x - (m.key?.x ?? 0)).toFixed(1), +(l.y - (m.key?.y ?? 0)).toFixed(1)]),
  });
  check(`${tag} Large text: the lamps keep their size and their place on the key`,
    JSON.stringify(onKey(afterText)) === JSON.stringify(onKey(beforeText)),
    `${JSON.stringify(onKey(beforeText))} vs ${JSON.stringify(onKey(afterText))}`);
  check(`${tag} Large text: the key is still ${KEY_H}px and its gaps have not moved`,
    afterText.keys.every((k) => k.h === KEY_H) && JSON.stringify(afterText.gaps) === JSON.stringify(beforeText.gaps),
    `${JSON.stringify(afterText.gaps)}`);
  check(`${tag} Large text: the menu still does not overflow`, afterText.innerOverflow === 0 && afterText.screenOverflow === 0, `inner ${afterText.innerOverflow}, screen ${afterText.screenOverflow}`);

  check(`${tag}: no page errors`, errors.length === 0, errors[0] ?? '');

  // ---- 6. the ACCOUNT is the second source: the lamps are the union ----------------
  // A fresh CONTEXT per account case: its own storage, so one account's cache can never leak into
  // the next case, and the first boot is a guest (no identity, no request) before we seed it.
  const accountPage = async () => {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
    const p = await context.newPage();
    const pageErrors: string[] = [];
    p.on('pageerror', (e) => pageErrors.push(e.message));
    return { page: p, context, pageErrors };
  };

  // 6a. A returning player on a NEW phone: no device record, seven account clears → seven lamps.
  const seven = await accountPage();
  const sevenNet = await openAccount(seven.page, [1, 2, 3, 4, 5, 6, 7]);
  await seven.page.waitForFunction(() => document.querySelectorAll('#menu-play-lessons > i.on').length === 7, undefined, { timeout: 10_000 });
  const onNewPhone = await measure(seven.page);
  check(`${tag}: a new phone lights the account’s seven clears, not zero`,
    onNewPhone.lamps.filter((l) => l.on).length === 7 && onNewPhone.key?.aria === 'Play. 7 of 10 lessons completed',
    `${onNewPhone.lamps.filter((l) => l.on).length} lit / ${String(onNewPhone.key?.aria)}`);
  check(`${tag}: the account read happened ONCE`, sevenNet.requests() === 1, `${sevenNet.requests()} requests`);
  // The answer is cached by player id: a reload opens the menu with NO request.
  await seven.page.reload({ waitUntil: 'domcontentloaded' });
  await seven.page.waitForSelector('#menu:not([hidden])', { timeout: 30_000 });
  await seven.page.waitForFunction(() => document.querySelectorAll('#menu-play-lessons > i.on').length === 7, undefined, { timeout: 10_000 });
  await seven.page.waitForTimeout(500);
  check(`${tag}: the cached account answer costs a second open NO request`, sevenNet.requests() === 1, `${sevenNet.requests()} requests`);
  check(`${tag}: the account lanes log no page error`, seven.pageErrors.length === 0, seven.pageErrors[0] ?? '');
  await seven.context.close();

  // 6b. Some from each: device 1-3, account 4-7 → seven DISTINCT lamps, never ten.
  const union = await accountPage();
  await openAccount(union.page, [4, 5, 6, 7], ['c1-01', 'c1-02', 'c1-03']);
  await union.page.waitForFunction(() => document.querySelectorAll('#menu-play-lessons > i.on').length === 7, undefined, { timeout: 10_000 });
  const unionSeen = await measure(union.page);
  check(`${tag}: device and account are a UNION (3 + 4 → 7, not 10)`,
    unionSeen.lamps.filter((l) => l.on).length === 7,
    `${unionSeen.lamps.filter((l) => l.on).length} lit`);
  check(`${tag}: the union log has no page error`, union.pageErrors.length === 0, union.pageErrors[0] ?? '');
  await union.context.close();

  // 6c. The account has cleared all ten though the DEVICE has nothing: the nudge is absent.
  const doneAccount = await accountPage();
  const doneNet = await openAccount(doneAccount.page, C1.map((_, index) => index + 1));
  await doneAccount.page.waitForFunction(() => {
    const strip = document.getElementById('menu-play-lessons');
    return !!strip && strip.hidden === true;
  }, undefined, { timeout: 10_000 });
  const doneSeen = await measure(doneAccount.page);
  check(`${tag}: an account with all ten hides the nudge on an empty device`,
    !!doneSeen.strip && doneSeen.strip.hidden === true && doneSeen.key?.aria === 'Play',
    `${String(doneSeen.key?.aria)} / hidden ${String(doneSeen.strip?.hidden)}`);
  check(`${tag}: that account read also happened once`, doneNet.requests() === 1, `${doneNet.requests()} requests`);
  // The account's answer is remembered on the device (keyed by player) so the next open is free.
  const cache = await doneAccount.page.evaluate((key) => localStorage.getItem(key), 'severgrow.campaign.account-clears.v1');
  check(`${tag}: the completed account is cached under its player id`,
    !!cache && JSON.parse(cache).playerId === 'e2e-account' && JSON.parse(cache).levels.length === 10, String(cache));
  check(`${tag}: the completed-account lane logs no page error`, doneAccount.pageErrors.length === 0, doneAccount.pageErrors[0] ?? '');
  await doneAccount.context.close();

  await page.close();
}

await browser.close();
await server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} first-run checks passed`);
process.exit(failed.length ? 1 : 0);
