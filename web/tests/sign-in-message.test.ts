// What the toast says after a Google sign-in (owner, 2026-10-22). Opening Play online on a new phone
// quietly creates a guest; signing in afterwards used to say "Games played as a guest on this device
// were not moved" even when that guest never played. It now says so only when there was something
// to move, or when it could not tell.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { signInMessage } from '../src/accounts/core.js';
import { ACCOUNT } from '../../src/strings.js';

const base = { name: 'MapleFox #7QK2', beforePlayerId: 'guest-1', afterPlayerId: 'acct-9' };

describe('the sign-in toast', () => {
  it('a guest upgraded in place is told their matches are saved', () => {
    expect(signInMessage({ ...base, outcome: 'linked', afterPlayerId: 'guest-1', guestHadMatches: true })).toBe(ACCOUNT.linked(base.name));
  });
  it('a guest who played and then signed into ANOTHER account is told their games stayed behind', () => {
    expect(signInMessage({ ...base, outcome: 'signed-in', guestHadMatches: true })).toBe(ACCOUNT.switched(base.name));
  });
  it('a guest who never played is simply welcomed back', () => {
    expect(signInMessage({ ...base, outcome: 'signed-in', guestHadMatches: false })).toBe(ACCOUNT.welcomeBack(base.name));
  });
  it('when it cannot tell, it keeps the honest warning', () => {
    expect(signInMessage({ ...base, outcome: 'signed-in', guestHadMatches: null })).toBe(ACCOUNT.switched(base.name));
  });
  it('the same player, or no earlier identity, is welcomed back', () => {
    expect(signInMessage({ ...base, outcome: 'signed-in', afterPlayerId: 'guest-1', guestHadMatches: true })).toBe(ACCOUNT.welcomeBack(base.name));
    expect(signInMessage({ ...base, outcome: 'signed-in', beforePlayerId: null, guestHadMatches: null })).toBe(ACCOUNT.welcomeBack(base.name));
  });
  // KEEP THE BEST OF BOTH (owner, 2026-11-18): a server that merged the guest says what came across.
  it('a merged guest is told what came across, in one short line', () => {
    const merged = { seeds: 120, tiles: 2, levels: 3 };
    const line = signInMessage({ ...base, outcome: 'signed-in', guestHadMatches: true, merged });
    expect(line).toBe(ACCOUNT.merged(base.name, merged));
    expect(line).toBe('Signed in as MapleFox #7QK2. Added from this device: 120 Seeds, 2 tiles, 3 levels.');
    expect(line).not.toContain('not moved');
  });
  it('a merge lists only what there was, in the singular when there was one', () => {
    expect(ACCOUNT.merged('Ash', { seeds: 1, tiles: 0, levels: 1 })).toBe('Signed in as Ash. Added from this device: 1 Seed, 1 level.');
    expect(ACCOUNT.merged('Ash', { seeds: 0, tiles: 1, levels: 0 })).toBe('Signed in as Ash. Added from this device: 1 tile.');
  });
  it('a merge with nothing countable still never says games were left behind', () => {
    const line = signInMessage({ ...base, outcome: 'signed-in', guestHadMatches: true, merged: { seeds: 0, tiles: 0, levels: 0 } });
    expect(line).toBe(ACCOUNT.merged(base.name, { seeds: 0, tiles: 0, levels: 0 }));
    expect(line).toBe('Signed in as MapleFox #7QK2. Your games from this device are on your account.');
  });
  it('the sign-in path asks the guest\'s own match list before it hands the token over', () => {
    const mount = readFileSync(fileURLToPath(new URL('../src/accounts/mount.ts', import.meta.url)), 'utf8');
    expect(mount).toContain("'/v1/players/me/matches'");
    expect(mount).toContain('signInMessage({');
  });
});
