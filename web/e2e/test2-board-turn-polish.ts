// Behavioral checks for the Test2 board/turn polish. Build CHANNEL=test2 first.
// PW_CHROMIUM=/usr/bin/chromium node --import tsx web/e2e/test2-board-turn-polish.ts
// TEST2_URL / TEST2_DIST may target an existing preview or an isolated built folder.
// Hooks only read the session: every Draw, placement, Undo, Skip and Throw uses real UI input.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { CDPSession, Page } from 'playwright-core';
import { preview } from 'vite';
import { apply, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { botSeed, chooseLevelAction } from '../../src/bots/levels.js';
import { decodeSave } from '../src/logic/persist.js';
import { hexCenter } from './drawing.js';

const port = Number(process.env.TEST2_POLISH_PORT ?? 4198);
const external = process.env.TEST2_URL;
const base = external ?? `http://localhost:${port}/`;
const server = external ? null : await preview({ configFile: 'web/vite.config.ts', build: { outDir: process.env.TEST2_DIST ?? 'dist' }, preview: { port, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'], ...(external && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) });
const dir = '/tmp/test2-board-turn-polish';
mkdirSync(dir, { recursive: true });
const presets = [[360,640],[390,664],[390,844],[430,932],[768,1024],[1280,800],[1440,900],[1600,980],[1920,1080]] as const;
const filter = process.env.TEST2_POLISH_VIEWPORTS?.split(',');
let checks = 0;
const failures: string[] = [];
const measurements: unknown[] = [];
const evidenceNames = new Set(['360x640-grow', '390x664-bloom-v3', '1280x800-bloom-v3']);
const evidenceWritten = new Set<string>();
const check = (value: unknown, label: string) => { assert(value, label); checks++; };
const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };
const state = (page: Page): Promise<State> => page.evaluate(() => (window as any).__severgrow.state());
const idle = (page: Page) => page.waitForFunction(() => { const h = (window as any).__severgrow; return h?.state() && !h.busy() && (h.state().actor === 0 || h.state().phase === 'GAME_OVER'); }, undefined, { timeout: 30000 });
const rawSave = (page: Page): Promise<string | null> => page.evaluate(() => Object.entries(localStorage).find(([key]) => key === 'main2:severgrow.save.v7')?.[1] ?? null);
const savedMatches = async (page: Page, label: string) => equal(decodeSave(await rawSave(page))?.state, await state(page), `${label}: autosave replays the exact current state`);
const cdps = new WeakMap<Page, CDPSession>();
const cdp = async (page: Page) => { if (!cdps.has(page)) cdps.set(page, await page.context().newCDPSession(page)); return cdps.get(page)!; };
const tapHex = async (page: Page, key: string, touch: boolean) => {
  if (touch) {
    const point = await hexCenter(page,key);
    await page.touchscreen.tap(point.x,point.y);
  } else await page.locator(`#board .hex-cell[data-key="${key}"]`).click();
};

/** At most two phone images and one desktop image, bounded to 192 KiB each for CI log review. */
async function evidence(page: Page, name: string) {
  if (!evidenceNames.has(name) || evidenceWritten.has(name)) return;
  let bytes = await page.screenshot({ type: 'jpeg', quality: 35, scale: 'css' });
  if (bytes.length > 192 * 1024) bytes = await page.screenshot({ type: 'jpeg', quality: 15, scale: 'css' });
  evidenceWritten.add(name);
  if (bytes.length > 192 * 1024) {
    console.log(`TEST2_SCREENSHOT_OMITTED ${name}.jpg exceeds 192 KiB`);
    return;
  }
  writeFileSync(`${dir}/${name}.jpg`,bytes);
  console.log(`TEST2_SCREENSHOT_BEGIN ${name}.jpg image/jpeg ${bytes.length} bytes`);
  console.log(bytes.toString('base64'));
  console.log(`TEST2_SCREENSHOT_END ${name}.jpg`);
}

async function open(width: number, height: number, seed: number, v3 = false) {
  const touch = width <= 600;
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch, ignoreHTTPSErrors: Boolean(external) });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    (window as any).__name = (f: unknown) => f;
    if (!sessionStorage.getItem('polish-seeded')) {
      sessionStorage.setItem('polish-seeded', '1');
      localStorage.setItem('severgrow.save.v7', 'MAIN-POLISH-SENTINEL');
      localStorage.setItem('test:severgrow.save.v7', 'TEST-POLISH-SENTINEL');
      localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ level: 7, sound: false, music: false, vibration: false, coach: false, speed: 'skip', reduceMotion: true, autoSkip: false, confirmPolicy: 'always' }));
      localStorage.setItem('main2:severgrow.tips.v1', JSON.stringify({ fruit: true, strengthen: true, draw: true }));
    }
  });
  await page.goto(`${base}?seed=${seed}${v3 ? '&design=v3' : ''}`);
  await idle(page);
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  await page.waitForTimeout(180);
  equal(await state(page), newGame(seed), `${width}x${height}: seeded Classic setup`);
  return { page, touch, errors };
}

async function geometry(page: Page, width: number, height: number, label: string) {
  const before = await state(page);
  const info = await page.evaluate(() => {
    const board = document.querySelector<SVGSVGElement>('#board')!;
    const wrap = document.querySelector<HTMLElement>('#board-wrap')!;
    const play = document.querySelector<HTMLElement>('#game > .play')!;
    const rail = document.querySelector<HTMLElement>('#test2-information-rail')!;
    const hud = document.querySelector<HTMLElement>('#game > .hud')!;
    const cells = [...board.querySelectorAll<SVGGElement>('.hex-cell')];
    const boxes = cells.map(cell => cell.getBoundingClientRect());
    const left = Math.min(...boxes.map(box => box.left)), top = Math.min(...boxes.map(box => box.top));
    const right = Math.max(...boxes.map(box => box.right)), bottom = Math.max(...boxes.map(box => box.bottom));
    return { keys: cells.map(cell => cell.getAttribute('data-key')).sort(), paths: cells.map(cell => [cell.getAttribute('data-key'), cell.querySelector('.hex')?.getAttribute('d')]),
      grid: { left, top, right, bottom, width: right-left, height: bottom-top }, board: board.getBoundingClientRect().toJSON(), wrap: wrap.getBoundingClientRect().toJSON(),
      rail: rail.getBoundingClientRect().toJSON(), play: play.getBoundingClientRect().toJSON(), hud: hud.getBoundingClientRect().toJSON(), skin: board.dataset.skin,
      homes: [...board.querySelectorAll('.landmark')].map(home => ({ key: home.getAttribute('data-key'), tree: home.classList.contains('lm-tree'), volcano: home.classList.contains('lm-volcano') })) };
  });
  equal(info.keys, Object.keys(before.board).sort(), `${label}: same 37 Classic coordinates`);
  equal(info.homes.map(home => home.key).sort(), ['-2,2', '2,-2'], `${label}: both homes keep their engine coordinates`);
  check(info.homes.some(home => home.tree) && info.homes.some(home => home.volcano), `${label}: current Forest and Volcano art remains`);
  check(info.rail.height <= 36, `${label}: no full-height instruction row (${info.rail.height}px)`);
  check(info.play.top <= info.hud.bottom + 37, `${label}: map follows the compact header (${info.play.top-info.hud.bottom}px gap)`);
  check(info.grid.left >= -1 && info.grid.right <= width+1 && info.grid.top >= info.hud.bottom-1 && info.grid.bottom <= height+1, `${label}: complete board stays within the viewport`);
  if (width <= 600) check(info.grid.width >= width * .80, `${label}: phone grid uses the recovered map width (${info.grid.width.toFixed(1)}px)`);
  measurements.push({ viewport: `${width}x${height}`, label, ...info });
  return info.paths;
}

async function controls(page: Page, label: string) {
  const blocked = await page.evaluate(() => {
    const selectors = ['#hud-menu', '#deck', '#discard', '#tool-undo', '#hand-sort', '#test2-help-button', '#moves .end'];
    return selectors.flatMap(selector => [...document.querySelectorAll<HTMLElement>(selector)].flatMap(element => {
      if (element.hidden || !element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') return [];
      const box = element.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) return [];
      const hit = document.elementFromPoint(box.x+box.width/2, box.y+box.height/2);
      return box.left < -1 || box.right > innerWidth+1 || box.top < -1 || box.bottom > innerHeight+1 || !hit || !(element === hit || element.contains(hit)) ? [`${selector}: ${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)} hit ${hit?.id ?? hit?.tagName}`] : [];
    }));
  });
  equal(blocked, [], `${label}: essential controls fit and receive taps`);
}

async function cue(page: Page, phase: 'draw' | 'grow' | 'throw', label: string) {
  await page.waitForFunction(phase => document.documentElement.dataset.step === phase && document.querySelector('#step-cue')?.getAttribute('data-level') !== 'off', phase);
  const result = await page.evaluate(() => {
    const cue = document.querySelector<HTMLElement>('#step-cue')!;
    const map = document.querySelector<HTMLElement>('#board-wrap')!.getBoundingClientRect();
    const box = cue.getBoundingClientRect(), css = getComputedStyle(cue);
    return { text: cue.textContent, visible: css.visibility !== 'hidden' && css.display !== 'none' && Number(css.opacity) > 0, pointer: css.pointerEvents,
      centered: Math.abs(box.x+box.width/2-(map.x+map.width/2)) < 3 && Math.abs(box.y+box.height/2-(map.y+map.height/2)) < 3 };
  });
  check(result.visible && result.text?.toLowerCase().includes(phase === 'throw' ? 'throw' : phase), `${label}: correct ${phase} cue is visible`);
  check(result.centered && result.pointer === 'none', `${label}: ${phase} cue is centered and cannot intercept map input`);
}

async function undo(page: Page, before: State, label: string) {
  await idle(page);
  check(await page.locator('#tool-undo').isEnabled(), `${label}: Undo is available immediately after the move settles`);
  await page.click('#tool-undo');
  equal(await state(page), before, `${label}: one Undo immediately restores the entire state`);
  await idle(page);
  equal(await page.locator('#hand [data-card]').evaluateAll(elements => elements.map(element => Number(element.getAttribute('data-card'))).sort((a,b) => a-b)), before.hands[0].map(card => card.id).sort((a,b) => a-b), `${label}: Undo visibly restores all hand cards`);
  const tiles = await page.locator('#board .l-tiles > .tile:not(.root)').evaluateAll(elements => elements.map(element => ({ key: element.getAttribute('data-key'), strength: Number(element.querySelector('.tile-num')?.textContent), owner: element.classList.contains('you') ? 0 : 1 })).sort((a,b) => a.key!.localeCompare(b.key!)));
  const expected = Object.entries(before.board).flatMap(([key,tile]) => tile && !tile.root ? [{ key, strength: tile.strength, owner: tile.owner }] : []).sort((a,b) => a.key.localeCompare(b.key));
  equal(tiles, expected, `${label}: Undo visibly restores both networks`);
  check(!await page.locator('#confirm').isVisible() && await page.evaluate(() => !(window as any).__severgrow.pending()), `${label}: Undo needs no confirmation`);
  await savedMatches(page, label);
}

async function endGrow(page: Page, before: State, label: string) {
  await page.keyboard.press('Escape');
  await controls(page, label);
  await page.locator('#moves .end, #moves .empty-continue').first().click();
  equal(await state(page), apply(before, { t: 'EndAct' }), `${label}: real Skip/Throw advances the engine once`);
  await idle(page);
  await cue(page, 'throw', label);
}

async function finishTurn(page: Page, label: string) {
  const before = await state(page);
  const discard = legalActions(viewFor(before,0)).find(action => action.t === 'Discard');
  assert(discard?.t === 'Discard', `${label}: has a legal throw`);
  let expected = apply(before, discard);
  const botActions: Action[] = [];
  while (expected.actor === 1 && expected.phase !== 'GAME_OVER') {
    const action = chooseLevelAction(viewFor(expected,1), 7, botSeed(expected.seed,7,expected.turnNumber,expected.history?.length ?? 0));
    botActions.push(action);
    expected = apply(expected, action);
    assert(botActions.length < 20, 'bounded opponent turn');
  }
  await page.locator(`#hand [data-card="${discard.card}"]`).click();
  await idle(page);
  equal(await state(page), expected, `${label}: actual Volcano opponent turn matches every deterministic engine/bot action`);
  check(botActions.some(action => action.t === 'Draw') && botActions.some(action => action.t === 'EndAct'), `${label}: Volcano completed its real turn`);
  check(!await page.locator('#confirm').isVisible(), `${label}: Throw and opponent turn leave no confirmation`);
  await savedMatches(page, label);
  return botActions;
}

async function sproutFlow(width: number, height: number) {
  const label = `${width}x${height} Forest/Volcano`;
  const { page, touch, errors } = await open(width,height,219682080);
  try {
    const paths = await geometry(page,width,height,label);
    await controls(page,label);
    await cue(page,'draw',label);
    const initial = await state(page);
    await page.click('#deck');
    await idle(page);
    const grown = await state(page);
    equal(grown, apply(initial,{ t:'Draw',from:'deck' }), `${label}: actual Draw preserves engine parity`);
    await cue(page,'grow',label);
    await evidence(page,`${width}x${height}-grow`);
    const action = legalActions(viewFor(grown,0)).find(action => action.t === 'Sprout');
    assert(action?.t === 'Sprout');
    await page.locator(`#hand [data-card="${action.card}"]`).click();
    check(await page.evaluate(() => document.documentElement.classList.contains('test2-move-active') || document.documentElement.classList.contains('gd-picked')),`${label}: cue suppression begins immediately with card selection`);
    await page.waitForTimeout(160);
    const hidden = await page.locator('#step-cue').evaluate(element => getComputedStyle(element).visibility === 'hidden' || Number(getComputedStyle(element).opacity) === 0 || (element as HTMLElement).hidden);
    check(hidden, `${label}: Grow cue disappears when its requested card action begins`);
    const rock = Object.keys(grown.terrain).find(key => grown.terrain[key] === 'rock')!;
    await tapHex(page,rock,touch);
    equal(await state(page), grown, `${label}: invalid rock tap neither places nor spends a card`);
    // Invalid inspection may clear the selection; select the real card again before choosing a valid spot.
    await page.locator(`#hand [data-card="${action.card}"]`).click();
    await tapHex(page,coordKey(action.coord),touch);
    equal(await state(page), apply(grown,action), `${label}: first valid target tap immediately places the Sprout`);
    await idle(page);
    check(!await page.locator('#confirm').isVisible() && await page.evaluate(() => !(window as any).__severgrow.pending()), `${label}: Sprout has no Confirm or tap-again step`);
    check(await page.locator('#board .tile .mark-line, #board .tile .mark-ink').count() === 0, `${label}: numbered Forest tiles have no owner icon`);
    check(await page.locator(`#board .tile[data-key="${coordKey(action.coord)}"] .tile-num`).textContent() === String(grown.hands[0].find(card => card.id === action.card)!.rank), `${label}: Sprout strength is clearly rendered`);
    await savedMatches(page,label+' Sprout');
    await undo(page,grown,label+' Sprout');
    await tapHex(page,coordKey(action.coord),touch);
    equal(await state(page),grown,`${label}: a board-first spot does not choose a card by itself`);
    await page.locator(`#hand [data-card="${action.card}"]`).click();
    equal(await state(page),apply(grown,action),`${label}: choosing the card after its valid spot immediately places the Sprout`);
    await undo(page,grown,label+' board-first Sprout');
    equal(await page.locator('#board .hex-cell').evaluateAll(cells => cells.map(cell => [cell.getAttribute('data-key'),cell.querySelector('.hex')?.getAttribute('d')])), paths, `${label}: Draw, placement and Undo retain the board geometry`);
    await page.screenshot({ path: `${dir}/${width}x${height}-sprout-undo.png` });
    await endGrow(page,grown,label+' Skip');
    await undo(page,grown,label+' Skip');
    await endGrow(page,grown,label+' Skip replay');
    const allBotActions = [...await finishTurn(page,label+' turn 1')];
    for (let turn=2;turn<=3;turn++) {
      const before = await state(page);
      check(before.actor === 0 && before.phase === 'DRAW', `${label}: Forest receives turn ${turn}`);
      await page.click('#deck'); await idle(page);
      const act = await state(page);
      equal(act,apply(before,{ t:'Draw',from:'deck' }),`${label}: turn ${turn} real Draw`);
      await endGrow(page,act,`${label} turn ${turn} Skip`);
      allBotActions.push(...await finishTurn(page,`${label} turn ${turn}`));
    }
    check(allBotActions.some(action => action.t === 'Sprout' || action.t === 'Bloom'), `${label}: real Volcano grew its numbered network`);
    check(await page.locator('#board .tile.bot:not(.root)').count() > 0 && await page.locator('#board .tile .mark-line, #board .tile .mark-ink').count() === 0, `${label}: numbered Volcano tiles remain readable without owner icons`);
    await controls(page,label+' after three turns');
    const resumed = await state(page);
    await page.evaluate(() => history.replaceState(null,'',location.pathname));
    await page.reload();
    await page.click('#menu-continue'); await idle(page);
    equal(await state(page),resumed,`${label}: reload resumes exact save after real turns`);
    const untouched = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key === 'severgrow.save.v7' || key === 'test:severgrow.save.v7')));
    equal(untouched,{ 'severgrow.save.v7':'MAIN-POLISH-SENTINEL','test:severgrow.save.v7':'TEST-POLISH-SENTINEL' },`${label}: other-channel saves stay intact`);
    await page.screenshot({ path: `${dir}/${width}x${height}-three-turns.png` });
    equal(errors,[],`${label}: no browser errors`);
  } catch (error) {
    await page.screenshot({ path: `${dir}/${width}x${height}-turns-failed.png` }).catch(() => {});
    throw error;
  } finally { await page.close(); }
}

async function bloomFlow(width: number, height: number, v3: boolean) {
  const label = `${width}x${height} ${v3 ? 'V3' : 'current art'} Bloom`;
  const { page, touch, errors } = await open(width,height,3,v3);
  try {
    if (v3) {
      await page.waitForFunction(() => document.querySelectorAll('#board .landmark.skin-has-art').length === 2 && !!document.querySelector('#board pattern[id$="skin-ground"] image')?.getAttribute('href'));
      check(await page.locator('#board').getAttribute('data-skin') === 'forest-volcano-v3',`${label}: V3 artwork loads`);
    }
    await geometry(page,width,height,label);
    await page.click('#deck'); await idle(page);
    const before = await state(page);
    const keys = ['-2,1','-1,1','0,1'];
    const action = legalActions(viewFor(before,0)).find(action => action.t === 'Bloom' && action.cards.join(',') === '6,43,61' && action.hexes.map(coordKey).join('|') === keys.join('|'));
    assert(action?.t === 'Bloom', `${label}: seeded legal Bloom`);
    const kind = `bloom-3-${action.cards.join('.')}`;
    const pick = async () => {
      const button = page.locator(`#moves [data-kind="${kind}"]`);
      if (!await button.isVisible()) await page.locator('#moves .bloom-toggle').click();
      await button.click();
      await page.waitForTimeout(50);
    };
    await pick();
    await tapHex(page,keys[0]!,touch);
    equal(await state(page),before,`${label}: starting a partial Bloom does not prematurely spend cards`);
    await tapHex(page,'-1,0',touch);
    equal(await state(page),before,`${label}: rock in an incomplete Bloom is rejected`);
    check(!await page.locator('#confirm').isVisible(),`${label}: incomplete/invalid Bloom has no confirmation`);
    await page.keyboard.press('Escape');
    equal(await state(page),before,`${label}: canceling the partial Bloom changes no game state`);
    await pick();
    if (touch) {
      for (const key of keys.slice(0,-1)) { await tapHex(page,key,true); equal(await state(page),before,`${label}: ${key} remains an incomplete placement`); }
      await tapHex(page,keys.at(-1)!,true);
    } else {
      const start = await hexCenter(page,keys[0]!), end = await hexCenter(page,keys.at(-1)!);
      await page.mouse.click(start.x,start.y);
      await page.mouse.move(end.x,end.y,{ steps: 8 });
      equal(await state(page),before,`${label}: desktop pointer preview leaves engine state untouched`);
      await page.mouse.click(end.x,end.y);
    }
    equal(await state(page),apply(before,action),`${label}: completed valid Bloom immediately commits once`);
    await idle(page);
    check(!await page.locator('#confirm').isVisible() && await page.evaluate(() => !(window as any).__severgrow.pending()),`${label}: completed Bloom has no Confirm or tap-again step`);
    check(await page.locator('#board .tile .mark-line, #board .tile .mark-ink').count() === 0,`${label}: numbered Bloom tiles have no owner icon`);
    await savedMatches(page,label);
    await page.screenshot({ path: `${dir}/${width}x${height}-bloom${v3 ? '-v3' : ''}.png` });
    await evidence(page,`${width}x${height}-bloom${v3 ? '-v3' : ''}`);
    await undo(page,before,label);
    if (touch) {
      await pick();
      const points = await Promise.all(keys.map(key => hexCenter(page,key)));
      const session = await cdp(page);
      await session.send('Input.dispatchTouchEvent',{ type:'touchStart',touchPoints:[{ ...points[0]!,id:1 }] });
      for (let i=1;i<points.length;i++) for (let step=1;step<=6;step++) {
        const from=points[i-1]!,to=points[i]!;
        await session.send('Input.dispatchTouchEvent',{ type:'touchMove',touchPoints:[{ x:from.x+(to.x-from.x)*step/6,y:from.y+(to.y-from.y)*step/6,id:1 }] });
      }
      equal(await state(page),before,`${label}: dragging preview spends nothing before release`);
      await session.send('Input.dispatchTouchEvent',{ type:'touchEnd',touchPoints:[] });
      equal(await state(page),apply(before,action),`${label}: touch drag completion commits immediately on release`);
      await undo(page,before,label+' drag');
    }
    await controls(page,label+' after Undo');
    equal(errors,[],`${label}: no browser errors`);
  } catch (error) {
    await page.screenshot({ path: `${dir}/${width}x${height}-bloom-failed.png` }).catch(() => {});
    throw error;
  } finally { await page.close(); }
}

try {
  for (const [index,[width,height]] of presets.entries()) {
    if (filter && !filter.includes(`${width}x${height}`)) continue;
    for (const [name,run] of [['turns',()=>sproutFlow(width,height)],['Bloom',()=>bloomFlow(width,height,index%2 === 1)]] as const) {
      try { await run(); console.log(`${width}x${height} ${name}: passed`); }
      catch (error) { const failure=`${width}x${height} ${name}: ${error instanceof Error ? error.message : String(error)}`; failures.push(failure); console.error(failure); }
    }
  }
  writeFileSync(`${dir}/report.json`,JSON.stringify({ checks,failures,measurements,evidence:[...evidenceWritten] },null,2));
  equal(failures,[],`board/turn polish failures; evidence ${dir}/report.json`);
  console.log(`${checks} board/turn polish checks passed; screenshots and geometry: ${dir}`);
} finally { await browser.close(); server?.httpServer.close(); }
