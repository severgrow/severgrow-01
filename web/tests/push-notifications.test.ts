// The CLIENT's absent/denied paths. Every browser API is optional here, and the turn must never
// depend on any of them: these tests fake the absent platform, a denied permission and a broken
// subscribe, and require one quiet failure instead of an exception.
import { describe, expect, it } from 'vitest';
import {
  disablePush,
  enablePush,
  pushFlagApplies,
  pushSupport,
  subscriptionBody,
  type PushPlatform,
} from '../src/online/push-notifications';
import { createPushNudger } from '../src/online/push-nudge';

const platform = (over: Partial<PushPlatform> = {}): PushPlatform => ({
  notification: true,
  serviceWorker: true,
  pushManager: true,
  secure: true,
  permission: 'default',
  ios: false,
  standalone: false,
  ...over,
});

const subscription = (endpoint = 'https://push.example.test/a') => ({
  endpoint,
  toJSON: () => ({ endpoint, keys: { p256dh: 'pub', auth: 'auth' } }),
});

describe('push support is honest about what this browser can do', () => {
  it('is supported only with all four APIs on a secure page and permission not denied', () => {
    expect(pushSupport(platform())).toBe('supported');
    expect(pushSupport(platform({ notification: false }))).toBe('unsupported');
    expect(pushSupport(platform({ serviceWorker: false }))).toBe('unsupported');
    expect(pushSupport(platform({ pushManager: false }))).toBe('unsupported');
    expect(pushSupport(platform({ secure: false }))).toBe('unsupported');
  });

  it('asks an iPhone to install first, and names a denied permission as denied', () => {
    expect(pushSupport(platform({ ios: true }))).toBe('install-first');
    expect(pushSupport(platform({ ios: true, standalone: true }))).toBe('supported');
    expect(pushSupport(platform({ permission: 'denied' }))).toBe('denied');
  });
});

describe('the opt-in belongs to the identity that made it', () => {
  it('a different account on the same phone reads it as OFF (and drops the device)', () => {
    expect(pushFlagApplies(null, 'a')).toBe(false);
    expect(pushFlagApplies('a', 'a')).toBe(true);
    expect(pushFlagApplies('a', 'b')).toBe(false);
    expect(pushFlagApplies('a', null)).toBe(false);
    expect(pushFlagApplies('1', 'b')).toBe(true); // a legacy boolean flag is adopted once
  });
});

describe('the subscription body', () => {
  it('carries exactly the endpoint and the two keys', () => {
    expect(subscriptionBody(subscription())).toEqual({
      endpoint: 'https://push.example.test/a',
      keys: { p256dh: 'pub', auth: 'auth' },
    });
  });

  it('refuses a browser response without usable keys, and never throws', () => {
    expect(subscriptionBody({ endpoint: 'x', toJSON: () => ({ endpoint: 'x' }) })).toBeNull();
    expect(subscriptionBody({ endpoint: 'x', toJSON: () => { throw new Error('nope'); } })).toBeNull();
  });
});

describe('enabling is all-or-nothing', () => {
  const deps = (over: Record<string, unknown> = {}) => ({
    requestPermission: async () => 'granted' as NotificationPermission,
    ensureIdentity: async () => ({ ok: true as const, token: 'tok' }),
    pushConfig: async () => ({ enabled: true, publicKey: 'B'.repeat(87) }), // decodes to 65 bytes
    registration: async () => ({
      pushManager: {
        getSubscription: async () => null,
        subscribe: async () => subscription(),
      },
    }),
    subscribeServer: async () => 1,
    setFlag: () => undefined,
    ...over,
  });

  it('a denied permission never subscribes and never writes the flag', async () => {
    let flag: boolean | null = null;
    const result = await enablePush(deps({
      requestPermission: async () => 'denied',
      setFlag: (on: boolean) => { flag = on; },
      subscribeServer: async () => { throw new Error('must not be called'); },
    }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('blocked');
    expect(flag).toBeNull();
  });

  it('a dark or older server leaves the switch off', async () => {
    const result = await enablePush(deps({ pushConfig: async () => ({ enabled: false, publicKey: null }) }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('not available');
  });

  it('a broken subscribe or server call is one calm failure, not an exception', async () => {
    const broken = await enablePush(deps({
      registration: async () => ({ pushManager: { getSubscription: async () => null, subscribe: async () => { throw new Error('denied'); } } }),
    }));
    expect(broken.ok).toBe(false);
    const refused = await enablePush(deps({ subscribeServer: async () => { throw new Error('401'); } }));
    expect(refused.ok).toBe(false);
  });

  it('success writes the flag only after the server accepted the endpoint', async () => {
    const order: string[] = [];
    const result = await enablePush(deps({
      subscribeServer: async () => { order.push('server'); return 1; },
      setFlag: (on: boolean) => { order.push(`flag:${on}`); },
    }));
    expect(result.ok).toBe(true);
    expect(order).toEqual(['server', 'flag:true']);
  });
});

describe('disabling always turns the device off locally', () => {
  it('removes the server row, unsubscribes, and clears the flag even when the server call fails', async () => {
    const calls: string[] = [];
    await disablePush({
      registration: async () => ({
        pushManager: {
          getSubscription: async () => ({ ...subscription(), unsubscribe: async () => { calls.push('browser'); return true; } }),
          subscribe: async () => subscription(),
        },
      }),
      unsubscribeServer: async () => { calls.push('server'); throw new Error('offline'); },
      token: () => 'tok',
      setFlag: (on) => { calls.push(`flag:${on}`); },
    });
    expect(calls).toEqual(['server', 'browser', 'flag:false']);
  });
});

describe('the nudge is cheap and never stacks', () => {
  it('sends at most once per gap and swallows a rejection', async () => {
    let now = 0;
    const calls: number[] = [];
    const nudger = createPushNudger({
      now: () => now,
      gapMs: 20_000,
      send: async () => { calls.push(now); throw new Error('offline'); },
    });
    nudger.nudge();
    nudger.nudge();
    expect(calls).toHaveLength(1);
    await new Promise((done) => setTimeout(done, 0)); // the first send settles
    now = 20_001;
    nudger.nudge();
    expect(calls).toHaveLength(2);
  });
});
