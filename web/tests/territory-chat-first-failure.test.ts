import { expect, it, vi } from 'vitest';
import { TerritoryChat } from '../src/online/territory-chat.js';
import { ONLINE } from '../../src/strings.js';

it('replaces a cold loading indicator with a truthful failure on the first failed read', async () => {
  const oldDocument = globalThis.document;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: false } });
  try {
    const chat: any = Object.create(TerritoryChat.prototype);
    Object.assign(chat, {
      open: true, busy: false, generation: 0, failures: 0,
      token: () => 'player',
      feed: { read: async () => { throw Error('offline'); }, snapshot: () => ({ loaded: false }) },
      say: vi.fn(),
    });
    await chat.poll();
    expect(chat.say).toHaveBeenCalledWith(ONLINE.worldChatOffline);
    chat.cancelPoll();
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: oldDocument });
  }
});

// Owner, 2026-11-18 (incognito desktop: "chat didn't load"): after that first failed read the open
// panel tried again only after 8 s, then 16, 32 and 60. While NOTHING has loaded, an open panel
// asks again every 2 s; once a page is on screen, the gentle back-off is kept for blips.
it('an open chat with nothing loaded asks again at 2 s, not after a growing back-off', async () => {
  vi.useFakeTimers();
  const oldDocument = globalThis.document;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: false } });
  try {
    let reads = 0;
    const chat: any = Object.create(TerritoryChat.prototype);
    Object.assign(chat, {
      open: true, busy: false, generation: 0, failures: 0, timer: null,
      token: () => 'player',
      feed: { read: async () => { reads++; throw Error('silent'); }, snapshot: () => ({ loaded: false }) },
      say: vi.fn(),
    });
    await chat.poll();
    for (let i = 0; i < 4; i++) await vi.advanceTimersByTimeAsync(2_000);
    expect(reads).toBe(5);
    chat.cancelPoll();
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: oldDocument });
    vi.useRealTimers();
  }
});
