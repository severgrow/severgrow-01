// MOTION COST (Beta 0.8): plays a big Blast, a Bomb, a Huge cut and a Bloom in Chromium with the CPU
// slowed 4x (a mid-range phone) and reports the frame gaps and long tasks the feel harness saw while
// each played. A MEASURING TOOL, not a gate: compare before/after a change (see docs/HANDOFF-0.8.md,
// "Frame cost" — Beta 0.8 measured the same stalls on the build before the pass).
//   CHANNEL=futa04 npm run web:build && node --import tsx web/e2e/motion-cost.ts
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { allNeighbors, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Player, State } from '../../src/engine/index.js';
import { positionSave } from './position.js';
import {writeFileSync} from 'node:fs';
import { cutPosition } from './cut-positions.js';
import { resumeSavedGame } from './helpers/menu-nav.js';

const port = 4239;
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });

const blastFixture = (): { state: State; blast: Action; bomb: Action; bloom: Action | undefined } => {
  const base = newGame(3107);
  const target = { q: -1, r: 2 };
  const board = { ...base.board, [coordKey(target)]: { owner: 1 as Player, strength: 9 } };
  for (const nb of allNeighbors(target)) {
    if (board[coordKey(nb)] === null) board[coordKey(nb)] = { owner: 1 as Player, strength: 4 };
    for (const n2 of allNeighbors(nb)) if (board[coordKey(n2)] === null) board[coordKey(n2)] = { owner: 1 as Player, strength: 2 };
  }
  const state: State = { ...base, phase: 'ACT', actor: 0, turnPlayer: 0, board,
    hands: [[{ id: 1000, suit: null, rank: 0 }, { id: 1001, suit: null, rank: 0 }, ...base.hands[0].slice(0, 5)] as Card[], base.hands[1]] };
  const legal = legalActions(viewFor(state, 0));
  return { state, blast: legal.find((a) => a.t === 'MegaBomb' && coordKey(a.target) === coordKey(target))!, bomb: legal.find((a) => a.t === 'PlayFruit')!, bloom: undefined };
};
const bloomFixture = (): { state: State; bloom: Action } => {
  const start = newGame(11);
  const terrain = { ...start.terrain };
  for (const key of Object.keys(terrain)) terrain[key] = 'normal';
  const c = (id: number, suit: Card['suit'], rank: number): Card => ({ id, suit, rank });
  const state: State = { ...start, terrain, phase: 'ACT', actor: 0, turnPlayer: 0, hands: [[c(900, 0, 1), c(901, 0, 2), c(902, 0, 3), c(903, 0, 4), c(910, 1, 5)], start.hands[1]] };
  return { state, bloom: legalActions(viewFor(state, 0)).filter((a) => a.t === 'Bloom').sort((a, b) => (b as { cards: number[] }).cards.length - (a as { cards: number[] }).cards.length)[0]! };
};

const measure = async (name: string, state: State, action: Action) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.addInitScript((save) => {
    (window as any).__name = (fn: unknown) => fn;
    localStorage.setItem('main2:severgrow.save.v7', save);
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, autoSkip: false, reduceMotion: false, speed: 'normal', vibration: false }));
  }, positionSave({ state }));
  await page.goto(`http://localhost:${port}/`);
  await resumeSavedGame(page);
  await page.waitForFunction(() => document.querySelectorAll('#board .hex-cell').length > 0);
  await page.waitForTimeout(1500);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Performance.enable');
  const metricsBefore=await cdp.send('Performance.getMetrics');
  if(process.env.MOTION_PROFILE){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
  const r = await page.evaluate(async (a) => {
    const g = (window as any).__severgrow;
    g.clearRenderCosts();
    const gaps: number[] = [];
    let last = performance.now();
    let on = true;
    const tick = (t: number) => { gaps.push(t - last); last = t; if (on) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const t0 = performance.now();
    g.playFor(a, 0);
    while (g.busy() || performance.now() - t0 < 200) await new Promise((res) => setTimeout(res, 50));
    on = false;
    const f = g.feel();
    gaps.sort((x, y) => x - y);
    const rc = g.renderCosts ? g.renderCosts() : null;
    return { rc: rc ? JSON.stringify(rc).slice(0, 300) : null, lt: f.longTasks.recent.slice(-6).map((x: { ms: number }) => Math.round(x.ms)), ms: Math.round(performance.now() - t0), p95: Math.round(gaps[Math.floor(gaps.length * 0.95)]!), max: Math.round(gaps.at(-1)!), frames: gaps.length, longMax: Math.round(f.longTasks.max ?? 0) };
  }, action);
  const metricsAfter=await cdp.send('Performance.getMetrics');
  if(process.env.MOTION_PROFILE){const profile=await cdp.send('Profiler.stop');writeFileSync(`/tmp/motion-${name.replace(/ /g,'-')}.json`,JSON.stringify(profile));}
  const work=Object.fromEntries(['LayoutDuration','RecalcStyleDuration','ScriptDuration','TaskDuration'].map(key=>[key,Math.round(1000*((metricsAfter.metrics.find(m=>m.name===key)?.value??0)-(metricsBefore.metrics.find(m=>m.name===key)?.value??0)))]));
  Object.assign(r,{work});
  console.log(`${name.padEnd(8)} ${JSON.stringify(r)}`);
  await page.close();
  return r;
};

try {
  const b = blastFixture();
  const results = [
    await measure('blast', b.state, b.blast),
    await measure('bomb', b.state, b.bomb),
    await measure('huge cut', cutPosition(9, false).state, cutPosition(9, false).action),
    await measure('bloom', bloomFixture().state, bloomFixture().bloom),
  ];
  assert(results.every((r) => r.frames > 0), 'every move was measured');
  console.log('motion-cost: measured (report only)');
} finally {
  await browser.close();
  await server.close();
}
