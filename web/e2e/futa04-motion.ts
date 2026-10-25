/** Focused checks for Futasaku 0.4's card flights and network wave. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { allNeighbors, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Player, State } from '../../src/engine/index.js';
import { cutPosition } from './cut-positions.js';
import { positionSave } from './position.js';
import { PINNED } from '../src/logic/motion.js';
import { BOOMERANG } from '../src/ui/throw-boomerang.js';
import { assertDistChannel } from './helpers/dist-channel.js';
import { openMenuEntry } from './helpers/menu-nav.js';

// A FREE port (helpers/preview-port.ts): two concurrent runs can never collide.
const { server, url: BASE } = await servePreview(4199, { logLevel: 'silent' });
const browser = await chromium.launch({...(process.env.PW_CHROMIUM ? {executablePath:process.env.PW_CHROMIUM} : {}),args:['--no-sandbox']});
const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
try {
  await page.addInitScript(() => localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({sound:false,music:false,coach:false,autoSkip:false,reduceMotion:false,speed:'normal'})));
  // The runner's TS transform names nested functions; the browser has no such helper. Evaluated
  // page code that defines a callback (the pile-top sampler) needs this shim, as other suites do.
  await page.addInitScript(() => { (window as any).__name = (fn: unknown) => fn; });
  await page.goto(`${BASE}?seed=2`);
  await page.waitForSelector('#deck.ready');
  const draw = await page.evaluate(async () => {
    const before = new Set((window as any).__severgrow.state().hands[0].map((card:{id:number})=>card.id));
    const pile = document.querySelector('#deck .pile-card')!.getBoundingClientRect();
    document.getElementById('deck')!.click();
    await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    const id = (window as any).__severgrow.state().hands[0].find((card:{id:number})=>!before.has(card.id)).id;
    const card = document.querySelector<HTMLElement>(`#hand [data-card="${id}"]`)!;
    const anim = card.getAnimations().find(a=>(a.effect as KeyframeEffect).getKeyframes().some(k=>'translate' in k));
    return {pile:pile.toJSON(),card:card.getBoundingClientRect().toJSON(),
      frames:(anim?.effect as KeyframeEffect | undefined)?.getKeyframes(),duration:(anim?.effect as KeyframeEffect | undefined)?.getTiming().duration};
  });
  assert.equal(draw.duration,396,'draw card travels for the intended short beat');
  const first = String(draw.frames?.[0]?.translate ?? '');
  assert(first.includes('px') && first !== '0 0','draw starts at the actual pile, not already in hand');
  await page.waitForFunction(() => (window as any).__severgrow.state().phase === 'ACT' && !(window as any).__severgrow.busy());
  await page.locator('#smart-context').click();
  await page.waitForFunction(() => (window as any).__severgrow.state().phase === 'DISCARD' && !(window as any).__severgrow.busy());
  const before = await page.evaluate(() => (window as any).__severgrow.state());
  const throwAction = legalActions(viewFor(before,0)).find(action=>action.t==='Discard');
  assert(throwAction,'a legal card can be thrown');
  const thrown = await page.evaluate(async action => {
    (window as any).__severgrow.playFor(action,0);
    await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    const flyer = document.querySelector<HTMLElement>('.flyer.card');
    const anim = flyer?.getAnimations()[0];
    const source = document.querySelector<HTMLElement>(`#hand [data-card="${(action as any).card}"]`);
    return {sourceGoneOrHidden:!source || source.style.visibility==='hidden',
      frames:(anim?.effect as KeyframeEffect | undefined)?.getKeyframes(),duration:(anim?.effect as KeyframeEffect | undefined)?.getTiming().duration};
  },throwAction);
  assert(thrown.sourceGoneOrHidden,'the original card does not double while its copy flies');
  // The throw is the BOOMERANG now (owner, 2026-10-25: every human throw — swipe up, pile drop,
  // pile tap — gets the flourish). Its own flight is still the Futa04 short beat: the card's
  // `PINNED.throwFlight` (320ms), which must finish INSIDE the step's `PINNED.throw` wait (396ms).
  // These assertions used to pin `flyCard`'s 320ms flight and its .48 arc apex. What ships is a
  // different animation now, so they pin the property that matters — the flight fits the wait —
  // plus the boomerang's shape: a turn out, alignment over the board, arrival before the fade.
  // The step's real hold is measured further down, from the pump's own log (a fast-forward below
  // cuts this one short on purpose, so its length here would prove nothing).
  assert.equal(thrown.duration,PINNED.throwFlight,'throw flies on the Futa04 short beat');
  assert(thrown.duration! < PINNED.throw,`the throw finishes inside the action wait (${thrown.duration} < ${PINNED.throw})`);
  const throwFrames = thrown.frames ?? [];
  const rotations = throwFrames.map(f=>/rotate\((-?[\d.]+)deg\)/.exec(String(f.transform ?? ''))?.[1]);
  assert(rotations.some(r=>r!==undefined && Math.abs(Number(r))>0),'the throw turns on its way out (the boomerang)');
  assert(rotations.includes('0'),'it aligns over the board as if placed');
  assert.equal(throwFrames.at(-2)?.offset,BOOMERANG.landAt,'the pile is handed the card on arrival, before the fade');
  assert.equal(Number(throwFrames.at(-2)?.opacity),1,'the card is still visible when it reaches the pile');
  assert.equal(Number(throwFrames.at(-1)?.opacity),0,'and fades only over the new pile top');
  await page.locator('#deck').evaluate(el=>(el as HTMLElement).click()); // existing tap-to-skip path
  await page.waitForFunction(() => !(window as any).__severgrow.busy(),undefined,{timeout:30000});
  assert.equal(await page.locator('.flyer.card').count(),0,'fast-forward removes an interrupted flight');

  // THE PILE TOP CHANGES ONCE, ON ARRIVAL (owner, 2026-10-20: "after throwing card ... it somewhat
  // flashes the previous card again even new card was just placed"). Sample the physical top card
  // every animation frame through a throw: before the card lands it must still be the OLD card,
  // and once it has changed it must never go back. A single flip, in one direction.
  await page.goto(`${BASE}?seed=2`);
  await page.waitForSelector('#deck.ready');
  await page.locator('#deck').evaluate(el=>(el as HTMLElement).click());
  await page.waitForFunction(() => (window as any).__severgrow.state().phase==='ACT' && !(window as any).__severgrow.busy());
  const previousId = await page.evaluate(() => {
    const top = document.getElementById('discard-top');
    return top?.dataset.faceKey ? Number(top.dataset.faceKey.split(':')[0]) : null;
  });
  await page.locator('#smart-context').click();
  await page.waitForFunction(() => (window as any).__severgrow.state().phase==='DISCARD' && !(window as any).__severgrow.busy());
  const throwB = await page.evaluate(() => (window as any).__severgrow.state());
  const throwB2 = legalActions(viewFor(throwB,0)).find(action=>action.t==='Discard')!;
  const sampled = await page.evaluate(async ({ action, previousId }) => {
    const log: { t: number; face: string | null; flying: boolean }[] = [];
    const t0 = performance.now();
    let running = true;
    const face = () => document.getElementById('discard-top')?.dataset.faceKey ?? null;
    // `flying` proves the hand-over happens while the card is still aloft (before its fade ends).
    const flying = () => !!document.querySelector('.flyer');
    const tick = () => { if (!running) return; log.push({ t: Math.round(performance.now() - t0), face: face(), flying: flying() }); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    document.querySelector<HTMLElement>(`#hand [data-card="${action.card}"]`)?.click();
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    (document.getElementById('discard') as HTMLElement).click();
    await new Promise<void>((r) => setTimeout(r, 1600));
    running = false;
    log.push({ t: Math.round(performance.now() - t0), face: face(), flying: flying() });
    return { log, previousId, cardId: action.card };
  }, { action: throwB2, previousId });

  const faces = sampled.log.map((s) => s.face);
  const thrownFace = `${sampled.cardId}:`;
  const firstThrown = faces.findIndex((f) => !!f && f.startsWith(thrownFace));
  assert(firstThrown >= 0, 'the thrown card reaches the pile top');
  const after = faces.slice(firstThrown);
  assert(after.every((f) => !!f && f.startsWith(thrownFace)),
    `the pile top never flips back to the previous card after the new one landed (${[...new Set(after)].join(' | ')})`);
  assert(faces.slice(0, firstThrown).every((f) => f === null || !f.startsWith(thrownFace)),
    'the new card is not shown before it arrives');
  assert.equal(faces.at(-1), faces[firstThrown], 'the pile top settles on the thrown card and stays there');
  // The hand-over still happens ON ARRIVAL: the frame the new top appears is a frame where the
  // flyer is still in the air (it fades over the identical new top). A later hand-over would let
  // the old top show through; an earlier one would show the new card before it landed.
  assert(sampled.log[firstThrown]!.flying === true, 'the pile turns over while the card is still aloft (before its fade ends)');
  assert(previousId === null || !faces.at(-1)!.startsWith(`${previousId}:`),
    `the settled top is not the previous card (${faces.at(-1)} vs ${previousId})`);
  // And the count agrees with what is shown.
  const shownCount = await page.evaluate(() => document.getElementById('discard-count')?.dataset.value ?? document.getElementById('discard-count')?.textContent ?? '');
  const trueCount = await page.evaluate(() => (window as any).__severgrow.state().discard.length);
  assert.equal(String(shownCount).replace(/^0+(?=\d)/, ''), String(trueCount), `the Throw pile count matches the cards it holds (${shownCount} vs ${trueCount})`);
  // THE STEP'S LENGTH. The regression behind this suite's red job: the boomerang used to total
  // 624ms at interface speed and the discard step awaited the whole flight, so every human throw
  // held the turn 634ms where the ordinary throw held ~406ms (+228ms, the flight 1.6x the step,
  // measured on the built product). The pump publishes each step's real duration — read that, not
  // a clock in the test process.
  const discardSteps = await page.evaluate(() => {
    const marks = (window as any).__severgrow.animLog() as { ev: string; k?: string; ms?: number; who?: number }[];
    return marks.filter((mark) => mark.ev === 'step' && mark.k === 'discard' && mark.who === 0);
  });
  const discardStep = discardSteps.at(-1);
  assert(discardStep && typeof discardStep.ms === 'number', 'the discard step publishes its duration');
  // Measured on the built product: 405-412 ms (the 396 ms wait plus frame overhead); the bug was
  // 634 ms. 100 ms of headroom keeps a loaded runner from faking a red, and +228 ms still fails.
  assert(discardStep!.ms! < PINNED.throw + 100,
    `the discard step keeps its ${PINNED.throw}ms beat instead of waiting out the flight (${discardStep!.ms}ms)`);

  await page.goto(`${BASE}?seed=3`);
  await page.waitForSelector('#deck.ready');
  await page.locator('#deck').evaluate(el=>(el as HTMLElement).click());
  await page.waitForFunction(() => (window as any).__severgrow.state().phase==='ACT' && !(window as any).__severgrow.busy());
  const bloomState = await page.evaluate(() => (window as any).__severgrow.state());
  const bloom = legalActions(viewFor(bloomState,0)).find(action=>action.t==='Bloom');
  assert(bloom?.t==='Bloom','the seeded match offers Bloom');
  await page.evaluate(action=>(window as any).__severgrow.playFor(action,0),bloom);
  await page.waitForFunction(() => document.querySelectorAll('#board .territory-contour.grow-in').length>0,undefined,{timeout:5000});
  const wave = await page.locator('#board .territory-contour.grow-in').evaluateAll(paths=>paths.map(path=>getComputedStyle(path).animationDelay));
  assert(wave.length>0,'new contour edges draw on during Bloom');
  await page.waitForFunction(() => !(window as any).__severgrow.busy(),undefined,{timeout:30000});
  assert.equal(await page.locator('#board .territory-contour.grow-in').count(),0,'the wave settles into the stable contour');

  // ---- Cut motion: Small stays still; Huge shakes once, ripples by ring, one −N ----
  const openSaved = async (width: number, height: number, save: string, cfg: Record<string, unknown>): Promise<Page> => {
    const p = await browser.newPage({ viewport: { width, height }, isMobile: width < 600, hasTouch: width < 600 });
    await p.addInitScript(([s, g]) => {
      (window as any).__name = (f: unknown) => f;
      localStorage.setItem('main2:severgrow.save.v7', s as string);
      localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify(g));
    }, [save, cfg] as const);
    await p.goto(BASE);
    await assertDistChannel(p);   // loud if the served dist was built for another channel
    await p.waitForSelector('#menu-continue', { state: 'attached' });
    // The product menu hides Continue (the save is offered when entering the level); its listener
    // is still bound, so a DOM click is the same resume path without a visible button.
    await p.evaluate(() => (document.getElementById('menu-continue') as HTMLElement | null)?.click());
    await p.waitForFunction(() => !(window as any).__severgrow.busy(), undefined, { timeout: 30000 });
    return p;
  };
  const recordMotion = (p: Page) => p.evaluate(() => {
    const proto = Element.prototype as any;
    proto.__m = { shakes: 0, tileDelays: [] as number[], sparks: 0, motes: 0, darks: 0, flinches: 0 };
    const orig = proto.animate;
    proto.__mOrig = orig;
    proto.animate = function (this: Element, frames: unknown, opts: unknown) {
      const m = proto.__m;
      const json = JSON.stringify(frames);
      const cls = this.classList;
      if ((this as HTMLElement).id === 'board-wrap' && json.includes('translate(')) m.shakes++;
      if (cls?.contains?.('tile') && json.includes('scale')) m.tileDelays.push(typeof opts === 'object' && opts ? Number((opts as KeyframeAnimationOptions).delay ?? 0) : 0);
      // a surviving tile beside a Severe cut: the flinch is the only tile animation that dips to 0.94
      if (cls?.contains?.('tile') && json.includes('0.94')) m.flinches++;
      if (cls?.contains?.('fx-spark')) m.sparks++;
      if (cls?.contains?.('fx-mote')) m.motes++;
      if (cls?.contains?.('fx-flash') && cls?.contains?.('dark')) m.darks++;
      return orig.call(this, frames, opts);
    };
  });
  const readMotion = (p: Page) => p.evaluate(() => {
    const proto = Element.prototype as any;
    if (proto.__mOrig) proto.animate = proto.__mOrig;
    const m = { ...proto.__m };
    delete proto.__mOrig; delete proto.__m;
    return m;
  });
  type Recorded = { shakes: number; tileDelays: number[]; sparks: number; motes: number; darks: number; flinches: number };
  const playCutAndWatch = async (n: number, reduceMotion: boolean) => {
    const { state: cs, action: ca, cut } = cutPosition(n, false);
    assert.equal(cut, n, `a ${n}-tile cut fixture exists`);
    const p = await openSaved(390, 844, positionSave({ state: cs }), { sound: false, music: false, coach: false, autoSkip: false, reduceMotion, speed: 'normal', vibration: false });
    await recordMotion(p);
    const floats = new Set<string>();
    await p.evaluate(a => (window as any).__severgrow.playFor(a, 0), ca);
    await p.waitForFunction(() => !!document.documentElement.dataset.cutTier, undefined, { timeout: 8000 });
    // count only what the cut itself adds (the replacing Sprout before it may spark)
    await p.evaluate(() => { const m = (Element.prototype as any).__m; if (m) { m.sparks = 0; m.motes = 0; m.darks = 0; m.flinches = 0; } });
    for (let i = 0; i < 200; i++) {
      for (const t of await p.evaluate(() => [...document.querySelectorAll('#captions .float')].map(e => e.textContent))) if (t) floats.add(t);
      if (!await p.evaluate(() => (window as any).__severgrow.busy())) break;
      await p.waitForTimeout(30);
    }
    await p.waitForFunction(() => !(window as any).__severgrow.busy(), undefined, { timeout: 30000 });
    const tier = await p.evaluate(() => document.documentElement.dataset.cutTier ?? null);
    const m = (await readMotion(p)) as Recorded;
    return { p, tier, m, floats, cut };
  };

  const small = await playCutAndWatch(1, false);
  try {
    assert.equal(small.tier, 'small', 'a 1-tile cut is Small');
    assert.equal(small.m.shakes, 0, 'a 1-tile cut does not shake the board');
    assert.deepEqual([...small.floats], ['−1'], 'a Small cut shows one −N, never one per tile');
  } finally { await small.p.close(); }

  const severe = await playCutAndWatch(3, false);
  try {
    assert.equal(severe.tier, 'severe', 'a 3-tile cut is Severe');
    assert.equal(severe.m.shakes, 1, 'a Severe cut shivers the board exactly once');
    assert(severe.m.flinches >= 1, `a Severe cut flinches its surviving neighbours (${severe.m.flinches})`);
    assert.equal(small.m.flinches, 0, 'a Small cut does not flinch its neighbours');
    assert.deepEqual([...severe.floats], ['−3'], 'a Severe cut shows one −N');
  } finally { await severe.p.close(); }

  // A tap during the cut still fast-forwards it and opens the gate.
  {
    const { state: cs, action: ca } = cutPosition(3, false);
    const p = await openSaved(390, 844, positionSave({ state: cs }), { sound: false, music: false, coach: false, autoSkip: false, reduceMotion: false, speed: 'normal', vibration: false });
    try {
      await p.evaluate(a => (window as any).__severgrow.playFor(a, 0), ca);
      await p.waitForFunction(() => !!document.documentElement.dataset.cutTier, undefined, { timeout: 8000 });
      assert.equal(await p.evaluate(() => (window as any).__severgrow.busy()), true, 'the cut holds the gate');
      const t0 = Date.now();
      await p.locator('#deck').click({ force: true, timeout: 3000 });
      await p.waitForFunction(() => !(window as any).__severgrow.busy(), undefined, { timeout: 3000 });
      const ms = Date.now() - t0;
      assert(ms < 1400, `a tap during the cut fast-forwards it (${ms}ms)`);
    } finally { await p.close(); }
  }

  const huge = await playCutAndWatch(9, false);
  try {
    assert.equal(huge.tier, 'huge', 'a 9-tile cut is Huge');
    assert.equal(huge.m.shakes, 1, 'a Huge cut shakes the board exactly once');
    assert.equal(huge.m.sparks, 0, 'a Huge cut uses the ripple, not sparks');
    assert(new Set(huge.m.tileDelays).size >= 2, `the Huge ripple starts ring by ring (${JSON.stringify(huge.m.tileDelays)})`);
    assert.deepEqual([...huge.floats], ['−9'], 'a Huge cut shows one −N for the whole gesture');
  } finally { await huge.p.close(); }

  const reduced = await playCutAndWatch(9, true);
  try {
    assert.equal(reduced.m.shakes, 0, 'Reduce motion: no shake');
    assert.equal(reduced.floats.size, 0, 'Reduce motion: no floating payoff');
    assert(new Set(reduced.m.tileDelays).size <= 1, `Reduce motion: no stagger (${JSON.stringify(reduced.m.tileDelays)})`);
  } finally { await reduced.p.close(); }

  // ---- Mega Bomb: its own disappearance, not a cut, and under 700ms ----
  {
    const bombBase = newGame(3107);
    const target = { q: -1, r: 2 };
    const blastBoard = { ...bombBase.board, [coordKey(target)]: { owner: 1 as Player, strength: 9 } };
    for (const nb of allNeighbors(target)) if (blastBoard[coordKey(nb)] === null) blastBoard[coordKey(nb)] = { owner: 1 as Player, strength: 4 };
    const bombState: State = { ...bombBase, phase: 'ACT', actor: 0, turnPlayer: 0, board: blastBoard,
      hands: [[{ id: 1000, suit: null, rank: 0 }, { id: 1001, suit: null, rank: 0 }, ...bombBase.hands[0].slice(0, 5)] as Card[], bombBase.hands[1]] };
    const action = legalActions(viewFor(bombState, 0)).find((a): a is Extract<Action, { t: 'MegaBomb' }> => a.t === 'MegaBomb' && coordKey(a.target) === coordKey(target));
    assert(action, 'a Mega Bomb is legal on the fixture');
    const p = await openSaved(390, 844, positionSave({ state: bombState }), { sound: false, music: false, coach: false, autoSkip: false, reduceMotion: false, speed: 'normal', vibration: false });
    try {
      await p.evaluate(() => { delete document.documentElement.dataset.cutTier; });
      await recordMotion(p);
      // Timed inside the page, from the move to the board being free again, frame by frame: a clock
      // in the test process also counted its own polling round trips (+100-250 ms on a slow runner).
      const ms = await p.evaluate(async a => {
        const g = (window as any).__severgrow;
        const t0 = performance.now();
        g.playFor(a, 0);
        const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
        let now = await frame();
        while (!g.busy() && now - t0 < 3000) now = await frame(); // the pump may start a frame late
        while (g.busy() && now - t0 < 5000) now = await frame();
        return Math.round(now - t0);
      }, action);
      const tier = await p.evaluate(() => document.documentElement.dataset.cutTier ?? null);
      const m = (await readMotion(p)) as Recorded;
      // What the step PLANNED, not when the DOM happened to settle. The 700 ms wall-clock bound
      // used to sit only 60 ms above the product's own 640 ms floor hold, so a shared runner's
      // frame and pump-wake latency (715 ms on 0e1e720, with the product unchanged) failed it.
      // The step publishes its hold; 640 ms is the floor, and it must never become a cut-length
      // wait. `ms` stays as an end-to-end sanity bound with room for a loaded runner, still well
      // under a doubled hold (2 × 640 = 1280 ms) or the cut's 1800 ms cap.
      const plan = await p.evaluate(() => {
        const marks = (window as any).__severgrow.animLog() as { ev: string; ms?: number; ring?: number }[];
        return marks.filter(mark => mark.ev === 'megaBomb:hold').at(-1) ?? null;
      });
      assert.equal(plan?.ms, 640, `the Mega Bomb plans its 640ms floor hold (${JSON.stringify(plan)})`);
      assert.equal(tier, null, 'a Mega Bomb never runs the cut plan');
      assert(ms < 1000, `a Mega Bomb disappears in under 1000ms (${ms}ms)`);
      assert(m.darks >= 1, 'the Mega Bomb has one dark pulse');
      assert(m.sparks === 0, 'the Mega Bomb adds no sparks');
      assert(m.motes >= 1, 'each destroyed tile leaves one ash mote');
    } finally { await p.close(); }
  }

  // A fresh context: the pages above leave a live save in the shared context's localStorage,
  // and #menu-new prompts before it opens the levels when a save exists. An isolated context
  // (empty storage) makes this block deterministic; the assertion's intent is unchanged.
  const menuCtx = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const menu = await menuCtx.newPage();
  await menu.goto(BASE);
  await openMenuEntry(menu, 'menu-new');
  await menu.locator('#levels').waitFor({state:'visible'});
  assert.deepEqual(await menu.locator('#level-grid button').allTextContents(),['EASY','MEDIUM','HARD']);
  assert.equal(await menu.locator('#level-grid button svg,#level-grid button .lt-note').count(),0,'difficulty choices are names only');
  await menu.screenshot({path:'/tmp/futasaku-03-difficulty.png'});
  await menuCtx.close();
  console.log('Futasaku 0.4 motion checks passed: Draw/Throw, Bloom, Small/Huge cut, Reduce motion and the Mega Bomb');
} finally {
  await page.close(); await browser.close(); await server.close();
}
