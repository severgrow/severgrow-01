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
  it('the sign-in path asks the guest\'s own match list before it hands the token over', () => {
    const mount = readFileSync(fileURLToPath(new URL('../src/accounts/mount.ts', import.meta.url)), 'utf8');
    expect(mount).toContain("'/v1/players/me/matches'");
    expect(mount).toContain('signInMessage({');
  });
});
