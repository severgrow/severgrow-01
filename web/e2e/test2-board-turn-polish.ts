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
import { fixture } from '../../tests/helpers.js';

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
const evidenceNames = new Set(['360x640-grow', '390x664-bloom-v3', '1280x800-bloom-v3', '360x640-futasaku-menu', '360x640-throw-preview', '390x664-bloom-choices', '390x844-bomb-cards', '1280x800-bomb-cards', '390x844-bloom-ready', '1280x800-bloom-ready']);
const evidenceWritten = new Set<string>();
const check = (value: unknown, label: string) => { assert(value, label); checks++; };
const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };
const state = (page: Page): Promise<State> => page.evaluate(() => (window as any).__severgrow.state());
const idle = (page: Page) => page.waitForFunction(() => { const h = (window as any).__severgrow; return h?.state() && !h.busy() && (h.state().actor === 0 || h.state().phase === 'GAME_OVER'); }, undefined, { timeout: 30000 });
const rawSave = (page: Page): Promise<string | null> => page.evaluate(() => Object.entries(localStorage).find(([key]) => key === 'main2:severgrow.save.v7')?.[1] ?? null);
const savedMatches = async (page: Page, label: string) => equal(decodeSave(await rawSave(page))?.state, await state(page), `${label}: autosave replays the exact current state`);
// The fan intentionally overlaps; use a visibly exposed point instead of covered card centres.
async function tapCard(page: Page, id: number) {
  const point = await page.locator(`#hand [data-card="${id}"]`).evaluate(el => {
    const r=el.getBoundingClientRect();
    for (const fy of [.18,.3,.45,.6,.8]) for (const fx of [.15,.3,.5,.7,.85]) {
      const x=r.left+r.width*fx,y=r.top+r.height*fy;
      if (document.elementFromPoint(x,y)?.closest('[data-card]') === el) return {x,y};
    }
    return null;
  });
  assert(point,`card ${id} retains an exposed, real tap target`);
  if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) await page.touchscreen.tap(point.x,point.y);
  else await page.mouse.click(point.x,point.y);
}
const cdps = new WeakMap<Page, CDPSession>();
const cdp = async (page: Page) => { if (!cdps.has(page)) cdps.set(page, await page.context().newCDPSession(page)); return cdps.get(page)!; };
const tapHex = async (page: Page, key: string, touch: boolean) => {
  const point = await hexCenter(page,key);
  if (touch) {
    await page.touchscreen.tap(point.x,point.y);
  } else await page.mouse.click(point.x,point.y);
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
  await page.locator('#game').waitFor({state:'visible'});
  await page.waitForFunction(() => document.querySelectorAll('#board .hex-cell').length > 0);
  await page.locator('#splash').waitFor({state:'hidden'});
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  await page.waitForTimeout(180);
  equal(await state(page), newGame(seed), `${width}x${height}: seeded Classic setup`);
  return { page, touch, errors };
}

async function geometry(page: Page, width: number, height: number, label: string) {
  const before = await state(page);
  const orientation = await page.evaluate(() => {
    const board = (window as any).__severgrow.state().board as Record<string, { owner: number; root?: boolean } | null>;
    const homes = Object.entries(board).filter(([, tile]) => tile?.root);
    const centre = (key: string) => {
      const box = document.querySelector<SVGPathElement>(`#board .hex-cell[data-key="${key}"] > .hex`)!.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    };
    const mine = centre(homes.find(([, tile]) => tile?.owner === 0)![0]);
    const theirs = centre(homes.find(([, tile]) => tile?.owner === 1)![0]);
    const cells = [...document.querySelectorAll<SVGGElement>('#board .hex-cell[data-key]')].map(cell => centre(cell.dataset.key!));
    const top = Math.min(...cells.map(cell => cell.y));
    const bottom = Math.max(...cells.map(cell => cell.y));
    return { family: document.documentElement.dataset.orient, mine, theirs,
      topCount: cells.filter(cell => Math.abs(cell.y - top) < 1).length,
      bottomCount: cells.filter(cell => Math.abs(cell.y - bottom) < 1).length };
  });
  check(orientation.family === 'flat' && orientation.mine.y > orientation.theirs.y &&
    Math.abs(orientation.mine.x - orientation.theirs.x) < 2 &&
    orientation.topCount === 1 && orientation.bottomCount === 1,
    `${label}: fixed orientation puts the player below the opponent and a single hex at each point (${JSON.stringify(orientation)})`);
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
      height: box.height, menuHeight: lines.height / 2, top:box.top, inkTop:menu.top+menu.height/2-lines.height/4, center: box.top + box.height / 2,
      color: getComputedStyle(image.querySelector('feFlood')!).floodColor,
      buttonColor: getComputedStyle(document.querySelector('#menu-continue')!).backgroundColor,
      menuCenter: menu.top + menu.height / 2, right: box.right,
      raceVisible: race.getClientRects().length > 0 && getComputedStyle(race).display !== 'none',
      pointer: getComputedStyle(image).pointerEvents, opacity: getComputedStyle(image).opacity };
  });
  equal(brand.title, 'Futasaku', `${label}: browser title uses the new name`);
  check(brand.loaded && Math.abs(brand.height-1.82*brand.menuHeight) < .15 && Math.abs(brand.top-brand.inkTop) < 2 && Number(brand.opacity) === .75,
    `${label}: kanji wordmark is readable and top-aligned with the menu lines (${JSON.stringify(brand)})`);
  equal(brand.color,brand.buttonColor,`${label}: logo uses the Continue button's exact cream`);
  check(brand.right <= width && width-brand.right <= 12 && brand.pointer === 'none', `${label}: right logo fits and never captures input (${JSON.stringify(brand)})`);
  check(!brand.raceVisible, `${label}: progress bar consumes no pixels or layout space`);
  const meterAlignment = await page.evaluate(() => ['deck','discard'].map(id => {
    const pile = document.querySelector(`#${id} .pile-card`)!.getBoundingClientRect();
    const meter = document.querySelector(`#${id} .pile-meter`)!.getBoundingClientRect();
    return Math.abs(pile.left-meter.left);
  }));
  check(meterAlignment.every(gap => gap < .6), `${label}: each mechanical counter starts at its pile's left edge (${meterAlignment})`);
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
      darker: backdrop.display !== 'none' && Number(backdrop.opacity) === .235,
      loaded: image.complete && image.naturalWidth > 0, bounded: Math.max(image.naturalWidth,image.naturalHeight) <= 1024,
      behind: !!(rim.compareDocumentPosition(document.querySelector('#board .l-base')!) & Node.DOCUMENT_POSITION_FOLLOWING),
      rimStatic: !rim.hasAttribute('filter') && getComputedStyle(rim).pointerEvents === 'none' && rim.getAnimations().length === 0,
      restrained: peak > 0 && peak <= 32, cleanSeams };
  });
  const emptyLighting = await page.evaluate(() => {
    const occupied = new Set([...document.querySelectorAll('#board .tile[data-key]')].map(tile=>tile.getAttribute('data-key')));
    return [...document.querySelectorAll('#board .hex-cell')].every(cell => {
      const empty = cell.classList.contains('normal') && !occupied.has(cell.getAttribute('data-key'));
      return getComputedStyle(cell).filter === (empty ? 'brightness(1.15)' : 'none');
    });
  });
  check(emptyLighting, `${label}: only empty normal hexes are 15% brighter; owned, rock and gold rendering stays unchanged`);
  check(atmosphere.coverage && atmosphere.opacity === .12 && atmosphere.pointer === 'none' && atmosphere.static && atmosphere.tile === '128px 128px' && atmosphere.background,
    `${label}: deterministic static 12% grain covers all UI without blocking input`);
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
    // The crystals have a soft halo; board fit is defined by the hex outlines,
    // not by decorative children extending their SVG group bounds.
    const boxes = cells.map(cell => cell.querySelector('.hex')!.getBoundingClientRect());
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
  // At the shortest supported heights the fixed upright map is height-bound;
  // keep it substantial without rotating it to fill the width.
  if (width <= 600) check(info.grid.width >= width * (height < 700 ? .75 : .90), `${label}: upright phone grid remains substantial (${info.grid.width.toFixed(1)}px)`);
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
  check(result.font.includes('Besley') && result.opacity === .6536, `${label}: Besley cue is a further 5% fainter`);
  if (phase === 'grow' && label.startsWith('1280x800') && !label.includes('inspection')) await pulseCheck(page,label);
  check(result.fontSize >= 30,`${label}: ${phase} cue remains legible at ${result.fontSize}px`);
}

async function pulseCheck(page: Page, label: string) {
  const before = await state(page);
  // The runner can request reduced motion at the OS/browser level. Explicitly test the
  // normal-motion mode, then restore the browser preference after testing the game toggle.
  const browserReduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const reduced = root.classList.contains('reduce-motion');
    root.classList.remove('reduce-motion');
    const text = document.querySelector<HTMLElement>('#step-cue .cue-text')!;
    const animation = text.getAnimations().find(a => (a as CSSAnimation).animationName === 'test2-cue-breathe');
    if (!animation) { root.classList.toggle('reduce-motion', reduced); return null; }
    animation.pause(); animation.currentTime = 0;
    const small = getComputedStyle(text).transform;
    animation.currentTime = 1550;
    const large = getComputedStyle(text).transform;
    animation.play();
    const card = document.querySelector('#hand .card.playable:not(.test2-throw-picked)');
    const cardPulse = card?.getAnimations().some(a => (a as CSSAnimation).animationName === 'test2-card-breathe');
    const growEdge = card ? getComputedStyle(card).boxShadow : '';
    const handBlob = getComputedStyle(document.querySelector('#hand')!, '::before').content;
    root.classList.add('reduce-motion');
    // Chromium may retain the paused Animation object briefly after CSS removes it.
    // The computed animation is the player's effective reduced-motion state.
    const motionName = getComputedStyle(text).animationName;
    const noMotion = motionName === 'none';
    root.classList.toggle('reduce-motion', reduced);
    return { small, large, cardPulse, growEdge, handBlob, off: noMotion, motionName };
  });
  await page.emulateMedia({ reducedMotion: browserReduced ? 'reduce' : 'no-preference' });
  check(result && result.small !== result.large && result.large.includes('1.085') && result.cardPulse &&
    result.growEdge.includes('119, 179, 116') && result.handBlob === 'none' && result.off,
    `${label}: larger idle cue and whole playable-card pulse actually run; Reduce Motion disables them (${JSON.stringify(result)})`);
  equal(await state(page), before, `${label}: pulses cannot change game state`);
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
  const before = fruitPosition(NINE_CHAIN, [[0,4],[1,6],[2,5],[3,8]], 1);
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
    equal(await state(page),before,'Bomb: saved position resumes unchanged');
    const palette = await page.locator('#hand .card').evaluateAll(cards => cards.map(card => ({
      suit:card.className.match(/\bs[0-3]\b/)?.[0] ?? 'bomb', ink:getComputedStyle(card.querySelector('.c-num')!).color,
      background:getComputedStyle(card).backgroundColor, border:getComputedStyle(card,'::after').borderStyle,
      title:card.querySelector('.c-suit')?.getAttribute('title'), spark:!!card.querySelector('.c-fruit .bomb-spark'), simpleIndex:!card.querySelector('.c-idx .bomb-spark'), circles:card.querySelectorAll('.c-fruit svg circle').length,
      name:card.getAttribute('aria-label')
    })));
    for (const [suit,color] of [['s0','rgb(127, 207, 141)'],['s1','rgb(179, 137, 243)'],['s2','rgb(118, 168, 245)'],['s3','rgb(238, 125, 115)']]) {
      equal(palette.find(card=>card.suit===suit)?.ink,color,`Bomb/cards: ${suit} uses the approved palette exactly`);
    }
    check(palette.every(card=>card.background==='rgba(20, 21, 21, 0.88)'), 'Bomb/cards: all faces keep the same dark translucent background');
    const bomb=palette.find(card=>card.suit==='bomb')!;
    check(bomb.title==='Bomb' && bomb.name?.includes('Bomb') && bomb.circles===1 && bomb.spark && bomb.simpleIndex && bomb.border==='double','Bomb: round line icon, cream double frame and accessible name replace mushroom');
    check(!await page.locator('body').innerText().then(text=>/\bfruit(?:ed)?\b/i.test(text)),'Bomb: no obsolete visible name');
    const counts=await page.locator('.dock .pile-count').evaluateAll(nodes=>nodes.map(el=>({value:(el as HTMLElement).dataset.value,wheels:el.querySelectorAll('.pile-meter-window').length})));
    check(counts.every(c=>c.value?.length===2 && c.wheels===2),
      'Card counters: two mechanical digit windows retain actual counts');
    await page.keyboard.press('Tab');
    const focusCard=page.locator(`#hand [data-card="${action.card}"]`);
    await focusCard.focus();
    check(await focusCard.evaluate(el=>el.matches(':focus-visible') && getComputedStyle(el).outlineWidth==='2px'),'Card focus: keyboard selection has a clear separate outline');
    await page.locator('#hud-menu').focus();
    equal(await state(page),before,'Card focus and counter styling change no state');
    await evidence(page,`${width}x${height}-bomb-cards`);
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
  const deck = await page.locator('#deck').evaluate(el => ({ opacity: Number(getComputedStyle(el).opacity), filter: getComputedStyle(el).filter }));
  check(deck.opacity < .55 && deck.filter.includes('grayscale'), `${label}: dimmed deck makes Throw visually distinct from Grow`);
  const throwLook = await page.evaluate(() => {
    const card = document.querySelector('#hand .card:not(.test2-throw-picked)')!;
    const halo = document.querySelector('#discard .gd-halo')!;
    const ring = document.querySelector('#discard .gd-ring')!;
    return { cardFilter:getComputedStyle(card).filter, cardAnimation:getComputedStyle(card).animationName,
      edge:getComputedStyle(card).boxShadow, handBlob:getComputedStyle(document.querySelector('#hand')!, '::before').content,
      haloShadow:getComputedStyle(halo).boxShadow, haloAnimation:getComputedStyle(halo).animationName,
      ringAnimation:getComputedStyle(ring).animationName };
  });
  check(throwLook.cardFilter.includes('grayscale(0.54)') && throwLook.edge.includes('222, 110, 83') && throwLook.handBlob === 'none' && throwLook.cardAnimation === 'none' &&
    throwLook.haloShadow !== 'none' && throwLook.haloAnimation === 'none' && throwLook.ringAnimation === 'none',
    `${label}: Throw keeps readable color and a steady ember light on each card edge (${JSON.stringify(throwLook)})`);
  const throwPulse = await page.evaluate(() => {
    const root = document.documentElement;
    const reduced = root.classList.contains('reduce-motion');
    root.classList.remove('reduce-motion');
    const card = document.querySelector('#hand .card:not(.test2-throw-picked)')!;
    const result = { card: getComputedStyle(card).animationName, light: getComputedStyle(card).boxShadow };
    root.classList.toggle('reduce-motion', reduced);
    return result;
  });
  check(throwPulse.card === 'test2-card-breathe' && throwPulse.light.includes('186, 66, 47'),
    `${label}: Throw pulses the whole card while its edge light stays attached (${JSON.stringify(throwPulse)})`);
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
  await tapCard(page,discard.card);
  equal(await state(page),before,`${label}: first Throw tap never spends a card or advances the turn`);
  if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) {
    check(await picked.evaluate(el => getComputedStyle(el).touchAction === 'manipulation'),
      `${label}: the mobile Throw card prevents double-tap browser zoom`);
  }
  const selection = await picked.evaluate(el => ({ selected:el.classList.contains('test2-throw-picked'), filter:getComputedStyle(el).filter, transform:getComputedStyle(el).transform }));
  check(selection.selected && selection.filter === 'grayscale(1)' && selection.transform !== 'none',`${label}: Throw preview is enlarged and completely desaturated`);
  const other = legalActions(viewFor(before,0)).find(a => a.t === 'Discard' && a.card !== discard.card);
  if (other?.t === 'Discard') {
    await tapCard(page,other.card);
    equal(await state(page),before,`${label}: selecting another card changes the preview without throwing`);
    equal(await page.locator('#hand .test2-throw-picked').getAttribute('data-card'),String(other.card),`${label}: only the new card is selected`);
    await tapCard(page,discard.card);
    equal(await state(page),before,`${label}: returning to the first card still waits for confirmation`);
  }
  if (label.startsWith('360x640') && label.endsWith('turn 1')) await evidence(page,'360x640-throw-preview');
  await tapCard(page,discard.card);
  await idle(page);
  if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) {
    check(await page.evaluate(() => Math.abs((visualViewport?.scale ?? 1) - 1) < .01),
      `${label}: confirming Throw keeps the mobile viewport at its normal scale`);
  }
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
    const meterMotion = width === 390 && height === 844;
    if (meterMotion) await page.evaluate(() => document.documentElement.classList.remove('reduce-motion'));
    await page.click('#deck');
    await idle(page);
    if (meterMotion) {
      const wheel = page.locator('#deck .pile-meter-drum').last();
      check(await wheel.count() > 0 && await wheel.evaluate(el => el.getAnimations().some(a => a.playState === 'running')),
        `${label}: drawing turns a mechanical number wheel`);
      const first = await wheel.evaluate(el => getComputedStyle(el).transform);
      await page.waitForTimeout(110);
      const second = await wheel.evaluate(el => getComputedStyle(el).transform);
      check(first !== second, `${label}: the number rolls smoothly across frames`);
      await page.evaluate(() => document.documentElement.classList.add('reduce-motion'));
    }
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
    check(await page.locator('#board .l-veins > *').count() === 0 && await page.locator('#board .ghost-vein').count() === 0,
      `${label}: no permanent or preview connector artwork is rendered`);
    check(await page.locator(`#board .tile[data-key="${coordKey(action.coord)}"] .seed-stone[data-owner="0"] .seed-stone-art image`).count() === 1,
      `${label}: the actual strength uses the light physical stone artwork`);
    await page.waitForTimeout(520); // the placed tile's entry animation has finished
    const stonePlacement = await page.evaluate(key => {
      const stone = document.querySelector<SVGGElement>(`#board .tile[data-key="${key}"] .seed-stone`)!;
      const hexPath = document.querySelector<SVGPathElement>(`#board .hex-cell[data-key="${key}"] > .hex`)!;
      const hex = hexPath.getBoundingClientRect();
      const group = new DOMPoint(0, 0).matrixTransform(stone.getScreenCTM()!);
      return { dx: Math.abs(group.x - hex.left - hex.width / 2),
        dy: Math.abs(group.y - hex.top - hex.height / 2), transform: stone.getAttribute('transform') };
    }, coordKey(action.coord));
    check(stonePlacement.dx < 5 && stonePlacement.dy < 5 && stonePlacement.transform?.endsWith('scale(0.6)'),
      `${label}: the 20% larger strength stone sits at the hex centre (${JSON.stringify(stonePlacement)})`);
    await savedMatches(page,label+' Sprout');
    await undo(page,grown,label+' Sprout');
    const illegalEmpty = Object.keys(grown.terrain).find(key => !grown.board[key] && grown.terrain[key] === 'normal' &&
      !legalActions(viewFor(grown,0)).some(move => move.t === 'Sprout' && coordKey(move.coord) === key));
    if (illegalEmpty) {
      await tapHex(page,illegalEmpty,touch);
      equal(await state(page),grown,`${label}: an illegal empty tile never places a card`);
      equal(await page.locator('#board .selected').count(),0,`${label}: an illegal empty tile is not selected`);
    }
    await tapHex(page,coordKey(action.coord),touch);
    equal(await state(page),grown,`${label}: legal empty-tile tap only previews a destination`);
    check(await page.locator('#board .selected').count()>0,`${label}: legal destination is visibly selected`);
    await page.locator(`#hand [data-card="${action.card}"]`).click();
    equal(await state(page),apply(grown,action),`${label}: tapping a card after a legal destination immediately places the Sprout`);
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
    check(await page.locator('#captions .caption, #captions .float, #board .amb-ember').count() === 0,
      `${label}: temporary move captions and rising fire are absent from this preview`);
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
    await page.waitForTimeout(350);
    const drawPiles = await page.evaluate(() => {
      const piles = document.querySelector<HTMLElement>('#test2-box > .piles')!;
      const first = document.querySelector<HTMLElement>('#hand .card')!.getBoundingClientRect();
      const deck = document.querySelector<HTMLElement>('#deck .pile-card')!.getBoundingClientRect();
      const meter = document.querySelector<HTMLElement>('#deck .pile-meter')!.getBoundingClientRect();
      const box = document.querySelector<HTMLElement>('#test2-box')!.getBoundingClientRect();
      const actions = document.querySelector<HTMLElement>('#test2-actions')!.getBoundingClientRect();
      return { first: first.left, deck: deck.left, meter: meter.left, meterBottom: meter.bottom, boxBottom: box.bottom,
        right: piles.getBoundingClientRect().right,
        actions: actions.left, scale: deck.width / 50, shift: parseFloat(getComputedStyle(piles).getPropertyValue('--test2-draw-shift')) || 0 };
    });
    check(drawPiles.scale >= 1.15 && Math.abs(drawPiles.deck-drawPiles.meter) < .6,
      `${label}: Draw smoothly enlarges the whole pile and its attached counter (${JSON.stringify(drawPiles)})`);
    if (width <= 600) check(drawPiles.shift > 0 && drawPiles.right <= drawPiles.actions - 6,
      `${label}: Draw piles move toward the hand without covering the cockpit tools (${JSON.stringify(drawPiles)})`);
    if (width <= 600) check(drawPiles.meterBottom >= drawPiles.boxBottom + 4 && drawPiles.meterBottom <= drawPiles.boxBottom + 12,
      `${label}: enlarged Draw piles sit just below the cockpit baseline (${JSON.stringify(drawPiles)})`);
    if (width === 390 && height === 844 && !v3) await page.screenshot({ path: `${dir}/390x844-draw-piles.png` });
    await page.click('#deck'); await idle(page);
    const before = await state(page);
    await geometry(page,width,height,label+' after Draw');
    const keys = ['-2,1','-1,1','0,1'];
    const action = legalActions(viewFor(before,0)).find(action => action.t === 'Bloom' && action.cards.join(',') === '6,43,61' && action.hexes.map(coordKey).join('|') === keys.join('|'));
    assert(action?.t === 'Bloom', `${label}: seeded legal Bloom`);
    const choicesToggle = page.locator('#moves > .bloom-toggle');
    if (await choicesToggle.count()) {
      await choicesToggle.click();
      const menu = page.locator('#moves .bloom-options');
      if (await menu.isVisible() && await menu.locator('button').count() > 1) {
        const size = await page.evaluate(() => {
          const panel = document.querySelector<HTMLElement>('#moves .bloom-options')!.getBoundingClientRect();
          const toggle = document.querySelector<HTMLElement>('#moves > .bloom-toggle')!.getBoundingClientRect();
          const box = document.querySelector<HTMLElement>('#test2-box')!.getBoundingClientRect();
          return { width: panel.width, boxWidth: box.width, left: panel.left, toggleLeft: toggle.left };
        });
        check(size.width <= Math.min(280, size.boxWidth * .75) && Math.abs(size.left - size.toggleLeft) <= 50,
          `${label}: multiple Bloom choices open in a compact menu beside their control (${JSON.stringify(size)})`);
        if (width === 390 && height === 664 && !v3) await page.screenshot({ path: `${dir}/390x664-bloom-menu-open.png` });
      }
      await choicesToggle.click();
    }
    if (width === 390 && height === 844) {
      await page.waitForFunction(() => document.documentElement.dataset.test2Waiting === 'true');
      const bloomPulse = await page.evaluate(() => {
        const root = document.documentElement, reduced = root.classList.contains('reduce-motion');
        root.classList.remove('reduce-motion');
        const icon = document.querySelector('#moves > .kind:not(.on) .test2-combination');
        const name = icon ? getComputedStyle(icon).animationName : null;
        root.classList.toggle('reduce-motion', reduced);
        return name;
      });
      check(bloomPulse === 'test2-card-breathe', `${label}: available Bloom cards pulse gently in the cockpit`);
    }
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
    check(await page.locator('#moves .test2-skip').evaluate(button => !!button.querySelector('svg') && !button.textContent?.trim() && button.getAttribute('aria-label')?.startsWith('Skip')),`${label}: Bloom retains an accessible icon-only Skip button`);
    check(await page.locator('#moves .test2-skip').isEnabled(),`${label}: subdued Skip remains usable`);
    equal(await page.locator('#hand .test2-bloom-card').count(),action.cards.length,`${label}: selected Bloom highlights exactly its cards`);
    check(!/Bloom \d+ tiles|Skip sprout/.test(await page.locator('#moves').innerText()),`${label}: Bloom choices use combination icons rather than prose`);
    await page.waitForFunction(() => document.documentElement.classList.contains('test2-idle-ready'));
    equal((await page.locator('#step-cue .cue-text').textContent())?.trim(),'Bloom',`${label}: idle Bloom uses only its short prompt`);
    check(await page.locator('#step-cue').evaluate(el => Number(getComputedStyle(el).opacity)>0),`${label}: idle Bloom remains visible with a combination selected`);
    await controls(page,label+' selected Bloom');
    await evidence(page,`${width}x${height}-bloom-ready`);
    const cockpit = await page.evaluate(() => {
      const box = document.querySelector('#test2-box')!.getBoundingClientRect();
      const kind = document.querySelector('#moves > .kind')!.getBoundingClientRect();
      const piles = document.querySelector('#test2-box > .piles')!.getBoundingClientRect();
      const faces = [...document.querySelectorAll('#test2-box .pile-card')].map(el => el.getBoundingClientRect());
      const actions = document.querySelector('#test2-actions')!.getBoundingClientRect();
      const miniCards = [...document.querySelectorAll('#moves > .kind .test2-mini-card')].map(el=>el.getBoundingClientRect());
      const kindStyle = getComputedStyle(document.querySelector('#moves > .kind')!);
      return { fits: kind.left >= box.left && kind.right <= box.right && kind.top >= box.top && kind.bottom <= box.bottom,
        separated: kind.left >= piles.right && kind.right <= actions.left && faces.every(face => face.right <= kind.left),
        mini: miniCards.every(face=>face.width >= 20 && Math.abs(face.bottom-actions.bottom) <= 12),
        frameFree: kindStyle.borderWidth === '0px' && kindStyle.boxShadow === 'none',
        weak: [...document.querySelectorAll('#board .badge.weak')].some(el => getComputedStyle(el).display !== 'none') };
    });
    check(cockpit.fits && cockpit.separated && cockpit.mini && cockpit.frameFree && !cockpit.weak, `${label}: frameless Bloom combinations sit on the cockpit baseline, clear of piles/tools; no weak-link badges`);
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
      await page.mouse.click(end.x,end.y);
    }
    equal(await state(page),apply(before,action),`${label}: completed valid Bloom immediately commits once`);
    await idle(page);
    check(!await page.locator('#confirm').isVisible() && await page.evaluate(() => !(window as any).__severgrow.pending()),`${label}: completed Bloom has no Confirm or tap-again step`);
    check(await page.locator('#board .tile .mark-line, #board .tile .mark-ink').count() === 0,`${label}: numbered Bloom tiles have no owner icon`);
    await savedMatches(page,label);
    const placed = await state(page);
    const tapped = keys.at(-1)!;
    const reduced = await page.evaluate(()=>document.documentElement.classList.contains('reduce-motion'));
    await page.evaluate(()=>document.documentElement.classList.remove('reduce-motion'));
    await page.evaluate(() => {
      const proto = Element.prototype as Element & { __boinkOriginal?: typeof Element.prototype.animate; __boinkCount?: number };
      proto.__boinkOriginal = proto.animate;
      proto.__boinkCount = 0;
      proto.animate = function(frames, options) {
        if (this.matches(`#board .tile[data-key="${(window as any).__boinkKey}"]`) && typeof options === 'object' && options?.duration === 240)
          proto.__boinkCount!++;
        return proto.__boinkOriginal!.call(this, frames, options);
      };
    });
    await page.evaluate(key => { (window as any).__boinkKey = key; }, tapped);
    await tapHex(page,tapped,touch);
    const bounce = await page.evaluate(() => {
      const proto = Element.prototype as Element & { __boinkOriginal?: typeof Element.prototype.animate; __boinkCount?: number };
      const count = proto.__boinkCount ?? 0;
      if (proto.__boinkOriginal) proto.animate = proto.__boinkOriginal;
      delete proto.__boinkOriginal;
      delete proto.__boinkCount;
      delete (window as any).__boinkKey;
      return count > 0;
    });
    check(bounce,`${label}: occupied tile tap gives a brief boink`);
    check(!await page.locator('#tooltip').isVisible(),`${label}: tapping an occupied tile opens no explanation`);
    equal(await state(page),placed,`${label}: touching a tile changes no game state`);
    await page.waitForFunction(()=>!document.querySelector('#board .test2-boink'),undefined,{timeout:2000});
    equal(await page.locator('#board .test2-boink').count(),0,`${label}: boink returns completely to the original appearance`);
    await page.evaluate(reduced=>document.documentElement.classList.toggle('reduce-motion',reduced),reduced);
    await tapHex(page,tapped,touch);
    check(await page.locator(`#board .tile[data-key="${tapped}"]`).evaluate(el=>!el.getAnimations().some(a=>a.id==='test2-boink')),
      `${label}: reduced motion suppresses the tile boink`);
    const empty = Object.entries(placed.board).find(([key,tile])=>!tile && placed.terrain[key]==='normal')?.[0];
    if (empty) await tapHex(page,empty,touch);
    check(!await page.locator('#tooltip').isVisible(),`${label}: empty tile tap also opens no explanation`);
    equal(await state(page),placed,`${label}: empty tile touch changes no state`);
    if (!touch) {
      await page.locator(`#board .hex-cell[data-key="${tapped}"]`).hover();
      check(!await page.locator('#tooltip').isVisible(),`${label}: hovering opens no explanation`);
      await page.mouse.move(width-4,4);
    }
    await cue(page,'grow',`${label}: after inspection`);
    await page.screenshot({ path: `${dir}/${width}x${height}-bloom${v3 ? '-v3' : ''}.png` });
    await evidence(page,`${width}x${height}-bloom${v3 ? '-v3' : ''}`);
    await undo(page,before,label);
    if (touch) {
      await pick();
      await tapHex(page,keys[0]!,true);
      equal(await state(page),before,`${label}: endpoint shortcut starts without spending cards`);
      check(await page.locator(`#board .target[data-key="${keys.at(-1)!}"]`).count() > 0,
        `${label}: the third Bloom tile is visibly tappable immediately after the first`);
      await tapHex(page,keys.at(-1)!,true);
      equal(await state(page),apply(before,action),`${label}: second endpoint infers and commits a legal Bloom`);
      await undo(page,before,label+' endpoints');
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

async function bloomMenuFit() {
  const game = newGame(5);
  const board = fixture({ tiles: { '0,1': [1,7] } });
  const pool = [...game.hands[0], ...game.hands[1], ...game.deck];
  const faces = [[0,6],[1,6],[2,6],[3,6],[0,3],[0,4],[0,5]] as const;
  const hand = faces.map(([suit,rank]) => {
    const index = pool.findIndex(card => card.suit === suit && card.rank === rank);
    assert(index >= 0, `Bloom menu fixture has ${suit}/${rank}`);
    return pool.splice(index,1)[0]!;
  });
  const positioned: State = { ...game, board: board.board, terrain: board.terrain,
    hands: [hand, pool.slice(0,7)], deck: pool.slice(7), phase: 'ACT', turnPlayer: 0, actor: 0 };
  const page = await browser.newPage({viewport:{width:390,height:664},hasTouch:true,isMobile:true});
  try {
    await page.addInitScript(save => {
      (window as any).__name=(f:unknown)=>f;
      localStorage.setItem('main2:severgrow.save.v7',save);
      localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({coach:false,sound:false,music:false,reduceMotion:true,speed:'skip',autoSkip:false}));
    },positionSave({state:positioned}));
    await page.goto(base); await page.click('#menu-continue'); await idle(page);
    equal(await state(page),positioned,'multiple Bloom choices fixture resumes exactly');
    const toggle = page.locator('#moves > .bloom-toggle');
    check(await toggle.isVisible(),'multiple Bloom choices have a menu control');
    await toggle.click();
    const panel = page.locator('#moves .bloom-options');
    const count = await panel.locator('button').count();
    check(count > 1,`Bloom fixture presents several choices (${count})`);
    const size = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('#moves .bloom-options')!.getBoundingClientRect();
      const toggle = document.querySelector<HTMLElement>('#moves > .bloom-toggle')!.getBoundingClientRect();
      const box = document.querySelector<HTMLElement>('#test2-box')!.getBoundingClientRect();
      return {width:panel.width,boxWidth:box.width,left:panel.left,right:panel.right,toggleLeft:toggle.left};
    });
    check(size.width <= Math.min(280,size.boxWidth*.75) && Math.abs(size.left-size.toggleLeft) <= 50 && size.right <= 390,
      `multiple Bloom choices fit beside their current control (${JSON.stringify(size)})`);
    await page.screenshot({path:`${dir}/390x664-bloom-menu-open.png`});
  } finally { await page.close(); }
}

async function goldFrameVisuals() {
  const game = newGame(5);
  const rich = Object.entries(game.terrain).filter(([,terrain]) => terrain === 'rich').map(([key]) => key);
  assert(rich.includes('0,0'),'gold fixture keeps its centre bonus hex');
  game.board['0,0'] = {owner:0,strength:6};
  const botKey = rich.find(key => key !== '0,0' && !game.board[key]);
  assert(botKey,'gold fixture has another available bonus hex');
  game.board[botKey] = {owner:1,strength:5};
  for (const v3 of [false,true]) for (const [width,height] of [[390,844],[1280,800]] as const) {
    const page = await browser.newPage({viewport:{width,height},hasTouch:width<600,isMobile:width<600});
    try {
      await page.addInitScript(save => {
        (window as any).__name=(f:unknown)=>f;
        localStorage.setItem('main2:severgrow.save.v7',save);
        localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({coach:false,sound:false,music:false,reduceMotion:true,speed:'skip'}));
      },positionSave({state:game}));
      await page.goto(`${base}${v3?'?design=v3':''}`);
      await page.click('#menu-continue'); await idle(page);
      if (v3) await page.waitForFunction(() => {
        const board = document.querySelector('#board');
        return board?.classList.contains('skin-ground-ready') && Number(getComputedStyle(board).opacity) > .98;
      }, undefined, {timeout:30000});
      equal(await state(page),game,`${v3?'V3':'standard'} ${width}: frame art does not change the position`);
      const visual = await page.evaluate(async () => {
        const rich = [...document.querySelectorAll<SVGGElement>('#board .hex-cell.rich')];
        const owned = [...document.querySelectorAll<SVGGElement>('#board .l-rich-frames .gold-frame.occupied')];
        const forest = document.querySelector<SVGGElement>('#board .l-rich-frames .gold-frame.occupied[data-key="0,0"]')!;
        const volcano = owned.find(frame=>frame!==forest)!;
        const art = forest.querySelector<SVGSVGElement>('.gold-frame-art')!;
        const source = document.querySelector<SVGImageElement>('#board .gold-frame image')!.getAttribute('href')!;
        const atlas = new Image(); atlas.src=source; await atlas.decode();
        const empty = document.querySelector<SVGGElement>('#board .l-rich-frames .gold-frame.empty')!;
        const centers = owned.map(frame => {
          const art = frame.querySelector<SVGSVGElement>('.gold-frame-art')!;
          const stone = [...document.querySelectorAll<SVGGElement>('#board .l-tiles .tile')]
            .find(tile=>tile.dataset.key===frame.dataset.key)!.querySelector<SVGGElement>('.seed-stone')!;
          const point = frame.ownerSVGElement!.createSVGPoint();
          point.x = Number(art.getAttribute('x')) + Number(art.getAttribute('width'))/2;
          point.y = Number(art.getAttribute('y')) + Number(art.getAttribute('height'))/2;
          const a = point.matrixTransform(frame.getScreenCTM()!);
          point.x = 0; point.y = 0;
          const b = point.matrixTransform(stone.getScreenCTM()!);
          return Math.hypot(a.x-b.x,a.y-b.y);
        });
        return {rich:rich.length,empty:document.querySelectorAll('#board .l-rich-frames .gold-frame.empty').length,
          hiddenUnderTile:!document.querySelector('#board .l-rich-frames .gold-frame.empty[data-key="0,0"]'),
          owners:owned.length,forest:!!forest,volcano:!!volcano,
          oldMarkers:document.querySelectorAll('#board .gold-crystals, #board .gold-crystal-bed, #board .gold-badge, #board .skin-gold').length,
          contourBelowGold:!!(document.querySelector('#board .l-territory-contour')!.compareDocumentPosition(document.querySelector('#board .l-rich-frames')!)&Node.DOCUMENT_POSITION_FOLLOWING),
          imageReady:atlas.naturalWidth===2172&&atlas.naturalHeight===724,
          frameWidth:Number(art.getAttribute('width')),centers,
          strongerEmptyGlow:getComputedStyle(empty).filter!==getComputedStyle(forest).filter,
          variants:rich.map(cell=>Number(document.querySelector(`#board .l-rich-frames .gold-frame[data-key="${cell.dataset.key}"]`)!.getAttribute('data-variant'))),
          noInterception:owned.every(frame=>getComputedStyle(frame).pointerEvents==='none')};
      });
      check(visual.rich===rich.length && visual.empty===rich.length-2 && visual.hiddenUnderTile && visual.owners===2 &&
        visual.forest && visual.volcano && visual.oldMarkers===0 && visual.noInterception,
        `${v3?'V3':'standard'} ${width}: frames mark empty and both occupied bonus tiles without old markers (${JSON.stringify(visual)})`);
      check(visual.contourBelowGold && visual.imageReady && visual.frameWidth>59 && visual.frameWidth<63 &&
        visual.centers.every(distance=>distance<4) && visual.strongerEmptyGlow &&
        visual.variants.every(variant=>variant>=0 && variant<3),
        `${v3?'V3':'standard'} ${width}: three deterministic rim designs fit the hexes under the stones (${JSON.stringify(visual)})`);
      await page.screenshot({path:`${dir}/${width}x${height}-gold-frame-${v3?'v3':'standard'}.png`});
      await page.reload(); await page.click('#menu-continue'); await idle(page);
      const reloaded = await page.locator('#board .l-rich-frames .gold-frame').evaluateAll(frames=>frames.map(frame=>Number(frame.getAttribute('data-variant'))));
      equal(reloaded,visual.variants,`${v3?'V3':'standard'} ${width}: frame variants survive reload`);
    } finally { await page.close(); }
  }
}

try {
  if (process.env.TEST2_POLISH_ONLY === 'gold') {
    await goldFrameVisuals();
    console.log(`${checks} gold-frame checks passed`);
  } else {
  await drawGlow();
  await bloomMenuFit();
  await goldFrameVisuals();
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
  }
} finally { await browser.close(); server?.httpServer.close(); }
