import { expect, it, vi } from 'vitest';
import { TerritoryChat } from '../src/online/territory-chat.js';

it('does not leave chat saying Connecting forever when guest identity is unavailable', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('document', { hidden: false });
  try {
    const status = { textContent: 'Connecting…' };
    const view: any = Object.create(TerritoryChat.prototype);
    Object.assign(view, {
      open: true, busy: false, generation: 0, failures: 0, noTokenPolls: 0,
      token: () => null, status,
    });
    await view.poll();
    expect(status.textContent).toBe('Connecting…');
    await vi.advanceTimersByTimeAsync(4_000);
    expect(status.textContent).toBe('Chat is not reachable right now.');
    view.cancelPoll();
  } finally {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
