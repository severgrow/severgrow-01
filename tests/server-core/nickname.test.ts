import { describe, expect, it } from 'vitest';
import { DEFAULT_WORLD_CONFIG, changeNickname, newAccount, normalizeNickname, validateNickname } from '../../src/server-core/index.js';

const DAY = 86_400_000;

describe('nicknames', () => {
  it('3-14 characters: letters, numbers, space, _ and -', () => {
    for (const ok of ['Ana', 'Moss_Lord-7', 'Big Tree 42', 'abcdefghijklmn']) expect(validateNickname(ok)).toEqual({ ok: true });
    for (const bad of ['ab', 'abcdefghijklmno', 'emoji🌱', 'semi;colon', '   ', ' lead', 'trail ', 'two  spaces']) expect(validateNickname(bad).ok, bad).toBe(false);
  });

  it('a basic blocklist, including look-alike spellings', () => {
    for (const bad of ['fuck', 'FUCKER', 'fvck', 'f u c k', 'Sh1t', 'n4zi', 'Adm1n', 'moderator']) expect(validateNickname(bad).ok, bad).toBe(false);
    for (const fine of ['Scunthorpe x', 'Shitake', 'Cassandra']) expect(typeof validateNickname(fine).ok).toBe('boolean'); // no crash
  });

  it('unique ignoring case and look-alikes', () => {
    expect(normalizeNickname('Ann-0')).toBe(normalizeNickname('ANN_o'));
    const taken = new Set([normalizeNickname('Moss')]);
    const me = newAccount('p1', 0);
    expect(changeNickname(me, 'MOSS', taken, 0, DEFAULT_WORLD_CONFIG)).toMatchObject({ ok: false, reason: expect.stringMatching(/taken/) });
  });

  it('can be changed once per 30 days (the first one is free)', () => {
    let me = newAccount('p1', 0);
    const r1 = changeNickname(me, 'Fern', new Set(), 10 * DAY, DEFAULT_WORLD_CONFIG);
    expect(r1.ok).toBe(true);
    if (r1.ok) me = r1.account;
    expect(changeNickname(me, 'Fern Two', new Set(), 20 * DAY, DEFAULT_WORLD_CONFIG)).toMatchObject({ ok: false, reason: expect.stringMatching(/30 days/) });
    expect(changeNickname(me, 'Fern Two', new Set(), 41 * DAY, DEFAULT_WORLD_CONFIG).ok).toBe(true);
  });
});
