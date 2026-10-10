/** Focused checks for Futasaku 0.4's card flights and network wave. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { allNeighbors, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Player, State } from '../../src/engine/index.js';
import { cutPosition } from './cut-positions.js';
import { positionSave } from './position.js';

const server = await preview({configFile:'web/vite.config.ts',preview:{port:4199,strictPort:true},logLevel:'silent'});
const browser = await chromium.launch({...(process.env.PW_CHROMIUM ? {executablePath:process.env.PW_CHROMIUM} : {}),args:['--no-sandbox']});
const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
try {
  await page.addInitScript(() => localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({sound:false,music:false,coach:false,autoSkip:false,reduceMotion:false,speed:'normal'})));
  await page.goto('http://localhost:4199/?seed=2');
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
  assert.equal(draw.duration,330,'draw card travels for the intended short beat');
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
  assert.equal(thrown.duration,330,'throw reaches the pile before the state advances');
  assert.equal((thrown.frames?.[1] as any)?.offset,.52,'throw follows a short arc');
  await page.locator('#deck').evaluate(el=>(el as HTMLElement).click()); // existing tap-to-skip path
  await page.waitForFunction(() => !(window as any).__severgrow.busy(),undefined,{timeout:30000});
  assert.equal(await page.locator('.flyer.card').count(),0,'fast-forward removes an interrupted flight');

  await page.goto('http://localhost:4199/?seed=3');
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
    await p.goto('http://localhost:4199/');
    await p.waitForSelector('#menu-continue');
    await p.click('#menu-continue');
    await p.waitForFunction(() => !(window as any).__severgrow.busy(), undefined, { timeout: 30000 });
    return p;
  };
  const recordMotion = (p: Page) => p.evaluate(() => {
    const proto = Element.prototype as any;
    proto.__m = { shakes: 0, tileDelays: [] as number[], sparks: 0, motes: 0, darks: 0 };
    const orig = proto.animate;
    proto.__mOrig = orig;
    proto.animate = function (this: Element, frames: unknown, opts: unknown) {
      const m = proto.__m;
      const json = JSON.stringify(frames);
      const cls = this.classList;
      if ((this as HTMLElement).id === 'board-wrap' && json.includes('translate(')) m.shakes++;
      if (cls?.contains?.('tile') && json.includes('scale')) m.tileDelays.push(typeof opts === 'object' && opts ? Number((opts as KeyframeAnimationOptions).delay ?? 0) : 0);
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
  type Recorded = { shakes: number; tileDelays: number[]; sparks: number; motes: number; darks: number };
  const playCutAndWatch = async (n: number, reduceMotion: boolean) => {
    const { state: cs, action: ca, cut } = cutPosition(n, false);
    assert.equal(cut, n, `a ${n}-tile cut fixture exists`);
    const p = await openSaved(390, 844, positionSave({ state: cs }), { sound: false, music: false, coach: false, autoSkip: false, reduceMotion, speed: 'normal', vibration: false });
    await recordMotion(p);
    const floats = new Set<string>();
    await p.evaluate(a => (window as any).__severgrow.playFor(a, 0), ca);
    await p.waitForFunction(() => !!document.documentElement.dataset.cutTier, undefined, { timeout: 8000 });
    // count only what the cut itself adds (the replacing Sprout before it may spark)
    await p.evaluate(() => { const m = (Element.prototype as any).__m; if (m) { m.sparks = 0; m.motes = 0; m.darks = 0; } });
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
      const t0 = Date.now();
      await p.evaluate(a => (window as any).__severgrow.playFor(a, 0), action);
      await p.waitForFunction(() => (window as any).__severgrow.busy(), undefined, { timeout: 3000 }).catch(() => {});
      await p.waitForFunction(() => !(window as any).__severgrow.busy(), undefined, { timeout: 5000 });
      const ms = Date.now() - t0;
      const tier = await p.evaluate(() => document.documentElement.dataset.cutTier ?? null);
      const m = (await readMotion(p)) as Recorded;
      assert.equal(tier, null, 'a Mega Bomb never runs the cut plan');
      assert(ms < 700, `a Mega Bomb disappears in under 700ms (${ms}ms)`);
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
  await menu.goto('http://localhost:4199/');
  await menu.locator('#menu-new').click();
  await menu.locator('#levels').waitFor({state:'visible'});
  assert.deepEqual(await menu.locator('#level-grid button').allTextContents(),['BEGINNER','EASY','MEDIUM','HARD','PRO']);
  assert.equal(await menu.locator('#level-grid button svg,#level-grid button .lt-note').count(),0,'difficulty choices are names only');
  await menu.screenshot({path:'/tmp/futasaku-03-difficulty.png'});
  await menuCtx.close();
  console.log('Futasaku 0.4 motion checks passed: Draw/Throw, Bloom, Small/Huge cut, Reduce motion and the Mega Bomb');
} finally {
  await page.close(); await browser.close(); await server.close();
}
