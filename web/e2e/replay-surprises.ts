// THE TWO SURPRISES (owner brief, 2026-10-26): a replay you can send, and a replay that knows
// the moment its match turned.
//
// This suite plays a REAL offline match (seed 1004 — the same deterministic practice deal the
// offline replay suite uses, with a 4-tile cut under the page's own greedy play) and then, in
// Chromium at 390x844 and 1280x800:
//   * presses the turning-point notch: the seek lands on the biggest-cut beat and pauses there;
//   * presses it again: playback carries on from that beat;
//   * shares the finished poster through the file-download fallback and reads the PNG back;
//   * stubs the Web Share door and proves the File it would hand to the phone (name, type, size);
//   * photographs the footer control, the poster and the paused turning point.
//
// Screenshots go to /tmp/morning (or $SHOTS).
//   CHANNEL=futa04 npx tsx web/e2e/replay-surprises.ts
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { servePreview } from './helpers/preview-port.js';
import { seedSettings } from './helpers/settings-seed.js';

const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const SHOTS = process.env.SHOTS?.trim() || '/tmp/morning';

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

type ReplayNow = { index: number; playing: boolean; elapsed: number; total: number; ended: boolean; board: string; turn: number | null };
type Plan = {
  total: number;
  names: [string, string];
  turningPoint: { frame: number; tiles: number; seat: number; action: number } | null;
  frames: { index: number; at: number; duration: number; turn: number; boundary: boolean; kind: string; board: string }[];
};

const replayNow = async (page: Page): Promise<ReplayNow | null> =>
  (await page.evaluate(() => (window as unknown as { __severgrow?: { replay?: () => unknown } }).__severgrow?.replay?.() ?? null)) as ReplayNow | null;
const replayPlan = async (page: Page): Promise<Plan | null> =>
  (await page.evaluate(() => (window as unknown as { __severgrow?: { replayPlan?: () => unknown } }).__severgrow?.replayPlan?.() ?? null)) as Plan | null;

const waitVisible = async (page: Page, sel: string, ms = 30_000) => {
  await page.waitForSelector(`${sel}:not([hidden])`, { timeout: ms });
};

const settingsInit = (page: Page) =>
  seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });

const dismissInstall = async (page: Page) => {
  const prompt = page.locator('#install-prompt');
  if (!(await prompt.isVisible().catch(() => false))) return;
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(150);
  if (await prompt.isVisible().catch(() => false)) {
    await page.evaluate("(() => { const el = document.getElementById('install-prompt'); if (el) el.hidden = true; })()");
  }
};

/** Play the page's own practice match to its finish card (the offline replay suite's proven loop). */
const toGameOver = async (page: Page, maxSteps = 2000): Promise<string> => {
  await page
    .waitForFunction(() => {
      const ritual = document.getElementById('starter-lottery');
      return !ritual || ritual.hidden || !ritual.getClientRects().length;
    }, undefined, { timeout: 15_000 })
    .catch(() => undefined);
  const read = () => page.evaluate('(() => window.__severgrow.state())()') as Promise<State | null>;
  const idle = () => page.waitForFunction('(() => { const h = window.__severgrow; return !!h && !!h.state() && !h.busy(); })()', undefined, { timeout: 30_000 });
  let waiting = 0;
  let refused = 0;
  for (let i = 0; i < maxSteps; i++) {
    const s = await read();
    if (!s) return 'no state';
    if (s.phase === 'GAME_OVER') return 'ended';
    await idle();
    const now = (await read())!;
    if (now.phase === 'GAME_OVER') return 'ended';
    if (now.actor !== 0) {
      if (++waiting > 400) return `the computer never finished its turn (${now.actor}, ${now.phase})`;
      await page.waitForTimeout(80);
      continue;
    }
    waiting = 0;
    const legal = legalActions(viewFor(now, 0));
    if (!legal.length) return `no legal move for the human (${now.phase})`;
    const pick = (t: Action['t']) => legal.find((a) => a.t === t) ?? null;
    const natural = (now.phase === 'DRAW' ? [pick('Draw'), pick('EndAct'), pick('Discard')] : [pick('Bloom'), pick('Sprout'), pick('EndAct'), pick('Discard')]).filter((a): a is Action => !!a);
    const candidates: Action[] = [...natural, ...legal.filter((a) => !natural.includes(a))];
    let applied = false;
    for (const candidate of candidates) {
      applied = await page.evaluate(
        ([a, who]) => Boolean((window as unknown as { __severgrow: { playFor: (x: unknown, p: number) => boolean } }).__severgrow.playFor(a, who)),
        [candidate, 0] as const,
      );
      if (applied) break;
    }
    if (!applied) {
      if (++refused > 10) return `the app refused every legal action (${now.phase})`;
      await page.waitForTimeout(200);
      continue;
    }
    refused = 0;
  }
  return `still playing after ${maxSteps} steps`;
};

/** Build the product bundle this suite is about (CHANNEL=futa04, the deployed channel). */
await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: { ...process.env, CHANNEL: 'futa04' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  child.on('error', reject);
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`web:build failed: ${code}`))));
});

const { server, origin } = await servePreview(4331, { logLevel: 'error' });
const browser = await chromium.launch({ executablePath: CHROME });
mkdirSync(SHOTS, { recursive: true });

let failedHere = false;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true });
  const page = await context.newPage();
  // No native share sheet in headless Chromium: force the page's own download fallback first. The
  // share door is proved afterwards by stubbing `canShare`/`share` at the API boundary.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
  await settingsInit(page);
  await page.goto(`${origin}/?seed=1004`);
  await page.waitForFunction('(() => { const h = window.__severgrow; return !!h && !!h.state() && !h.busy(); })()', undefined, { timeout: 60_000 });
  await waitVisible(page, '#game', 30_000);
  const ended = await toGameOver(page);
  check('a real practice match reaches its finish card', ended === 'ended', ended);
  await page.waitForSelector('#gameover:not([hidden])', { timeout: 30_000 });
  await page.waitForFunction('(() => !window.__severgrow.busy())()', undefined, { timeout: 30_000 });
  await page.waitForTimeout(400);
  await dismissInstall(page);

  await page.locator('#go-replay').click();
  await waitVisible(page, '#replay', 20_000);
  const plan = await replayPlan(page);
  check('the replay has a turning point (a real cut in this match)', !!plan?.turningPoint, JSON.stringify(plan?.turningPoint));
  const tp = plan!.turningPoint!;
  const frame = plan!.frames[tp.frame]!;
  check('the turning point names a cut beat and the tiles it took', frame.kind === 'sever' && tp.tiles >= 2, `${frame.kind}, ${tp.tiles} tiles`);

  // The notch is the control: its ink sits at the beat's time, its label says how many tiles.
  const notch = page.locator('#replay [data-rp="turn"]');
  const notchBox = await notch.boundingBox();
  const barBox = await page.locator('#replay .rp-scrub').boundingBox();
  check('the turning-point notch is on the scrub bar', !!notchBox && !!barBox, JSON.stringify(notchBox));
  const expectedX = (barBox?.x ?? 0) + (barBox?.width ?? 0) * (frame.at / plan!.total);
  check('the notch sits at the exact beat time', !!notchBox && Math.abs(notchBox.x + notchBox.width / 2 - expectedX) <= 4, `notch ${Math.round(notchBox?.x ?? 0)} vs ${Math.round(expectedX)}`);
  const label = (await notch.getAttribute('aria-label')) ?? '';
  check('the notch is labelled in words, with the tile count', /Turning point · \d+ tiles?/i.test(label), label);

  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/replay-footer-390x844.png` });
  const before = await replayNow(page);
  await notch.click();
  await page.waitForTimeout(90);
  const parked = await replayNow(page);
  check('the notch seeks to the biggest-cut beat', !!parked && parked.index === tp.frame, `${parked?.index} vs ${tp.frame}`);
  check('it pauses there, on the beat\'s own board', !!parked && !parked.playing && parked.elapsed === frame.at && parked.board === plan!.frames[tp.frame]!.board, JSON.stringify({ playing: parked?.playing, elapsed: parked?.elapsed, at: frame.at }));
  await page.screenshot({ path: `${SHOTS}/replay-turning-point-paused-390x844.png` });
  await notch.click();
  await page.waitForTimeout(700);
  const resumed = await replayNow(page);
  check('a second press resumes playback from the turning point', !!resumed && resumed.playing && (resumed.index > tp.frame || resumed.elapsed > frame.at), JSON.stringify({ index: resumed?.index, elapsed: resumed?.elapsed, before: before?.index }));

  // ---------- THE ONE SHARE KEY (owner, 2026-10-30: "remove the png sharing option … just 1 icon") ----------
  // The footer carries ONE icon, and it makes the replay's video and hands it to the share sheet.
  check('the image (PNG) share key is gone', (await page.locator('#replay [data-rp="share"]').count()) === 0);
  const share = page.locator('#replay [data-rp="video"]');
  check('there is exactly one share key, a 44px target', (await page.locator('#replay .rp-foot .rp-icon').count()) === 1 && (await share.boundingBox())?.width === 44, JSON.stringify(await share.boundingBox()));
  check('it is named for a screen reader', (await share.getAttribute('aria-label')) === 'Share replay', (await share.getAttribute('aria-label')) ?? '');
  // The share door, stubbed at the API boundary (a STRING: the bundler's name-preserving transform
  // would inject a `__name` helper into a serialized function, and the page does not define it).
  await page.evaluate(`(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', {
      value: async (data) => {
        window.__shared = {
          title: data.title,
          files: (data.files || []).map((f) => ({ name: f.name, type: f.type, size: f.size })),
        };
      },
      configurable: true,
    });
  })()`);
  await share.click();
  await page.waitForSelector('#replay .rp-video:not([hidden])', { timeout: 5_000 });
  check('the key starts the video, with its progress line', /Making video|Recording/.test(((await page.locator('#replay .rp-video-text').textContent()) ?? '').trim()));
  // A phone opens its share sheet only from a tap: once the file is ready, either the press still
  // counts and the sheet opens at once, or a SHARE key waits for the tap.
  await page.waitForFunction(
    () => !!(window as unknown as { __shared?: unknown }).__shared || !!document.querySelector('#replay [data-rp="video-share"]:not([hidden])'),
    undefined,
    { timeout: 120_000 },
  );
  if (await page.locator('#replay [data-rp="video-share"]').isVisible()) {
    await page.screenshot({ path: `${SHOTS}/replay-video-ready-390x844.png` });
    await page.locator('#replay [data-rp="video-share"]').click();
  }
  await page.waitForFunction(() => !!(window as unknown as { __shared?: unknown }).__shared, undefined, { timeout: 15_000 }).catch(() => undefined);
  const shared = (await page.evaluate(() => (window as unknown as { __shared?: unknown }).__shared ?? null)) as { title?: string; files?: { name: string; type: string; size: number }[] } | null;
  check('the share sheet gets one file', !!shared && shared.files?.length === 1, JSON.stringify(shared));
  check('the shared file is the replay video, named for the match', !!shared && /^futasaku-.+-\d+-\d+\.(mp4|webm)$/.test(shared.files![0]!.name) && /^video\//.test(shared.files![0]!.type) && shared.files![0]!.size > 100_000, JSON.stringify(shared?.files));
  await page.locator('#replay .rp-video').waitFor({ state: 'hidden', timeout: 6_000 }).catch(() => undefined);

  // ---------- the wide viewport ----------
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${SHOTS}/replay-surprises-1280x800.png` });
  const notchWide = await notch.boundingBox();
  const barWide = await page.locator('#replay .rp-scrub').boundingBox();
  check('the notch keeps its exact place on a wide screen', !!notchWide && !!barWide && Math.abs(notchWide.x + notchWide.width / 2 - (barWide.x + barWide.width * (frame.at / plan!.total))) <= 4);
} finally {
  await browser.close();
  await server.close();
  failedHere = failed > 0;
}

if (failedHere) {
  console.error(`${failed} replay-surprise checks failed`);
  process.exit(1);
}
console.log('replay-surprises checks passed');
