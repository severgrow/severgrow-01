// SIGNING OUT LEAVES THE ACCOUNT'S PLACE BEHIND (owner, 2026-11-13: "when I sign out, level still shows
// my level in campaign ... those should be locked to account only ... after sign out it should go back
// to level 1"). A signed-in device's campaign record is raised to the account's verified clears, so
// sign-out must clear it, the cached account clears (which would raise it again on the next load), the
// campaign game in progress and the remembered wallet balance. The device is then a fresh guest.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACCOUNT_BOUND_KEYS, clearAccountBoundProgress } from '../src/accounts/signout-reset.js';
import { CAMPAIGN_PROGRESS_KEY, CAMPAIGN_SAVE_KEY } from '../../src/campaign/index.js';
import { ACCOUNT_CLEARS_KEY } from '../src/menu/account-clears.js';
import { SEED_BALANCE_KEY } from '../src/logic/finish-window.js';

describe('sign-out resets the account-bound campaign place', () => {
  it('names every key that carries the account\'s place', () => {
    expect([...ACCOUNT_BOUND_KEYS].sort()).toEqual([ACCOUNT_CLEARS_KEY, CAMPAIGN_PROGRESS_KEY, CAMPAIGN_SAVE_KEY, SEED_BALANCE_KEY].sort());
  });

  it('removes them and nothing else', () => {
    const data = new Map<string, string>([
      [CAMPAIGN_PROGRESS_KEY, '{"v":3,"completed":["c4-40"]}'],
      [CAMPAIGN_SAVE_KEY, 'x'],
      [ACCOUNT_CLEARS_KEY, '[1,2,3]'],
      [SEED_BALANCE_KEY, '500'],
      ['severgrow.settings.v3', 'keep'],
    ]);
    clearAccountBoundProgress({ get: (k) => data.get(k) ?? null, set: (k, v) => { data.set(k, v); }, remove: (k) => { data.delete(k); } });
    expect([...data.keys()]).toEqual(['severgrow.settings.v3']);
  });

  it('the sign-out action clears them before it reloads', () => {
    const mount = readFileSync(new URL('../src/accounts/mount.ts', import.meta.url), 'utf8');
    const signOut = mount.slice(mount.indexOf('const signOut = () =>'), mount.indexOf('const deleteAccount'));
    expect(signOut).toMatch(/clearAccountBoundProgress\(kv\)/);
    expect(signOut.indexOf('clearAccountBoundProgress(kv)')).toBeLessThan(signOut.indexOf('location.reload()'));
  });
});
