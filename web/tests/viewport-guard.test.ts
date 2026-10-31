// THE VIEWPORT GUARD (owner, 2026-10-31): after iOS's keyboard closes, the page is put back at its
// origin — unless the player is still typing.
import { describe, expect, it } from 'vitest';
import { settleViewport } from '../src/ui/viewport-guard.js';

const fakeWindow = (active: { matches: (s: string) => boolean; isContentEditable?: boolean } | null, x = 0, y = 56) => {
  const calls: [number, number][] = [];
  const root = { scrollLeft: x, scrollTop: y };
  const win = {
    scrollX: x,
    scrollY: y,
    scrollTo: (a: number, b: number) => calls.push([a, b]),
    document: { activeElement: active, scrollingElement: root, documentElement: root, body: { scrollLeft: 0, scrollTop: 0 } },
  } as unknown as Window;
  return { win, calls, root };
};
const button = { matches: () => false };
const input = { matches: (s: string) => s.includes('input') };

describe('settleViewport', () => {
  it('puts a shifted page back at its origin when nothing is being typed into', () => {
    const { win, calls, root } = fakeWindow(button, 18, 56);
    settleViewport(win);
    expect(calls).toEqual([[0, 0]]);
    expect(root).toEqual({ scrollLeft: 0, scrollTop: 0 });
  });
  it('leaves the page alone while a text box still has focus (the keyboard is up)', () => {
    const { win, calls, root } = fakeWindow(input, 0, 56);
    settleViewport(win);
    expect(calls).toEqual([]);
    expect(root.scrollTop).toBe(56);
  });
  it('does nothing when the page is already at its origin', () => {
    const { win, calls } = fakeWindow(null, 0, 0);
    settleViewport(win);
    expect(calls).toEqual([]);
  });
});
