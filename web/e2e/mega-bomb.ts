import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { allNeighbors, coordKey, newGame } from '../../src/engine/index.js';
import type { Player, State } from '../../src/engine/index.js';
import { positionSave } from './position.js';
import { hexCenter } from './drawing.js';

const base = newGame(3107);
const target = {q:-1,r:2};
const blastBoard={...base.board,[coordKey(target)]:{owner:1 as Player,strength:9}};
for(const neighbor of allNeighbors(target))if(blastBoard[coordKey(neighbor)]===null)blastBoard[coordKey(neighbor)]={owner:1,strength:4};
const state: State = { ...base, phase:'ACT', board:blastBoard,
  hands:[[{id:1000,suit:null,rank:0},{id:1001,suit:null,rank:0},{id:1002,suit:0,rank:3}],base.hands[1]] };
const server = await preview({configFile:'web/vite.config.ts',preview:{port:4199,strictPort:true},logLevel:'silent'});
const browser = await chromium.launch({executablePath:process.env.PW_CHROMIUM ?? '/usr/bin/chromium',args:['--no-sandbox']});
try {
  // Futasaku 0.4 ships the default skin only; the V3 skin is a localhost-only art preview
  // (main.ts V3_MODE) and is not part of what a player runs. The former third iteration ran
  // this same flow under ?skin-preview=v3; it is skipped rather than wired to a look users
  // cannot select. The flow below is unchanged and runs on the default skin.
  for (const [width,height] of [[390,844],[1280,800]] as const) {
    const game: State = width < 600 ? state : { ...state,hands:[[...state.hands[0],
      {id:1400,suit:0,rank:4},{id:1401,suit:1,rank:4},{id:1402,suit:2,rank:4}],state.hands[1]] };
    const page = await browser.newPage({viewport:{width,height},isMobile:width<600,hasTouch:width<600});
    const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(saved=>{
      (window as any).__name=(f:unknown)=>f;
      localStorage.setItem('main2:severgrow.save.v7',saved);
      localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({sound:false,music:false,speed:'skip',reduceMotion:true,coach:false}));
    },positionSave({state:game}));
    await page.goto('http://localhost:4199/');
    await page.click('#menu-continue');
    await page.waitForFunction(() => !(window as any).__severgrow.busy());
    assert(await page.locator('#board').evaluate(board => {
      const svg = board.tagName.toLowerCase()==='svg' ? board : board.querySelector('svg');
      const layers = [...svg?.children ?? []];
      const contour = board.querySelector('.l-territory-contour');
      const gold = board.querySelector('.l-rich-frames');
      return !!contour && !!gold && layers.indexOf(contour) < layers.indexOf(gold) &&
        !!contour.querySelector('.territory-contour.p0') && !!contour.querySelector('.territory-contour.p1');
    }),'both home networks have a shared contour beneath the gold frames');
    await page.locator('#hand [data-card="1000"]').click();
    assert((await page.locator('#board .target.kind-fruit').count())>0,'a tapped Bomb remains the existing single-card action');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#smart-bloom-button .futa04-mini-card').count(),width<600 ? 2 : 3);
    await page.click('#smart-bloom-button');
    if (width >= 600) {
      assert((await page.locator('#smart-bloom-selector button').count())>=2);
      await page.locator('#smart-bloom-selector button[aria-label^="Mega Bomb"]').click();
    }
    assert.equal(await page.evaluate(() => (window as any).__severgrow.pending()),null);
    const centre=await hexCenter(page,coordKey(target));
    await page.mouse.move(centre.x,centre.y);
    await page.waitForFunction(() => document.querySelectorAll('#board .blast-affected').length>0);
    assert.equal(await page.locator('#board .blast-affected').count(),5,'hover previews the five other enemy tiles affected by this blast');
    await page.mouse.click(centre.x,centre.y);
    assert.equal(await page.locator('#board .blast-affected').count(),5,'blast footprint remains visible while confirmation is pending');
    await page.mouse.click(centre.x,centre.y);
    await page.waitForFunction(() => (window as any).__severgrow.state().board['-1,2'] === null);
    const after=await page.evaluate(() => (window as any).__severgrow.state() as State);
    await page.waitForFunction(() => document.querySelectorAll('#board .last-round-art').length >= 6);
    const faded = await page.locator('#board .last-round-art').evaluateAll(nodes=>nodes.every(node=>
      node.getAttribute('opacity')==='0.2' &&
      !node.querySelector('.seed-stone') &&
      !(window as any).__severgrow.state().board[node.getAttribute('data-key')||'']));
    assert(faded,'removed enemy tiles show their former artwork faintly only on empty hexes');
    if (width<600) await page.screenshot({path:'/tmp/futasaku-default-last-round.png'});
    assert.deepEqual(after.hands[0].map(c=>c.id),game.hands[0].filter(c=>c.id!==1000&&c.id!==1001).map(c=>c.id));
    assert.deepEqual(after.lastResolution?.megaBomb?.cards,[1000,1001]);
    assert.equal(errors.length,0,errors.join(' | '));
    await page.close();
  }
  process.stdout.write('Mega Bomb cockpit targeting works on mobile and desktop.\n');
} finally { await browser.close(); await server.httpServer.close(); }
