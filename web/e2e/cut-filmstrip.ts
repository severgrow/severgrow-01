// The cut, frame by frame (Part 2 / Part 4 proof): plays a built cut with the page clock frozen
// and stepped to exact times, and saves a PNG per moment plus a contact sheet.
//   npx tsx web/e2e/cut-filmstrip.ts [--dir=docs/screens/overhaul/cut]
import { positionSave } from './position.js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { cutPosition } from './cut-positions.js';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dir = arg('dir') ?? 'docs/screens/overhaul/cut';
mkdirSync(dir, { recursive: true });
const TIMES = [0, 100, 220, 400, 700, 1000, 1400, 1800];
// A FREE port (helpers/preview-port.ts): two concurrent runs can never collide.
const { server, url: BASE } = await servePreview(4193, { logLevel: 'silent' });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const doneCoach = { step: 99, taught: [], known: [], choice: 0, summaryDone: true };

const film = async (name: string, n: number, mine: boolean, settings: Record<string, unknown> = {}) => {
  const { state, action } = cutPosition(n, mine);
  const page: Page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await page.addInitScript((frozen: boolean) => {
    // a page clock the test can step (only once switched on): timers, animation frames and
    // Web Animations all follow it, so each frame shows exactly that moment of the cut
    type T = { at: number; fn: () => void; id: number };
    const real = { setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window), raf: window.requestAnimationFrame.bind(window), now: performance.now.bind(performance), animate: Element.prototype.animate };
    const F = { on: frozen, now: 0, timers: [] as T[], frames: [] as ((t: number) => void)[], anims: [] as { a: Animation; t0: number }[], id: 1 };
    (window as unknown as { __fake: unknown }).__fake = F;
    window.setTimeout = ((fn: () => void, ms = 0) => {
      if (!F.on) return real.setTimeout(fn, ms);
      const id = F.id++;
      F.timers.push({ at: F.now + Math.max(0, ms), fn, id });
      return id;
    }) as typeof window.setTimeout;
    window.clearTimeout = ((id: number) => {
      F.timers = F.timers.filter((t) => t.id !== id);
      real.clearTimeout(id);
    }) as typeof window.clearTimeout;
    window.requestAnimationFrame = (fn) => {
      if (!F.on) return real.raf(fn);
      F.frames.push(fn);
      return 0;
    };
    performance.now = () => (F.on ? F.now : real.now());
    Element.prototype.animate = function (this: Element, k: Keyframe[] | PropertyIndexedKeyframes | null, o?: number | KeyframeAnimationOptions) {
      const a = real.animate.call(this, k, o);
      if (F.on) {
        a.pause();
        a.currentTime = 0;
        F.anims.push({ a, t0: F.now });
      }
      return a;
    };
    (window as unknown as { __step: (ms: number) => void }).__step = (ms: number) => {
      F.now += ms;
      const due = F.timers.filter((t) => t.at <= F.now).sort((x, y) => x.at - y.at);
      F.timers = F.timers.filter((t) => t.at > F.now);
      for (const t of due) t.fn();
      const fr = F.frames.splice(0);
      for (const f of fr) f(F.now);
      for (const { a, t0 } of F.anims) {
        try {
          a.currentTime = F.now - t0;
        } catch {
          /* finished or removed */
        }
      }
    };
  }, !!settings.frozen);
  await page.addInitScript(
    ([s, saved]) => {
      localStorage.clear();
      // The product build installs `main2:`. Seed every prefix this harness may be served with,
      // so the save is found whichever channel built `web/dist`.
      for (const prefix of ['', 'main2:', 'futa05:', 'futa05-3:', 'futa04:']) {
        localStorage.setItem(`${prefix}severgrow.settings.v1`, s as string);
        localStorage.setItem(`${prefix}severgrow.save.v7`, saved as string);
        localStorage.setItem(`${prefix}severgrow.tips.v1`, JSON.stringify({ fruit: true, strengthen: true, draw: true }));
        localStorage.setItem(`${prefix}severgrow.seen`, '1');
      }
    },
    [JSON.stringify({ sound: false, coach: false, speed: 'normal', level: 7, ...settings }), positionSave({ state, coach: doneCoach, level: 7 })],
  );
  await page.goto(BASE);
  // The product menu hides Continue (the save is offered when entering the level); the button and
  // its listener are still there, so a test-only DOM click resumes the fixture exactly as before.
  await page.waitForFunction(() => !!(window as unknown as { __severgrow?: unknown }).__severgrow, undefined, { timeout: 20000 });
  await page.evaluate(() => (document.getElementById('menu-continue') as HTMLElement | null)?.click());
  await page.waitForFunction(() => !!(window as unknown as { __severgrow?: { state?: () => unknown } }).__severgrow?.state?.(), undefined, { timeout: 20000 });
  await page.mouse.move(2, 2); // (no hover tooltip over the board)
  // the opponent's own move must not run first: for its turn the page clock is frozen from the start
  if (!mine) await page.waitForTimeout(2200);
  const cdp = await page.context().newCDPSession(page);
  await page.evaluate(() => ((window as unknown as { __fake: { on: boolean; now: number } }).__fake.on = true));
  await page.evaluate(([a, who]) => (window as unknown as { __severgrow: { playFor: (a: unknown, w: number) => boolean } }).__severgrow.playFor(a, who as number), [action, mine ? 1 : 0] as const);
  const clip = await page.locator('#board-wrap').boundingBox();
  const files: string[] = [];
  // time 0 is the moment the cut itself starts (after the tile that causes it lands)
  for (let i = 0; i < 250 && !(await page.evaluate(() => !!document.documentElement.dataset.cutTier)); i++) await page.evaluate(() => (window as unknown as { __step: (ms: number) => void }).__step(4));
  let now = 0;
  for (const t of TIMES) {
    while (now < t) {
      const d = Math.min(16, t - now);
      await page.evaluate((ms) => (window as unknown as { __step: (ms: number) => void }).__step(ms), d);
      now += d;
    }
    const f = `${dir}/${name}-${String(t).padStart(4, '0')}ms.png`;
    const shot = (await cdp.send('Page.captureScreenshot', { format: 'png', clip: { ...clip!, scale: 1 }, captureBeyondViewport: false })) as { data: string };
    writeFileSync(f, Buffer.from(shot.data, 'base64'));
    files.push(f);
  }
  const tier = await page.evaluate(() => document.documentElement.dataset.cutTier ?? null);
  await page.close();
  return { files, tier };
};

const sheet = async (title: string, files: string[], out: string) => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const imgs = files.map((f) => `<figure><img src="data:image/png;base64,${readFileSync(f).toString('base64')}"><figcaption>${f.match(/(\d+)ms/)![1]!.replace(/^0+(?=\d)/, '')} ms</figcaption></figure>`).join('');
  await page.setContent(`<style>body{margin:0;background:#18191a;color:#efe7d6;font:16px sans-serif;padding:16px}h1{font-size:20px;margin:0 0 12px}div{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}img{width:100%;border-radius:8px}figure{margin:0}figcaption{text-align:center;padding:4px}</style><h1>${title}</h1><div>${imgs}</div>`);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
};

const runs: [string, number, boolean, Record<string, unknown>, string][] = [
  ['small', 2, false, {}, 'Small cut (2 tiles): quiet, no movement'],
  ['severe-3', 3, false, {}, 'Severe cut (3 tiles): short beat, 60ms hit-stop, 2.5px shiver, 1.012 zoom, seam flash'],
  ['severe-4', 4, false, {}, 'Severe cut (4 tiles)'],
  ['big', 6, false, {}, 'Big cut (6 tiles): my 9 replaces the weak link'],
  ['huge-8', 8, false, {}, 'Huge cut (8 tiles)'],
  ['huge', 9, false, {}, 'Huge cut (9 tiles)'],
  ['opponent-cuts-me', 5, true, { frozen: true }, 'The opponent cuts 5 of mine: the calmer variant'],
  ['reduce-motion', 6, false, { reduceMotion: true }, 'Reduce motion: a fade only'],
  ['reduce-motion-severe', 3, false, { reduceMotion: true }, 'Reduce motion, Severe (3 tiles): still a plain fade'],
];
for (const [name, n, mine, s, title] of runs) {
  const { files, tier } = await film(name, n, mine, s);
  await sheet(title, files, `${dir}/${name}-contact-sheet.png`);
  console.log(`${name}: ${files.length} frames (tier ${tier})`);
}
await browser.close();
await server.close();
