import { describe, expect, it, vi } from 'vitest';
import { createChatController } from '../src/online/chat/controller.js';
import type { DuelClient } from '../../server/src/client.js';
import type { ChatMessage, ChatResult } from '../../server/src/chat/types.js';
import type { MatchDriverSnapshot, MatchChannel } from '../src/online/types.js';
const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
const msg = (sequence: number, mine = false): ChatMessage => ({
  id: `message-${sequence}`,
  requestId: `request-${sequence}`,
  sequence,
  mine,
  createdAt: Date.now(),
  text: `Message ${sequence}`,
  phrase: null,
});
const page = (
  messages: ChatMessage[] = [],
  extras: Partial<ChatResult> = {},
): ChatResult => ({
  messages,
  hasMore: false,
  canSend: true,
  turnRevision: 0,
  muted: false,
  blocked: false,
  blockedByMe: false,
  ...extras,
});
const setup = () => {
  let current = {
    status: 'active',
    serverPhase: 'DRAW',
    view: { actor: 1 },
    seat: 0,
    turnStartRevision: 0,
    connection: 'online',
    remainingMs: 100000,
  } as MatchDriverSnapshot;
  let handlers: Parameters<MatchChannel['subscribe']>[1] | undefined;
  const unsubscribe = vi.fn();
  const channel: MatchChannel = {
    subscribe: vi.fn((_id, h) => {
      handlers = h;
      return unsubscribe;
    }),
  };
  const client = {
    chatHistory: vi.fn<DuelClient['chatHistory']>(async () => page()),
    chatSend: vi.fn<DuelClient['chatSend']>(async () =>
      page([msg(1, true)], { sent: msg(1, true) }),
    ),
    chatAction: vi.fn<DuelClient['chatAction']>(async () => page()),
  };
  const onChange = vi.fn();
  const ctl = createChatController({
    client,
    token: 'private-token',
    matchId: 'match-1',
    channel,
    snapshot: () => current,
    onChange,
  });
  return {
    ctl,
    client,
    channel,
    unsubscribe,
    onChange,
    handlers: () => handlers,
    turn: (actor: number, revision: number) => {
      current = {
        ...current,
        view: { ...current.view, actor: actor as 0 | 1 },
        turnStartRevision: revision,
      };
      ctl.turnChanged();
    },
  };
};
describe('match chat lifecycle', () => {
  it('disables on your turn immediately, preserves draft, enables on the next authoritative epoch', async () => {
    const x = setup();
    x.ctl.start();
    await tick();
    expect(x.ctl.state().canSend).toBe(true);
    x.ctl.draft('Still thinking');
    x.turn(0, 1);
    expect(x.ctl.state().canSend).toBe(false);
    expect(x.ctl.state().draft).toBe('Still thinking');
    await x.ctl.send();
    expect(x.client.chatSend).not.toHaveBeenCalled();
    x.client.chatHistory.mockResolvedValue(page([], { turnRevision: 2 }));
    x.turn(1, 2);
    await tick();
    expect(x.ctl.state().canSend).toBe(true);
    x.ctl.stop();
  });
  it('retains a stable ID and draft after a lost response, prevents rapid duplicate clicks', async () => {
    const x = setup();
    x.ctl.start();
    await tick();
    x.ctl.draft('Hello');
    let reject!: (e: unknown) => void;
    x.client.chatSend.mockImplementationOnce(
      () =>
        new Promise((_resolve, r) => {
          reject = r;
        }),
    );
    const pending = x.ctl.send();
    await x.ctl.send();
    expect(x.client.chatSend).toHaveBeenCalledTimes(1);
    reject(new Error('Offline'));
    await pending;
    await tick();
    expect(x.ctl.state().outgoing?.state).toBe('failed');
    expect(x.ctl.state().draft).toBe('Hello');
    const id = x.ctl.state().outgoing?.requestId;
    await x.ctl.send();
    expect(x.client.chatSend.mock.calls[1]?.[3]).toBe(id);
    expect(x.ctl.state().draft).toBe('');
    expect(x.ctl.state().outgoing).toBeNull();
    x.ctl.stop();
  });
  it('deduplicates simultaneous delivery, counts only unseen incoming messages, suppresses muted previews', async () => {
    const x = setup();
    x.ctl.start();
    await tick();
    x.client.chatHistory.mockResolvedValue(page([msg(1), msg(2, true)]));
    x.handlers()?.onChat?.();
    x.handlers()?.onChat?.();
    await tick();
    expect(x.ctl.state().messages).toHaveLength(2);
    expect(x.ctl.state().unread).toBe(1);
    expect(x.ctl.state().preview?.id).toBe('message-1');
    x.client.chatHistory.mockResolvedValue(
      page([msg(1), msg(2, true), msg(3)], { muted: true }),
    );
    await x.ctl.refresh();
    expect(x.ctl.state().preview).toBeNull();
    x.ctl.setOpen(true);
    expect(x.ctl.state().unread).toBe(0);
    x.ctl.stop();
  });
  it('restores missed history on reconnect without constant polling', async () => {
    const x = setup();
    x.ctl.start();
    await tick();
    expect(x.client.chatHistory).toHaveBeenCalledTimes(1);
    x.client.chatHistory.mockResolvedValue(page([msg(4)]));
    x.handlers()?.onReconnect?.();
    await tick();
    expect(x.ctl.state().messages[0]?.sequence).toBe(4);
    x.ctl.stop();
  });
  it('aborts pending work and removes subscriptions on rapid match switching', async () => {
    const x = setup();
    let resolve!: (r: ChatResult) => void;
    x.client.chatHistory.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    x.ctl.start();
    x.ctl.stop();
    resolve(page([msg(100)]));
    await tick();
    expect(x.ctl.state().messages).toHaveLength(0);
    expect(x.unsubscribe).toHaveBeenCalledOnce();
    expect(x.onChange).toHaveBeenCalledTimes(1);
    expect(x.client.chatHistory.mock.calls[0]?.[3]?.aborted).toBe(true);
  });
  it('does not enable a composer based on a stale history response', async () => {
    const x = setup();
    let resolve!: (r: ChatResult) => void;
    x.client.chatHistory.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    x.ctl.start();
    x.turn(0, 1);
    resolve(page());
    await tick();
    expect(x.ctl.state().canSend).toBe(false);
    x.ctl.stop();
  });
  it('keeps messages and drafts separate from game state and bounds history memory', async () => {
    const x = setup();
    x.ctl.start();
    await tick();
    for (let i = 0; i < 6; i++) {
      x.client.chatHistory.mockResolvedValue(
        page(Array.from({ length: 40 }, (_, n) => msg(i * 40 + n + 1))),
      );
      await x.ctl.refresh();
    }
    expect(x.ctl.state().messages).toHaveLength(160);
    expect(x.ctl.state().messages.at(-1)?.sequence).toBe(240);
    expect(x.ctl.state().hasOlder).toBe(true);
    x.ctl.stop();
  });
});

import { chatReadCursor } from '../src/online/chat/read-cursor.js';
describe('device-private chat unread memory', () => {
  it('survives reopening, separates seats/matches, bounds storage and tolerates unavailable storage', () => {
    const data = new Map<string, string>();
    const store = {
      get: (k: string) => data.get(k) ?? null,
      set: (k: string, v: string) => {
        data.set(k, v);
      },
      remove: (k: string) => {
        data.delete(k);
      },
    };
    const read = chatReadCursor(store, 'match', 0);
    read.save(42);
    expect(read.load()).toBe(42);
    expect(chatReadCursor(store, 'match', 1).load()).toBe(0);
    for (let n = 0; n < 70; n++) chatReadCursor(store, `other-${n}`, 0).save(n);
    expect(JSON.parse([...data.values()][0]!).length).toBe(50);
    expect(chatReadCursor(null, 'match', 0).load()).toBe(0);
    expect([...data.values()][0]).not.toContain('token');
  });
});

describe('bounded history navigation', () => {
  it('pages backwards and returns to latest without skipping or duplicating the cached gap', async () => {
    const x = setup();
    x.client.chatHistory.mockResolvedValueOnce(
      page(
        Array.from({ length: 40 }, (_, n) => msg(n + 161)),
        { hasMore: true },
      ),
    );
    x.ctl.start();
    await tick();
    expect(x.client.chatHistory).toHaveBeenCalledTimes(1);
    expect(x.ctl.state().hasOlder).toBe(true);
    x.client.chatHistory.mockResolvedValue(
      page(
        Array.from({ length: 40 }, (_, n) => msg(n + 121)),
        { hasMore: true },
      ),
    );
    await x.ctl.older();
    expect(x.ctl.state().messages[0]?.sequence).toBe(121);
    x.client.chatHistory.mockResolvedValue(
      page(
        Array.from({ length: 40 }, (_, n) => msg(n + 81)),
        { hasMore: true },
      ),
    );
    await x.ctl.older();
    x.client.chatHistory.mockResolvedValue(
      page(
        Array.from({ length: 40 }, (_, n) => msg(n + 41)),
        { hasMore: true },
      ),
    );
    await x.ctl.older();
    x.client.chatHistory.mockResolvedValue(
      page(
        Array.from({ length: 40 }, (_, n) => msg(n + 1)),
        { hasMore: false },
      ),
    );
    await x.ctl.older();
    expect(x.ctl.state().messages).toHaveLength(160);
    expect(x.ctl.state().hasNewer).toBe(true);
    x.client.chatHistory.mockResolvedValue(
      page(
        Array.from({ length: 40 }, (_, n) => msg(n + 161)),
        { hasMore: true },
      ),
    );
    await x.ctl.latest();
    expect(x.ctl.state().messages.at(-1)?.sequence).toBe(200);
    expect(x.ctl.state().hasNewer).toBe(false);
    x.ctl.stop();
  });
});
