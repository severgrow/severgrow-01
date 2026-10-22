// The main menu's account key is painted in the menu's FIRST layout, with the other keys (owner,
// 2026-10-22: "login/player button on main menu loads longer than rest of the buttons - laggy
// feeling"). It used to wait for a lazily-loaded module AND a network probe of Supabase's Google
// setting, so it appeared 0.4-1 s after PLAY. Now the answer to "is Google on?" is remembered on
// the device, and the key says LOG IN or the player's name from what the device already knows.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { accountKeyNow, accountsConfigured, GOOGLE_ON_KEY, IDENTITY_KEY, paintAccountKey } from '../src/accounts/menu-key.js';
import { IDENTITY_STORAGE_KEY } from '../src/online/identity.js';
import { ACCOUNT_KEY } from '../src/accounts/core.js';
import { taggedName } from '../../src/player-tag.js';
import { MENU, PROFILE } from '../../src/strings.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const store = (entries: Record<string, string> = {}) => {
  const m = new Map(Object.entries(entries));
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) };
};
const PLAYER = '6f1c2a40-1111-4222-8333-944455556666';
const signedInStore = (extra: Record<string, string> = {}) => store({
  [IDENTITY_KEY]: JSON.stringify({ token: 't'.repeat(20), playerId: PLAYER, kind: 'account', displayName: 'MapleFox' }),
  [ACCOUNT_KEY]: JSON.stringify({ provider: 'google', playerId: PLAYER, email: 'a@b.c' }),
  ...extra,
});

describe('the account key knows what to say before any network', () => {
  it('reads the same identity key the online module writes', () => {
    expect(IDENTITY_KEY).toBe(IDENTITY_STORAGE_KEY);
  });

  it('is configured exactly when the accounts module would ask about Google', () => {
    expect(accountsConfigured({ supabaseUrl: 'https://x.supabase.co', duelApi: true, flag: undefined })).toBe(true);
    expect(accountsConfigured({ supabaseUrl: 'http://127.0.0.1:9', duelApi: true, flag: undefined })).toBe(false);
    expect(accountsConfigured({ supabaseUrl: 'http://127.0.0.1:9', duelApi: true, flag: 'on' })).toBe(true);
    expect(accountsConfigured({ supabaseUrl: 'https://x.supabase.co', duelApi: true, flag: 'off' })).toBe(false);
    expect(accountsConfigured({ supabaseUrl: null, duelApi: true, flag: 'on' })).toBe(false);
    expect(accountsConfigured({ supabaseUrl: 'https://x.supabase.co', duelApi: false, flag: undefined })).toBe(false);
  });

  it('shows LOG IN for a guest, the name for a signed-in player, and nothing once Google is known off', () => {
    expect(accountKeyNow(store(), true)).toEqual({ show: true, name: null });
    expect(accountKeyNow(store({ [GOOGLE_ON_KEY]: '1' }), true)).toEqual({ show: true, name: null });
    expect(accountKeyNow(signedInStore({ [GOOGLE_ON_KEY]: '1' }), true)).toEqual({ show: true, name: taggedName('MapleFox', PLAYER) });
    expect(accountKeyNow(store({ [GOOGLE_ON_KEY]: '0' }), true)).toEqual({ show: false, name: null });
    expect(accountKeyNow(signedInStore(), false)).toEqual({ show: false, name: null });
    // A guest identity, or an account record for someone else, is not "signed in".
    const guest = store({ [IDENTITY_KEY]: JSON.stringify({ token: 't'.repeat(20), playerId: PLAYER, kind: 'guest', displayName: 'Guest' }) });
    expect(accountKeyNow(guest, true).name).toBeNull();
    expect(accountKeyNow(store({ [IDENTITY_KEY]: '{not json' }), true)).toEqual({ show: true, name: null });
  });

  it('paints the key the one way the accounts module paints it', () => {
    const btn = { hidden: true, textContent: '', title: '', attrs: {} as Record<string, string>, setAttribute(k: string, v: string) { this.attrs[k] = v; } };
    paintAccountKey(btn as never, null);
    expect(btn).toMatchObject({ hidden: false, textContent: MENU.login, title: MENU.login });
    expect(btn.attrs['aria-label']).toBe(MENU.login);
    paintAccountKey(btn as never, 'MapleFox #7QK2');
    expect(btn).toMatchObject({ textContent: 'MapleFox #7QK2', title: PROFILE.open('MapleFox #7QK2') });
    // ONE implementation: the accounts module's refresh goes through the same function.
    expect(read('../src/accounts/mount.ts')).toContain('paintAccountKey(menuLogin, name)');
  });

  it('is painted in the menu\'s synchronous first layout, and Google\'s answer is remembered on the device', () => {
    const main = read('../src/main.ts');
    const layout = main.slice(main.indexOf('function layoutMenu('), main.indexOf('function layoutMenu(') + 6000);
    expect(layout).toContain('paintEarlyAccountKey(');
    const mount = read('../src/accounts/mount.ts');
    expect(mount).toContain('GOOGLE_ON_KEY');
    // A key shown early but then found to be off is taken away again, so no dead key stays up.
    expect(mount).toMatch(/if \(!available\) \{[\s\S]{0,400}hidden = true/);
  });
});
