// The server decision, the storage rule and the routes — the three places a notification can go
// wrong. "Who gets it, once" is proven here against a fake sender, so no network is involved.
import { readFileSync } from 'node:fs';
import type { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { memoryPushStore } from '../src/push/memory.js';
import { createPushService } from '../src/push/service.js';
import { createPushRouter } from '../src/push/router.js';
import { createFetchApp } from '../src/fetch-app.js';
import { PUSH_DISABLED, pushConfigFromEnv, pushHealth, validVapidPair, type PushConfig } from '../src/push/config.js';
import type { PushSendResult, PushSender, PushTarget, PushPayload } from '../src/push/types.js';
import type { MatchListRow, PlayerRecord } from '../src/storage/types.js';

type CryptoKeyPair = webcrypto.CryptoKeyPair;

const H = 60 * 60 * 1000;
const AT = 1_000 * H;

const player = (id: string, name: string | null = id): PlayerRecord => ({
  id,
  kind: 'guest',
  displayName: name,
  createdAt: 0,
  upgradedAt: null,
});

const playerA = player('p-a', 'RYK');
const playerB = player('p-b', 'LIDWINGO');

const b64u = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};
const keys = () => {
  const p256dh = new Uint8Array(65);
  p256dh[0] = 0x04;
  for (let i = 1; i < 65; i++) p256dh[i] = i;
  const auth = new Uint8Array(16).fill(7);
  return { p256dh: b64u(p256dh), auth: b64u(auth) };
};

const endpointFor = (who: string): string => `https://push.example.test/send/${who}`;

const matchRow = (over: Record<string, unknown> = {}): MatchListRow => ({
  match: {
    id: 'm1',
    status: 'active',
    revision: 9,
    turnStartRevision: 7,
    turnDeadlineAt: AT + 20 * H,
    liveManaged: false,
    state: { turnPlayer: 1 },
    turnStartState: null,
    ...over,
  },
  mySeat: 0,
  lastSeenAt: 0,
  opponentId: 'p-b',
  opponentName: 'LIDWINGO',
}) as unknown as MatchListRow;

const recordingSender = () => {
  const sent: { target: PushTarget; payload: PushPayload }[] = [];
  let result: PushSendResult = { ok: true };
  const sender: PushSender = {
    async send(target, payload) {
      sent.push({ target, payload });
      return result;
    },
  };
  return {
    sender,
    sent,
    failWith(next: PushSendResult) { result = next; },
  };
};

const setup = (options: {
  rows?: MatchListRow[];
  challenges?: { incoming: unknown[]; outgoing: unknown[] };
  config?: Partial<PushConfig>;
  sender?: PushSender;
} = {}) => {
  const store = memoryPushStore();
  const recorder = recordingSender();
  const config: PushConfig = { ...PUSH_DISABLED, enabled: true, publicKey: 'pub', privateKey: 'priv', ...options.config };
  const source = {
    matchesOf: async () => options.rows ?? [matchRow()],
    challengesOf: async () => ({ incoming: [], outgoing: [], ...(options.challenges ?? {}) }),
  };
  const push = createPushService({
    config,
    store,
    sender: options.sender ?? recorder.sender,
    source: source as never,
    now: () => AT,
  });
  return { push, store, recorder, config };
};

const subscribe = async (push: ReturnType<typeof setup>['push'], who: PlayerRecord, endpoint = endpointFor(who.id)) =>
  push.subscribe(who, { endpoint, ...keys() }, AT);

describe('push: who is told, once', () => {
  it('a turn notification goes to the opponent, and a repeated nudge sends nothing', async () => {
    const { push, recorder } = setup();
    await subscribe(push, playerB);
    expect((await push.nudge(playerA)).sent).toBe(1);
    expect(recorder.sent).toHaveLength(1);
    expect(recorder.sent[0]!.target.endpoint).toBe(endpointFor('p-b'));
    expect(recorder.sent[0]!.payload.body).toContain('RYK');
    // Same turn, many polls/tabs: the ledger answers.
    expect((await push.nudge(playerA)).sent).toBe(0);
    expect(recorder.sent).toHaveLength(1);
  });

  it('never claims an event nobody could receive (a later subscription still gets it)', async () => {
    const { push, recorder } = setup();
    expect((await push.nudge(playerA)).sent).toBe(0);
    expect(recorder.sent).toHaveLength(0);
    await subscribe(push, playerB);
    expect((await push.nudge(playerA)).sent).toBe(1);
  });

  it('a subscription belongs to ONE account: the same browser re-pointed stops hearing the old one', async () => {
    const { push, store } = setup();
    const endpoint = 'https://push.example.test/send/shared-phone';
    await subscribe(push, playerA, endpoint);
    await subscribe(push, playerB, endpoint);
    expect(await store.countForPlayer('p-a')).toBe(0);
    expect(await store.countForPlayer('p-b')).toBe(1);
    expect(store.peek(endpoint)?.playerId).toBe('p-b');
  });

  it('says nothing when the caller is the one to act, and nothing for a finished match', async () => {
    const { push, recorder } = setup({ rows: [matchRow({ state: { turnPlayer: 0 } })] });
    await subscribe(push, playerB);
    expect((await push.nudge(playerA)).sent).toBe(0);
    expect((await push.nudge(playerA)).sent).toBe(0);
    expect(recorder.sent).toHaveLength(0);
  });

  it('a failing sender is a counter, never an error, and is not retried for the same event', async () => {
    const { push, recorder } = setup();
    recorder.failWith({ ok: false });
    await subscribe(push, playerB);
    await expect(push.nudge(playerA)).resolves.toEqual({ sent: 0 });
    recorder.failWith({ ok: true });
    expect((await push.nudge(playerA)).sent).toBe(0); // already claimed: at most once
  });

  it('a 410 removes the dead device and stops trying it', async () => {
    const { push, store, recorder } = setup();
    recorder.failWith({ ok: false, gone: true });
    await subscribe(push, playerB);
    await push.nudge(playerA);
    expect(await store.countForPlayer('p-b')).toBe(0);
  });

  it('the dark configuration sends nothing and never touches the sender', async () => {
    const { push, recorder } = setup({ config: { enabled: false } });
    await expect(subscribe(push, playerB)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await push.nudge(playerA)).toEqual({ sent: 0 });
    expect(await push.dispatch()).toEqual({ due: 0, sent: 0 });
    expect(recorder.sent).toHaveLength(0);
  });
});

describe('push: challenges', () => {
  const challenge = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    cellId: '3,4',
    status: 'pending',
    challengerId: 'p-a',
    defenderId: 'p-b',
    challengerName: 'RYK',
    defenderName: 'LIDWINGO',
    expiresAt: AT + 40 * H,
    matchId: null,
    ...over,
  });

  it('the challenger\'s nudge tells the defender once, with the window as a duration', async () => {
    const { push, recorder } = setup({ rows: [], challenges: { incoming: [], outgoing: [challenge()] } });
    await subscribe(push, playerB);
    expect((await push.nudge(playerA)).sent).toBe(1);
    expect(recorder.sent[0]!.payload.body).toContain('40h');
    expect((await push.nudge(playerA)).sent).toBe(0);
  });

  it('the defender\'s acceptance tells the challenger, and nobody else', async () => {
    const accepted = challenge({ status: 'accepted', matchId: 'm9' });
    const { push, recorder } = setup({ rows: [], challenges: { incoming: [accepted], outgoing: [] } });
    await subscribe(push, playerA);
    expect((await push.nudge(playerB)).sent).toBe(1);
    expect(recorder.sent[0]!.target.endpoint).toBe(endpointFor('p-a'));
    expect(recorder.sent[0]!.payload.body).toContain('accepted');
    expect((await push.nudge(playerB)).sent).toBe(0);
  });

  it('the reminder sweep sends the 12 h and 1 h nudges once each, and ignores a closed window', async () => {
    const { push, store, recorder } = setup({ rows: [] });
    store.seedChallenges([
      { id: 'due12', cellId: '0,0', challengerId: 'p-a', defenderId: 'p-b', challengerName: 'RYK', expiresAt: AT + 11 * H },
      { id: 'later', cellId: '0,1', challengerId: 'p-a', defenderId: 'p-b', challengerName: 'RYK', expiresAt: AT + 30 * H },
      { id: 'closed', cellId: '0,2', challengerId: 'p-a', defenderId: 'p-b', challengerName: 'RYK', expiresAt: AT - 1 },
    ]);
    await subscribe(push, playerB);
    expect(await push.dispatch()).toEqual({ due: 1, sent: 1 });
    expect(recorder.sent[0]!.payload.title).toContain('12 hours');
    expect((await push.dispatch()).sent).toBe(0); // same event, same ledger
    // An hour before the SAME challenge closes, the urgent reminder is a different event.
    const urgent = setup({ rows: [] });
    urgent.store.seedChallenges([
      { id: 'c1', cellId: '0,0', challengerId: 'p-a', defenderId: 'p-b', challengerName: 'RYK', expiresAt: AT + 30 * 60 * 1000 },
    ]);
    await subscribe(urgent.push, playerB);
    expect((await urgent.push.dispatch()).sent).toBe(1);
    expect(urgent.recorder.sent[0]!.payload.title).toContain('One hour');
  });
});

describe('push: subscription storage is identity-scoped and validates its input', () => {
  it('refuses an http, localhost, private or single-label endpoint', async () => {
    const { push } = setup();
    for (const endpoint of [
      'http://push.example.test/x',
      'https://localhost/x',
      'https://127.0.0.1/x',
      'https://10.0.0.5/x',
      'https://intranet/x',
      'not a url',
    ]) {
      await expect(subscribe(push, playerA, endpoint)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    }
  });

  it('refuses keys that are not a 65-byte P-256 point and a 16-byte secret', async () => {
    const { push } = setup();
    for (const bad of [
      { endpoint: endpointFor('p-a'), p256dh: 'AAAA', auth: keys().auth },
      { endpoint: endpointFor('p-a'), p256dh: keys().p256dh, auth: 'AAAA' },
    ]) {
      await expect(push.subscribe(playerA, bad, AT)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    }
  });

  it('unsubscribe only removes the caller\'s own row', async () => {
    const { push, store } = setup();
    const endpoint = endpointFor('p-a');
    await subscribe(push, playerA, endpoint);
    expect(await push.unsubscribe(playerB, endpoint)).toBe(false);
    expect(await store.countForPlayer('p-a')).toBe(1);
    expect(await push.unsubscribe(playerA, endpoint)).toBe(true);
    expect(await store.countForPlayer('p-a')).toBe(0);
  });
});

describe('push routes', () => {
  const routerFor = (options: { enabled?: boolean; token?: string | null } = {}) => {
    const { push } = setup({ config: { enabled: options.enabled ?? true } });
    const router = createPushRouter({
      push,
      authenticate: async () => playerA,
      limit: async () => undefined,
      dispatchToken: options.token === undefined ? 'sweep-token' : options.token,
      nudgePerPlayerPerHour: 180,
      dispatchPerIpPerHour: 240,
    });
    return { push, router };
  };
  const call = (router: ReturnType<typeof createPushRouter>, method: string, path: string, headers: Record<string, string> = {}) =>
    router(new Request(`http://local${path}`, { method, headers }), path);

  it('a dark feature owns no routes at all', async () => {
    const { router } = routerFor({ enabled: false });
    expect(await call(router, 'GET', '/v1/push/status')).toBeNull();
    expect(await call(router, 'POST', '/v1/push/nudge')).toBeNull();
  });

  it('status and nudge are authenticated player routes', async () => {
    const { router } = routerFor();
    const status = await call(router, 'GET', '/v1/push/status', { authorization: 'Bearer t' });
    expect(status).toEqual({ status: 200, body: { ok: true, subscribed: 0 } });
    const nudge = await call(router, 'POST', '/v1/push/nudge', { authorization: 'Bearer t' });
    expect(nudge).toEqual({ status: 200, body: { ok: true, sent: 0 } });
    expect(await call(router, 'GET', '/v1/other')).toBeNull();
  });

  it('the reminder sweep exists only with a token, and only for that caller', async () => {
    const noToken = routerFor({ token: null }).router;
    expect(await call(noToken, 'POST', '/v1/push/dispatch')).toBeNull();
    const { router } = routerFor();
    await expect(call(router, 'POST', '/v1/push/dispatch')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(call(router, 'POST', '/v1/push/dispatch', { 'x-futasaku-push': 'wrong' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(await call(router, 'POST', '/v1/push/dispatch', { 'x-futasaku-push': 'sweep-token' })).toEqual({
      status: 200,
      body: { ok: true, due: 0, sent: 0 },
    });
  });
});

describe('the one switch stays dark unless it is fully and correctly configured', () => {
  const vapidPair = async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey) as { d?: string };
    return { publicKey: b64u(publicRaw), privateKey: String(jwk.d) };
  };

  it('is off with no environment, with PUSH_ENABLED alone, and with the switch explicitly off', async () => {
    const pair = await vapidPair();
    const envOf = (values: Record<string, string>) => (name: string) => values[name];
    expect(pushConfigFromEnv(envOf({})).enabled).toBe(false);
    expect(pushConfigFromEnv(envOf({ PUSH_ENABLED: '1' })).enabled).toBe(false);
    expect(pushConfigFromEnv(envOf({ PUSH_ENABLED: '0', VAPID_PUBLIC_KEY: pair.publicKey, VAPID_PRIVATE_KEY: pair.privateKey })).enabled).toBe(false);
    expect(pushHealth(pushConfigFromEnv(envOf({ PUSH_ENABLED: '1' })))).toBeNull();
  });

  it('is on with the switch and a real pair, and advertises only the public key', async () => {
    const pair = await vapidPair();
    const config = pushConfigFromEnv((name) => ({
      PUSH_ENABLED: '1',
      VAPID_PUBLIC_KEY: pair.publicKey,
      VAPID_PRIVATE_KEY: pair.privateKey,
      VAPID_SUBJECT: 'mailto:owner@example.test',
    })[name]);
    expect(config.enabled).toBe(true);
    expect(pushHealth(config)).toEqual({ enabled: true, publicKey: pair.publicKey });
    // The private key is never part of the public block, and a truncated pair turns it off.
    expect(JSON.stringify(pushHealth(config))).not.toContain(pair.privateKey);
    expect(validVapidPair(pair.publicKey, pair.privateKey.slice(0, -1))).toBe(false);
    expect(validVapidPair('AAAA', pair.privateKey)).toBe(false);
  });
});

describe('/v1/health is how a page knows the feature exists', () => {
  const service = { assertClientVersion: () => undefined, serverNow: () => 1, rulesVersion: 'test' } as never;
  const health = async (deps: { push?: { enabled: true; publicKey: string } }) => {
    const app = createFetchApp({ service, ...deps });
    const res = await app(new Request('http://local/v1/health'));
    return (await res.json()) as { push?: unknown; features?: string[] };
  };

  it('carries the public key while on, and no block at all while dark', async () => {
    expect((await health({ push: { enabled: true, publicKey: 'PUBLIC' } })).push).toEqual({ enabled: true, publicKey: 'PUBLIC' });
    expect((await health({})).push).toBeUndefined();
  });
});

describe('migration 0031', () => {
  const sql = readFileSync(new URL('../migrations/0031_push_notifications.sql', import.meta.url), 'utf8');
  const flat = sql.replace(/\s+/g, ' ').toLowerCase();

  it('creates both tables, RLS on each, and no client-role grant', () => {
    for (const table of ['push_subscriptions', 'push_sends']) {
      expect(flat).toContain(`create table if not exists ${table}`);
      expect(flat).toContain(`alter table ${table} enable row level security`);
      expect(flat).toContain(`revoke all on ${table} from anon`);
      expect(flat).toContain(`revoke all on ${table} from authenticated`);
    }
    expect(flat).not.toContain('create policy');
  });

  it('one endpoint, one owner; one dedupe key, one send', () => {
    expect(flat).toContain('primary key (endpoint)');
    expect(flat).toContain('primary key (player_id, dedupe_key)');
  });
});
