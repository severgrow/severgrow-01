import { expect, it, vi } from 'vitest';
import { WorldView } from '../src/online/world-view.js';

it('warms identity-scoped chat even when the public world is still loading', () => {
  const view: any = Object.create(WorldView.prototype);
  const prefetch = vi.fn();
  Object.assign(view, {
    active: false, chat: { prefetch }, releaseCrop: vi.fn(),
    openPlanet: vi.fn(),
  });
  const identity = { playerId: 'me', token: 'token', kind: 'guest' };
  (view as WorldView).preview(null, identity as any);
  expect(view.identity).toBe(identity);
  expect(prefetch).toHaveBeenCalledOnce();
});
