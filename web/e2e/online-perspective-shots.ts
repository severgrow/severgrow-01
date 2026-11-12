// Phase 3b — seat 0 vs seat 1 perspective screenshots (same match, each from their side).
//   CHANNEL=futa04 npm run web:build && npx tsx web/e2e/online-perspective-shots.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { applyAs, newGame, viewFor } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { onlinePerspective } from '../src/online/perspective.js';
import { positionSave } from './position.js';
import { assertDistChannel } from './helpers/dist-channel.js';

const dir = 'docs/screens/online';
mkdirSync(dir, { recursive: true });

const midGame = (seed: number, turns: number): State => {
  let s = newGame(seed);
  for (let i = 0; i < turns && s.phase !== 'GAME_OVER'; i++) {
    s = applyAs(s, s.actor, GreedyBot.chooseAction(viewFor(s, s.actor)));
  }
  return s;
};

const doneCoach = { step: 99, taught: [], known: [], choice: 0, summaryDone: true };

// Owner decision (2026-10-19): the PRODUCT main menu has NO Continue — a saved match is offered
// when the player enters its level. These fixtures only need the resume itself, so boot first and
// invoke the still-bound hidden control, exactly as futa04-critical/motion do. Waiting for it to be
// VISIBLE (page.click) can never succeed on this channel: `[hidden]` is display:none by design.
const resumeSave = async (page: Page) => {
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 20000 });
  await page.evaluate(() => (document.getElementById('menu-continue') as HTMLButtonElement | null)?.click());
};

const openSeat = async (
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  state: State,
  label: string,
): Promise<{ page: Page; path: string }> => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const save = positionSave({ state, coach: doneCoach, level: 8 });
  await page.addInitScript((payload) => {
    localStorage.clear();
    // futa04 product channel prefixes with main2: before the page patches Storage.
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({
      sound: false,
      music: false,
      coach: false,
      speed: 'skip',
      reduceMotion: true,
      eyeCandy: false,
      level: 8,
    }));
    localStorage.setItem('main2:severgrow.save.v7', payload);
    localStorage.setItem('main2:severgrow.tips.v1', JSON.stringify({ fruit: true, strengthen: true, draw: true }));
  }, save);
  await page.goto(BASE);
  await assertDistChannel(page);   // loud if the served dist was built for another channel
  await resumeSave(page);
  await page.waitForTimeout(1600);
  const path = `${dir}/perspective-seat-${label}.png`;
  await page.screenshot({ path, type: 'png' });
  return { page, path };
};

// A FREE port (helpers/preview-port.ts): two concurrent runs can never collide.
const { server, url: BASE } = await servePreview(4199, { logLevel: 'silent' });
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);

try {
  const engine = midGame(42, 48);
  const seat0 = onlinePerspective(0).toDisplayState(engine);
  const seat1 = onlinePerspective(1).toDisplayState(engine);

  const a = await openSeat(browser, seat0, '0');
  const b = await openSeat(browser, seat1, '1');

  // Side-by-side composite for the owner: same match, Me always moss/bottom.
  const composite = await browser.newPage({
    viewport: { width: 820, height: 900 },
    deviceScaleFactor: 1,
  });
  const img0 = await a.page.screenshot({ type: 'png' });
  const img1 = await b.page.screenshot({ type: 'png' });
  await composite.setContent(`<!doctype html><html><body style="margin:0;background:#1a1c1a;color:#efe7d6;font:16px sans-serif">
  <h1 style="margin:12px 16px;font-size:18px">FUTASAKU online perspective — same match</h1>
  <div style="display:flex;gap:12px;padding:0 12px 12px">
    <figure style="margin:0;flex:1"><img style="width:100%;border-radius:8px" src="data:image/png;base64,${img0.toString('base64')}"/><figcaption style="text-align:center;padding:8px">Seat 0 — Me (moss) bottom</figcaption></figure>
    <figure style="margin:0;flex:1"><img style="width:100%;border-radius:8px" src="data:image/png;base64,${img1.toString('base64')}"/><figcaption style="text-align:center;padding:8px">Seat 1 — Me (moss) bottom</figcaption></figure>
  </div>
  </body></html>`);
  await composite.waitForTimeout(200);
  await composite.screenshot({ path: `${dir}/perspective-seat0-vs-seat1.png`, fullPage: true });

  // Sanity: each seat's home tile class is "you" (moss) near the bottom half.
  for (const [page, seat] of [[a.page, 0], [b.page, 1]] as const) {
    const check = await page.evaluate(() => {
      const wrap = document.getElementById('board-wrap')?.getBoundingClientRect();
      const you = [...document.querySelectorAll('#board g.tile.you')].map((g) => g.getBoundingClientRect());
      const bot = [...document.querySelectorAll('#board g.tile.bot')].map((g) => g.getBoundingClientRect());
      if (!wrap || !you.length || !bot.length) return { ok: false, reason: 'missing tiles' };
      const midY = wrap.top + wrap.height / 2;
      const youAvg = you.reduce((s, r) => s + r.top + r.height / 2, 0) / you.length;
      const botAvg = bot.reduce((s, r) => s + r.top + r.height / 2, 0) / bot.length;
      return { ok: youAvg > botAvg, youAvg, botAvg, midY, you: you.length, bot: bot.length };
    });
    if (!check.ok) {
      console.error(`FAIL seat ${seat}: moss not below lava`, check);
      process.exitCode = 1;
    } else {
      console.log(`PASS seat ${seat}: Me/moss below Opponent/lava (${check.you} vs ${check.bot} tiles)`);
    }
  }

  writeFileSync(
    `${dir}/README.md`,
    `# Online perspective screenshots (Phase 3b)

Same mid-game position, rendered for each seat.

- \`perspective-seat-0.png\` — seat 0 view (Me = moss/tree at bottom)
- \`perspective-seat-1.png\` — seat 1 view (Me = moss/tree at bottom after 180° map)
- \`perspective-seat0-vs-seat1.png\` — side by side

Offline stays identity (seat 0 mapping). Server always uses engine coordinates.
`,
  );

  await a.page.close();
  await b.page.close();
  await composite.close();
  console.log(`saved screenshots to ${dir}/`);
} finally {
  await browser.close();
  await server.close();
}
