// The Territory screen's wallet line never tells a signed-in player to sign in (2026-10-22). It used
// to paint "SIGN IN TO GROW" whenever it had no wallet yet: on every open (the first map read starts
// before the player's identity has resolved) and on any failed wallet request.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { walletLine } from '../src/online/world-view.js';
import { seedBalanceLabel } from '../src/online/seed-icon.js';

describe('the Territory wallet line', () => {
  it('says nothing until it knows who the player is', () => {
    expect(walletLine({ identityKnown: false, hasIdentity: false, wallet: null })).toBeNull();
    expect(walletLine({ identityKnown: false, hasIdentity: true, wallet: null })).toBeNull();
  });
  it('shows the balance once it has one', () => {
    const wallet = { balance: 250, lifetimeEarned: 250, lifetimeSpent: 0, worldInvitationSeen: true };
    expect(walletLine({ identityKnown: true, hasIdentity: true, wallet })).toBe(seedBalanceLabel(250));
  });
  it('asks to sign in ONLY when there is no identity at all', () => {
    expect(walletLine({ identityKnown: true, hasIdentity: false, wallet: null })).toBe('SIGN IN TO GROW');
    // An identity whose wallet has not arrived (slow or failed request) is not told to sign in.
    expect(walletLine({ identityKnown: true, hasIdentity: true, wallet: null })).toBeNull();
  });
  it('the screen paints through it, and a failed wallet read keeps the last known balance', () => {
    const view = readFileSync(fileURLToPath(new URL('../src/online/world-view.ts', import.meta.url)), 'utf8');
    expect(view).toContain('walletLine({');
    expect(view).toMatch(/seedWallet\(identityAtRequest\.token\)\.catch\(\(\) => undefined\)/);
  });
});
