import { describe, expect, it, vi } from 'vitest';
import { mountPlayBackdrop } from '../src/player/play-backdrop.js';
function fixture() {
  let resolve!: () => void;
  const finished = new Promise<void>(r => { resolve = r; });
  const beat = { finished, cancel: vi.fn() };
  const target = { animate: vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => beat) };
  const stop = vi.fn();
  const fade = mountPlayBackdrop(target as unknown as HTMLElement, stop);
  return { fade, target, stop, resolve, beat };
}
describe('PLAY keeps its existing backdrop for one interruptible fade', () => {
  it('fades for 1.5 seconds without delaying controls, then releases the old world', async () => {
    const f = fixture(); f.fade.start(true);
    expect(f.stop).not.toHaveBeenCalled();
    expect(f.fade.active()).toBe(true);
    expect(f.target.animate.mock.calls[0]?.[1]).toMatchObject({ duration: 1500 });
    f.resolve(); await Promise.resolve();
    expect(f.stop).toHaveBeenCalledOnce();
    expect(f.fade.active()).toBe(false);
  });
  it('returning immediately cancels the stale completion; repeated PLAY does not restart', async () => {
    const f = fixture(); f.fade.start(true); f.fade.start(true);
    expect(f.target.animate).toHaveBeenCalledOnce();
    f.fade.cancel(); f.resolve(); await Promise.resolve();
    expect(f.stop).not.toHaveBeenCalled();
    expect(f.beat.cancel).toHaveBeenCalledOnce();
  });
  it('reduced motion releases immediately and allocates no animation', () => {
    const f = fixture(); f.fade.start(false);
    expect(f.target.animate).not.toHaveBeenCalled();
    expect(f.stop).toHaveBeenCalledOnce();
  });
});
