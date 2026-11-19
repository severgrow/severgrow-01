// INSTANT SIGN-IN (owner, 2026-11-18, accounts pass: "warm the server when the sign-in sheet
// opens"). Opening the email sheet, or tapping Google, wakes the server with one cheap request, so
// the hand-over that follows does not meet a cold server. At most once a minute; never throws.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { signInWarmer } from '../src/accounts/warm.js';

describe('waking the server for a sign-in', () => {
  it('one request, then nothing again for a minute', async () => {
    let t = 0;
    const ping = vi.fn(async () => undefined);
    const warm = signInWarmer(ping, () => t);
    warm(); warm();
    expect(ping).toHaveBeenCalledTimes(1);
    t = 59_000; warm();
    expect(ping).toHaveBeenCalledTimes(1);
    t = 61_000; warm();
    expect(ping).toHaveBeenCalledTimes(2);
  });

  it('a failed wake-up is harmless', () => {
    const warm = signInWarmer(() => Promise.reject(new Error('offline')), () => 0);
    expect(() => warm()).not.toThrow();
  });

  it('the email sheet and the Google button both wake it', () => {
    const mount = readFileSync(fileURLToPath(new URL('../src/accounts/mount.ts', import.meta.url)), 'utf8');
    const openEmail = mount.slice(mount.indexOf('const openEmail'), mount.indexOf('const openEmail') + 400);
    expect(openEmail).toContain('warmSignIn()');
    const start = mount.slice(mount.indexOf('const start = async'), mount.indexOf('const start = async') + 600);
    expect(start).toContain('warmSignIn()');
  });
});
