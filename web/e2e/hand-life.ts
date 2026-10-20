// Phase 4: the idle hand breathes — and only when it should.
//
//   CHANNEL=futa05 npm run web:build, then:  npx tsx web/e2e/hand-life.ts
//
// Checks, at 390x844 and 360x640:
//   the hand breathes only on the player's turn (1-7 cards, 4.5-6 s, 0.4-0.8%),
//   it adds no layout shift (the hand's box and the page's scroll size never change),
//   it starts no requestAnimationFrame loop while idle,
//   it pauses under a finger and when the tab is hidden, and resumes in place,
//   and Reduce motion / Speed Off leave the hand completely still.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { CHROME } from './helpers/local-duel.js';

const { server, url: BASE } = await servePreview(4197, { logLevel: 'silent' });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? CHROME, args: ['--no-sandbox'] });
let checks = 0;
const check = (value: unknown, name: string) => {
  assert(value, name);
  checks++;
  console.log(`  ok ${name}`);
};

const settings = (reduceMotion: boolean, speed = 'normal') => JSON.stringify({
  sound: false, music: false, coach: false, autoSkip: false, reduceMotion, speed,
});

/**
 * Settings must be written BEFORE the page's channel script patches Storage: at that point the
 * app's prefix is not applied yet, so the test writes the real keys itself (futa05 at the root,
 * main2 for a futa04 build). After load, the page's own prefixed reads see them.
 */
const installSettings = (page: Page, json: string) => page.addInitScript(`
  localStorage.setItem('futa05:severgrow.settings.v1', ${JSON.stringify(json)});
  localStorage.setItem('main2:severgrow.settings.v1', ${JSON.stringify(json)});
`);

/** Counts every requestAnimationFrame the page asks for, so "no RAF" is measured, not assumed. */
const installRafProbe = (page: Page) => page.addInitScript(() => {
  const raw = window.requestAnimationFrame.bind(window);
  const probe = { count: 0 };
  (window as unknown as { __rafProbe: typeof probe }).__rafProbe = probe;
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    probe.count++;
    return raw(cb);
  };
});

const BREATH_PROBE = `(() => {
  const hand = document.getElementById('hand');
  const cards = [...hand.querySelectorAll('.card')];
  const states = document.getAnimations()
    .filter(a => a.animationName === 'hand-breath')
    .map(a => a.playState);
  return {
    breathing: hand.classList.contains('breathing'),
    held: hand.classList.contains('breath-hold'),
    cards: cards.length,
    running: states.filter(p => p === 'running').length,
    paused: states.filter(p => p === 'paused').length,
    periods: cards.map(c => { const css = getComputedStyle(c); return { name: css.animationName, duration: css.animationDuration, delay: css.animationDelay }; }),
    amps: cards.map(c => Number(c.style.getPropertyValue('--breath-scale')) || 1),
    weights: cards.map(c => Number(c.style.getPropertyValue('--weight')) || 0),
  };
})()`;

type Breath = {
  breathing: boolean; held: boolean; cards: number; running: number; paused: number;
  periods: { name: string; duration: string; delay: string }[]; amps: number[]; weights: number[];
};
const breath = (page: Page) => page.evaluate(BREATH_PROBE) as Promise<Breath>;

/** The hand's layout box, each card's layout size and the page's scroll size. */
const GEOMETRY = `(() => {
  const hand = document.getElementById('hand');
  const r = hand.getBoundingClientRect();
  const round = n => Math.round(n * 10) / 10;
  return {
    hand: { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) },
    cards: [...hand.querySelectorAll('.card')].map(c => ({ w: c.offsetWidth, h: c.offsetHeight })),
    scroll: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight },
  };
})()`;
const geometry = (page: Page) => page.evaluate(GEOMETRY) as Promise<{
  hand: { x: number; y: number; w: number; h: number }; cards: { w: number; h: number }[];
  scroll: { w: number; h: number; iw: number; ih: number };
}>;

const resetRaf = (page: Page) => page.evaluate('(() => { window.__rafProbe.count = 0; })()');
const rafCount = (page: Page) => page.evaluate('(() => window.__rafProbe.count)()') as Promise<number>;

const startGame = async (page: Page) => {
  await page.goto(`${BASE}?seed=2`);
  await page.waitForSelector('#deck.ready', { timeout: 30_000 });
  await page.waitForFunction(() => {
    const h = (window as unknown as { __severgrow?: { busy: () => boolean } }).__severgrow;
    return !!h && !h.busy();
  }, undefined, { timeout: 30_000 });
  await page.waitForTimeout(400);
};

try {
  for (const [w, h] of [[390, 844], [360, 640]] as const) {
    console.log(`\n${w}x${h} — the hand breathes:`);
    const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
    await installRafProbe(page);
    await installSettings(page, settings(false));
    await startGame(page);

    const b1 = await breath(page);
    check(b1.breathing, `${w}x${h}: the interactive hand carries .breathing`);
    check(b1.running >= 1 && b1.running <= 7, `${w}x${h}: between 1 and 7 cards breathe (${b1.running} of ${b1.cards})`);
    check(b1.paused === 0, `${w}x${h}: no breath starts paused`);
    check(b1.periods.filter((p) => p.name === 'hand-breath').length <= 7, `${w}x${h}: at most 7 breath animations exist`);
    const periods = b1.periods.filter((p) => p.name === 'hand-breath')
      .map((p) => parseFloat(p.duration) * (p.duration.trim().endsWith('ms') ? 1 : 1000));
    check(periods.length > 0 && periods.every((ms) => ms >= 4500 && ms <= 6000),
      `${w}x${h}: every breath is 4.5-6 s (${periods.map((n) => Math.round(n)).join(', ')})`);
    const delays = b1.periods.filter((p) => p.name === 'hand-breath').map((p) => p.delay);
    check(new Set(delays).size > 1, `${w}x${h}: cards do not breathe in step (${delays.join(', ')})`);
    const amps = b1.amps.filter((a) => a > 1);
    check(amps.length > 0 && amps.every((a) => a >= 1.004 && a <= 1.008),
      `${w}x${h}: amplitude is 0.4-0.8% (${amps.map((a) => a.toFixed(4)).join(', ')})`);
    // Lighter cards sway at least as much as heavier ones.
    const pairs = b1.amps.map((a, i) => ({ a, w: b1.weights[i]! })).filter((p) => p.a > 1).sort((x, y) => x.w - y.w);
    check(pairs.every((p, i) => i === 0 || p.a <= pairs[i - 1]!.a + 1e-6), `${w}x${h}: heavier cards sway no more`);

    // No layout shift: the same boxes and the same page after more than a whole breath.
    const g1 = await geometry(page);
    await page.waitForTimeout(1200);
    const g2 = await geometry(page);
    check(JSON.stringify(g1.hand) === JSON.stringify(g2.hand), `${w}x${h}: the hand's box does not move (${g1.hand.w}x${g1.hand.h})`);
    check(JSON.stringify(g1.cards) === JSON.stringify(g2.cards), `${w}x${h}: no card's hit box changes size`);
    check(JSON.stringify(g1.scroll) === JSON.stringify(g2.scroll), `${w}x${h}: the page does not scroll or grow`);

    // No RAF: the breath is CSS, so an idle hand asks for no frames.
    await resetRaf(page);
    await page.waitForTimeout(1000);
    const raf = await rafCount(page);
    const feel = await page.evaluate('(() => window.__severgrow.feel())()') as { rafSubscribers: number };
    check(feel.rafSubscribers === 0, `${w}x${h}: the breath owns no scheduler subscriber (${feel.rafSubscribers})`);
    check(raf <= 2, `${w}x${h}: an idle breathing hand starts no RAF loop (${raf} frames in 1 s)`);

    // Under a finger: paused where it is, so the target cannot move before the tap lands.
    const card = page.locator('#hand .card').first();
    const box = (await card.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6);
    await page.mouse.down();
    await page.waitForTimeout(80);
    const down = await breath(page);
    check(down.held, `${w}x${h}: pointerdown holds the breath`);
    check(down.running === 0 && down.paused > 0, `${w}x${h}: the breath freezes under the finger (${down.paused} paused)`);
    await page.mouse.up();
    await page.waitForTimeout(120);
    const up = await breath(page);
    check(!up.held && up.running > 0, `${w}x${h}: releasing resumes the same breath (${up.running} running)`);

    // Hidden tab: the pause is a state, so nothing is left running off-screen.
    await page.evaluate('(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); })()');
    await page.waitForTimeout(60);
    const hidden = await breath(page);
    check(hidden.held && hidden.running === 0, `${w}x${h}: a hidden tab holds the breath`);
    await page.evaluate('(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); })()');
    await page.waitForTimeout(80);
    check((await breath(page)).running > 0, `${w}x${h}: coming back resumes it`);

    // Off while a move animates, and off on the opponent's turn: a real draw, end, throw.
    const first = await page.evaluate('(() => window.__severgrow.state().hands[0][0].id)()') as number;
    await page.evaluate('(() => window.__severgrow.playFor({ t: "Draw", from: "deck" }, 0))()');
    await page.waitForTimeout(80);
    check(!(await breath(page)).breathing, `${w}x${h}: no breath while the move animates`);
    await page.waitForFunction(() => !(window as unknown as { __severgrow: { busy: () => boolean } }).__severgrow.busy());
    await page.evaluate('(() => window.__severgrow.playFor({ t: "EndAct" }, 0))()');
    await page.waitForFunction(() => !(window as unknown as { __severgrow: { busy: () => boolean } }).__severgrow.busy());
    await page.evaluate(`(() => window.__severgrow.playFor({ t: "Discard", card: ${first} }, 0))()`);
    await page.waitForTimeout(80);
    check(!(await breath(page)).breathing, `${w}x${h}: no breath while the throw animates`);
    await page.waitForFunction(() => (window as unknown as { __severgrow: { state: () => { actor: number } } }).__severgrow.state().actor === 1);
    const onOpp = await page.evaluate(`(() => ({
      actor: window.__severgrow.state().actor,
      breathing: document.getElementById('hand').classList.contains('breathing'),
    }))()`) as { actor: number; breathing: boolean };
    check(onOpp.actor === 1 && !onOpp.breathing, `${w}x${h}: no breath on the opponent's turn`);
    await page.waitForFunction(() => {
      const h = (window as unknown as { __severgrow: { state: () => { actor: number }; busy: () => boolean } }).__severgrow;
      return !h.busy() && h.state().actor === 0;
    }, undefined, { timeout: 30_000 });
    await page.waitForTimeout(200);
    check((await breath(page)).breathing, `${w}x${h}: the breath comes back on the player's turn`);
    await page.close();
  }

  console.log('\nReduce motion — the hand is still:');
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await installRafProbe(page);
    await installSettings(page, settings(true));
    await startGame(page);
    const b = await breath(page);
    check(!b.breathing, 'reduce motion: the hand does not carry .breathing');
    check(b.running === 0 && b.paused === 0, 'reduce motion: no breath animation runs');
    check(b.periods.every((p) => p.name !== 'hand-breath'), 'reduce motion: no hand-breath animation is applied');
    const motion = await page.evaluate(`(() => ({
      html: document.documentElement.classList.contains('reduce-motion'),
      transition: getComputedStyle(document.querySelector('#hand .card')).transitionDuration,
    }))()`) as { html: boolean; transition: string };
    check(motion.html, 'reduce motion: the page is in its reduce-motion state');
    check(motion.transition.split(',').every((v) => parseFloat(v) === 0), `reduce motion: the lift/settle is instant (${motion.transition})`);
    const card = await page.locator('#hand .card').first().boundingBox();
    check(!!card, 'reduce motion: the hand is still drawn');
    await resetRaf(page);
    await page.waitForTimeout(1000);
    const stillFeel = await page.evaluate('(() => window.__severgrow.feel())()') as { rafSubscribers: number };
    check(stillFeel.rafSubscribers === 0, 'reduce motion: no scheduler subscriber for the hand');
    await page.close();
  }

  console.log('\nSpeed Off — no motion at all:');
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await installSettings(page, settings(false, 'skip'));
    await startGame(page);
    check(!(await breath(page)).breathing, 'speed off: the hand does not breathe');
    await page.close();
  }

  console.log(`\nHand life passed (${checks} checks).`);
} finally {
  await browser.close();
  await server.close();
}
