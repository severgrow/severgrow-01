// The cut, frame by frame (Part 2 / Part 4 proof): plays a built cut with the page clock frozen
// and stepped to exact times, and saves a PNG per moment plus a contact sheet.
//   npx tsx web/e2e/cut-filmstrip.ts [--dir=docs/screens/overhaul/cut]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { cutPosition } from './cut-positions.js';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dir = arg('dir') ?? 'docs/screens/overhaul/cut';
mkdirSync(dir, { recursive: true });
const TIMES = [0, 100, 220, 400, 700, 1000, 1400, 1800];
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4193, strictPort: true }, logLevel: 'silent' });
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
      localStorage.setItem('severgrow.settings.v1', s as string);
      localStorage.setItem('severgrow.save.v5', saved as string);
      localStorage.setItem('severgrow.tips.v1', JSON.stringify({ fruit: true, strengthen: true, draw: true }));
      localStorage.setItem('severgrow.seen', '1');
    },
    [JSON.stringify({ sound: false, coach: false, speed: 'normal', level: 7, ...settings }), JSON.stringify({ state, coach: doneCoach, level: 7 })],
  );
  await page.goto('http://localhost:4193/');
  await page.click('#menu-continue');
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
  await page.close();
  return files;
};

const sheet = async (title: string, files: string[], out: string) => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const imgs = files.map((f) => `<figure><img src="data:image/png;base64,${readFileSync(f).toString('base64')}"><figcaption>${f.match(/(\d+)ms/)![1]!.replace(/^0+(?=\d)/, '')} ms</figcaption></figure>`).join('');
  await page.setContent(`<style>body{margin:0;background:#18191a;color:#efe7d6;font:16px sans-serif;padding:16px}h1{font-size:20px;margin:0 0 12px}div{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}img{width:100%;border-radius:8px}figure{margin:0}figcaption{text-align:center;padding:4px}</style><h1>${title}</h1><div>${imgs}</div>`);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
};

const runs: [string, number, boolean, Record<string, unknown>, string][] = [
  ['big', 6, false, {}, 'Big cut (6 tiles): my 9 replaces the weak link'],
  ['huge', 9, false, {}, 'Huge cut (9 tiles)'],
  ['medium', 4, false, {}, 'Medium cut (4 tiles)'],
  ['small', 2, false, {}, 'Small cut (2 tiles)'],
  ['opponent-cuts-me', 5, true, { frozen: true }, 'The opponent cuts 5 of mine: the calmer variant'],
  ['reduce-motion', 6, false, { reduceMotion: true }, 'Reduce motion: a fade only'],
];
for (const [name, n, mine, s, title] of runs) {
  const files = await film(name, n, mine, s);
  await sheet(title, files, `${dir}/${name}-contact-sheet.png`);
  console.log(`${name}: ${files.length} frames`);
}
await browser.close();
await server.close();
