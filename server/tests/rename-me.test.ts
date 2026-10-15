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
  return { service, call, guest, account };
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
    const renamed = await h.service.renameMe(record, 'Totally Different');
    expect(renamed.id).toBe(record.id);
    expect(playerTag(renamed.id)).toBe(tagBefore);
    expect(taggedName(renamed.displayName ?? '', renamed.id)).toBe(`Totally Different #${tagBefore}`);
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
    const res = await h.call('PATCH', '/v1/players/me', { displayName: "  Fern   O'Hara " }, token);
    expect(res.status).toBe(200);
    expect(res.json.player).toMatchObject({ kind: 'account', displayName: "Fern O'Hara" });
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
      ['too long', 'x'.repeat(41)],
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
});
