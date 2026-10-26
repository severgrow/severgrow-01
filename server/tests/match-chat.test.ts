import { createLiveRuntime } from '../src/live/runtime.js';
import { MemoryLiveStore } from '../src/live/memory.js';
import { postgresLiveStore } from '../src/live/postgres.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { Pool } from 'pg';
import { MemoryStorage } from '../src/storage/memory.js';
import { postgresStorage, type PgPool } from '../src/storage/postgres.js';
import { MatchService } from '../src/service.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { memoryChatStore } from '../src/chat/memory.js';
import { postgresChatStore } from '../src/chat/postgres.js';
import { createChatRouter } from '../src/chat/router.js';
import { createFetchApp } from '../src/fetch-app.js';
import { MemoryFeedbackStore } from '../src/feedback/feedback.js';
import { DuelClient, type FetchLike } from '../src/client.js';
import { RecordingBroadcaster } from '../src/broadcast.js';
import { newId } from '../src/ids.js';
import { assertSendAllowed, contentFrom } from '../src/chat/rules.js';
import type { ChatStore } from '../src/chat/types.js';
import type { Storage } from '../src/storage/types.js';

const localUrl = process.env.CHAT_TEST_DATABASE_URL;
if (
  localUrl &&
  !['localhost', '127.0.0.1'].includes(new URL(localUrl).hostname)
)
  throw new Error(
    'Chat tests require an isolated LOCAL database, never production.',
  );
let pool: Pool | undefined;
beforeAll(async () => {
  if (!localUrl) return;
  pool = new Pool({ connectionString: localUrl, max: 8 });
  await pool.query(
    "do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;",
  );
  const dir = new URL('../migrations/', import.meta.url);
  // Supabase-only outbound keepalive extensions are deliberately not installed locally.
  for (const f of readdirSync(dir)
    .sort()
    .filter((f) => f.endsWith('.sql') && !/^000[57]_/.test(f)))
    await pool.query(readFileSync(new URL(f, dir), 'utf8'));
});
afterAll(async () => {
  await pool?.end();
});

for (const adapter of ['memory', ...(localUrl ? ['postgres'] : [])])
  describe(`${adapter}: authenticated match chat`, () => {
    const setup = async () => {
      let now = Date.now();
      const storage: Storage =
        adapter === 'memory'
          ? new MemoryStorage()
          : postgresStorage(pool as unknown as PgPool);
      const feedback = new MemoryFeedbackStore();
      const chat: ChatStore =
        adapter === 'memory'
          ? memoryChatStore(storage as MemoryStorage, feedback)
          : postgresChatStore(pool as unknown as PgPool);
      const service = new MatchService({
        storage,
        now: () => now,
        config: {
          ...DEFAULT_SERVER_CONFIG,
          maxOpenMatchesPerPlayer: 100,
          rateLimits: {
            ...DEFAULT_SERVER_CONFIG.rateLimits,
            guestPerIpPerHour: 10000,
            createPerIpPerHour: 10000,
          },
        },
      });
      const notifier = new RecordingBroadcaster();
      const app = createFetchApp({
        service,
        live: createChatRouter({ store: chat, service, storage, notifier }),
      });
      const fetcher: FetchLike = async (url, init) =>
        app(new Request(url, init));
      const client = new DuelClient({
        baseUrl: 'http://local',
        fetch: fetcher,
        storage: null,
      });
      const a = await service.createGuest(),
        b = await service.createGuest(),
        third = await service.createGuest();
      const pa = await service.authenticate(a.token),
        pb = await service.authenticate(b.token);
      const m = await service.createMatch(pa);
      await service.joinMatch(pb, m.match.inviteCode);
      const id = m.match.matchId;
      const match = (await storage.matchById(id))!;
      const actor = match.state.actor === 0 ? a : b;
      const waiting = match.state.actor === 0 ? b : a;
      const send = (
        token = waiting.token,
        text = 'Hello',
        requestId = newId(),
        turnRevision = match.turnStartRevision,
      ) =>
        client.chatSend(
          token,
          id,
          { text, phrase: null },
          requestId,
          turnRevision,
        );
      const nextTurn = async () => {
        const player = await service.authenticate(actor.token);
        for (let n = 0; n < 5; n++) {
          const view = await service.viewPayload(player, id);
          if (view.actor !== view.seat) return;
          const action =
            view.legalActions.find((a) => a.t === 'Draw') ??
            view.legalActions.find((a) => a.t === 'EndAct') ??
            view.legalActions.find((a) => a.t === 'Discard');
          if (!action) throw new Error('No turn-ending action');
          await service.submitAction(player, id, {
            action,
            expectedRevision: view.revision,
            requestId: newId(),
          });
        }
      };
      return {
        storage,
        chat,
        service,
        feedback,
        client,
        a,
        b,
        third,
        actor,
        waiting,
        id,
        match,
        send,
        notifier,
        app,
        nextTurn,
        now: () => now,
        advance: (ms: number) => {
          now += ms;
        },
      };
    };
    it('refuses every request without a bearer, and keeps the chat and replay routes separate', async () => {
      const x = await setup();
      const url = (sub: string) => `http://local/v1/matches/${x.id}/${sub}`;
      // 1. Unauthenticated: no Authorization header at all is refused on both verbs.
      for (const [method, path] of [
        ['GET', url('chat')],
        ['POST', url('chat')],
        ['POST', url('chat/mute')],
      ] as const) {
        const r = await x.app(
          new Request(path, {
            method,
            ...(method === 'POST' ? { body: '{}' } : {}),
          }),
        );
        expect([method, r.status]).toEqual([method, 401]);
      }
      // A foreign bearer token is refused the same way as no token.
      await expect(x.client.chatHistory('invalid-token-value', x.id)).rejects.toMatchObject({ status: 401 });
      // 2. A chat-shaped path can never return the replay, and vice versa. The replay route exists
      //    on its own path only; the chat router owns nothing under it.
      const crossed = await x.app(
        new Request(url('chat/replay'), {
          headers: { authorization: `Bearer ${x.a.token}` },
        }),
      );
      expect(crossed.status).toBe(404);
      // The real replay route still requires membership, exactly like chat (403 for an outsider),
      // and is refused before a finished match exists (409), never answering with chat content.
      const outsider = await x.app(
        new Request(url('replay'), { headers: { authorization: `Bearer ${x.third.token}` } }),
      );
      expect(outsider.status).toBe(403);
      const unfinished = await x.app(
        new Request(url('replay'), { headers: { authorization: `Bearer ${x.a.token}` } }),
      );
      expect(unfinished.status).toBe(409);
      const replayBody = JSON.stringify(await unfinished.json());
      expect(replayBody).not.toContain('messages');
      // 3. A participant's chat read never carries the action log either.
      const history = JSON.stringify(await x.client.chatHistory(x.a.token, x.id));
      expect(history).not.toContain('actions');
      expect(history).not.toContain('seed');
    });
    it('delivers private persisted ordered history to both authenticated participants, never a third party', async () => {
      const x = await setup();
      await x.send();
      const a = await x.client.chatHistory(x.a.token, x.id),
        b = await x.client.chatHistory(x.b.token, x.id);
      expect(a.messages[0]?.text).toBe('Hello');
      expect(b.messages[0]?.text).toBe('Hello');
      expect(a.messages[0]?.mine).not.toBe(b.messages[0]?.mine);
      expect(JSON.stringify(a)).not.toContain(x.waiting.player.id);
      await expect(
        x.client.chatHistory(x.third.token, x.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(x.send(x.third.token)).rejects.toMatchObject({
        status: 404,
      });
      await expect(x.client.chatHistory('invalid', x.id)).rejects.toMatchObject(
        { status: 401 },
      );
      expect(x.notifier.published[0]).toEqual({
        matchId: x.id,
        ping: { revision: 0, status: 'changed' },
      });
      if (adapter === 'postgres')
        expect(
          (
            await postgresChatStore(pool as unknown as PgPool).execute(
              x.actor.player.id,
              x.id,
              { kind: 'history' },
              Date.now(),
            )
          ).messages[0]?.text,
        ).toBe('Hello');
    });
    it('accepts text and phrases on your own turn, and never trusts a claimed sender', async () => {
      const x = await setup();
      // Owner direction (2026-10-26): chat is no longer restricted to the opponent's turn.
      const own = await x.send(x.actor.token);
      expect(own.sent?.text).toBe('Hello');
      x.advance(1100);
      const phrase = await x.client.chatSend(
        x.actor.token,
        x.id,
        { text: null, phrase: 'gg' },
        newId(),
        x.match.turnStartRevision,
      );
      expect(phrase.sent?.phrase).toBe('gg');
      x.advance(1100);
      const r = await x.app(
        new Request(`http://local/v1/matches/${x.id}/chat`, {
          method: 'POST',
          headers: { authorization: `Bearer ${x.actor.token}` },
          body: JSON.stringify({
            text: 'spoof',
            senderId: x.waiting.player.id,
            turnRevision: x.match.turnStartRevision,
            requestId: newId(),
          }),
        }),
      );
      expect(r.status).toBe(200);
      // The bearer is the only identity: the claimed sender is ignored, not refused.
      const mine = await x.client.chatHistory(x.actor.token, x.id);
      const theirs = await x.client.chatHistory(x.waiting.token, x.id);
      expect(mine.messages.find((m) => m.text === 'spoof')?.mine).toBe(true);
      expect(theirs.messages.find((m) => m.text === 'spoof')?.mine).toBe(false);
    });
    it('retries exactly once after an ambiguous response, even after the turn changes', async () => {
      const x = await setup(),
        requestId = newId();
      const first = await x.send(x.waiting.token, 'Safe retry', requestId);
      await x.nextTurn();
      const replay = await x.send(x.waiting.token, 'Safe retry', requestId);
      expect(replay.sent?.id).toBe(first.sent?.id);
      expect(replay.messages).toHaveLength(1);
      await expect(
        x.send(x.waiting.token, 'Changed payload', requestId),
      ).rejects.toMatchObject({ code: 'REQUEST_ID_CONFLICT' });
      // The turn is now theirs, and chat still works: the old turn gate is gone.
      x.advance(1100);
      expect((await x.send()).sent?.text).toBe('Hello');
    });
    it('accepts a queued stale turn epoch and safely serializes rapid duplicate sends', async () => {
      const x = await setup(),
        requestId = newId();
      const stale = await x.send(
        x.waiting.token,
        'stale',
        newId(),
        x.match.turnStartRevision + 1,
      );
      expect(stale.sent?.text).toBe('stale');
      x.advance(1100);
      const rs = await Promise.all(
        Array.from({ length: 6 }, () =>
          x.send(x.waiting.token, 'One message', requestId),
        ),
      );
      expect(new Set(rs.map((r) => r.sent?.id)).size).toBe(1);
      expect(
        (await x.client.chatHistory(x.waiting.token, x.id)).messages,
      ).toHaveLength(2);
    });
    it('keeps offline async history and makes finished chats read-only without changing game state', async () => {
      const x = await setup();
      const before = await x.storage.matchById(x.id);
      await x.send();
      expect(await x.storage.matchById(x.id)).toEqual(before);
      await x.service.resign(await x.service.authenticate(x.actor.token), x.id);
      const r = await x.client.chatHistory(x.waiting.token, x.id);
      expect(r.canSend).toBe(false);
      expect(r.messages[0]?.text).toBe('Hello');
      await expect(x.send()).rejects.toMatchObject({
        code: 'MATCH_NOT_ACTIVE',
      });
    });
    it('persists async messages across a 12-hour offline gap and a returning authenticated client', async () => {
      const x = await setup();
      const before = (await x.storage.matchById(x.id))!;
      expect(before.liveManaged ?? false).toBe(false);
      expect(before.turnTimeoutMs).toBe(86400000);
      await x.send(x.waiting.token, 'See you when you return');
      x.advance(12 * 3600000);
      const returning = new DuelClient({
        baseUrl: 'http://local',
        storage: null,
        fetch: async (url, init) => x.app(new Request(url, init)),
      });
      expect(
        (await returning.chatHistory(x.actor.token, x.id)).messages[0]?.text,
      ).toBe('See you when you return');
      // A 12-hour gap, a due 24-hour clock and the sender's own turn do not stop a message.
      x.advance(1100);
      await returning.chatSend(
        x.actor.token,
        x.id,
        { text: 'My turn', phrase: null },
        newId(),
        before.turnStartRevision,
      );
      x.advance(1100);
      await returning.chatSend(
        x.waiting.token,
        x.id,
        { text: 'Still your turn', phrase: null },
        newId(),
        before.turnStartRevision,
      );
      expect(
        (await returning.chatHistory(x.actor.token, x.id)).messages,
      ).toHaveLength(3);
      expect(await x.storage.matchById(x.id)).toEqual(before);
    });
    it('works in an actual accepted live session, follows turn changes, and retains history after live timeout', async () => {
      const x = await setup();
      const runtime = createLiveRuntime({
        storage: x.storage,
        live:
          adapter === 'memory'
            ? new MemoryLiveStore(x.storage as MemoryStorage)
            : postgresLiveStore(pool as unknown as PgPool),
        server: DEFAULT_SERVER_CONFIG,
        now: x.now,
      });
      const pa = await x.service.authenticate(x.a.token),
        pb = await x.service.authenticate(x.b.token);
      await runtime.service.presence(pa, 'idle', null);
      await runtime.service.presence(pb, 'idle', null);
      const invitation = await runtime.service.challenge(pa, x.id, 'live');
      await runtime.service.accept(pb, invitation.challenge.id);
      const started = (await x.storage.matchById(x.id))!;
      expect(started.liveManaged).toBe(true);
      expect(started.turnTimeoutMs).toBe(60000);
      await x.send(x.waiting.token, 'Live hello');
      // Chat on your own real-time turn is allowed (owner, 2026-10-26).
      x.advance(1100);
      await x.send(x.actor.token, 'Own turn hello');
      expect(await x.storage.matchById(x.id)).toEqual(started);
      await x.nextTurn();
      const next = (await x.storage.matchById(x.id))!;
      x.advance(1100);
      await x.send(x.waiting.token, 'Now my turn');
      x.advance(1100);
      await x.client.chatSend(
        x.actor.token,
        x.id,
        { text: 'Now you are thinking', phrase: null },
        newId(),
        next.turnStartRevision,
      );
      // Past the live clock but not yet advanced: chat must not fail or spend the grace.
      x.advance(60001);
      await runtime.service.presence(pa, 'in_live', x.id);
      await runtime.service.presence(pb, 'in_live', x.id);
      const overdue = await x.storage.matchById(x.id);
      await x.client.chatSend(
        x.actor.token,
        x.id,
        { text: 'Too late', phrase: null },
        newId(),
        next.turnStartRevision,
      );
      expect(await x.storage.matchById(x.id)).toEqual(overdue);
      await runtime.service.tickMatch(x.id);
      const history = await x.client.chatHistory(x.waiting.token, x.id);
      expect(history.canSend).toBe(false);
      expect(history.messages.map((m) => m.text)).toEqual([
        'Live hello',
        'Own turn hello',
        'Now my turn',
        'Now you are thinking',
        'Too late',
      ]);
      await expect(x.send()).rejects.toMatchObject({
        code: 'MATCH_NOT_ACTIVE',
      });
    });
    it('accepts a due clock without spending grace, changing deadlines or simulating turns', async () => {
      const x = await setup();
      x.advance(x.match.turnTimeoutMs + 1);
      const before = await x.storage.matchById(x.id);
      expect((await x.send()).sent?.text).toBe('Hello');
      // Only the gameplay authority may spend grace or finish a match; chat changes nothing.
      expect(await x.storage.matchById(x.id)).toEqual(before);
      expect((await x.client.chatHistory(x.waiting.token, x.id)).canSend).toBe(
        true,
      );
    });
    it('rate-limits bursts across request IDs, permits a later send, and stores stable quick phrase identifiers', async () => {
      const x = await setup();
      await x.send();
      await expect(x.send()).rejects.toMatchObject({ status: 429 });
      x.advance(1001);
      const r = await x.client.chatSend(
        x.waiting.token,
        x.id,
        { text: null, phrase: 'nice-move' },
        newId(),
        x.match.turnStartRevision,
      );
      expect(r.sent?.phrase).toBe('nice-move');
    });
    it('persists mute, enforces blocking in the API, reports only opponent messages into real triage', async () => {
      const x = await setup();
      const r = await x.send();
      const messageId = r.sent!.id;
      await x.client.chatAction(x.actor.token, x.id, 'mute', { value: true });
      expect((await x.client.chatHistory(x.actor.token, x.id)).muted).toBe(
        true,
      );
      // The OTHER player can tell chat is off for this match, and only that.
      const seenByOpponent = await x.client.chatHistory(x.waiting.token, x.id);
      expect(seenByOpponent.muted).toBe(false);
      expect(seenByOpponent.opponentMuted).toBe(true);
      expect(JSON.stringify(seenByOpponent)).not.toContain('preferences');
      await x.client.chatAction(x.actor.token, x.id, 'block', { value: true });
      x.advance(2000);
      await expect(x.send()).rejects.toMatchObject({ status: 403 });
      await x.client.chatAction(x.waiting.token, x.id, 'block', {
        value: false,
      });
      await expect(x.send()).rejects.toMatchObject({ status: 403 });
      await x.client.chatAction(x.actor.token, x.id, 'report', {
        messageId,
        reason: 'abuse',
      });
      await x.client.chatAction(x.actor.token, x.id, 'report', {
        messageId,
        reason: 'abuse',
      });
      await expect(
        x.client.chatAction(x.waiting.token, x.id, 'report', {
          messageId,
          reason: 'abuse',
        }),
      ).rejects.toMatchObject({ status: 404 });
      const reports =
        adapter === 'memory'
          ? x.feedback.rows
          : (
              await pool!.query(
                "select context from feedback_reports where context->>'matchId'=$1",
                [x.id],
              )
            ).rows;
      expect(reports).toHaveLength(1);
      expect(reports[0]?.context).toMatchObject({ text: 'Hello', messageId });
      await x.client.chatAction(x.actor.token, x.id, 'block', { value: false });
      expect((await x.send()).sent?.text).toBe('Hello');
    });
    it('mutes the reporter as part of the report, server-side, for both players', async () => {
      const x = await setup();
      const r = await x.send(x.waiting.token);
      const reported = await x.client.chatAction(x.actor.token, x.id, 'report', {
        messageId: r.sent!.id,
        reason: 'spam',
      });
      // The action response already carries the new mute: no second round-trip.
      expect(reported.muted).toBe(true);
      expect((await x.client.chatHistory(x.actor.token, x.id)).muted).toBe(true);
      // Persisted, not a client flag: a fresh request (a reload / second device) still sees it.
      expect((await x.client.chatHistory(x.actor.token, x.id)).muted).toBe(true);
      const theirs = await x.client.chatHistory(x.waiting.token, x.id);
      expect(theirs.muted).toBe(false);
      expect(theirs.opponentMuted).toBe(true);
      await x.client.chatAction(x.actor.token, x.id, 'mute', { value: false });
      expect(
        (await x.client.chatHistory(x.waiting.token, x.id)).opponentMuted,
      ).toBe(false);
    });
    it('cannot read, report or send through a different match', async () => {
      const x = await setup();
      const r = await x.send();
      const p = await x.service.authenticate(x.third.token);
      const second = await x.service.createMatch(p);
      await x.service.joinMatch(
        await x.service.authenticate(x.a.token),
        second.match.inviteCode,
      );
      await expect(
        x.client.chatHistory(x.b.token, second.match.matchId),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        x.client.chatAction(x.third.token, second.match.matchId, 'report', {
          messageId: r.sent!.id,
          reason: 'spam',
        }),
      ).rejects.toMatchObject({ status: 404 });
      expect(
        (await x.client.chatHistory(x.third.token, second.match.matchId))
          .messages,
      ).toHaveLength(0);
    });
    it('enforces a block in every other match between the pair', async () => {
      const x = await setup();
      await x.client.chatAction(x.a.token, x.id, 'block', { value: true });
      const second = await x.service.createMatch(
        await x.service.authenticate(x.a.token),
      );
      await x.service.joinMatch(
        await x.service.authenticate(x.b.token),
        second.match.inviteCode,
      );
      const m = (await x.storage.matchById(second.match.matchId))!;
      const waiting = m.state.actor === 0 ? x.b : x.a;
      await expect(
        x.client.chatSend(
          waiting.token,
          m.id,
          { text: 'Blocked elsewhere', phrase: null },
          newId(),
          m.turnStartRevision,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect((await x.client.chatHistory(waiting.token, m.id)).blocked).toBe(
        true,
      );
    });
    it('bounds pages and orders by committed sequence, including equal timestamps', async () => {
      const x = await setup();
      for (let i = 0; i < 45; i++) {
        x.advance(2100);
        await x.send(x.waiting.token, `Message ${i}`);
      }
      const latest = await x.client.chatHistory(x.actor.token, x.id);
      expect(latest.messages).toHaveLength(40);
      expect(latest.hasMore).toBe(true);
      expect(latest.messages[0]?.text).toBe('Message 5');
      const earlier = await x.client.chatHistory(x.actor.token, x.id, {
        before: latest.messages[0]!.sequence,
      });
      expect(earlier.messages).toHaveLength(5);
      expect(earlier.messages[0]?.text).toBe('Message 0');
      const newer = await x.client.chatHistory(x.actor.token, x.id, {
        after: earlier.messages.at(-1)!.sequence,
      });
      expect(newer.messages[0]?.text).toBe('Message 5');
    });
  });

// The owner's new chat rule (2026-10-26): messages may be sent at any point in an active match.
// Turn identity, a stale turn epoch and a due clock are NOT refusals any more.
describe('chat send policy', () => {
  const ctx = (
    over: Partial<Parameters<typeof assertSendAllowed>[0]> = {},
  ): Parameters<typeof assertSendAllowed>[0] => ({
    status: 'active',
    phase: 'ACT',
    actor: 0,
    seat: 0,
    turnRevision: 7,
    deadline: Date.now() + 60_000,
    blocked: false,
    ...over,
  });
  it('accepts your own turn, the opponent turn, a stale epoch and a due clock', () => {
    expect(() => assertSendAllowed(ctx({ actor: 0, seat: 0 }), 0, Date.now())).not.toThrow();
    expect(() =>
      assertSendAllowed(
        ctx({ actor: 1, seat: 0, deadline: Date.now() - 5_000 }),
        999,
        Date.now(),
      ),
    ).not.toThrow();
  });
  it('still refuses blocked chat, a non-active match and GAME_OVER', () => {
    expect(() => assertSendAllowed(ctx({ blocked: true }), 0, 0)).toThrowError(/blocked/);
    expect(() => assertSendAllowed(ctx({ status: 'finished' }), 0, 0)).toThrowError(/read-only/);
    expect(() => assertSendAllowed(ctx({ phase: 'GAME_OVER' }), 0, 0)).toThrowError(/read-only/);
  });
});

describe('chat input boundary', () => {
  it('accepts plain untrusted text and Unicode, rejects controls, empty content and oversized messages', () => {
    expect(contentFrom({ text: ' <img onerror=alert(1)> ' })).toEqual({
      text: '<img onerror=alert(1)>',
      phrase: null,
    });
    expect(contentFrom({ text: 'こんにちは 🌲' }).text).toBe('こんにちは 🌲');
    for (const text of ['', ' ', 'x'.repeat(281), 'a\nb', 'a\u202eb'])
      expect(() => contentFrom({ text })).toThrow();
    expect(() => contentFrom({ phrase: 'unknown' })).toThrow();
    expect(() => contentFrom({ text: 'Hi', phrase: 'gg' })).toThrow();
  });
});

// Actual privilege/RLS checks, rollback and a turn-boundary row-lock race, not a fake SQL adapter.
describe.skipIf(!localUrl)(
  'Postgres chat security and row serialization',
  () => {
    it('denies all direct client-role reads/writes, even with granted table permissions (RLS)', async () => {
      const sample = (await pool!.query('select * from match_messages limit 1'))
        .rows[0];
      const c = await pool!.connect();
      try {
        await c.query('begin');
        for (const role of ['anon', 'authenticated']) {
          await c.query(
            `grant select,insert,update,delete on match_messages to ${role}`,
          );
          await c.query(
            `grant usage on sequence match_messages_sequence_seq to ${role}`,
          );
          await c.query('savepoint denied_write');
          await c.query(`set local role ${role}`);
          expect(
            (await c.query('select * from match_messages')).rows,
          ).toHaveLength(0);
          await expect(
            c.query(
              'insert into match_messages(id,match_id,sender_id,text,request_id,created_at) values($1,$2,$3,$4,$5,$6)',
              [
                newId(),
                sample.match_id,
                sample.sender_id,
                'Direct client write',
                newId(),
                Date.now(),
              ],
            ),
          ).rejects.toThrow(/row-level security/);
          await c.query('rollback to savepoint denied_write');
          await c.query('reset role');
        }
        await c.query('rollback');
      } finally {
        c.release();
      }
      const denied = await pool!.query(
        "select has_table_privilege('anon','match_messages','INSERT') as allowed",
      );
      expect(denied.rows[0].allowed).toBe(false);
    });
    it('rolls report receipts back if the existing admin evidence queue fails', async () => {
      const storage = postgresStorage(pool as unknown as PgPool),
        service = new MatchService({
          storage,
          config: {
            ...DEFAULT_SERVER_CONFIG,
            rateLimits: {
              ...DEFAULT_SERVER_CONFIG.rateLimits,
              guestPerIpPerHour: 10000,
              createPerIpPerHour: 10000,
            },
          },
        });
      const a = await service.createGuest(),
        b = await service.createGuest();
      const m = await service.createMatch(await service.authenticate(a.token));
      await service.joinMatch(
        await service.authenticate(b.token),
        m.match.inviteCode,
      );
      const match = (await storage.matchById(m.match.matchId))!;
      const sender = match.state.actor === 0 ? b : a;
      const reporter = match.state.actor === 0 ? a : b;
      const chat = postgresChatStore(pool as unknown as PgPool);
      const sent = await chat.execute(
        sender.player.id,
        match.id,
        {
          kind: 'send',
          content: { text: 'Report evidence', phrase: null },
          requestId: newId(),
          turnRevision: match.turnStartRevision,
        },
        Date.now(),
      );
      await pool!.query(
        "create or replace function chat_test_fail_report() returns trigger language plpgsql as $$ begin raise exception 'Injected evidence failure'; end $$; create trigger chat_test_fail_report before insert on feedback_reports for each row execute function chat_test_fail_report();",
      );
      try {
        await expect(
          chat.execute(
            reporter.player.id,
            match.id,
            { kind: 'report', messageId: sent.sent!.id, reason: 'abuse' },
            Date.now(),
          ),
        ).rejects.toThrow('Injected evidence failure');
        expect(
          (
            await pool!.query(
              'select * from match_chat_reports where message_id=$1',
              [sent.sent!.id],
            )
          ).rows,
        ).toHaveLength(0);
      } finally {
        await pool!.query(
          'drop trigger chat_test_fail_report on feedback_reports; drop function chat_test_fail_report();',
        );
      }
      await chat.execute(
        reporter.player.id,
        match.id,
        { kind: 'report', messageId: sent.sent!.id, reason: 'abuse' },
        Date.now(),
      );
      expect(
        (
          await pool!.query(
            'select * from match_chat_reports where message_id=$1',
            [sent.sent!.id],
          )
        ).rows,
      ).toHaveLength(1);
    });
    it('sends only after waiting for the authoritative game row lock, even if the turn moved', async () => {
      const storage = postgresStorage(pool as unknown as PgPool),
        service = new MatchService({
          storage,
          config: {
            ...DEFAULT_SERVER_CONFIG,
            rateLimits: {
              ...DEFAULT_SERVER_CONFIG.rateLimits,
              guestPerIpPerHour: 10000,
              createPerIpPerHour: 10000,
            },
          },
        });
      const a = await service.createGuest(),
        b = await service.createGuest();
      const m = await service.createMatch(await service.authenticate(a.token));
      await service.joinMatch(
        await service.authenticate(b.token),
        m.match.inviteCode,
      );
      const match = (await storage.matchById(m.match.matchId))!;
      const waiting = match.state.actor === 0 ? b : a;
      const c = await pool!.connect();
      try {
        await c.query('begin');
        await c.query('select id from matches where id=$1 for update', [
          match.id,
        ]);
        const result = postgresChatStore(pool as unknown as PgPool).execute(
          waiting.player.id,
          match.id,
          {
            kind: 'send',
            content: { text: 'Boundary', phrase: null },
            requestId: newId(),
            turnRevision: match.turnStartRevision,
          },
          Date.now(),
        );
        // Commit a changed actor while chat waits for this row, exactly the move serialization path.
        await c.query(
          "update matches set state=jsonb_set(state,'{actor}',$2::jsonb), turn_start_revision=turn_start_revision+1 where id=$1",
          [match.id, JSON.stringify(1 - match.state.actor)],
        );
        await c.query('commit');
        // The insert is still serialized behind the game row; the moved turn no longer refuses it.
        expect((await result).sent?.text).toBe('Boundary');
        expect(
          (
            await pool!.query(
              'select * from match_messages where match_id=$1',
              [match.id],
            )
          ).rows,
        ).toHaveLength(1);
      } finally {
        await c.query('rollback');
        c.release();
      }
    });
  },
);

describe('global chat spam budget', () => {
  it('limits a player to 200 messages per rolling day, independently of request IDs', async () => {
    const storage = new MemoryStorage(),
      feedback = new MemoryFeedbackStore();
    let now = Date.now();
    const service = new MatchService({ storage, now: () => now });
    const a = await service.createGuest(),
      b = await service.createGuest();
    const m = await service.createMatch(await service.authenticate(a.token));
    await service.joinMatch(
      await service.authenticate(b.token),
      m.match.inviteCode,
    );
    const match = (await storage.matchById(m.match.matchId))!;
    const waiting = match.state.actor === 0 ? b : a;
    const chat = memoryChatStore(storage, feedback);
    for (let n = 0; n < 200; n++) {
      now += 11000;
      await chat.execute(
        waiting.player.id,
        match.id,
        {
          kind: 'send',
          requestId: newId(),
          content: { text: 'Within budget', phrase: null },
          turnRevision: match.turnStartRevision,
        },
        now,
      );
    }
    now += 11000;
    await expect(
      chat.execute(
        waiting.player.id,
        match.id,
        {
          kind: 'send',
          requestId: newId(),
          content: { text: 'Over budget', phrase: null },
          turnRevision: match.turnStartRevision,
        },
        now,
      ),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
});
