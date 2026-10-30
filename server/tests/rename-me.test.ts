// A signed-in player chooses their own name: PATCH /v1/players/me stores it, the #tag never moves,
// and a guest is refused. This is the behaviour the owner asked for after accounts shipped.
import { describe, expect, it } from 'vitest';
import { NATURE_NAME_PATTERN } from '../src/nature-names.js';
import { playerTag, taggedName } from '../../src/player-tag.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { createFetchApp } from '../src/fetch-app.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import type { PlayerRecord } from '../src/storage/types.js';

const setup = () => {
  const storage = new MemoryStorage();
  const config = { ...DEFAULT_SERVER_CONFIG, corsOrigin: '*' };
  const service = new MatchService({ storage, config });
  const app = createFetchApp({ service, config });
  type Json = Record<string, unknown> & { player?: { id: string; displayName: string; kind: string }; token?: string; code?: string; message?: string };
  const call = async (method: string, path: string, body: unknown, token?: string) => {
    const res = await app(
      new Request(`http://x${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
    return { status: res.status, json: (await res.json()) as Json };
  };
  /** A fresh guest, its token and the STORED record. */
  const guest = async (): Promise<{ token: string; record: PlayerRecord }> => {
    const created = await service.createGuest();
    return { token: created.token, record: await service.authenticate(created.token) };
  };
  /** A guest upgraded in place to an account (same id and token), exactly as Google sign-in does. */
  const account = async (): Promise<{ token: string; record: PlayerRecord }> => {
    const g = await guest();
    await service.upgradePlayer(g.record, 'anything');
    return { token: g.token, record: await service.authenticate(g.token) };
  };
  return { service, call, guest, account, storage };
};

describe('renameMe: a signed-in player stores their own name', () => {
  it('stores exactly the normalised typed name — never a generated one', async () => {
    const h = setup();
    const { token, record } = await h.account();
    expect(record.displayName).toMatch(NATURE_NAME_PATTERN);

    const renamed = await h.service.renameMe(record, '  Big    Fox  ');
    expect(renamed.displayName).toBe('Big Fox');
    expect(renamed.displayName).not.toMatch(NATURE_NAME_PATTERN);

    // It is really persisted, not merely echoed: re-read it from storage.
    expect((await h.service.authenticate(token)).displayName).toBe('Big Fox');
  });

  it('keeps the same player id, so the #tag never moves on a rename', async () => {
    const h = setup();
    const { record } = await h.account();
    const tagBefore = playerTag(record.id);
    const renamed = await h.service.renameMe(record, 'Renamed');
    expect(renamed.id).toBe(record.id);
    expect(playerTag(renamed.id)).toBe(tagBefore);
    expect(taggedName(renamed.displayName ?? '', renamed.id)).toBe(`Renamed #${tagBefore}`);
  });

  it('refuses a guest, which keeps its generated nature name', async () => {
    const h = setup();
    const { token, record } = await h.guest();
    expect(record.displayName).toMatch(NATURE_NAME_PATTERN);
    await expect(h.service.renameMe(record, 'My Own Name')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await h.service.authenticate(token)).displayName).toBe(record.displayName);
  });
});

describe('PATCH /v1/players/me', () => {
  it('stores the typed name for an account and echoes it back, normalised', async () => {
    const h = setup();
    const { token } = await h.account();
    const res = await h.call('PATCH', '/v1/players/me', { displayName: "  Fern   O'N " }, token);
    expect(res.status).toBe(200);
    expect(res.json.player).toMatchObject({ kind: 'account', displayName: "Fern O'N" });
  });

  it('refuses a guest with FORBIDDEN', async () => {
    const h = setup();
    const { token } = await h.guest();
    const res = await h.call('PATCH', '/v1/players/me', { displayName: 'My Own Name' }, token);
    expect(res.status).toBe(403);
    expect(res.json.code).toBe('FORBIDDEN');
  });

  it('rejects bad input with a precise code and never stores it', async () => {
    const h = setup();
    const { token } = await h.account();
    const bad: [string, unknown][] = [
      ['too long', 'x'.repeat(9)],
      ['empty', '   '],
      ['newline', 'Big\nFox'],
      ['control', 'Big\u0000Fox'],
      ['punctuation only', '...'],
      ['emoji', 'Grow 🌱'],
      ['blocked word', 'fuck'],
      ['spaced-out blocked word', 'f u c k'],
      ['missing', undefined],
    ];
    for (const [label, displayName] of bad) {
      const res = await h.call('PATCH', '/v1/players/me', displayName === undefined ? {} : { displayName }, token);
      expect(res.status, label).toBe(400);
      expect(res.json.code, label).toBe('INVALID_REQUEST');
    }
    // The account still carries its original name: nothing bad was stored.
    expect((await h.service.authenticate(token)).displayName).toMatch(NATURE_NAME_PATTERN);
  });

  it('requires a bearer token', async () => {
    const h = setup();
    const res = await h.call('PATCH', '/v1/players/me', { displayName: 'Nobody' }, undefined);
    expect(res.status).toBe(401);
  });

  // THE OWNER'S NAME LIMIT (2026-10-30): "make the account names be max 8 characters ... existing
  // longer names are LEFT ALONE; enforce 8 only on NEW names and RENAMES".
  it('accepts exactly 8 characters and refuses 9 — both on first naming and on a rename', async () => {
    const h = setup();
    const { token, record } = await h.account();
    const eight = await h.call('PATCH', '/v1/players/me', { displayName: 'EightChr' }, token);
    expect(eight.status).toBe(200);
    expect(eight.json.player?.displayName).toBe('EightChr');
    const nine = await h.call('PATCH', '/v1/players/me', { displayName: 'NineCharr' }, token);
    expect(nine.status).toBe(400);
    expect(nine.json.code).toBe('INVALID_REQUEST');
    // Nothing long was stored: the account still has the eight-character name it just chose.
    expect((await h.service.authenticate(token)).displayName).toBe('EightChr');
    // And the same decision is the one `renameMe` itself makes (the route is only a doorway).
    await expect(h.service.renameMe({ ...record, displayName: 'EightChr' }, 'NineCharr'))
      .rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('leaves a legacy long name alone, but will not let it be replaced by another long one', async () => {
    const h = setup();
    const { token, record } = await h.account();
    // Simulate a row that predates the rule.
    const legacy = { ...record, displayName: 'BloomHeron' };
    await h.storage.updatePlayer(legacy);
    const same = await h.call('PATCH', '/v1/players/me', { displayName: 'BloomHeron' }, token);
    expect(same.status).toBe(200);
    expect(same.json.player?.displayName).toBe('BloomHeron');
    const other = await h.call('PATCH', '/v1/players/me', { displayName: 'BloomHeronTwo' }, token);
    expect(other.status).toBe(400);
    expect((await h.service.authenticate(token)).displayName).toBe('BloomHeron');
  });
});
