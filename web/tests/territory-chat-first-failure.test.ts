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
