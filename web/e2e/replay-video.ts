// THE VIDEO EXPORT (owner brief, 2026-10-26): "is it difficult to have a video export? … download
// the whole game". Whole replay, silent.
//
// This suite plays a REAL offline match (seed 1004, the deal the replay suites use), opens its
// replay, and then:
//   * proves the exported video's board is the same board the game paints (a video frame rendered
//     by the recorder's own painter, beside a photograph of the replay's real board);
//   * presses the export control and records the whole replay, asserting that progress appeared,
//     that the control was disabled while it ran and restored afterwards, and that the file that
//     came out is a real, non-empty video with the right name — then decodes that file in the page
//     to read its true length, its size and that it carries no audio;
//   * starts a second recording and cancels it, proving the recording stops and no file is saved;
//   * starts a third and closes the surface, proving a recording never outlives the replay.
//
// Screenshots go to docs/screens/replay/ (or $SHOTS).
//   CHANNEL=futa05 npx tsx web/e2e/replay-video.ts
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { servePreview } from './helpers/preview-port.js';
import { seedSettings } from './helpers/settings-seed.js';

const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const SHOTS = process.env.SHOTS?.trim() || new URL('../../docs/screens/replay/', import.meta.url).pathname;

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
const videoFramePng = async (page: Page, step: number): Promise<string | null> =>
  (await page.evaluate(
    (i) => (window as unknown as { __severgrow?: { replayVideoFrame?: (n: number) => Promise<string | null> } }).__severgrow?.replayVideoFrame?.(i) ?? null,
    step,
  )) as string | null;

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

/** What the page can say about a video file handed to it: its container, its own length, no audio. */
type Probed = {
  duration: number | null;
  width: number;
  height: number;
  audioBytes: number | null;
  audioTracks: number | null;
  error: string | null;
};

/**
 * Decode the recorded file IN THE PAGE and read the length it really carries. Passed as a STRING:
 * the bundler's name-preserving transform would inject a `__name` helper into a serialized
 * function, and the page does not define it.
 */
const PROBE_SRC = `(async (data) => {
  const raw = atob(data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const blob = new Blob([bytes]);
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = url;
  const out = { duration: null, width: 0, height: 0, audioBytes: null, audioTracks: null, error: null };
  const loaded = await new Promise((done) => {
    video.onloadedmetadata = () => done(true);
    video.onerror = () => done(false);
    setTimeout(() => done(false), 20000);
  });
  if (!loaded) { out.error = 'the file did not decode'; URL.revokeObjectURL(url); return out; }
  out.width = video.videoWidth;
  out.height = video.videoHeight;
  if (!Number.isFinite(video.duration)) {
    await new Promise((done) => {
      video.ondurationchange = () => { if (Number.isFinite(video.duration)) done(); };
      video.currentTime = 1e101;
      setTimeout(done, 10000);
    });
  }
  out.duration = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null;
  out.audioBytes = typeof video.webkitAudioDecodedByteCount === 'number' ? video.webkitAudioDecodedByteCount : null;
  out.audioTracks = typeof video.audioTracks === 'object' && video.audioTracks ? video.audioTracks.length : null;
  URL.revokeObjectURL(url);
  return out;
})`;

/** Put the decoder in the page once (a string: see PROBE_SRC), then read the file it is given. */
const probeVideo = async (page: Page, file: string): Promise<Probed> => {
  const base64 = readFileSync(file).toString('base64');
  await page.evaluate((src) => {
    (window as unknown as { __probeVideo?: unknown }).__probeVideo = eval(src);
  }, PROBE_SRC);
  return (await page.evaluate(
    (data) => (window as unknown as { __probeVideo: (d: string) => Promise<Probed> }).__probeVideo(data),
    base64,
  )) as Probed;
};

// Build the suite channel's bundle (the same command the gates use).
const suiteEnv = {
  CHANNEL: 'futa05',
  VITE_DUEL_API_URL: process.env.VITE_DUEL_API_URL ?? 'http://127.0.0.1:9/functions/v1/duel',
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:9',
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? 'local',
};
if (process.env.REPLAY_VIDEO_SKIP_BUILD !== '1') {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
      env: { ...process.env, ...suiteEnv },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`web:build failed: ${code}`))));
  });
}

const { server, origin } = await servePreview(4337, { logLevel: 'error' });
const browser = await chromium.launch({ executablePath: CHROME });
mkdirSync(SHOTS, { recursive: true });

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true });
  const page = await context.newPage();
  await page.addInitScript(() => {
    // Headless Chromium has no share sheet: the page takes its own download fallback, which is the
    // real file a player on a desktop would get.
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
  check('the replay has a plan to record', !!plan && plan.total > 0, `${plan?.total}ms, ${plan?.frames.length} beats`);
  const total = plan?.total ?? 0;

  // ---------- the export control ----------
  const video = page.locator('#replay [data-rp="video"]');
  const box = await video.boundingBox();
  check('the export control is a 44px target beside the share key', box?.width === 44 && box?.height === 44, JSON.stringify(box));
  check('it is named for a screen reader', (await video.getAttribute('aria-label')) === 'Export video', (await video.getAttribute('aria-label')) ?? '');
  check('the recording line is hidden until a recording starts', await page.locator('#replay .rp-video').isHidden());
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/replay-footer-video-390x844.png` });

  // ---------- the video's board is the game's board ----------
  // Park the replay on the turning point (a real cut), photograph the board the game paints there,
  // and ask the recorder's own painter for the same step of the video.
  const tpFrame = plan?.turningPoint?.frame ?? Math.max(0, (plan?.frames.length ?? 1) - 1);
  await page.locator('#replay [data-rp="turn"]').click();
  await page.waitForTimeout(600);
  const parked = await replayNow(page);
  check('the replay parks on the turning point for the comparison', parked?.index === tpFrame, `${parked?.index} vs ${tpFrame}`);
  const boardShot = `${SHOTS}/replay-video-board-in-game.png`;
  await page.locator('#replay .rp-board').screenshot({ path: boardShot });
  const framePng = await videoFramePng(page, tpFrame);
  check('the recorder paints the same step as an image', !!framePng && framePng.startsWith('data:image/png;base64,'), `${Math.round((framePng?.length ?? 0) / 1024)}KB`);
  const frameFile = `${SHOTS}/replay-video-frame.png`;
  if (framePng) writeFileSync(frameFile, Buffer.from(framePng.split(',')[1] ?? '', 'base64'));
  // THE SIDE-BY-SIDE: the video frame's board, then the game's own board photographed on screen.
  // Both are drawn from their picture's board area (never squeezed), so the tile faces, the rims and
  // the stones can be compared one for one.
  const board64 = readFileSync(boardShot).toString('base64');
  const frame64 = (framePng ?? '').split(',')[1] ?? '';
  const pair = await context.newPage();
  await pair.setViewportSize({ width: 1000, height: 620 });
  await pair.setContent(`<body style="margin:0;background:#0a0c0b;font:500 12px ui-monospace,monospace;color:#e8ddc9">
    <div style="display:flex;gap:16px;padding:14px;align-items:flex-start">
      <figure style="margin:0"><div style="width:560px;height:420px;overflow:hidden;border:1px solid #2a2f2a">
        <img src="data:image/png;base64,${frame64}" style="width:648px;height:810px;margin:-235px 0 0 -43px;display:block"/></div>
        <figcaption style="padding-top:8px;letter-spacing:.12em">VIDEO FRAME · canvas (board area)</figcaption></figure>
      <figure style="margin:0"><div style="width:228px;height:420px;overflow:hidden;border:1px solid #2a2f2a">
        <img src="data:image/png;base64,${board64}" style="width:228px;height:420px;display:block"/></div>
        <figcaption style="padding-top:8px;letter-spacing:.12em">GAME BOARD · on screen</figcaption></figure>
    </div></body>`);
  await pair.waitForTimeout(300);
  await pair.screenshot({ path: `${SHOTS}/replay-video-vs-game-board.png` });
  await pair.close();

  // ---------- export the whole replay ----------
  // THE FAST EXPORT (owner, 2026-10-30): a browser with an H.264 encoder (this Chromium has one)
  // paints and encodes every picture itself, so the .mp4 is ready long before the replay's own
  // length; a browser without one keeps the real-time recorder and its "Recording 3s / 20s" line.
  const PROGRESS = /^(Recording \d+s \/ \d+s|Making video \d+%)$/;
  const fast = await page.evaluate(async () => {
    const VE = (window as unknown as { VideoEncoder?: { isConfigSupported(c: unknown): Promise<{ supported?: boolean }> } }).VideoEncoder;
    if (!VE) return false;
    return !!(await VE.isConfigSupported({ codec: 'avc1.42e028', width: 1080, height: 1350, bitrate: 8e6, framerate: 30, avc: { format: 'avc' } })).supported;
  });
  console.log(`INFO  this browser takes the ${fast ? 'fast .mp4 export' : 'real-time recorder'}`);
  const started = Date.now();
  const downloadPromise = page.waitForEvent('download', { timeout: Math.max(90_000, total * 5) });
  await video.click();
  // Progress, and a way out, appear at once; the control is disabled while it runs.
  await page.waitForSelector('#replay .rp-video:not([hidden])', { timeout: 5_000 });
  const firstLine = ((await page.locator('#replay .rp-video-text').textContent()) ?? '').trim();
  check('the export line says what it is doing', PROGRESS.test(firstLine) || /Video (saved|ready)|Preparing/.test(firstLine), firstLine);
  check('the export control is disabled while it runs', await video.isDisabled());
  check(
    'the replay’s own controls are still there while it runs',
    (await page.locator('#replay .rp-scrub').isVisible()) && (await page.locator('#replay [data-rp="close"]').isVisible()),
  );
  await page.screenshot({ path: `${SHOTS}/replay-video-recording-390x844.png` });

  const download = await downloadPromise;
  const waited = Date.now() - started;
  const name = download.suggestedFilename();
  const saved = `${SHOTS}/futasaku-replay-download.${name.endsWith('.mp4') ? 'mp4' : 'webm'}`;
  await download.saveAs(saved);
  const bytes = statSync(saved).size;
  check('the export downloads a named video file', /^futasaku-.+-\d+-\d+\.(webm|mp4)$/.test(name), name);
  if (fast) check('a browser with an H.264 encoder gets an .mp4 (what phones and chat apps take)', name.endsWith('.mp4'), name);
  check('the file is not empty', bytes > 100_000, `${bytes} bytes`);

  // The control comes back, and the line clears itself.
  await page.waitForFunction(() => !(document.querySelector('#replay [data-rp="video"]') as HTMLButtonElement | null)?.disabled, undefined, { timeout: 15_000 });
  check('the export control re-enables afterwards', !(await video.isDisabled()));
  const says = ((await page.locator('#replay .rp-video-text').textContent()) ?? '').trim();
  check('it says where the file went', /Video (saved|shared)/i.test(says), says);
  await page.locator('#replay .rp-video').waitFor({ state: 'hidden', timeout: 6_000 }).catch(() => undefined);
  check('the line clears itself afterwards', await page.locator('#replay .rp-video').isHidden());

  const probed = await probeVideo(page, saved);
  check('the file decodes as a video', probed.error === null && probed.width === 1080 && probed.height === 1350, JSON.stringify(probed));
  check('its length is the replay’s own length', probed.duration !== null && Math.abs(probed.duration - total) <= 1_500, `${probed.duration}ms vs ${total}ms`);
  check('it carries no audio', (probed.audioBytes ?? 0) === 0, `audio bytes ${probed.audioBytes}, tracks ${probed.audioTracks}`);
  if (fast) {
    check('the fast export is quicker than the replay itself', waited < total, `${waited}ms for a ${total}ms replay`);
    // A second, independent reader of the file: ffmpeg's own probe (skipped where it is not installed).
    const ff = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,codec_type,width,height,nb_frames:format=duration,format_name', '-of', 'json', saved], { encoding: 'utf8' });
    if (ff.status === 0 && ff.stdout) {
      const info = JSON.parse(ff.stdout) as { streams: { codec_name: string; codec_type: string; width?: number; height?: number; nb_frames?: string }[]; format: { duration: string; format_name: string } };
      const v = info.streams.filter((x) => x.codec_type === 'video');
      check('ffprobe: one H.264 video stream, 1080×1350, no audio', v.length === 1 && v[0]!.codec_name === 'h264' && v[0]!.width === 1080 && v[0]!.height === 1350 && info.streams.every((x) => x.codec_type === 'video'), ff.stdout.replace(/\s+/g, ' '));
      check('ffprobe: an MP4 of the replay’s length', /mp4/.test(info.format.format_name) && Math.abs(Number(info.format.duration) * 1000 - total) <= 100, `${info.format.duration}s vs ${total}ms`);
      check('ffprobe: the tiles move (many more pictures than beats)', Number(v[0]!.nb_frames ?? 0) > (plan?.frames.length ?? 0) * 2, `${v[0]!.nb_frames} pictures for ${plan?.frames.length} beats`);
      // Every picture decodes, start to finish.
      const dec = spawnSync('ffmpeg', ['-v', 'error', '-i', saved, '-f', 'null', '-'], { encoding: 'utf8' });
      check('ffmpeg decodes every picture without an error', dec.status === 0 && !dec.stderr.trim(), dec.stderr.trim().slice(0, 200));
      // Two stills from inside the first Bloom beat, to see the wave arriving.
      const bloom = plan?.frames.find((f) => f.kind === 'grow' && f.duration > 600);
      if (bloom) {
        for (const [tag, ms] of [['a', bloom.at + 120], ['b', bloom.at + 380]] as const) {
          spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(ms / 1000), '-i', saved, '-frames:v', '1', `${SHOTS}/replay-video-bloom-${tag}.png`]);
        }
      }
    } else {
      console.log('INFO  ffprobe not available: skipped the independent file check');
    }
  } else {
    check('recording took about as long as the replay itself', waited >= total * 0.8 && waited <= total * 3, `${waited}ms for a ${total}ms replay`);
  }
  const stats = await page.evaluate(() => (window as unknown as { __severgrow?: { replayLastVideo?: () => unknown } }).__severgrow?.replayLastVideo?.() ?? null);
  console.log(`INFO  export stats: ${JSON.stringify(stats)}`);
  console.log(`INFO  ${name} · ${bytes} bytes · ${Math.round(bytes / 1024)}KB for ${(total / 1000).toFixed(1)}s · made in ${waited}ms`);

  // ---------- cancel an export ----------
  const cancelled = page.waitForEvent('download', { timeout: 4_000 }).then(() => 'downloaded').catch(() => 'none');
  await video.click();
  await page.waitForSelector('#replay [data-rp="video-cancel"]:not([hidden])', { timeout: 5_000 });
  await page.locator('#replay [data-rp="video-cancel"]').click();
  await page.locator('#replay .rp-video').waitFor({ state: 'hidden', timeout: 5_000 });
  check('cancel stops the export and takes the line away', await page.locator('#replay .rp-video').isHidden());
  check('cancel leaves the export control usable', !(await video.isDisabled()));
  check('a cancelled export saves no file', (await cancelled) === 'none');

  // A recording never outlives the surface: start one, close the replay, and it must stop.
  await video.click();
  await page.waitForSelector('#replay .rp-video:not([hidden])', { timeout: 5_000 });
  await page.locator('#replay [data-rp="close"]').click();
  await page.locator('#replay').waitFor({ state: 'hidden', timeout: 5_000 });
  await page.waitForTimeout(800);
  check('closing the replay stops a recording in flight', (await page.locator('#replay .rp-video').isHidden()) && (await page.locator('#gameover').isVisible()));

  // ---------- reduce motion ----------
  // The video is a recording of the match, so it keeps the model's own pacing — but a player who
  // asked for less motion must still get the same progress line and the same way out.
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('input[data-setting="reduceMotion"]');
    if (!input) throw new Error('no reduce-motion switch');
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  await page.locator('#go-replay').click();
  await waitVisible(page, '#replay', 20_000);
  await page.waitForTimeout(400);
  await page.locator('#replay [data-rp="video"]').click();
  await page.waitForSelector('#replay [data-rp="video-cancel"]:not([hidden])', { timeout: 5_000 });
  const rmLine = ((await page.locator('#replay .rp-video-text').textContent()) ?? '').trim();
  check(
    'reduce motion gets the same progress line and cancel',
    PROGRESS.test(rmLine) && (await page.locator('#replay [data-rp="video-cancel"]').isVisible()),
    rmLine,
  );
  const rmBoard = await page.locator('#replay .rp-board > svg').isVisible();
  check('the board stays on screen while it records with reduce motion', rmBoard);
  await page.locator('#replay [data-rp="video-cancel"]').click();
  await page.locator('#replay .rp-video').waitFor({ state: 'hidden', timeout: 5_000 });
  check('reduce motion can cancel it too', await page.locator('#replay .rp-video').isHidden());
} finally {
  await browser.close();
  await server.close();
}

if (failed) {
  console.error(`${failed} replay-video checks failed`);
  process.exit(1);
}
console.log('replay-video checks passed');
