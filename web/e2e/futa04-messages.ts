// Observe 20 complete Classic games in the actual Futa04 browser renderer.
// Real UI actions cover Draw, Sprout/Fruit placement, Throw and phase controls.
// Complex Bloom placements use the existing test session hook; counts are reported.
// Build CHANNEL=futa04 first. PW_CHROMIUM=/usr/bin/chromium node --import tsx web/e2e/futa04-messages.ts
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { legalActions, viewFor, apply, coordKey } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { chooseLevelAction, botSeed } from '../../src/bots/levels.js';

const count = Number(process.env.MESSAGE_GAMES ?? 20);
const startIndex = Number(process.env.MESSAGE_START ?? 0);
const tag = process.env.MESSAGE_TAG ?? 'messages';
const dir = `/tmp/futa04-${tag}`;
mkdirSync(dir, { recursive: true });
const port = Number(process.env.MESSAGE_PORT ?? 4196);
const base = process.env.FUTA04_URL ?? `http://localhost:${port}/`;
const server = process.env.FUTA04_URL ? null : await preview({ configFile: 'web/vite.config.ts', build: { outDir: process.env.FUTA04_DIST ?? 'dist' }, preview: { port, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'], ...(process.env.FUTA04_URL && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) });
const presets = [[360,640],[390,664],[390,844],[1280,800],[1440,900]] as const;
const read = (p: Page) => p.evaluate(() => (window as any).__severgrow.state() as State);
const idle = (p: Page) => p.waitForFunction(() => { const h = (window as any).__severgrow, s = h?.state(); return s && !h.busy() && (s.actor === 0 || s.phase === 'GAME_OVER'); }, undefined, { timeout: 40000 });
type Game = { index: number; seed: number; viewport: string; look: string; large: boolean; winner: unknown; actions: number; uiActions: number; hookActions: number; failures: string[]; observations: any[]; historyActions: number; screenshots: string[] };
const games: Game[] = [];
const perform = async (p: Page, a: Action, before: State, game: Game) => {
  const initial = before.history?.length ?? 0;
  const changed = async () => { const now = await read(p); return now.history!.length !== initial || now.phase !== before.phase || now.actor !== before.actor || now.turnNumber !== before.turnNumber; };
  try {
    if (a.t === 'Bloom') throw new Error('complex Bloom: session playback');
    if (a.t === 'Draw') await p.locator(a.from === 'deck' ? '#deck' : '#discard').click({ timeout: 1800 });
    else if (a.t === 'Discard') {
      await p.locator(`#hand [data-card="${a.card}"]`).click({ timeout: 1800 });
      if (!await changed() && await p.locator('#confirm-play').isVisible()) await p.locator('#confirm-play').click({ timeout: 1800 });
    } else if (a.t === 'Sprout' || a.t === 'PlayFruit') {
      await p.locator(`#hand [data-card="${a.card}"]`).click({ timeout: 1800 });
      if (!await changed()) {
        const key = coordKey(a.t === 'Sprout' ? a.coord : a.target);
        const target = p.locator(`#board .hex-cell[data-key="${key}"]`);
        await target.click({ timeout: 1800 });
        if (!await changed()) await target.click({ timeout: 1800 });
        if (!await changed() && await p.locator('#confirm-play').isVisible()) await p.locator('#confirm-play').click({ timeout: 1800 });
      }
    } else if (a.t === 'EndAct') {
      await p.keyboard.press('Escape');
      const end = p.locator('#moves .end, #moves .empty-continue').first();
      await end.click({ timeout: 1800 });
    } else if (a.t === 'Continue' || a.t === 'Knock') {
      await p.locator('#moves').getByRole('button', { name: a.t === 'Continue' ? 'End turn' : 'Knock', exact: true }).click({ timeout: 1800 });
    } else if (a.t === 'RotPick') {
      await p.locator(`#board .hex-cell[data-key="${coordKey(a.coord)}"]`).click({ timeout: 1800 });
      if (!await changed() && await p.locator('#confirm-play').isVisible()) await p.locator('#confirm-play').click({ timeout: 1800 });
    }
    if (!await changed()) throw new Error(`${a.t}: UI did not advance`);
    game.uiActions++;
  } catch (e) {
    if (await changed()) { game.uiActions++; return; }
    if (a.t !== 'Bloom') {
      game.failures.push(`${a.t} #${initial}: ${String(e).split('\n')[0]}`);
      if (game.failures.length <= 3) {
        const shot = `${dir}/game-${game.index}-blocked-${game.failures.length}.png`;
        await p.screenshot({ path: shot }); game.screenshots.push(shot);
      }
    }
    const played = await p.evaluate(a => (window as any).__severgrow.playFor(a, 0), a);
    assert(played, `game ${game.index}: legal ${a.t} rejected`);
    game.hookActions++;
  }
};

async function run(index: number) {
  const [w,h] = presets[index % presets.length]!;
  const seed = index === 0 ? 219682080 : 1009 + index * 7919;
  const large = index % 5 === 1;
  // Futasaku 0.4 ships the default skin; the V3 skin is a localhost-only art preview
  // (main.ts V3_MODE). Alternate games used to run as "V3"; every game now runs on the default
  // look that a player actually sees, which is what this observation suite is about.
  const g: Game = { index,seed,viewport:`${w}x${h}`,look:'default',large,winner:null,actions:0,uiActions:0,hookActions:0,failures:[],observations:[],historyActions:0,screenshots:[] };
  const p = await browser.newPage({ viewport:{width:w,height:h},isMobile:w<600,hasTouch:w<600,ignoreHTTPSErrors:!!process.env.FUTA04_URL });
  const errors: string[] = []; p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(({large,level}) => {
    (window as any).__name = (f: unknown) => f;
    localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({sound:false,music:false,coach:true,speed:'skip',reduceMotion:true,autoSkip:false,confirmPolicy:'always',largeText:large,level}));
    // DOM sampling catches transient turn banners and opponent captions between actions.
    (window as any).__messageSamples = [];
    let previous = '';
    setInterval(() => {
      const ids = ['step-cue','turn-pill','futa04-notice-slot','futa04-help-button','coach','first-tip','hint','draw-info','root-warn','confirm'];
      const visible = ids.flatMap(id => {
        const el = document.getElementById(id); if(!el) return [];
        const r = el.getBoundingClientRect(), s = getComputedStyle(el);
        if(el.hidden || !r.width || !r.height || s.display==='none' || s.visibility==='hidden' || Number(s.opacity)<.05 || !el.textContent?.trim()) return [];
        return [{id,text:el.textContent.trim().replace(/\s+/g,' ').slice(0,260),rect:{x:r.x,y:r.y,width:r.width,height:r.height},opacity:s.opacity,pointer:s.pointerEvents,overflow:el.scrollWidth>el.clientWidth+2||el.scrollHeight>el.clientHeight+2}];
      });
      const signature = JSON.stringify({ visible, phase:(window as any).__severgrow?.state()?.phase, actor:(window as any).__severgrow?.state()?.actor }); if(signature===previous)return; previous=signature;
      const conflicts:string[]=[];
      const intersect=(a:any,b:any)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
      for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++)if(intersect(visible[i]!.rect,visible[j]!.rect) && !document.getElementById(visible[i]!.id)?.contains(document.getElementById(visible[j]!.id)))conflicts.push(`${visible[i]!.id}/${visible[j]!.id}`);
      const actionHits=[...document.querySelectorAll('#board .target,#hand .card,#deck,#discard,#moves button')].flatMap(el=>{
        const r=el.getBoundingClientRect();if(!r.width||!r.height||getComputedStyle(el).display==='none')return[];
        const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        const blocker=hit?.closest('#coach,#first-tip,#turn-pill,#step-cue,#captions,#banner');
        return blocker?[{target:el.getAttribute('data-key')??el.getAttribute('data-card')??el.id,blocker:blocker.id}]:[];
      });
      (window as any).__messageSamples.push({ms:Math.round(performance.now()),phase:(window as any).__severgrow?.state()?.phase,actor:(window as any).__severgrow?.state()?.actor,busy:(window as any).__severgrow?.busy(),visible,conflicts,actionHits});
      if((window as any).__messageSamples.length>20000)(window as any).__messageSamples.shift();
    },120);
  },{large,level:1+(index%4)});
  try {
    await p.goto(`${base}?seed=${seed}`); await idle(p); await p.waitForTimeout(350);
    for(let n=0;n<650;n++) {
      await idle(p); const before=await read(p); if(before.phase==='GAME_OVER')break;
      const legal=legalActions(viewFor(before,0)); assert(legal.length,'no human legal actions');
      let a:Action;
      if(before.phase==='ACT') {
        // Tactics come from the same pure bot used by game/coach; browser still executes each move.
        a=chooseLevelAction(viewFor(before,0),3,botSeed(seed,3,before.turnNumber,before.history?.length??0));
      } else a=legal.find(a=>a.t==='Knock')??legal.find(a=>a.t==='Draw'&&a.from==='deck')??legal[0]!;
      const expect=apply(before,a); assert(expect!==before,'engine action unchanged');
      if(n===0||n===1||n===5||n===15||n===40||n===80) {
        const shot=`${dir}/game-${index}-action-${n}-${before.phase.toLowerCase()}.png`;
        await p.screenshot({path:shot});g.screenshots.push(shot);
      }
      await perform(p,a,before,g);g.actions++;
      if(n%10===0)console.log(`game ${index} ${g.look} ${g.viewport} action ${n} turn ${before.turnNumber} ${a.t}`);
    }
    await idle(p);const final=await read(p);assert(final.phase==='GAME_OVER',`game ${index} exceeded action budget`);
    g.winner=final.result;g.historyActions=final.history?.length??0;
    await p.waitForTimeout(800);g.observations=await p.evaluate(()=>(window as any).__messageSamples);
    if(errors.length)g.failures.push(...errors.map(e=>'pageerror: '+e));
    const shot=`${dir}/game-${index}-complete.png`;await p.screenshot({path:shot});g.screenshots.push(shot);
    writeFileSync(`${dir}/game-${index}.json`,JSON.stringify(g,null,2));games.push(g);
    console.log(`COMPLETE ${index}: ${g.actions} human actions (${g.uiActions} UI/${g.hookActions} assisted), ${g.historyActions} engine actions, ${g.observations.length} observed frames, ${g.failures.length} UI issues`);
  } finally {await p.close();}
}
try {
  // Four independent browser games preserve separate saves and exercise actual rendering.
  let next=0;await Promise.all(Array.from({length:Math.min(4,count)},async()=>{while(next<count){const i=next++;await run(i + startIndex);}}));
  games.sort((a,b)=>a.index-b.index);
  const report={games:games.length,humanActions:games.reduce((n,g)=>n+g.actions,0),uiActions:games.reduce((n,g)=>n+g.uiActions,0),hookActions:games.reduce((n,g)=>n+g.hookActions,0),engineActions:games.reduce((n,g)=>n+g.historyActions,0),sampleFrames:games.reduce((n,g)=>n+g.observations.length,0),issues:games.flatMap(g=>g.failures.map(issue=>({game:g.index,issue}))),perGame:games.map(({observations,...g})=>({...g,observedFrames:observations.length,conflictFrames:observations.filter(s=>s.conflicts.length).length,blockedFrames:observations.filter(s=>s.actionHits.length).length,overflowFrames:observations.filter(s=>s.visible.some((v:any)=>v.overflow)).length}))};
  writeFileSync(`${dir}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  assert(games.length===count,'all requested games completed');
} finally {await browser.close();server?.httpServer.close();}
