// THE BOARD'S PICTURES WAIT FOR THE MENU (2026-11-16 release pass).
//
// The 0.86 board (Forest & Ash, the painted ground, gold frames) asks for ~1 MB of pictures. They were
// requested the moment the board module loaded, i.e. while the menu was still assembling, in
// parallel with the menu's own files. Measured at a 9 Mbps / 85 ms phone link, 4x CPU: time to menu
// 3.4 s on the live build, 3.85 s on 0.86. The card faces already wait for the app's
// `severor-ready` (player/cards.ts, warmCardArtWhenReady); the board's pictures now follow that same
// rule, and anything that needs them sooner (a game or replay being drawn) starts them at once.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = () => void;
let requested: string[] = [];
let idle: Listener[] = [];
let timers: Listener[] = [];
let listeners: Record<string, Listener[]> = {};
let decodes: (() => void)[] = [];

class FakeImage {
  decoding = 'auto';
  addEventListener() { /* errors are not exercised here */ }
  set src(url: string) { requested.push(url); }
  decode() { return new Promise<void>((resolve) => decodes.push(resolve)); }
}

const fakeWindow = {
  addEventListener: (type: string, fn: Listener) => { (listeners[type] ??= []).push(fn); },
  requestIdleCallback: (fn: Listener) => { idle.push(fn); return idle.length; },
  setTimeout: (fn: Listener) => { timers.push(fn); return timers.length; },
};

const load = async () => {
  vi.resetModules();
  return import('../src/ui/defaultArtBoard.js');
};
const fire = (type: string) => { for (const fn of listeners[type] ?? []) fn(); };
const runIdle = () => { const due = idle; idle = []; for (const fn of due) fn(); };
const settledFlag = (p: Promise<unknown>) => { const s = { done: false }; void p.then(() => { s.done = true; }); return s; };
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  requested = []; idle = []; timers = []; listeners = {}; decodes = [];
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('window', fakeWindow);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('the board pictures are not on the menu\'s path', () => {
  it('loading the board module asks for no picture', async () => {
    await load();
    expect(requested).toEqual([]);
  });

  it('they start once the app is ready and the page is idle', async () => {
    const mod = await load();
    fire('severor-ready');
    expect(requested, 'not inside the ready event itself').toEqual([]);
    runIdle();
    expect(requested).toContain(mod.BOARD_GROUND);
    expect(requested.length).toBeGreaterThan(10);
  });

  it('a safety timer starts them when the app never reports ready', async () => {
    await load();
    expect(timers.length).toBeGreaterThan(0);
    for (const fn of timers) fn();
    runIdle();
    expect(requested.length).toBeGreaterThan(10);
  });

  it('a board being drawn starts them at once, and only once', async () => {
    const mod = await load();
    mod.preloadBoardArt();
    const first = requested.length;
    expect(first).toBeGreaterThan(10);
    mod.preloadBoardArt();
    fire('severor-ready'); runIdle();
    expect(requested.length, 'no second request for any picture').toBe(first);
    expect(new Set(requested).size).toBe(requested.length);
  });

  it('boardArtReady still means decoded: it waits for the pictures, not for the module', async () => {
    const mod = await load();
    const ready = settledFlag(mod.boardArtReady);
    await tick();
    expect(ready.done, 'nothing has been asked for yet').toBe(false);
    mod.preloadBoardArt();
    await tick();
    expect(ready.done, 'asked for, not decoded').toBe(false);
    for (const resolve of decodes) resolve();
    await tick(); await tick();
    expect(ready.done).toBe(true);
  });
});
