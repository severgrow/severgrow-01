// THE THREE JOY PASSES (owner, 2026-11-20: "find another 3 animations that can be easily improved
// for max satisfaction joy dopamine and do please").
//
//   1. the turn-start glow travels across the hand (logic/turn-glow.ts) — same 900 ms, opacity only;
//   2. a Strengthen makes the TILE answer, inside the step's own hold (ui/feel.ts);
//   3. a score's landing click starts before the count ends, so it reads as one arrival.
//
// Every one of them is measured on the REAL path in a real page, and every one must become NOTHING
// under Reduce motion. Frames go to /tmp/juice (the owner is shown them).
//
//   PW_CHROMIUM="..." npx tsx web/e2e/juice-joy.ts
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { allNeighbors, coordKey, homeCoord, newGame } from '../../src/engine/index.js';
import { positionSave } from './position.js';
import { SCORE_BEAT } from '../src/logic/candy.js';
import { MOTION } from '../src/logic/motion.js';
import { STRENGTHEN_POP_MS } from '../src/ui/feel.js';
import { GLOW_STEP_MAX } from '../src/logic/turn-glow.js';

const SHOTS = process.env.SHOTS === '1';
const OUT = process.env.JUICE_DIR ?? '/tmp/juice';
if (SHOTS) mkdirSync(OUT, { recursive: true });

const { server, url: BASE } = await servePreview(4191, { logLevel: 'silent' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
const baseSettings = { sound: false, music: false, coach: false, autoSkip: false, reduceMotion: false, speed: 'normal', vibration: false };

const open = async (save: string, extra: Record<string, unknown> = {}) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await p.addInitScript(([s, g]) => {
    (window as any).__name = (f: unknown) => f;
    if (s) localStorage.setItem('main2:severgrow.save.v7', s as string);
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify(g));
  }, [save, { ...baseSettings, ...extra }] as const);
  await p.goto(BASE);
  await p.waitForSelector('#menu-continue', { state: 'attached' });
  await p.evaluate(() => (document.getElementById('menu-continue') as HTMLElement | null)?.click());
  await p.waitForFunction(() => !(window as any).__severgrow.busy(), undefined, { timeout: 30_000 });
  return p;
};
const idle = (p: any) => p.waitForFunction(() => !(window as any).__severgrow.busy(), undefined, { timeout: 40_000 }).catch(() => undefined);
const tapHex = async (p: any, key: string) => {
  const box = await p.locator(`.hex-cell[data-key="${key}"] path.hex`).boundingBox();
  if (box) await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

let failures = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

try {
  // ---------------------------------------------------------------- 1. the glow wave
  // Read at the INSTANT the class lands (a MutationObserver in the page), so a loaded runner can
  // never miss a 900 ms beat — and so the numbers are the ones the browser really composites.
  const GLOW_PROBE = () => {
    (window as any).__glow = [] as unknown[];
    new MutationObserver(() => {
      const h = document.getElementById('hand');
      if (!h || !h.classList.contains('turn-glow')) return;
      (window as any).__glow.push({
        ms: h.style.getPropertyValue('--turn-glow-ms'),
        step: h.style.getPropertyValue('--turn-glow-step'),
        tail: h.style.getPropertyValue('--turn-glow-tail'),
        cards: [...h.querySelectorAll('.card')].map((c) => {
          const st = getComputedStyle(c, '::before');
          return { name: st.animationName, dur: st.animationDuration, delay: st.animationDelay };
        }),
      });
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ['class'] });
  };

  // One whole turn, tapped like a person: draw, grow, throw.
  const playOneTurn = async (p: any) => {
    await p.locator('#deck').evaluate((el: HTMLElement) => el.click());
    await idle(p);
    const card = p.locator('#hand .card.playable').first();
    if (await card.count()) await card.evaluate((el: HTMLElement) => el.click());
    await p.waitForTimeout(250);
    const t = p.locator('#board .target').first();
    if (await t.count()) {
      const box = await t.boundingBox();
      if (box) await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    await idle(p);
    if ((await p.evaluate(() => (window as any).__severgrow.state()?.phase)) === 'DISCARD') {
      const throwCard = p.locator('#hand .card.playable').first();
      if (await throwCard.count()) await throwCard.evaluate((el: HTMLElement) => el.click());
      await p.waitForTimeout(280);
      await p.locator('#discard').evaluate((el: HTMLElement) => el.click());
    }
  };

  {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await p.addInitScript(([s, g, probe]) => {
      (window as any).__name = (f: unknown) => f;
      localStorage.setItem('main2:severgrow.save.v7', s as string);
      localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify(g));
      (0, eval)(`(${probe})()`);
    }, [positionSave({ state: { ...newGame(11), phase: 'DRAW' as const } }), baseSettings, GLOW_PROBE.toString()] as const);
    await p.goto(BASE);
    await p.waitForSelector('#menu-continue', { state: 'attached' });
    await p.evaluate(() => (document.getElementById('menu-continue') as HTMLElement | null)?.click());
    await p.waitForFunction(() => !(window as any).__severgrow.busy(), undefined, { timeout: 30_000 });
    await playOneTurn(p);
    await p.waitForFunction(() => ((window as any).__glow as unknown[]).length > 0, undefined, { timeout: 60_000 });
    const wave = (await p.evaluate(() => ((window as any).__glow as any[]).at(-1)))!;
    const delays = wave.cards.map((r: any) => Number.parseFloat(r.delay) * 1000);
    const durations = wave.cards.map((r: any) => Number.parseFloat(r.dur) * 1000);
    check('the light travels: each card waits its turn', delays.length > 1 && delays.every((d: number, i: number) => i === 0 || d > delays[i - 1]!), JSON.stringify(delays));
    check("the beat between neighbours is the plan's step", Math.abs(delays[1]! - delays[0]! - Number.parseFloat(wave.step)) < 1, `${delays[1]! - delays[0]!} vs ${wave.step}`);
    const total = Number.parseFloat(wave.ms);
    check('the sweep ends exactly on the beat it replaced (no turn is longer)',
      Math.abs(Math.max(...delays) + durations[0]! - total) < 1, `tail ${Math.max(...delays)} + card ${durations[0]} vs ${total}`);
    check('opacity only on the compositor', wave.cards.every((r: any) => r.name === 'hand-turn-glow'), wave.cards[0].name);
    check('the step is a short sweep, not a queue', Number.parseFloat(wave.step) <= GLOW_STEP_MAX, wave.step);

    if (SHOTS) {
      // The wave held under a fixed clock: the SAME rule with the plan's own step (after), and with
      // the step forced to zero (before = the old wash on every card at the same instant).
      const shoot = async (name: string, step: string, tail: string) => {
        await p.evaluate(([s, t]) => {
          const h = document.getElementById('hand')!;
          h.style.setProperty('--turn-glow-ms', '1200ms');
          h.style.setProperty('--turn-glow-step', s);
          h.style.setProperty('--turn-glow-tail', t);
          h.classList.remove('turn-glow');
          void h.offsetWidth;
          h.classList.add('turn-glow');
        }, [step, tail] as const);
        for (let k = 0; k < 6; k++) {
          await p.screenshot({ path: `${OUT}/01-turn-glow-${name}-${k}.png`, clip: { x: 0, y: 640, width: 390, height: 204 } });
          await p.waitForTimeout(80);
        }
        await p.evaluate(() => document.getElementById('hand')!.classList.remove('turn-glow'));
      };
      await shoot('before', '0ms', '0ms');
      await shoot('after', wave.step, wave.tail);
    }
    await p.close();
  }

  // ---------------------------------------------------------------- 1b. Reduce motion: no glow at all
  {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await p.addInitScript(([s, g, probe]) => {
      (window as any).__name = (f: unknown) => f;
      localStorage.setItem('main2:severgrow.save.v7', s as string);
      localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify(g));
      (0, eval)(`(${probe})()`);
    }, [positionSave({ state: { ...newGame(11), phase: 'DRAW' as const } }), { ...baseSettings, reduceMotion: true }, GLOW_PROBE.toString()] as const);
    await p.goto(BASE);
    await p.waitForSelector('#menu-continue', { state: 'attached' });
    await p.evaluate(() => (document.getElementById('menu-continue') as HTMLElement | null)?.click());
    await p.waitForFunction(() => !(window as any).__severgrow.busy(), undefined, { timeout: 30_000 });
    await playOneTurn(p);
    await p.waitForTimeout(9000); // long enough for the hand-over either way
    const lights = (await p.evaluate(() => ((window as any).__glow as unknown[]).length)) as number;
    check('Reduce motion: the turn glow is NOTHING, not a faint version', lights === 0, `${lights} light-ups`);
    await p.close();
  }

  // ---------------------------------------------------------------- 2. the Strengthen's tile answer
  {
    const base = newGame(5);
    const key = allNeighbors(homeCoord(0, base.config)).map(coordKey).find((k) => base.board[k] === null)!;
    const st = { ...base, phase: 'ACT' as const, actor: 0 as const, turnPlayer: 0 as const, board: { ...base.board, [key]: { owner: 0 as const, strength: 2 } }, hands: [[{ id: 900, suit: 0 as const, rank: 5 }, ...base.hands[0]], base.hands[1]] as any };
    const p = await open(positionSave({ state: st }));
    await p.evaluate(() => {
      (window as any).__anims = [] as unknown[];
      const orig = Element.prototype.animate;
      Element.prototype.animate = function (this: Element, frames: unknown, opts: unknown) {
        try { (window as any).__anims.push({ cls: this.getAttribute('class') ?? '', d: Math.round(Number((opts as any)?.duration) || 0), k: JSON.stringify(frames) }); } catch { /* ignore */ }
        return orig.call(this, frames as Keyframe[], opts as KeyframeAnimationOptions);
      };
    });
    const before = await p.evaluate(() => (window as any).__anims.length);
    await p.locator('#hand [data-card="900"]').evaluate((el) => (el as HTMLElement).click());
    await p.waitForTimeout(120);
    await tapHex(p, key);
    if (await p.locator('#confirm-play').isVisible()) await p.locator('#confirm-play').evaluate((el) => (el as HTMLElement).click());
    await p.waitForTimeout(120);
    const anims = await p.evaluate((n) => ((window as any).__anims as { cls: string; d: number; k: string }[]).slice(n), before);
    const tilePop = anims.find((a) => a.cls.includes('tile') && a.k.includes('translateY(-1.6px)'));
    check('a Strengthen makes the tile itself answer', !!tilePop, JSON.stringify(anims.map((a) => `${a.cls}:${a.d}`)));
    if (tilePop) {
      check('the tile pop is the pinned beat (inside the step\'s own hold)', tilePop.d === STRENGTHEN_POP_MS, `${tilePop.d}ms`);
      check('the tile pop animates transform only', !/filter|boxShadow|opacity/.test(tilePop.k), tilePop.k.slice(0, 80));
      check('it is tactile, not a bounce (a few percent)', /scale\(1\.03/.test(tilePop.k));
    }
    if (SHOTS) {
      for (let k = 0; k < 3; k++) {
        await p.screenshot({ path: `${OUT}/02-strengthen-after-${k}.png`, clip: { x: 30, y: 150, width: 330, height: 400 } });
        await p.waitForTimeout(75);
      }
    }
    await idle(p);
    await p.close();
  }

  // ---------------------------------------------------------------- 3. the score lands as it arrives
  {
    const p = await open(positionSave({ state: { ...newGame(7), phase: 'ACT', actor: 0, turnPlayer: 0 } }));
    await p.evaluate(() => {
      (window as any).__score = [] as unknown[];
      const el = document.getElementById('score-you')!;
      const orig = el.animate.bind(el);
      (el as HTMLElement).animate = ((frames: unknown, opts: unknown) => {
        try { (window as any).__score.push({ d: Math.round(Number((opts as any)?.duration) || 0), dl: Math.round(Number((opts as any)?.delay) || 0), k: JSON.stringify(frames) }); } catch { /* ignore */ }
        return orig(frames as Keyframe[], opts as KeyframeAnimationOptions);
      }) as HTMLElement['animate'];
    });
    await p.locator('#hand .card.playable').first().evaluate((el) => (el as HTMLElement).click());
    const t = p.locator('.l-over .target[data-key]').first();
    if (await t.count()) await tapHex(p, (await t.getAttribute('data-key'))!);
    if (await p.locator('#confirm-play').isVisible()) await p.locator('#confirm-play').evaluate((el) => (el as HTMLElement).click());
    await p.waitForTimeout(1400);
    const score = await p.evaluate(() => (window as any).__score as { d: number; dl: number; k: string }[]);
    const pop = score.find((a) => a.k.includes(String(SCORE_BEAT.popScale)));
    check('the score still clicks on the number that changed', !!pop, JSON.stringify(score));
    if (pop) {
      check('the click starts BEFORE the count ends (one arrival, not two events)',
        pop.dl < MOTION.move && pop.dl === MOTION.move - SCORE_BEAT.popLead, `${pop.dl}ms of ${MOTION.move}ms`);
      check('the click carries a hair of lift and the pinned scale', pop.k.includes('translateY(-1px)') && pop.k.includes(String(SCORE_BEAT.popScale)));
      check('the number is transform only (no filter, no layout)', !/filter|boxShadow|width|height/.test(pop.k));
    }
    if (SHOTS) await p.screenshot({ path: `${OUT}/03-score-after.png`, clip: { x: 0, y: 0, width: 390, height: 96 } });
    await p.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
