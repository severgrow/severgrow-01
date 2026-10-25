import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatNotifier } from '../src/chat/notifier.js';
afterEach(() => vi.unstubAllGlobals());
describe('bounded content-free chat delivery', () => {
  it('waits for the Supabase broadcast attempt before the Edge request finishes', async () => {
    let finish!: (r: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((r) => {
          finish = r;
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    let done = false;
    const task = chatNotifier('https://local.supabase.co', 'public-key')!
      .publish('match-id', { revision: 0, status: 'changed' })
      .then(() => {
        done = true;
      });
    await Promise.resolve();
    expect(done).toBe(false);
    const init = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init[1].body))).toEqual({
      messages: [
        {
          topic: 'match-id',
          event: 'chat',
          payload: { revision: 0, status: 'changed' },
        },
      ],
    });
    expect(init[1].signal).toBeInstanceOf(AbortSignal);
    finish(new Response('{}'));
    await task;
    expect(done).toBe(true);
  });
  it('keeps persisted sends successful during a Realtime outage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );
    await expect(
      chatNotifier('https://local.supabase.co', 'public-key')!.publish(
        'match',
        { revision: 0, status: 'changed' },
      ),
    ).resolves.toBeUndefined();
    expect(chatNotifier('', '')).toBeUndefined();
  });
});
