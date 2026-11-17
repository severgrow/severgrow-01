// The installed desktop app opens as a companion column (owner, 2026-11-17). See logic/app-window.ts.
import { describe, expect, it } from 'vitest';
import { APP_WINDOW_KEY, appWindowPlan, openAsCompanionWindow } from '../src/logic/companion-window.js';

const laptop = { availLeft: 0, availTop: 25, availWidth: 1440, availHeight: 875 };
const base = { standalone: true, finePointer: true, screen: laptop, offered: false };

describe('the companion window', () => {
  it('a portrait column at the right edge, nearly the full height, leaving most of the screen free', () => {
    const p = appWindowPlan(base)!;
    expect(p.h).toBeGreaterThan(p.w * 1.5);
    expect(p.x + p.w).toBe(laptop.availWidth - 24);
    expect(p.y).toBeGreaterThanOrEqual(laptop.availTop);
    expect(p.y + p.h).toBeLessThanOrEqual(laptop.availTop + laptop.availHeight);
    expect(laptop.availWidth - p.w).toBeGreaterThan(laptop.availWidth * 0.6);
  });
  it('never on a browser tab, a touch screen, a small screen, or a second launch', () => {
    expect(appWindowPlan({ ...base, standalone: false })).toBeNull();
    expect(appWindowPlan({ ...base, finePointer: false })).toBeNull();
    expect(appWindowPlan({ ...base, screen: { ...laptop, availWidth: 900 } })).toBeNull();
    expect(appWindowPlan({ ...base, offered: true })).toBeNull();
  });
  it('a tall 4K screen still gets a column, not a wall', () => {
    const p = appWindowPlan({ ...base, screen: { availLeft: 0, availTop: 0, availWidth: 3840, availHeight: 2120 } })!;
    expect(p.h).toBeLessThanOrEqual(1000);
    expect(p.w).toBeLessThanOrEqual(540);
  });
  it('applies once: resizes, moves, remembers', () => {
    const kv = new Map<string, string>();
    const store = { get: (k: string) => kv.get(k) ?? null, set: (k: string, v: string) => { kv.set(k, v); } };
    const calls: string[] = [];
    const win = {
      matchMedia: (q: string) => ({ matches: q.includes('standalone') || q.includes('fine') }),
      screen: laptop,
      resizeTo: (w: number, h: number) => calls.push(`resize ${w}x${h}`),
      moveTo: (x: number, y: number) => calls.push(`move ${x},${y}`),
    } as unknown as Window;
    openAsCompanionWindow(store, win);
    openAsCompanionWindow(store, win);
    expect(calls.length).toBe(2);
    expect(kv.get(APP_WINDOW_KEY)).toBe('1');
  });
});
