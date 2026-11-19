// SETTINGS, LESSON PROGRESS AND TIPS FOLLOW THE ACCOUNT (owner decision 2026-11-18, accounts pass):
// the page half. A signed-in device sends its copy and takes the merged one back; nothing here can
// take another device's newer choice or progress away.
import { describe, expect, it } from 'vitest';
import { syncPrefs, PREFS_SYNC_KEY } from '../src/accounts/prefs-sync.js';
import type { PrefsDoc } from '../../server/src/account-prefs.js';
import { EMPTY_PREFS, mergePrefs, parsePrefs } from '../../server/src/account-prefs.js';

const memory = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k), map: m };
};
const ACCOUNT = (id = 'acct-1') => JSON.stringify({ token: `tok-${id}`, playerId: id, displayName: 'Ash', kind: 'account' });

/** A fake server holding one copy per player, merging like the real one. */
const server = (start: Record<string, PrefsDoc> = {}, clock = { now: 10_000 }) => {
  const docs = new Map(Object.entries(start));
  const posted: { player: string; body: Record<string, unknown> }[] = [];
  const api = async (method: 'GET' | 'POST', token: string, body?: Record<string, unknown>) => {
    const player = token.replace(/^tok-/, '');
    if (method === 'POST') {
      posted.push({ player, body: body! });
      docs.set(player, mergePrefs(docs.get(player) ?? EMPTY_PREFS, parsePrefs(body!), clock.now));
    }
    return { prefs: docs.get(player) ?? null, serverNow: clock.now };
  };
  return { api, docs, posted, clock };
};

describe('syncing preferences with the account', () => {
  it('a new device takes the account\'s choices and never pushes its own defaults over them', async () => {
    const s = server({ 'acct-1': { ...EMPTY_PREFS, fields: { reduceMotion: { v: true, at: 5_000 }, handSide: { v: 'left', at: 5_000 }, guide: { v: 'subtle', at: 5_000 } } } });
    const kv = memory({
      'severgrow.duel.identity.v1': ACCOUNT(),
      'severgrow.settings.v1': JSON.stringify({ sound: false, reduceMotion: false, vibration: true }),
      'severgrow-thumb': JSON.stringify({ thumb: true, side: 'right', idleTip: true }),
    });
    const changed = await syncPrefs(kv, s.api, () => 9_000);
    expect(changed).toBe(true);
    expect(JSON.parse(kv.get('severgrow.settings.v1')!)).toMatchObject({ reduceMotion: true, sound: false });
    expect(JSON.parse(kv.get('severgrow-thumb')!)).toMatchObject({ side: 'left', thumb: true, idleTip: true });
    expect(kv.get('severgrow-guide')).toBe('subtle');
    expect(s.docs.get('acct-1')!.fields.reduceMotion).toEqual({ v: true, at: 5_000 });
  });

  it('a choice made on this device after the last sync wins everywhere', async () => {
    const s = server();
    const kv = memory({ 'severgrow.duel.identity.v1': ACCOUNT(), 'severgrow.settings.v1': JSON.stringify({ reduceMotion: false }) });
    await syncPrefs(kv, s.api, () => 9_000);
    s.clock.now = 20_000;
    kv.set('severgrow.settings.v1', JSON.stringify({ reduceMotion: true }));
    await syncPrefs(kv, s.api, () => 19_000);
    expect(s.docs.get('acct-1')!.fields.reduceMotion!.v).toBe(true);
    // device B, synced before with the old value, then opened again: it takes the change
    const b = memory({ 'severgrow.duel.identity.v1': ACCOUNT(), 'severgrow.settings.v1': JSON.stringify({ reduceMotion: false }) });
    await syncPrefs(b, s.api, () => 20_500);
    expect(JSON.parse(b.get('severgrow.settings.v1')!).reduceMotion).toBe(true);
  });

  it('tips and lesson progress from both devices are kept', async () => {
    const s = server({ 'acct-1': { ...EMPTY_PREFS, tips: ['draw'], lessons: { version: 3, counts: { grow: 9 }, spotlights: {}, hellos: ['bomb'] } } });
    const kv = memory({
      'severgrow.duel.identity.v1': ACCOUNT(),
      'severgrow.tips.v1': JSON.stringify({ fruit: true, draw: false }),
      'severgrow.lesson.mastery.v1': JSON.stringify({ version: 3, counts: { grow: 2, draw: 4 }, spotlights: { 3: 'bloom' }, hellos: ['bloom'] }),
    });
    await syncPrefs(kv, s.api, () => 9_000);
    expect(JSON.parse(kv.get('severgrow.tips.v1')!)).toMatchObject({ fruit: true, draw: true });
    expect(JSON.parse(kv.get('severgrow.lesson.mastery.v1')!)).toEqual({ version: 3, counts: { draw: 4, grow: 9 }, spotlights: { 3: 'bloom' }, hellos: ['bloom', 'bomb'] });
    expect(s.docs.get('acct-1')!.tips).toEqual(['draw', 'fruit']);
  });

  it('a guest makes no request; nothing changes', async () => {
    const s = server();
    const kv = memory({ 'severgrow.duel.identity.v1': JSON.stringify({ token: 't', playerId: 'g', displayName: 'G', kind: 'guest' }) });
    expect(await syncPrefs(kv, s.api, () => 1)).toBe(false);
    expect(s.posted).toEqual([]);
  });

  it('a second account on this device starts fresh: the first account\'s sync record is never reused', async () => {
    const s = server({ 'acct-2': { ...EMPTY_PREFS, fields: { sound: { v: true, at: 100 } } } });
    const kv = memory({ 'severgrow.duel.identity.v1': ACCOUNT('acct-1'), 'severgrow.settings.v1': JSON.stringify({ sound: false }) });
    await syncPrefs(kv, s.api, () => 9_000);
    kv.set('severgrow.duel.identity.v1', ACCOUNT('acct-2'));
    await syncPrefs(kv, s.api, () => 9_500);
    // acct-2's own older choice is kept, not overwritten by what this device last sent for acct-1
    expect(s.docs.get('acct-2')!.fields.sound!.v).toBe(true);
    expect(JSON.parse(kv.get(PREFS_SYNC_KEY)!).player).toBe('acct-2');
  });

  it('offline, or a server without the route, changes nothing and does not throw', async () => {
    const kv = memory({ 'severgrow.duel.identity.v1': ACCOUNT(), 'severgrow.settings.v1': JSON.stringify({ sound: true }) });
    const before = new Map(kv.map);
    expect(await syncPrefs(kv, async () => { throw new Error('offline'); }, () => 1)).toBe(false);
    expect(await syncPrefs(kv, async () => null, () => 1)).toBe(false);
    expect(kv.map).toEqual(before);
  });
});
