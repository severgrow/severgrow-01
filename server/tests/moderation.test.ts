// MODERATION (launch readiness, 2026-11-12). Strangers share a global chat and see each other's names,
// so three things are needed before a public launch:
//   1. Chat text is filtered: a blocked word is masked (never refused, so a message is never lost),
//      in duel chat and in the Territory chat alike, without masking innocent words around it.
//   2. The owner can SILENCE a player's chat from /admin (24 hours, 7 days, for good, or lift it).
//      A silenced player can still play; every chat send is refused, and their Territory lines go.
//   3. The owner can RESET a bad nickname to a generated nature name.
// Every moderation action is admin-only and audited.
import { describe, expect, it } from 'vitest';
import { maskChat } from '../src/chat/filter.js';
import { contentFrom } from '../src/chat/rules.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { hashToken, newId, newToken } from '../src/ids.js';
import type { PlayerRecord } from '../src/storage/types.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { createFetchApp } from '../src/fetch-app.js';
import { chainRouters } from '../src/feedback/feedback.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { memoryAdminStore } from '../src/admin/memory.js';
import { createAdminRouter } from '../src/admin/router.js';
import type { AdminAuditEntry, AdminStore } from '../src/admin/types.js';
import { createTerritoryChatRouter, memoryTerritoryChatStore } from '../src/chat/territory.js';
import { chatSilenced, SILENCE_FOREVER } from '../src/chat/silence.js';
import { NATURE_NAME_PATTERN } from '../src/nature-names.js';

describe('chat filter', () => {
  it('masks blocked words, whatever the spelling', () => {
    expect(maskChat('you fucking idiot')).toBe('you f•••••• idiot');
    expect(maskChat('Sh1t move')).toBe('S••• move');
    expect(maskChat('what a SHIT')).toBe('what a S•••');
    expect(maskChat('f@ggot')).toBe('f•••••');
    expect(maskChat('motherfucker')).toBe('m•••••••••••');
    expect(maskChat('bitches everywhere')).toBe('b•••••• everywhere');
  });

  it('leaves innocent words alone (no Scunthorpe problem)', () => {
    for (const line of ['Scunthorpe United', 'a cocktail please', 'reading Dickens', 'assassin', 'classic', 'Shitake soup?', 'hello nice move', 'good luck!', 'Hancock park']) {
      expect(maskChat(line), line).toBe(line);
    }
  });

  it('keeps everything that is not a word exactly as typed', () => {
    expect(maskChat('gg 🌱 ... fuck!!')).toBe('gg 🌱 ... f•••!!');
  });

  it('is applied to every chat message on the server', () => {
    expect(contentFrom({ text: 'well shit' })).toEqual({ text: 'well s•••', phrase: null });
  });
});

describe('silence rule', () => {
  it('a player is silenced until the stored time, and never when nothing is stored', () => {
    const p = { chatSilencedUntil: 1000 } as PlayerRecord;
    expect(chatSilenced(p, 999)).toBe(true);
    expect(chatSilenced(p, 1000)).toBe(false);
    expect(chatSilenced({} as PlayerRecord, 5)).toBe(false);
    expect(chatSilenced({ chatSilencedUntil: SILENCE_FOREVER } as PlayerRecord, Date.now())).toBe(true);
  });
});

const ADMIN_ID = '37e3d4d0-a34c-45b3-bc61-992fcf392912';
const NOW = 1_760_000_000_000;

const setup = () => {
  const storage = new MemoryStorage();
  const config = { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'], adminPlayerIds: [ADMIN_ID] };
  const economy = new MemoryWorldEconomyStore();
  let now = NOW;
  const service = new MatchService({ storage, config, now: () => now });
  const base = memoryAdminStore({ storage, feedback: null as never, economy, links: null as never });
  const audits: AdminAuditEntry[] = [];
  const store: AdminStore = { ...base, audit: async (entry) => { audits.push(entry); await base.audit(entry); } };
  const admin = createAdminRouter({
    store, economy, authenticate: (t) => service.authenticate(t), config, now: () => now,
    rulesVersion: service.rulesVersion, storage, log: () => undefined,
  });
  const chat = createTerritoryChatRouter({ store: memoryTerritoryChatStore(storage), service, storage });
  const app = createFetchApp({ service, config, live: chainRouters(chat, admin) });
  const makePlayer = async (id: string | null, name: string): Promise<{ player: PlayerRecord; token: string }> => {
    const player: PlayerRecord = { id: id ?? newId(), kind: 'account', displayName: name, createdAt: NOW, upgradedAt: NOW };
    await storage.createPlayer(player);
    const token = newToken();
    await storage.issueToken({ id: newId(), playerId: player.id, tokenHash: hashToken(token), createdAt: NOW, revokedAt: null });
    return { player, token };
  };
  const call = async (path: string, token: string | null, body?: unknown) => {
    const res = await app(new Request(`http://x${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const say = (token: string, text: string) => call('/v1/territory/chat', token, { text, requestId: newId() });
  return { storage, audits, makePlayer, call, say, tick: (ms: number) => { now += ms; } };
};

const moderate = (id: string) => `/v1/admin/players/${id}/moderation`;

describe('admin moderation', () => {
  it('is admin-only: 401 without a token, 403 for a player', async () => {
    const t = setup();
    const p = await t.makePlayer(null, 'Rude');
    expect((await t.call(moderate(p.player.id), null, { chat: 'silence-24h' })).status).toBe(401);
    expect((await t.call(moderate(p.player.id), p.token, { chat: 'silence-24h' })).status).toBe(403);
    expect((await t.storage.playerById(p.player.id))?.chatSilencedUntil ?? null).toBeNull();
  });

  it('silences chat for 24 hours: sends are refused, their Territory lines go, play is untouched; then it ends', async () => {
    const t = setup();
    const admin = await t.makePlayer(ADMIN_ID, 'Owner');
    const rude = await t.makePlayer(null, 'Rude');
    const other = await t.makePlayer(null, 'Kind');
    expect((await t.say(rude.token, 'hello all')).status).toBe(200);
    await t.say(other.token, 'hi');
    const done = await t.call(moderate(rude.player.id), admin.token, { chat: 'silence-24h' });
    expect(done.status).toBe(200);
    expect(done.body.chatSilencedUntil).toBe(NOW + 24 * 3_600_000);
    const refused = await t.say(rude.token, 'let me speak');
    expect(refused.status).toBe(403);
    expect(String(refused.body.message)).toMatch(/paused/i);
    const seen = await t.call('/v1/territory/chat', other.token);
    expect((seen.body.messages as Array<{ text: string }>).map((m) => m.text)).toEqual(['hi']);
    expect(t.audits.map((a) => a.action)).toContain('player.chat');
    t.tick(24 * 3_600_000);
    expect((await t.say(rude.token, 'sorry')).status).toBe(200);
  });

  it('silences for good, and lifts', async () => {
    const t = setup();
    const admin = await t.makePlayer(ADMIN_ID, 'Owner');
    const rude = await t.makePlayer(null, 'Rude');
    await t.call(moderate(rude.player.id), admin.token, { chat: 'silence-forever' });
    t.tick(10 * 365 * 86_400_000);
    expect((await t.say(rude.token, 'still here')).status).toBe(403);
    const lifted = await t.call(moderate(rude.player.id), admin.token, { chat: 'lift' });
    expect(lifted.body.chatSilencedUntil).toBeNull();
    expect((await t.say(rude.token, 'thanks')).status).toBe(200);
  });

  it('resets a nickname to a generated nature name, audited with the old name', async () => {
    const t = setup();
    const admin = await t.makePlayer(ADMIN_ID, 'Owner');
    const rude = await t.makePlayer(null, 'Bad Name');
    const done = await t.call(moderate(rude.player.id), admin.token, { name: 'reset' });
    expect(done.status).toBe(200);
    const name = (await t.storage.playerById(rude.player.id))!.displayName!;
    expect(name).toMatch(NATURE_NAME_PATTERN);
    expect(done.body.displayName).toBe(name);
    expect(t.audits.find((a) => a.action === 'player.name')?.detail).toMatchObject({ from: 'Bad Name', to: name });
  });

  it('refuses an unknown action and an unknown player', async () => {
    const t = setup();
    const admin = await t.makePlayer(ADMIN_ID, 'Owner');
    const rude = await t.makePlayer(null, 'Rude');
    expect((await t.call(moderate(rude.player.id), admin.token, { chat: 'shout' })).status).toBe(400);
    expect((await t.call(moderate(rude.player.id), admin.token, {})).status).toBe(400);
    expect((await t.call(moderate(newId()), admin.token, { chat: 'lift' })).status).toBe(404);
  });
});
