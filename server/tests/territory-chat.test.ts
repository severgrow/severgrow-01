// TERRITORY CHAT (owner, 2026-10-28): one shared channel for everyone in Territory. Reuses the duel
// chat's text rules, its player-to-player block list and the server's rate limiter; shows each
// sender's nickname and tag; keeps only the newest 30 messages. Block and report work from a message.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { Pool } from 'pg';
import { MemoryStorage } from '../src/storage/memory.js';
import { postgresStorage, type PgPool } from '../src/storage/postgres.js';
import { MatchService } from '../src/service.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { createFetchApp } from '../src/fetch-app.js';
import { DuelClient, DuelError, type FetchLike } from '../src/client.js';
import { newId } from '../src/ids.js';
import { playerTag } from '../../src/player-tag.js';
import {
  TERRITORY_CHAT_KEEP,
  createTerritoryChatRouter,
  memoryTerritoryChatStore,
  postgresTerritoryChatStore,
  type TerritoryChatStore,
} from '../src/chat/territory.js';
import type { Storage } from '../src/storage/types.js';

const localUrl = process.env.CHAT_TEST_DATABASE_URL;
if (localUrl && !['localhost', '127.0.0.1'].includes(new URL(localUrl).hostname))
  throw new Error('Chat tests require an isolated LOCAL database, never production.');
let pool: Pool | undefined;
beforeAll(async () => {
  if (!localUrl) return;
  pool = new Pool({ connectionString: localUrl, max: 8 });
  await pool.query(
    "do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;",
  );
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).sort().filter((f) => f.endsWith('.sql') && !/^000[57]_/.test(f)))
    await pool.query(readFileSync(new URL(f, dir), 'utf8'));
  await pool.query('delete from territory_messages');
});
afterAll(async () => { await pool?.end(); });

for (const adapter of ['memory', ...(localUrl ? ['postgres'] : [])])
  describe(`${adapter}: territory chat`, () => {
    const setup = async () => {
      let now = Date.now();
      const storage: Storage = adapter === 'memory' ? new MemoryStorage() : postgresStorage(pool as unknown as PgPool);
      const store: TerritoryChatStore = adapter === 'memory'
        ? memoryTerritoryChatStore(storage)
        : postgresTerritoryChatStore(pool as unknown as PgPool);
      if (adapter === 'postgres') await pool!.query('delete from territory_messages');
      const service = new MatchService({
        storage,
        now: () => now,
        config: { ...DEFAULT_SERVER_CONFIG, rateLimits: { ...DEFAULT_SERVER_CONFIG.rateLimits, guestPerIpPerHour: 10000 } },
      });
      const app = createFetchApp({ service, live: createTerritoryChatRouter({ store, service, storage }) });
      const fetcher: FetchLike = async (url, init) => app(new Request(url, init));
      const client = new DuelClient({ baseUrl: 'http://local', fetch: fetcher, storage: null });
      const [a, b, c] = [await service.createGuest(), await service.createGuest(), await service.createGuest()];
      const tick = (ms: number) => { now += ms; };
      return { client, a, b, c, tick };
    };

    it('everyone in Territory shares one channel, each message named by nickname and tag', async () => {
      const { client, a, b } = await setup();
      await client.territoryChatSend(a.token, 'hello world', newId());
      const seen = await client.territoryChat(b.token);
      expect(seen.messages).toHaveLength(1);
      const [m] = seen.messages;
      expect(m!.text).toBe('hello world');
      expect(m!.name).toBe(a.player.displayName);
      expect(m!.tag).toBe(playerTag(a.player.id));
      expect(m!.mine).toBe(false);
      expect((await client.territoryChat(a.token)).messages[0]!.mine).toBe(true);
      // no sender id ever leaves the API
      expect(JSON.stringify(seen)).not.toContain(a.player.id);
    });

    it(`keeps only the newest ${TERRITORY_CHAT_KEEP} messages, oldest dropped first`, async () => {
      const { client, a, b, tick } = await setup();
      for (let i = 0; i < TERRITORY_CHAT_KEEP + 5; i++) {
        tick(61_000); // a minute apart, so no send budget is hit
        await client.territoryChatSend(i % 2 ? a.token : b.token, `m${i}`, newId());
      }
      const page = await client.territoryChat(a.token);
      expect(page.messages).toHaveLength(TERRITORY_CHAT_KEEP);
      expect(page.messages[0]!.text).toBe('m5');
      expect(page.messages.at(-1)!.text).toBe(`m${TERRITORY_CHAT_KEEP + 4}`);
    });

    it('a resend with the same request id is one message', async () => {
      const { client, a } = await setup();
      const id = newId();
      await client.territoryChatSend(a.token, 'once', id);
      await client.territoryChatSend(a.token, 'once', id);
      expect((await client.territoryChat(a.token)).messages).toHaveLength(1);
    });

    it('uses the duel chat text rules', async () => {
      const { client, a } = await setup();
      await expect(client.territoryChatSend(a.token, '   ', newId())).rejects.toBeInstanceOf(DuelError);
      await expect(client.territoryChatSend(a.token, 'x'.repeat(281), newId())).rejects.toBeInstanceOf(DuelError);
      await expect(client.territoryChatSend(a.token, 'bad‮line', newId())).rejects.toBeInstanceOf(DuelError);
    });

    it('a burst is slowed down by the rate limit', async () => {
      const { client, a } = await setup();
      let refused = 0;
      for (let i = 0; i < 12; i++) {
        try { await client.territoryChatSend(a.token, `spam ${i}`, newId()); } catch (e) { if ((e as DuelError).code === 'RATE_LIMITED') refused++; }
      }
      expect(refused).toBeGreaterThan(0);
    });

    it('blocking from a message hides that player\'s messages for me only', async () => {
      const { client, a, b, c, tick } = await setup();
      await client.territoryChatSend(a.token, 'from a', newId());
      tick(61_000);
      await client.territoryChatSend(c.token, 'from c', newId());
      const fromA = (await client.territoryChat(b.token)).messages.find((m) => m.text === 'from a')!;
      await client.territoryChatBlock(b.token, fromA.id);
      expect((await client.territoryChat(b.token)).messages.map((m) => m.text)).toEqual(['from c']);
      expect((await client.territoryChat(c.token)).messages.map((m) => m.text)).toEqual(['from a', 'from c']);
      tick(61_000);
      await client.territoryChatSend(a.token, 'again', newId());
      expect((await client.territoryChat(b.token)).messages.map((m) => m.text)).toEqual(['from c']);
    });

    it('my own message cannot be blocked or reported; a report is kept even after the message rolls off', async () => {
      const { client, a, b, tick } = await setup();
      await client.territoryChatSend(a.token, 'rude', newId());
      const m = (await client.territoryChat(b.token)).messages[0]!;
      await expect(client.territoryChatBlock(a.token, m.id)).rejects.toBeInstanceOf(DuelError);
      await expect(client.territoryChatReport(a.token, m.id, 'abuse')).rejects.toBeInstanceOf(DuelError);
      const r = await client.territoryChatReport(b.token, m.id, 'abuse');
      expect(r.reported).toBe(true);
      // the window rolls on past the reported message
      for (let i = 0; i < TERRITORY_CHAT_KEEP + 1; i++) { tick(61_000); await client.territoryChatSend(b.token, `n${i}`, newId()); }
      expect((await client.territoryChat(b.token)).messages.some((x) => x.id === m.id)).toBe(false);
      if (adapter === 'postgres') {
        const kept = await pool!.query('select text from territory_chat_reports where message_id=$1', [m.id]);
        expect(kept.rows[0]?.text).toBe('rude');
      }
    });

    it('a stranger without a token is refused', async () => {
      const { client } = await setup();
      await expect(client.territoryChat('nope')).rejects.toBeInstanceOf(DuelError);
    });
  });
