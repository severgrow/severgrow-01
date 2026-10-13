/**
 * Display-glow optical QA (Futasaku 0.4 cockpit).
 *
 * Freezes the cockpit light at the frames the owner judges — idle first, then the
 * pulse / alarm / flash states and every `data-led-mode` ink — and writes before/after
 * pairs into docs/screens/glow. Uses the Vite dev server so the LED cell painter can be
 * re-imported to recolour the glyph canvas per mode (the app itself only ever emits
 * amber / score / red / green in production, but the CSS maps all six inks).
 *
 *   GLOW_PHASE=before tsx web/e2e/futa04-display-glow.ts
 *   GLOW_PHASE=after  tsx web/e2e/futa04-display-glow.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import type { Page } from 'playwright-core';

const PHASE = process.env.GLOW_PHASE ?? 'before';
const OUT = process.env.GLOW_OUT ?? `docs/screens/glow/${PHASE}`;
const PORT = Number(process.env.GLOW_PORT ?? 4201);

const viewportSet = [
  { name: '390x844', width: 390, height: 844, mobile: true },
  { name: '1280x800', width: 1280, height: 800, mobile: false },
] as const;

const modes = ['amber', 'ivory', 'green', 'red', 'pink', 'cyan'] as const;
type Mode = typeof modes[number];
type State = 'idle' | 'pulse' | 'alarm' | 'flash-cut' | 'flash-bloom';

const server = await createServer({
  configFile: 'web/vite.config.ts',
  server: { port: PORT, strictPort: true },
  logLevel: 'silent',
});
await server.listen();
const BASE = server.resolvedUrls?.local[0] ?? `http://localhost:${PORT}/`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });

const openDuel = async (v: (typeof viewportSet)[number], reduceMotion: boolean) => {
  const page = await browser.newPage({ viewport: { width: v.width, height: v.height }, isMobile: v.mobile, hasTouch: v.mobile, deviceScaleFactor: 2 });
  await page.addInitScript((reduced) => {
    (window as any).__name = (fn: unknown) => fn;
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, autoSkip: false, reduceMotion: reduced }));
  }, reduceMotion);
  await page.goto(`${BASE}?seed=2`);
  await page.waitForSelector('#deck.ready');
  await page.waitForFunction(() => !!document.getElementById('smart-led-spill') && !!document.getElementById('smart-panel'));
  // Let the opening score settle so the display rests rather than mid-reel.
  await page.waitForFunction(() => /^\d+:\d+$/.test(document.getElementById('smart-led-text')?.textContent ?? ''), undefined, { timeout: 6000 });
  await page.waitForTimeout(300);
  const rest = await page.locator('#smart-led-text').innerText();
  return { page, rest };
};

/** Pin the cockpit's optical state without waiting on gameplay timing. */
const force = async (page: Page, mode: Mode, state: State, text: string, urgency = false) => {
  await page.evaluate(async (opts) => {
    const { mode, state, urgency, text } = opts;
    const panel = document.getElementById('smart-panel')!;
    const win = document.getElementById('smart-led-window')!;
    panel.dataset.ledMode = mode;
    win.classList.toggle('led-pulse', state === 'pulse');
    win.classList.toggle('led-alarm', state === 'alarm');
    win.classList.toggle('led-flash-cut', state === 'flash-cut');
    win.classList.toggle('led-flash-bloom', state === 'flash-bloom');
    panel.classList.toggle('led-pulse', state === 'pulse');
    panel.classList.toggle('led-alarm', state === 'alarm');
    document.documentElement.classList.toggle('idle-urgency', urgency);
    // Hold one message so every frame is comparable, and paint the glyph canvases in
    // this mode's ink (the CSS maps all six inks; production only emits four).
    const spec = '/src/player/led-cells.ts';
    const m = await import(/* @vite-ignore */ spec);
    m.drawLedCells(document.getElementById('smart-led-cells') as HTMLCanvasElement, text, false, mode);
    m.drawLedCells(document.getElementById('smart-led-spill-cells') as HTMLCanvasElement, text, false, mode);
  }, { mode, state, urgency, text });
};

const FREEZE_AT: Record<State, number> = { idle: 0, pulse: 250, alarm: 240, 'flash-cut': 30, 'flash-bloom': 30 };

const pin = async (page: Page, state: State) => {
  await page.evaluate((t) => {
    document.getAnimations().forEach((a) => { try { a.pause(); a.currentTime = t; } catch { /* infinite/none */ } });
  }, FREEZE_AT[state]);
};

const DPR = 2;
const shoot = async (page: Page, name: string) => {
  const box = await page.locator('#smart-panel').boundingBox();
  const pad = 16;
  const clip = box ? { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: box.height + pad * 2 } : undefined;
  await page.screenshot({ path: `${OUT}/${name}.png`, ...(clip ? { clip } : {}) });
  if (!clip) return;
  const regions = await page.evaluate((base) => {
    const rel = (id: string) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x - base.x, y: r.y - base.y, w: r.width, h: r.height };
    };
    const buttons = [...document.querySelectorAll('#futa04-actions > .hand-slot')].map((el, i) => {
      const r = el.getBoundingClientRect();
      return { id: `slot${i}`, x: r.x - base.x, y: r.y - base.y, w: r.width, h: r.height };
    });
    return { panel: rel('smart-panel'), led: rel('smart-led'), window: rel('smart-led-window'), context: rel('smart-context'), spill: rel('smart-led-spill'), buttons };
  }, { x: clip.x, y: clip.y });
  const scaled = (r: { x: number; y: number; w: number; h: number } | null) => r ? { x: r.x * DPR, y: r.y * DPR, w: r.w * DPR, h: r.h * DPR } : null;
  const sidecar = {
    image: { width: Math.round(clip.width * DPR), height: Math.round(clip.height * DPR) },
    panel: scaled(regions.panel), led: scaled(regions.led), window: scaled(regions.window),
    context: scaled(regions.context), spill: scaled(regions.spill),
    buttons: regions.buttons.map((b) => ({ id: b.id, ...scaled(b)! })),
  };
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(sidecar));
};

let shots = 0;

for (const v of viewportSet) {
  // Motion on: the real resting cockpit first (what the owner judges), then the animated
  // states in their natural inks.
  const a = await openDuel(v, false);
  await pin(a.page, 'idle');
  await shoot(a.page, `${v.name}-idle`);
  shots++;
  for (const [mode, state] of [['amber', 'pulse'], ['amber', 'alarm'], ['green', 'flash-cut'], ['green', 'flash-bloom']] as const) {
    await force(a.page, mode, state, a.rest, state === 'alarm');
    await pin(a.page, state);
    await shoot(a.page, `${v.name}-${mode}-${state}`);
    shots++;
  }
  // Every mode at rest on one held message.
  for (const mode of modes) {
    await force(a.page, mode, 'idle', a.rest);
    await pin(a.page, 'idle');
    await shoot(a.page, `${v.name}-${mode}-idle`);
    shots++;
  }
  await a.page.close();

  // Reduced motion: must read as the same static reflected wash.
  const b = await openDuel(v, true);
  await force(b.page, 'amber', 'idle', b.rest);
  await pin(b.page, 'idle');
  await shoot(b.page, `${v.name}-reduce-idle`);
  await force(b.page, 'amber', 'alarm', b.rest, true);
  await pin(b.page, 'alarm');
  await shoot(b.page, `${v.name}-reduce-alarm`);
  await b.page.close();
}

await browser.close();
await server.close();
console.log(`${shots} glow shots written to ${OUT}`);
