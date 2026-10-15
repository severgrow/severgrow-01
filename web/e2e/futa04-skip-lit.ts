// Evidence for the lit Skip key (owner ask 2026-10-14: "when showing skip button button should
// be lit up"; since 2026-10-15 lit as backlit hardware — the frame and icon glow, no square ring). Writes docs/screens/skip-lit/ at 360x640, 390x844, 768x1024 and 1280x800, offline
// AND online, plus the tutorial's SKIP GROW step, with before/after pairs and measured pixel
// deltas. The "before" frame is the same live page with the new lit rule disabled via one
// injected override, so before/after differ only by the lit state.
//
//   npx tsx web/e2e/futa04-skip-lit.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { preview } from 'vite';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { createHttpServer } from '../../server/src/http.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';

const CHROME = process.env.PW_CHROMIUM ?? '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = new URL('../../docs/screens/skip-lit/', import.meta.url).pathname;
const VIEWPORTS = [
  { tag: '360x640', width: 360, height: 640 },
  { tag: '390x844', width: 390, height: 844 },
  { tag: '768x1024', width: 768, height: 1024 },
  { tag: '1280x800', width: 1280, height: 800 },
] as const;
const SETTINGS = { sound: false, music: false, coach: false, autoSkip: false, speed: 'fast', reduceMotion: true, eyeCandy: false };

mkdirSync(OUT, { recursive: true });
const results: Record<string, unknown> = { generated: new Date().toISOString(), viewports: VIEWPORTS.map(v => v.tag), states: {} };
const write = (name: string, buf: Buffer) => writeFileSync(`${OUT}${name}`, buf);
const log = (...a: unknown[]) => console.log(...a);

// ------------------------------------------------------------------ local duel API + build + preview
const service = new MatchService({ storage: new MemoryStorage(), config: { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'] } });
const apiServer = createHttpServer({ service, config: { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'] } });
await new Promise<void>(resolve => apiServer.listen(0, '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}`;
const build = () => new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: { ...process.env, PATH: process.env.PATH, CHANNEL: 'futa05', VITE_FIND_OPPONENT: '1', VITE_DUEL_API_URL: apiBase, VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'local-e2e' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`web:build failed (${code})`))));
});
await build();
const previewServer = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: 4237, strictPort: true }, logLevel: 'error' });
const ORIGIN = 'http://127.0.0.1:4237/';
for (let i = 0; i < 40; i++) { try { const r = await fetch(ORIGIN); if (r.ok || r.status === 404) break; } catch { await new Promise(r => setTimeout(r, 120)); } }

const browser: Browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const scratch = await browser.newPage();
await scratch.addInitScript(() => { (window as any).__name = (fn: unknown) => fn; });
await scratch.goto('about:blank');

// ------------------------------------------------------------------ helpers
const offlinePage = async (vp: { width: number; height: number }): Promise<{ context: BrowserContext; page: Page }> => {
  const touch = vp.width < 500;
  const context = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  await context.addInitScript(s => {
    try { localStorage.clear(); localStorage.setItem('futa05:severgrow.settings.v1', JSON.stringify(s)); } catch { /* ignore */ }
  }, SETTINGS);
  const page = await context.newPage();
  return { context, page };
};

const goto = async (page: Page, url: string): Promise<void> => {
  let last: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try { await page.goto(url, { waitUntil: 'domcontentloaded' }); return; } catch (error) { last = error; await page.waitForTimeout(700); }
  }
  throw last;
};

const toGrow = async (page: Page, seed: number): Promise<void> => {
  await goto(page, `${ORIGIN}?seed=${seed}`);
  await page.waitForSelector('#deck.ready', { timeout: 30_000 });
  await page.locator('#deck').evaluate(el => (el as HTMLButtonElement).click());
  await page.waitForFunction(() => (window as any).__severgrow?.state().phase === 'ACT' && !(window as any).__severgrow.busy(), undefined, { timeout: 20_000 });
  await page.waitForTimeout(500);
};

const keyState = (page: Page) => page.evaluate(() => {
  const key = document.getElementById('smart-context') as HTMLButtonElement;
  const cs = getComputedStyle(key);
  const box = document.getElementById('smart-bloom') as HTMLElement;
  const r = key.getBoundingClientRect();
  return { action: key.dataset.action, label: key.getAttribute('aria-label'), disabled: key.disabled,
    boxShadow: cs.boxShadow, frameFilter: getComputedStyle(key, '::before').filter, color: cs.color, background: cs.backgroundColor, outline: cs.outline,
    animation: cs.animationName, transition: cs.transitionDuration,
    width: Math.round(r.width), height: Math.round(r.height), x: r.x, y: r.y,
    bloomOnOffer: !!box && !box.hidden };
});

/** Draw before/after: the "after" is live, the "before" is the same frame with the lit rule off. */
const capture = async (page: Page, tag: string) => {
  const box = await page.locator('#futa04-box').boundingBox();
  if (!box) return null;
  const clip = { x: Math.max(0, Math.floor(box.x - 6)), y: Math.max(0, Math.floor(box.y - 6)), width: Math.ceil(box.width + 12), height: Math.ceil(box.height + 12) };
  const before = await keyState(page);
  write(`${tag}-after.jpg`, await page.screenshot({ type: 'jpeg', quality: 78 }));
  write(`${tag}-cockpit-after.jpg`, await page.screenshot({ clip, type: 'jpeg', quality: 80 }));
  const afterPng = await page.screenshot({ clip, type: 'png' });
  const key = await page.evaluate(() => { const r = (document.getElementById('smart-context') as HTMLElement).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  // The lit rule off — exactly the pre-change frame (one rule, no other effect).
  const style = await page.addStyleTag({ content: `html.futa04-information #futa04-box #smart-context[data-action='skip']:not(:disabled){box-shadow:none!important;color:var(--control-ivory)!important;background:#111312!important} html.futa04-information #futa04-box #smart-context[data-action='skip']:not(:disabled)::before,html.futa04-information #futa04-box #smart-context[data-action='skip']:not(:disabled) svg{filter:none!important} .moves :is(.futa04-skip,.end.skip):not(.tutorial-next){box-shadow:none!important}` });
  const dim = await keyState(page);
  write(`${tag}-before.jpg`, await page.screenshot({ type: 'jpeg', quality: 78 }));
  write(`${tag}-cockpit-before.jpg`, await page.screenshot({ clip, type: 'jpeg', quality: 80 }));
  const beforePng = await page.screenshot({ clip, type: 'png' });
  await style.evaluate(el => { el.parentNode?.removeChild(el); });
  const delta = await ringDelta(beforePng, afterPng, { x: key.x - clip.x, y: key.y - clip.y, w: key.w, h: key.h });
  const pair = await pairStrip(beforePng, afterPng);
  write(`${tag}-pair.jpg`, pair);
  return { lit: before, dim, delta };
};

/** Count the lit (new) pixels in a band hugging the key, and the mean luminance change there. */
const ringDelta = async (before: Buffer, after: Buffer, rect: { x: number; y: number; w: number; h: number }) =>
  scratch.evaluate(async ({ b, a, r }) => {
    const load = (b64: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `data:image/png;base64,${b64}`; });
    const [bi, ai] = await Promise.all([load(b), load(a)]);
    const w = ai.width, h = ai.height;
    const draw = (img: HTMLImageElement) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d')!; x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const d1 = draw(bi), d2 = draw(ai);
    const lum = (d: Uint8ClampedArray, i: number) => 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
    const band = 3;
    let sum = 0, n = 0, lit = 0, maxD = 0, faceSum = 0, faceN = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const inFace = x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
      const inBand = x >= r.x - band && x <= r.x + r.w + band && y >= r.y - band && y <= r.y + r.h + band;
      if (!inBand) continue;
      const i = (y * w + x) * 4;
      const dl = lum(d2, i) - lum(d1, i);
      if (inFace) { faceSum += dl; faceN++; continue; }
      sum += dl; n++; if (dl > 12) lit++; if (dl > maxD) maxD = dl;
    }
    return { ringBand: band, bandMeanLuminanceDelta: +(sum / Math.max(1, n)).toFixed(2), bandLitPixels: lit, bandMaxDelta: +maxD.toFixed(1), faceMeanLuminanceDelta: +(faceSum / Math.max(1, faceN)).toFixed(2), pixels: n };
  }, { b: before.toString('base64'), a: after.toString('base64'), r: rect });

/** [before | after] strip, in the browser (no image deps). */
const pairStrip = (before: Buffer, after: Buffer) => scratch.evaluate(async ({ b, a }) => {
  const load = (b64: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `data:image/png;base64,${b64}`; });
  const [bi, ai] = await Promise.all([load(b), load(a)]);
  const c = document.createElement('canvas'); c.width = bi.width + ai.width; c.height = bi.height;
  const x = c.getContext('2d')!; x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(bi, 0, 0); x.drawImage(ai, bi.width, 0);
  return c.toDataURL('image/jpeg', 0.8).split(',')[1]!;
}, { b: before.toString('base64'), a: after.toString('base64') }).then(b64 => Buffer.from(b64, 'base64'));

const findSeed = async (want: (s: Awaited<ReturnType<typeof keyState>>) => boolean, fallback: number): Promise<number> => {
  const { context, page } = await offlinePage({ width: 390, height: 844 });
  try {
    for (let seed = 1; seed <= 24; seed++) {
      await toGrow(page, seed);
      const s = await keyState(page);
      if (want(s)) return seed;
    }
    return fallback;
  } finally { await context.close(); }
};

const ONLY = process.env.SKIP_ONLY ?? '';
try {
  const states = results.states as Record<string, unknown>;

  // ---------------------------------------------------------------- OFFLINE
  const seedAlone = ONLY ? 2 : await findSeed(s => !s.bloomOnOffer && s.action === 'skip' && !s.disabled, 2);
  const seedBloom = ONLY ? 1 : await findSeed(s => s.bloomOnOffer && s.action === 'skip' && !s.disabled, 3);
  log(`offline seeds: skip-alone=${seedAlone} with-bloom=${seedBloom}`);
  results.offlineSeeds = { skipAlone: seedAlone, withBloom: seedBloom };
  for (const vp of (!ONLY || ONLY === 'offline') ? VIEWPORTS : []) {
    const { context, page } = await offlinePage(vp);
    try {
      await toGrow(page, seedAlone);
      const st = await keyState(page);
      const shot = await capture(page, `offline-skip-${vp.tag}`);
      const entry = { ...st, ...(shot && { delta: shot.delta }) };
      (states[`offline-skip-${vp.tag}`] = entry);
      log(`[${vp.tag}] offline skip-alone`, JSON.stringify({ action: st.action, bloom: st.bloomOnOffer, lit: shot?.lit.frameFilter !== 'none', delta: shot?.delta }));
    } finally { await context.close(); }
  }
  // The competition view: Skip is lit while a Bloom recipe is on offer (390x844 + 1280x800).
  for (const vp of ((!ONLY || ONLY === 'offline') ? VIEWPORTS : []).filter(v => v.tag === '390x844' || v.tag === '1280x800')) {
    const { context, page } = await offlinePage(vp);
    try {
      await toGrow(page, seedBloom);
      const st = await keyState(page);
      const shot = await capture(page, `offline-skip-with-bloom-${vp.tag}`);
      (states[`offline-skip-with-bloom-${vp.tag}`] = { ...st, ...(shot && { delta: shot.delta }) });
      const bloomBox = await page.locator('#smart-bloom-button').boundingBox();
      (states[`offline-skip-with-bloom-${vp.tag}`] as Record<string, unknown>).bloomButtonArea = bloomBox ? Math.round(bloomBox.width * bloomBox.height) : 0;
      log(`[${vp.tag}] offline skip with Bloom`, JSON.stringify({ bloom: st.bloomOnOffer, delta: shot?.delta }));
    } finally { await context.close(); }
  }

  // ---------------------------------------------------------------- Reduce motion + Large text
  for (const variant of ((!ONLY || ONLY === 'offline') ? ['reduce-motion', 'large-text'] as const : [] as const)) {
    const { context, page } = await offlinePage({ width: 390, height: 844 });
    try {
      if (variant === 'reduce-motion') await page.emulateMedia({ reducedMotion: 'reduce' });
      await goto(page, `${ORIGIN}?seed=${seedAlone}`);
      await page.waitForSelector('#deck.ready', { timeout: 30_000 });
      if (variant === 'large-text') await page.evaluate(() => document.documentElement.classList.add('large-text'));
      await page.locator('#deck').evaluate(el => (el as HTMLButtonElement).click());
      await page.waitForFunction(() => (window as any).__severgrow?.state().phase === 'ACT' && !(window as any).__severgrow.busy(), undefined, { timeout: 20_000 });
      await page.waitForTimeout(400);
      const st = await keyState(page);
      write(`offline-${variant}-390x844.jpg`, await page.screenshot({ type: 'jpeg', quality: 78 }));
      (states[`offline-${variant}-390x844`] = st);
      log(`[390x844] ${variant}`, JSON.stringify({ lit: st.frameFilter !== 'none', animation: st.animation, w: st.width, h: st.height, action: st.action }));
    } finally { await context.close(); }
  }

  // ---------------------------------------------------------------- TUTORIAL (SKIP GROW)
  if (!ONLY || ONLY === 'tutorial') {
    const { context, page } = await offlinePage({ width: 390, height: 844 });
    try {
      await goto(page, `${ORIGIN}?tutorial=1&chapter=6`);
      await page.waitForFunction(() => !!(window as any).__severgrow?.tutorial(), undefined, { timeout: 25_000 });
      await page.waitForSelector('#futasaku-glass', { timeout: 20_000 });
      await page.waitForFunction(() => !(document.getElementById('smart-context') as HTMLButtonElement)?.disabled, undefined, { timeout: 20_000 }).catch(() => undefined);
      await page.waitForTimeout(700);
      const lesson = await page.evaluate(() => (window as any).__severgrow.tutorial());
      const st = await keyState(page);
      const shot = await capture(page, 'tutorial-skip-390x844');
      (states['tutorial-skip-390x844'] = { lesson, ...st, ...(shot && { delta: shot.delta }) });
      log('[tutorial] SKIP GROW', JSON.stringify({ lesson, action: st.action, lit: shot?.lit.frameFilter !== 'none', delta: shot?.delta }));
    } finally { await context.close(); }
  }

  // ---------------------------------------------------------------- ONLINE (a real local duel)
  if (!ONLY || ONLY === 'online') {
    const { startLocalDuel, openSeat, openDuel } = await import('./helpers/local-duel.js');
    const duel = await startLocalDuel({ port: 4238 });
    try {
      const match = await duel.newMatch();
      const a = await openSeat(duel, match, 0, { viewport: { width: 390, height: 844 }, reduceMotion: true, speed: 'fast' });
      const b = await openSeat(duel, match, 1, { viewport: { width: 390, height: 844 }, reduceMotion: true, speed: 'fast' });
      await openDuel(a, match.matchId);
      await openDuel(b, match.matchId);
      // The lottery's starter draws first; that seat is the one that shows Skip in the grow step.
      const moverSeat = match.starterSeat;
      const seat = moverSeat === a.seat ? a : b;
      log(`[online] starter seat ${moverSeat}`);
      const diag = async (tag: string) => log(`[online diag ${tag}]`, JSON.stringify(await seat.page.evaluate(() => ({
        game: (document.getElementById('game') as HTMLElement).hidden,
        hud: !!document.querySelector('#duel-hud:not([hidden])'),
        deck: document.getElementById('deck')?.className,
        waiting: document.documentElement.dataset.futa04Waiting,
        phase: document.documentElement.dataset.step,
        online: (window as any).__severgrow?.online?.(),
      }))));
      await diag('after openDuel');
      await seat.page.waitForSelector('#duel-hud:not([hidden])', { timeout: 30_000 }).catch(() => undefined);
      await diag('after hud');
      await seat.page.waitForFunction(() => (window as any).__severgrow?.state()?.phase === 'DRAW', undefined, { timeout: 30_000 }).catch(() => undefined);
      await diag('after DRAW');
      await seat.page.waitForSelector('#deck.ready', { timeout: 30_000 });
      await seat.page.locator('#deck').evaluate(el => (el as HTMLButtonElement).click());
      await seat.page.waitForFunction(() => (window as any).__severgrow?.state().phase === 'ACT' && !(window as any).__severgrow.busy(), undefined, { timeout: 25_000 });
      await seat.page.waitForTimeout(600);
      const st = await keyState(seat.page);
      const shot = await capture(seat.page, 'online-skip-390x844');
      (states['online-skip-390x844'] = { seat: moverSeat, ...st, ...(shot && { delta: shot.delta }) });
      log('[online] 390x844', JSON.stringify({ seat: moverSeat, action: st.action, bloom: st.bloomOnOffer, lit: shot?.lit.frameFilter !== 'none', delta: shot?.delta }));
      // 1280x800 desktop seat of the same duel, resuming at the same grow step.
      const wide = await openSeat(duel, match, moverSeat, { viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false, reduceMotion: true, speed: 'fast' });
      await openDuel(wide, match.matchId);
      await wide.page.waitForSelector('#duel-hud:not([hidden])', { timeout: 30_000 });
      await wide.page.waitForTimeout(800);
      const wideState = await keyState(wide.page);
      const wideShot = await capture(wide.page, 'online-skip-1280x800');
      (states['online-skip-1280x800'] = { seat: wide.seat, ...wideState, ...(wideShot && { delta: wideShot.delta }) });
      log('[online] 1280x800', JSON.stringify({ action: wideState.action, bloom: wideState.bloomOnOffer, lit: wideShot?.lit.frameFilter !== 'none', delta: wideShot?.delta }));
    } finally { await duel.close(); }
  }
} finally {
  writeFileSync(`${OUT}results.json`, `${JSON.stringify(results, null, 2)}\n`);
  await scratch.close();
  await browser.close();
  await previewServer.close();
  await new Promise<void>(resolve => apiServer.close(() => resolve()));
}
log(`\nskip-lit evidence written to ${OUT}`);
