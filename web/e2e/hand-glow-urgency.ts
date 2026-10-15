// The hand during my turn (owner, 2026-10-15):
//   1. While the display blinks GROW! (the idle re-prompt), the grow hand KEEPS breathing (its
//      scale pulse), in time with the display, instead of switching to a flat fade.
//   2. The turn-start light over my hand animates opacity only (no repainting filter).
//
//   PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx web/e2e/hand-glow-urgency.ts
//   SHOTS=1 ... also writes docs/screens/motion/*.png
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { legalActionsForState } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';
import { CHROME } from './helpers/local-duel.js';

const PORT = 4246;
const SHOTS = process.env.SHOTS === '1';
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: { ...process.env, CHANNEL: 'futa05', VITE_DUEL_API_URL: 'http://127.0.0.1:9', VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'k' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  child.stderr?.on('data', (b) => (err += String(b)));
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(err))));
});
const server = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch({ executablePath: CHROME });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.goto(`http://127.0.0.1:${PORT}/?seed=4242`);
  await page.waitForSelector('#game:not([hidden])');
  await page.waitForSelector('#starter-lottery', { state: 'hidden', timeout: 20_000 }).catch(() => undefined);
  // Reach MY grow step: draw if I must, never grow (so the hand is waiting to be played).
  for (let i = 0; i < 200; i++) {
    const st = (await page.evaluate('window.__severgrow.state()')) as State;
    const idle = !(await page.evaluate('window.__severgrow.busy()'));
    if (idle && st.actor === 0 && st.turnPlayer === 0 && st.phase === 'ACT' && legalActionsForState(st).some((a) => a.t === 'Sprout')) break;
    if (idle && st.actor === 0) {
      const acts = legalActionsForState(st);
      const a = acts.find((x) => x.t === 'Draw') ?? acts.find((x) => x.t === 'EndAct') ?? acts.find((x) => x.t === 'Discard') ?? acts[0]!;
      await page.evaluate(([x]) => (window as unknown as { __severgrow: { playFor: (a: unknown, w: number) => boolean } }).__severgrow.playFor(x, 0), [a] as const);
    }
    await page.waitForTimeout(80);
  }
  await page.waitForFunction("document.documentElement.dataset.step === 'grow' && document.documentElement.dataset.futa04Waiting === 'true'", undefined, { timeout: 20_000 });
  await page.waitForTimeout(400);
  const cardAnim = () => page.evaluate(`(() => { const c = document.querySelector('#hand:not(.waiting) .card.playable:not(.dim):not(.lifted)'); return c ? getComputedStyle(c).animationName : 'no card'; })()`) as Promise<string>;
  const before = await cardAnim();
  check('my grow hand breathes while I think', before.includes('futa04-card-breathe'), before);
  // The idle re-prompt: the display blinks GROW! (the cockpit sets html.idle-urgency).
  await page.evaluate("document.documentElement.classList.add('idle-urgency')");
  const during = await cardAnim();
  check('while GROW! blinks, the hand still breathes (scale), on the display beat', during === 'idle-urgency-grow-hand', during);
  const kf = (await page.evaluate(`(() => { const c = document.querySelector('#hand .card.playable:not(.dim):not(.lifted)'); const a = c.getAnimations()[0]; return a ? a.effect.getKeyframes().map(k => k.scale ?? '').join(',') : ''; })()`)) as string;
  check('…and that beat really grows and shrinks the cards', /1\.055/.test(kf), kf);
  await page.evaluate("document.documentElement.classList.remove('idle-urgency')");

  // The turn-start glow: opacity on each card's own light, never a filter on the hand.
  await page.evaluate("document.getElementById('hand').style.setProperty('--turn-glow-ms', '4000ms'); document.getElementById('hand').classList.add('turn-glow')");
  await page.waitForTimeout(1500);
  const glow = (await page.evaluate(`(() => { const c = document.querySelector('#hand .card'); const p = getComputedStyle(c, '::before'); return { name: p.animationName, op: Number(p.opacity), shadow: p.boxShadow, handFilter: getComputedStyle(document.getElementById('hand')).filter }; })()`)) as { name: string; op: number; shadow: string; handFilter: string };
  check('the turn glow fades each card\'s own light (opacity only)', glow.name === 'hand-turn-glow' && glow.op > 0.5 && glow.shadow !== 'none', JSON.stringify(glow));
  check('the hand itself carries no animated filter', glow.handFilter === 'none', glow.handFilter);
  if (SHOTS) {
    mkdirSync('docs/screens/motion', { recursive: true });
    await page.screenshot({ path: 'docs/screens/motion/turn-glow-new-390x844.png', clip: { x: 0, y: 560, width: 390, height: 284 } });
    await page.evaluate("document.getElementById('hand').classList.remove('turn-glow'); document.getElementById('hand').style.filter = 'drop-shadow(0 -4px 10px color-mix(in srgb, var(--c-text) 30%, transparent))'");
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'docs/screens/motion/turn-glow-old-390x844.png', clip: { x: 0, y: 560, width: 390, height: 284 } });
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
