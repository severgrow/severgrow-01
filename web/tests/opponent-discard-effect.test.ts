import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardView } from '../src/ui/board.js';
import { createEffects } from '../src/ui/effects.js';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const fixture = (motion = 1) => {
  vi.useFakeTimers();
  const flyers: any[] = [];
  const rect = (x: number, y: number) => ({ left: x, top: y, width: 48, height: 68 });
  let finish!: () => void, cancel!: () => void;
  let frames: Keyframe[] = [];
  const finished = new Promise<void>((resolve, reject) => { finish = resolve; cancel = () => reject(new Error('cancelled')); });
  const layer = { getBoundingClientRect: () => rect(0, 0), querySelectorAll: () => flyers.filter(f => f.isConnected),
    appendChild: (el: any) => { el.isConnected = true; flyers.push(el); } };
  vi.stubGlobal('document', { getElementById: () => layer, createElement: () => ({
    style: {}, isConnected: false, setAttribute() {}, innerHTML: '',
    remove() { this.isConnected = false; },
    animate(f: Keyframe[]) { frames = f; return { finished }; },
  }) });
  const fx = createEffects({} as BoardView, () => 1, () => motion);
  const landed = vi.fn();
  const duration = fx.oppThrow({ id: 4, suit: 0, rank: 3 },
    { getBoundingClientRect: () => rect(300, 60) } as HTMLElement,
    { getBoundingClientRect: () => rect(30, 600) } as Element, 1, false, landed);
  return { frames, duration, landed, finish, cancel, flyers };
};
// OWNER CHANGED THE RULE (2026-11-10): "the card that just flew to the discard pile should cover
// the prev card as it lands". The flight used to FADE on the pile while the pile still showed the old
// card (the fade began ~25% before the clock-timed swap, because the easing runs over the whole
// flight), so the old card showed through. Now the card never fades: it sits on the pile, fully
// visible, and on that frame the pile becomes it and the flyer goes.
describe('shared opponent discard effect (offline and online)', () => {
  it('starts visible, flies to a precise upright seat and stays fully visible to the end', async () => {
    const f = fixture();
    expect(f.frames[0]!.opacity).toBe(1);
    expect(f.duration).toBeLessThan(400);
    expect(String(f.frames.at(-1)!.transform)).toContain('translate(-270.0px, 540.0px)');
    expect(f.frames.every((k) => k.opacity === undefined || k.opacity === 1)).toBe(true);
  });
  it('the pile becomes the card and the flyer goes in the same moment, when it is seated', async () => {
    const f = fixture();
    await vi.advanceTimersByTimeAsync(f.duration * 2);
    expect(f.landed).not.toHaveBeenCalled(); // never on a clock: only when the card is seated
    expect(f.flyers[0].isConnected).toBe(true);
    f.finish(); await vi.advanceTimersByTimeAsync(0);
    expect(f.landed).toHaveBeenCalledTimes(1);
    expect(f.flyers[0].isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels the landing callback when an interrupted match removes its flyer', async () => {
    const f = fixture(); f.flyers[0].remove(); f.cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.landed).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('reduced motion: no travel and no spin; the card appears on the pile and stays until it is the pile', () => {
    const f = fixture(0);
    expect(new Set(f.frames.map(k => k.transform)).size).toBe(2);
    expect(f.frames.some(k => String(k.transform).includes('rotate'))).toBe(false);
    expect(f.frames.at(-1)!.opacity).toBe(1);
    f.cancel();
  });
});
