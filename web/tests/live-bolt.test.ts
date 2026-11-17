// The bolt is the presence signal in every online game (owner, 2026-11-17). See online/live/bolt.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { boltLook } from '../src/online/live/bolt.js';

const s = (presence: 'online' | 'busy' | 'offline', extra: { status?: string; live?: boolean } = {}) =>
  ({ status: extra.status ?? 'active', live: extra.live ?? false, opponent: { presence, name: 'Moss', inLive: false, available: true, reconnecting: false } }) as never;

describe('the bolt\'s look follows the opponent', () => {
  it('filled when the opponent is here, whatever a live duel would need', () => {
    expect(boltLook(s('online'))).toBe('online');
    expect(boltLook(s('busy')), 'busy in another screen is still online').toBe('online');
    expect(boltLook(s('online', { live: true }))).toBe('online');
  });
  it('empty when the opponent is offline', () => {
    expect(boltLook(s('offline'))).toBe('offline');
  });
  it('shown in every active online game: a status that cannot be read still shows an empty bolt', () => {
    expect(boltLook(null, true)).toBe('offline');
    expect(boltLook(null), 'before the first answer: a beat, never a flash of the wrong state').toBe('hidden');
  });
  it('not in a finished or waiting match', () => {
    expect(boltLook(s('online', { status: 'finished' }))).toBe('hidden');
    expect(boltLook(s('online', { status: 'waiting' }))).toBe('hidden');
  });
});

describe('the pill paints the look', () => {
  const ui = readFileSync(new URL('../src/online/live/ui.ts', import.meta.url), 'utf8');
  it('fills by presence, dims only offline', () => {
    expect(ui).toMatch(/\.live-pill\[data-presence='online'\] svg path \{/);
    expect(ui).toMatch(/\.live-pill\[data-presence='offline'\] \{ opacity:\.6;/);
  });
});
