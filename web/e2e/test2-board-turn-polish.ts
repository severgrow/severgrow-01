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
import { positionSave } from './position.js';
import { fruitPosition, NINE_CHAIN } from './fruitcards-pos.js';

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
const evidenceNames = new Set(['360x640-grow', '390x664-bloom-v3', '1280x800-bloom-v3', '360x640-futasaku-menu', '360x640-throw-preview', '390x664-bloom-choices']);
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

/** Selected phone/desktop states, individually bounded to 192 KiB for CI log review. */
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
  const brand = await page.evaluate(async () => {
    const menu = document.querySelector<HTMLElement>('#hud-menu')!.getBoundingClientRect();
    const lines = document.querySelector<SVGSVGElement>('#hud-menu svg')!.getBoundingClientRect();
    const image = document.querySelector<SVGSVGElement>('#hud-brand')!;
    const asset = new Image();
    asset.src = image.querySelector('image')!.getAttribute('href')!;
    await asset.decode();
    const box = image.getBoundingClientRect();
    const race = document.querySelector<HTMLElement>('#race')!;
    return { title: document.title, loaded: asset.complete && asset.naturalWidth > 0,
      height: box.height, menuHeight: lines.height / 2, center: box.top + box.height / 2,
      color: getComputedStyle(image.querySelector('feFlood')!).floodColor,
      buttonColor: getComputedStyle(document.querySelector('#menu-continue')!).backgroundColor,
      menuCenter: menu.top + menu.height / 2, right: box.right,
      raceVisible: race.getClientRects().length > 0 && getComputedStyle(race).display !== 'none',
      pointer: getComputedStyle(image).pointerEvents };
  });
  equal(brand.title, 'Futasaku', `${label}: browser title uses the new name`);
  check(brand.loaded && Math.abs(brand.height-brand.menuHeight) < .1 && Math.abs(brand.center-brand.menuCenter) < 1,
    `${label}: logo matches the three menu lines' visible height and centre`);
  equal(brand.color,brand.buttonColor,`${label}: logo uses the Continue button's exact cream`);
  check(brand.right <= width && width-brand.right <= 12 && brand.pointer === 'none', `${label}: right logo fits and never captures input (${JSON.stringify(brand)})`);
  check(!brand.raceVisible, `${label}: progress bar consumes no pixels or layout space`);
  const atmosphere = await page.evaluate(async () => {
    const grain = document.querySelector<HTMLElement>('#test2-film-grain')!;
    const css = getComputedStyle(grain), box = grain.getBoundingClientRect();
    const rim = document.querySelector<SVGImageElement>('#test2-map-rim')!;
    const image = new Image(); image.src = rim.getAttribute('href')!; await image.decode();
    const pixels = document.createElement('canvas'); pixels.width = image.naturalWidth; pixels.height = image.naturalHeight;
    const context = pixels.getContext('2d')!; context.drawImage(image,0,0);
    const ink = context.getImageData(0,0,pixels.width,pixels.height).data;
    let peak = 0; for (let i=3;i<ink.length;i+=4) peak = Math.max(peak,ink[i]!);
    const cells = [...document.querySelectorAll<SVGPathElement>('#board .hex-cell > .hex')].map(path => {
      const box = path.getBBox(); return { x: box.x+box.width/2, y: box.y+box.height/2 };
    });
    const distance = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.hypot(a.x-b.x,a.y-b.y);
    const nearest = Math.min(...cells.flatMap((a,i)=>cells.slice(i+1).map(b=>distance(a,b))));
    const at = (x: number,y: number) => {
      const px = Math.floor((x-rim.x.baseVal.value)*pixels.width/rim.width.baseVal.value);
      const py = Math.floor((y-rim.y.baseVal.value)*pixels.height/rim.height.baseVal.value);
      return ink[(py*pixels.width+px)*4+3] ?? 255;
    };
    const cleanSeams = cells.every((a,i)=>cells.slice(i+1).every(b=>distance(a,b)>nearest*1.05 || at((a.x+b.x)/2,(a.y+b.y)/2)===0));
    const backdrop = getComputedStyle(document.querySelector('#test2-board-backdrop')!);
    return { coverage: box.left === 0 && box.top === 0 && box.width === innerWidth && box.height === innerHeight,
      opacity: Number(css.opacity), pointer: css.pointerEvents, static: css.animationName === 'none' && css.filter === 'none',
      tile: css.backgroundSize, background: css.backgroundImage.startsWith('url("data:image/png'),
      darker: backdrop.display !== 'none' && Number(backdrop.opacity) === .1,
      loaded: image.complete && image.naturalWidth > 0, bounded: Math.max(image.naturalWidth,image.naturalHeight) <= 1024,
      behind: !!(rim.compareDocumentPosition(document.querySelector('#board .l-base')!) & Node.DOCUMENT_POSITION_FOLLOWING),
      rimStatic: !rim.hasAttribute('filter') && getComputedStyle(rim).pointerEvents === 'none' && rim.getAnimations().length === 0,
      restrained: peak > 0 && peak <= 32, cleanSeams };
  });
  check(atmosphere.coverage && atmosphere.opacity === .04 && atmosphere.pointer === 'none' && atmosphere.static && atmosphere.tile === '128px 128px' && atmosphere.background,
    `${label}: deterministic static 4% grain covers all UI without blocking input`);
  check(atmosphere.darker && atmosphere.loaded && atmosphere.bounded && atmosphere.behind && atmosphere.rimStatic,
    `${label}: darker backdrop and bounded baked rim sit behind the unchanged tiles`);
  check(atmosphere.restrained && atmosphere.cleanSeams, `${label}: faint rim emits light only outside the map, never along internal seams`);
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
  if (width <= 600) check(info.grid.width >= width * .90, `${label}: phone grid uses nearly the full map width (${info.grid.width.toFixed(1)}px)`);
  const dock = await page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>('#hand .card')].map(card => card.getBoundingClientRect());
    const bottom = Math.max(...cards.map(card => card.bottom));
    const safe = parseFloat(getComputedStyle(document.querySelector('#safe-probe') ?? document.body).paddingBottom) || 0;
    return { bottom, safe, dock: document.querySelector('#dock')?.getBoundingClientRect().toJSON(),
      margin: getComputedStyle(document.querySelector('#board-wrap')!).marginLeft };
  });
  check(dock.bottom <= height+1 && height-dock.bottom <= 20+dock.safe,
    `${label}: cards sit low with a small safe bottom margin (${height-dock.bottom}px)`);
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
  check(await page.evaluate(() => {
    const dock = document.querySelector('#dock')!.getBoundingClientRect();
    return [...document.querySelectorAll('#moves > button')].filter(button => button.getClientRects().length)
      .every(button => button.getBoundingClientRect().top >= dock.top-1);
  }), `${label}: move controls never spill upward into the map`);
}

async function cue(page: Page, phase: 'draw' | 'grow' | 'throw', label: string) {
  await page.waitForFunction(phase => document.documentElement.dataset.step === phase && document.documentElement.classList.contains('test2-idle-ready'), phase);
  const result = await page.evaluate(() => {
    const cue = document.querySelector<HTMLElement>('#step-cue')!;
    const wrap = document.querySelector<HTMLElement>('#board-wrap')!;
    const map = wrap.getBoundingClientRect();
    const under = parseFloat(getComputedStyle(wrap).getPropertyValue('--cam-under')) || 0;
    const box = cue.getBoundingClientRect(), css = getComputedStyle(cue);
    return { text: cue.querySelector('.cue-text')?.textContent, visible: css.visibility !== 'hidden' && css.display !== 'none' && Number(css.opacity) > 0, pointer: css.pointerEvents,
      fontSize: parseFloat(getComputedStyle(cue.querySelector('.cue-text')!).fontSize), font:getComputedStyle(cue.querySelector('.cue-text')!).fontFamily, opacity:Number(css.opacity),
      centered: Math.abs(box.x+box.width/2-(map.x+map.width/2)) < 3 && Math.abs(box.y+box.height/2-(map.y+(map.height-under)/2)) < 3 };
  });
  check(result.visible && result.text?.trim().toLowerCase() === phase, `${label}: correct ${phase} cue is visible`);
  check(result.centered && result.pointer === 'none', `${label}: ${phase} cue is centered in the usable map and cannot intercept input`);
  check(result.font.includes('Besley') && result.opacity === .688, `${label}: Besley cue is exactly 20% fainter`);
  check(result.fontSize >= 30,`${label}: ${phase} cue remains legible at ${result.fontSize}px`);
}

async function idleTiming(page: Page, label: string) {
  const before = await state(page);
  await page.keyboard.press('Shift');
  const start = Date.now();
  await page.waitForTimeout(2700);
  check(await page.locator('#step-cue').evaluate(el => Number(getComputedStyle(el).opacity) === 0), `${label}: no prompt during the first 2.7 idle seconds`);
  await page.waitForFunction(() => document.documentElement.classList.contains('test2-idle-ready'));
  check(Date.now()-start >= 2950, `${label}: prompt waits three seconds after interaction`);
  await cue(page, 'draw', label);
  await page.keyboard.press('Shift');
  await page.waitForTimeout(160);
  check(await page.locator('#step-cue').evaluate(el => Number(getComputedStyle(el).opacity) === 0), `${label}: new input promptly hides idle guidance`);
  equal(await state(page),before,`${label}: the idle timer changes no game state`);
}

async function fruitFlow(width: number, height: number) {
  const before = fruitPosition(NINE_CHAIN, [[0,4],[2,5]], 1);
  const action = legalActions(viewFor(before,0)).find(a => a.t === 'PlayFruit' && before.board[coordKey(a.target)]?.strength === 9);
  assert(action?.t === 'PlayFruit');
  const page = await browser.newPage({ viewport: { width,height }, hasTouch: width < 600, isMobile: width < 600 });
  try {
    await page.addInitScript(saved => {
      (window as any).__name = (f: unknown) => f;
      localStorage.setItem('main2:severgrow.save.v7', saved);
      localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({ coach:false,sound:false,music:false,speed:'skip',reduceMotion:true,autoSkip:false,confirmPolicy:'always' }));
      localStorage.setItem('main2:severgrow.tips.v1',JSON.stringify({fruit:true,fruitAny:true,strengthen:true}));
    },positionSave({state:before}));
    await page.goto(base);
    await page.click('#menu-continue'); await idle(page);
    equal(await state(page),before,'Fruit: saved position resumes unchanged');
    await page.locator(`#hand [data-card="${action.card}"]`).click();
    equal(await state(page),before,'Fruit: choosing the card alone does not spend it');
    await tapHex(page,coordKey(action.target),width < 600);
    equal(await state(page),apply(before,action),'Fruit: first valid target tap executes with Confirm=Always');
    await idle(page);
    check(!await page.locator('#confirm').isVisible() && await page.evaluate(() => !(window as any).__severgrow.pending()),'Fruit: no confirmation or second tap remains');
    await undo(page,before,'Fruit');
    await savedMatches(page,'Fruit after Undo');
  } finally { await page.close(); }
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
  await page.evaluate(() => {
    (window as any).__test2OpponentReadiness = null;
    const observer = new MutationObserver(() => {
      if (document.documentElement.dataset.step !== 'opp') return;
      const card = document.querySelector('#hand .card');
      const cue = document.querySelector('#step-cue')!;
      if (!card) return;
      const css = getComputedStyle(card);
      (window as any).__test2OpponentReadiness = { opacity:Number(css.opacity),filter:css.filter,
        hidden:getComputedStyle(cue).visibility === 'hidden',text:cue.querySelector('.cue-text')?.textContent };
      observer.disconnect();
    });
    observer.observe(document.documentElement,{ attributes:true,attributeFilter:['data-step'] });
  });
  const picked = page.locator(`#hand [data-card="${discard.card}"]`);
  await picked.click();
  equal(await state(page),before,`${label}: first Throw tap never spends a card or advances the turn`);
  const selection = await picked.evaluate(el => ({ selected:el.classList.contains('test2-throw-picked'), filter:getComputedStyle(el).filter, transform:getComputedStyle(el).transform }));
  check(selection.selected && selection.filter === 'grayscale(1)' && selection.transform !== 'none',`${label}: Throw preview is enlarged and completely desaturated`);
  const other = legalActions(viewFor(before,0)).find(a => a.t === 'Discard' && a.card !== discard.card);
  if (other?.t === 'Discard') {
    await page.locator(`#hand [data-card="${other.card}"]`).click();
    equal(await state(page),before,`${label}: selecting another card changes the preview without throwing`);
    equal(await page.locator('#hand .test2-throw-picked').getAttribute('data-card'),String(other.card),`${label}: only the new card is selected`);
    await picked.click();
    equal(await state(page),before,`${label}: returning to the first card still waits for confirmation`);
  }
  if (label.startsWith('360x640') && label.endsWith('turn 1')) await evidence(page,'360x640-throw-preview');
  await picked.click();
  await idle(page);
  equal(await state(page), expected, `${label}: actual Volcano opponent turn matches every deterministic engine/bot action`);
  check(botActions.some(action => action.t === 'Draw') && botActions.some(action => action.t === 'EndAct'), `${label}: Volcano completed its real turn`);
  const opponent = await page.evaluate(() => (window as any).__test2OpponentReadiness);
  check(opponent?.opacity <= .4 && opponent.filter.includes('grayscale') && opponent.filter.includes('brightness'),`${label}: actual opponent turn substantially darkens/desaturates the hand (${JSON.stringify(opponent)})`);
  check(opponent?.hidden && opponent.text === '',`${label}: opponent turn has no board message`);
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
    if (width === 360 || width === 1280) await idleTiming(page,label);
    await cue(page,'draw',label);
    const initial = await state(page);
    await page.click('#deck');
    await idle(page);
    const grown = await state(page);
    equal(grown, apply(initial,{ t:'Draw',from:'deck' }), `${label}: actual Draw preserves engine parity`);
    await page.waitForTimeout(200);
    await geometry(page,width,height,label+' after Draw');
    check(await page.locator('#step-cue').evaluate(el => Number(getComputedStyle(el).opacity) === 0), `${label}: Draw transitions without an immediate Grow prompt`);
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
    await page.waitForTimeout(200);
    await geometry(page,width,height,label+' after three turns');
    await controls(page,label+' after three turns');
    const resumed = await state(page);
    await page.evaluate(() => history.replaceState(null,'',location.pathname));
    await page.reload();
    // HTML names the game before the async branding chunk mounts its supplied logo.
    await page.locator('#logo svg').waitFor({ state: 'visible' });
    equal((await page.locator('#menu .title').textContent())?.trim(), 'Futasaku', `${label}: main screen uses the exact new name`);
    equal((await page.locator('#menu .title').innerText()).toLowerCase(), 'futasaku', `${label}: the visible wordmark has the new name, with its existing uppercase styling`);
    check(await page.locator('#logo svg').isVisible(), `${label}: supplied logo replaces the old menu mark`);
    check(await page.evaluate(() => getComputedStyle(document.querySelector('#logo feFlood')!).floodColor === getComputedStyle(document.querySelector('#menu-continue')!).backgroundColor), `${label}: main-screen logo matches Continue cream`);
    check(!/severor/i.test(await page.locator('body').innerText()), `${label}: old name is absent from visible copy`);
    check(!await page.locator('#terrarium').isVisible(), `${label}: old menu artwork does not obscure the new logo`);
    const manifest = await (await page.request.get(base+'manifest.webmanifest')).json();
    equal([manifest.name,manifest.short_name], ['Futasaku','Futasaku'], `${label}: installed-app name uses Futasaku`);
    await page.screenshot({ path: `${dir}/${width}x${height}-futasaku-menu.png` });
    await evidence(page,`${width}x${height}-futasaku-menu`);
    await page.click('#menu-continue'); await idle(page);
    equal(await state(page),resumed,`${label}: reload resumes exact save after real turns`);
    const untouched = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key === 'severgrow.save.v7' || key === 'test:severgrow.save.v7')));
    equal(untouched,{ 'severgrow.save.v7':'MAIN-POLISH-SENTINEL','test:severgrow.save.v7':'TEST-POLISH-SENTINEL' },`${label}: other-channel saves stay intact`);
    await page.screenshot({ path: `${dir}/${width}x${height}-three-turns.png` });
    equal(errors,[],`${label}: no browser errors`);
  } catch (error) {
    await page.screenshot({ path: `${dir}/${width}x${height}-turns-failed.png` }).catch(() => {});
    await evidence(page,`${width}x${height}-grow`).catch(() => {});
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
    await page.waitForTimeout(200);
    await geometry(page,width,height,label+' after Draw');
    const keys = ['-2,1','-1,1','0,1'];
    const action = legalActions(viewFor(before,0)).find(action => action.t === 'Bloom' && action.cards.join(',') === '6,43,61' && action.hexes.map(coordKey).join('|') === keys.join('|'));
    assert(action?.t === 'Bloom', `${label}: seeded legal Bloom`);
    const kind = `bloom-3-${action.cards.join('.')}`;
    const pick = async () => {
      const button = page.locator(`#moves [data-kind="${kind}"]`);
      if (!await button.isVisible()) await page.locator('#moves .bloom-toggle').click();
      // Escape clears a partial painting and retains its selected Bloom group.
      if (await button.getAttribute('aria-pressed') !== 'true') await button.click();
      if (await page.locator('#moves .bloom-options').isVisible()) await page.locator('#moves .bloom-toggle').click();
      await page.waitForTimeout(50);
    };
    if (width === 390 && height === 664) await evidence(page,'390x664-bloom-choices');
    await pick();
    equal((await page.locator('#moves .test2-skip').innerText()).trim(),'Skip',`${label}: Bloom retains a short Skip button`);
    check(await page.locator('#moves .test2-skip').isEnabled(),`${label}: subdued Skip remains usable`);
    equal(await page.locator('#hand .test2-bloom-card').count(),action.cards.length,`${label}: selected Bloom highlights exactly its cards`);
    check(!/Bloom \d+ tiles|Skip sprout/.test(await page.locator('#moves').innerText()),`${label}: Bloom choices use combination icons rather than prose`);
    await page.waitForFunction(() => document.documentElement.classList.contains('test2-idle-ready'));
    equal((await page.locator('#step-cue .cue-text').textContent())?.trim(),'Bloom',`${label}: idle Bloom uses only its short prompt`);
    check(await page.locator('#step-cue').evaluate(el => Number(getComputedStyle(el).opacity)>0),`${label}: idle Bloom remains visible with a combination selected`);
    await controls(page,label+' selected Bloom');
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
    if (!touch) {
      const placed = await state(page);
      await page.mouse.move(width-4,4);
      await page.locator(`#board .hex-cell[data-key="${keys.at(-1)!}"]`).hover();
      await page.waitForFunction(() => !document.querySelector<HTMLElement>('#tooltip')!.hidden);
      await page.waitForTimeout(160);
      check(await page.locator('#tooltip').isVisible(),`${label}: hovering keeps the tile information readable`);
      check(await page.locator('#step-cue').evaluate(element => Number(getComputedStyle(element).opacity) === 0),`${label}: idle instruction yields to the open tile information`);
      equal(await state(page),placed,`${label}: reading tile information changes no game state`);
      await page.mouse.move(width-4,4);
      await page.waitForFunction(() => document.querySelector<HTMLElement>('#tooltip')!.hidden);
      await page.waitForTimeout(160);
      await cue(page,'grow',`${label}: after inspection`);
    }
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
    await evidence(page,`${width}x${height}-bloom${v3 ? '-v3' : ''}`).catch(() => {});
    throw error;
  } finally { await page.close(); }
}


async function drawGlow() {
  // Real save fixtures distinguish new combinations, existing combinations and duplicate faces.
  for (const [label, numbers, topFace, wanted] of [
    ['new run', [[0,4],[0,5],[2,9]], [0,6], true],
    ['unrelated card', [[0,4],[0,5],[0,6]], [3,9], false],
    ['duplicate face', [[0,4],[0,5],[0,6]], [0,4], false],
    ['extends an existing run', [[0,4],[0,5],[0,6]], [0,7], true],
  ] as const) {
    const game = fruitPosition(NINE_CHAIN, numbers.map(([s,r]) => [s,r]),0);
    const index = game.deck.findIndex(c => c.suit === topFace[0] && c.rank === topFace[1]);
    assert(index >= 0,'top card exists in fixture deck');
    const [top] = game.deck.splice(index,1);
    game.deck.push(...game.discard); game.discard=[top!]; game.phase='DRAW';
    const page = await browser.newPage({ viewport:{width:390,height:844},hasTouch:true,isMobile:true });
    try {
      await page.addInitScript(save => {
        (window as any).__name=(f:unknown)=>f;
        localStorage.setItem('main2:severgrow.save.v7',save);
        localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({coach:true,sound:false,music:false,reduceMotion:true,speed:'skip',autoSkip:false}));
      },positionSave({state:game}));
      await page.goto(base); await page.waitForFunction(() => !!(window as any).__severgrow);
      await page.click('#menu-continue'); await idle(page);
      equal(await state(page),game,`${label}: exact real position resumes`);
      equal(await page.locator('#discard').evaluate(el=>el.classList.contains('test2-bloom-draw')),wanted,`${label}: only a new Bloom combination changes the throw-pile highlight`);
      equal(await page.locator('#deck.coach-glow').count(),0,`${label}: no square Deck recommendation`);
      equal(await page.locator('.pile-label:visible').count(),0,`${label}: pile labels are hidden`);
      check((await page.locator('#discard').getAttribute('aria-label'))?.startsWith('Throw pile:'),`${label}: accessible pile name remains`);
      equal(await state(page),game,`${label}: highlighting changes no game state`);
    } finally { await page.close(); }
  }
}

try {
  await drawGlow();
  for (const [index,[width,height]] of presets.entries()) {
    if (filter && !filter.includes(`${width}x${height}`)) continue;
    for (const [name,run] of [['turns',()=>sproutFlow(width,height)],['Bloom',()=>bloomFlow(width,height,index%2 === 1)]] as const) {
      try { await run(); console.log(`${width}x${height} ${name}: passed`); }
      catch (error) { const failure=`${width}x${height} ${name}: ${error instanceof Error ? error.message : String(error)}`; failures.push(failure); console.error(failure); }
    }
  }
  await fruitFlow(390,844);
  await fruitFlow(1280,800);
  const safe = await open(390,844,219682080);
  try {
    const before = await state(safe.page);
    // Model an iPhone notch/home indicator; the existing screen and inset probe agree.
    await safe.page.addStyleTag({ content: '#game { padding-top:24px; padding-bottom:34px; } #safe-probe { padding-top:24px; padding-bottom:34px; } html.test2-branding .game > .hud { top:24px; }' });
    await safe.page.setViewportSize({ width:390,height:843 });
    await safe.page.waitForTimeout(250);
    await geometry(safe.page,390,843,'phone with notch/home indicator');
    await controls(safe.page,'phone with notch/home indicator');
    const bottom = await safe.page.locator('#hand .card').evaluateAll(cards => Math.max(...cards.map(card=>card.getBoundingClientRect().bottom)));
    check(bottom <= 843-34-2, 'lower hand keeps a clear margin above the home indicator');
    equal(await state(safe.page),before,'safe-area resizing changes no game state');
  } finally { await safe.page.close(); }
  writeFileSync(`${dir}/report.json`,JSON.stringify({ checks,failures,measurements,evidence:[...evidenceWritten] },null,2));
  equal(failures,[],`board/turn polish failures; evidence ${dir}/report.json`);
  console.log(`${checks} board/turn polish checks passed; screenshots and geometry: ${dir}`);
} finally { await browser.close(); server?.httpServer.close(); }
