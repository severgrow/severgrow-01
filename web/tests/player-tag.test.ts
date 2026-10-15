// Name tags: "MapleFox #7QK2" tells two players with the same nature name apart.
import { describe, expect, it } from 'vitest';
import { PLAYER_TAG_PATTERN, playerTag, taggedName } from '../../src/player-tag.js';
import { toLobbyRow } from '../src/online/lobby.js';

describe('player tags', () => {
  it('is 4 easy-to-read characters, the same every time for the same player', () => {
    const id = '3f2b8c1e-9a7d-4e62-b0c4-55aa1e0f9d21';
    expect(playerTag(id)).toMatch(PLAYER_TAG_PATTERN);
    expect(playerTag(id)).toBe(playerTag(id));
    expect(playerTag(id)).not.toMatch(/[ILOU]/);
  });

  it('spreads out: 2000 random players get almost all different tags', () => {
    const tags = new Set<string>();
    for (let i = 0; i < 2000; i++) tags.add(playerTag(globalThis.crypto.randomUUID()));
    expect(tags.size).toBeGreaterThan(1990);
  });

  it('taggedName adds the tag; no id leaves the name alone', () => {
    expect(taggedName('MapleFox', 'abc')).toBe(`MapleFox #${playerTag('abc')}`);
    expect(taggedName('MapleFox', null)).toBe('MapleFox');
  });

  it('the online list shows "Name #TAG" when the server sends a tag, and the plain name otherwise', () => {
    const base = { matchId: 'm', status: 'active', mySeat: 0, turnPlayer: 0, turnDeadlineAt: null, opponentName: 'MapleFox', lastActivityAt: 0, unseenTurn: false, revision: 1, graceUsed: [0, 0], gracePeriods: 1, result: null } as const;
    expect(toLobbyRow({ ...base, opponentTag: '7QK2' } as never, 0).opponentName).toBe('MapleFox #7QK2');
    expect(toLobbyRow(base as never, 0).opponentName).toBe('MapleFox');
  });
});
