// SETTINGS, LESSON PROGRESS AND TIPS FOLLOW THE ACCOUNT (owner decision 2026-11-18, accounts pass:
// "server-stored, cached on the device, work offline, merged safely").
// Settings: per field, the newest change wins (a device clock can never claim the future).
// Lesson progress and tips: they only ever grow, so neither device can erase the other's.
import { describe, expect, it } from 'vitest';
import { EMPTY_PREFS, mergePrefs, parsePrefs, SYNCED_FIELDS } from '../src/account-prefs.js';

const doc = (fields: Record<string, { v: unknown; at: number }>, extra: Partial<typeof EMPTY_PREFS> = {}) => ({ ...EMPTY_PREFS, fields, ...extra });

describe('account preferences merge', () => {
  it('per field, the newer change wins, and an untouched field keeps its value', () => {
    const a = doc({ reduceMotion: { v: true, at: 100 }, handSide: { v: 'left', at: 300 } });
    const b = doc({ reduceMotion: { v: false, at: 200 }, guide: { v: 'subtle', at: 50 } });
    expect(mergePrefs(a, b, 1000).fields).toEqual({
      reduceMotion: { v: false, at: 200 },
      handSide: { v: 'left', at: 300 },
      guide: { v: 'subtle', at: 50 },
    });
  });

  it('a stale device (older times) never overwrites a newer choice', () => {
    const server = doc({ sound: { v: true, at: 500 } });
    const oldTab = doc({ sound: { v: false, at: 400 } });
    expect(mergePrefs(server, oldTab, 1000).fields.sound).toEqual({ v: true, at: 500 });
  });

  it('a device clock in the future cannot win for ever: its time is clamped to now', () => {
    const merged = mergePrefs(EMPTY_PREFS, doc({ sound: { v: true, at: 9_999_999 } }), 1000);
    expect(merged.fields.sound).toEqual({ v: true, at: 1000 });
    expect(mergePrefs(merged, doc({ sound: { v: false, at: 1001 } }), 2000).fields.sound).toEqual({ v: false, at: 1001 });
  });

  it('tips seen and lesson progress only ever grow', () => {
    const a = doc({}, { tips: ['fruit'], lessons: { version: 3, counts: { grow: 4, draw: 9 }, spotlights: { 3: 'bloom' }, hellos: ['bloom'] } });
    const b = doc({}, { tips: ['draw', 'fruit'], lessons: { version: 3, counts: { grow: 7 }, spotlights: { 3: 'cut', 5: 'take' }, hellos: ['bomb'] } });
    const m = mergePrefs(a, b, 1000);
    expect(m.tips).toEqual(['draw', 'fruit']);
    expect(m.lessons).toEqual({ version: 3, counts: { draw: 9, grow: 7 }, spotlights: { 3: 'bloom', 5: 'take' }, hellos: ['bloom', 'bomb'] });
  });

  it('lesson progress from an older lesson version gives way to the newer version', () => {
    const old = doc({}, { lessons: { version: 2, counts: { grow: 99 }, spotlights: {}, hellos: [] } });
    const fresh = doc({}, { lessons: { version: 3, counts: { grow: 1 }, spotlights: {}, hellos: [] } });
    expect(mergePrefs(old, fresh, 1).lessons!.counts).toEqual({ grow: 1 });
    expect(mergePrefs(fresh, old, 1).lessons!.counts).toEqual({ grow: 1 });
  });

  it('merging is the same in either order and merging twice changes nothing', () => {
    const a = doc({ sound: { v: true, at: 5 } }, { tips: ['fruit'] });
    const b = doc({ sound: { v: false, at: 9 }, guide: { v: 'off', at: 2 } }, { tips: ['draw'] });
    expect(mergePrefs(a, b, 100)).toEqual(mergePrefs(b, a, 100));
    const once = mergePrefs(a, b, 100);
    expect(mergePrefs(once, b, 100)).toEqual(once);
  });
});

describe('reading a device\'s preferences', () => {
  it('keeps only the synced fields, with small plain values', () => {
    const parsed = parsePrefs({
      fields: { sound: { v: true, at: 1 }, palette: { v: 'x', at: 1 }, guide: { v: 'x'.repeat(500), at: 1 }, handSide: { v: 'left', at: -5 } },
      tips: ['fruit', 7, 'draw'], lessons: { version: 3, counts: { grow: 2, nope: 'x' }, spotlights: { 3: 'bloom' }, hellos: ['bloom', 1] },
    });
    expect(Object.keys(parsed.fields).sort()).toEqual(['handSide', 'sound']);
    expect(parsed.fields.handSide).toEqual({ v: 'left', at: 0 });
    expect(parsed.tips).toEqual(['draw', 'fruit']);
    expect(parsed.lessons).toEqual({ version: 3, counts: { grow: 2 }, spotlights: { 3: 'bloom' }, hellos: ['bloom'] });
  });

  it('refuses something that is not a preferences object', () => {
    expect(() => parsePrefs([] as unknown as Record<string, unknown>)).toThrow();
  });

  it('syncs exactly what the owner listed: sound, left-hand, guide, reduced motion, Blitz', () => {
    expect([...SYNCED_FIELDS].sort()).toEqual(['blitz', 'guide', 'handSide', 'reduceMotion', 'sound', 'thumbLayout', 'vibration']);
  });
});

// ---- the route: GET / POST /v1/players/me/prefs ----------------------------------------------------
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { createFetchApp } from '../src/fetch-app.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';

const route = () => {
  let now = 5_000;
  const service = new MatchService({ storage: new MemoryStorage(), config: DEFAULT_SERVER_CONFIG, now: () => now });
  const app = createFetchApp({ service, config: DEFAULT_SERVER_CONFIG });
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await app(new Request(`http://x${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));
    return { status: res.status, json: await res.json() as Record<string, unknown> };
  };
  return { call, token: async () => (await service.createGuest()).token, tick: (ms: number) => { now += ms; } };
};

describe('GET / POST /v1/players/me/prefs', () => {
  it('GET is null until the first POST; a POST answers the merged copy', async () => {
    const { call, token } = route();
    const t = await token();
    expect((await call('GET', '/v1/players/me/prefs', undefined, t)).json.prefs).toBeNull();
    const a = await call('POST', '/v1/players/me/prefs', { fields: { reduceMotion: { v: true, at: 4_000 } }, tips: ['fruit'] }, t);
    expect(a.status).toBe(200);
    expect(a.json.prefs).toEqual({ fields: { reduceMotion: { v: true, at: 4_000 } }, tips: ['fruit'], lessons: null });
    // device B: an older choice and another tip; the newer choice stays, the tips join
    const b = await call('POST', '/v1/players/me/prefs', { fields: { reduceMotion: { v: false, at: 3_000 }, handSide: { v: 'left', at: 4_500 } }, tips: ['draw'] }, t);
    expect(b.json.prefs).toEqual({ fields: { handSide: { v: 'left', at: 4_500 }, reduceMotion: { v: true, at: 4_000 } }, tips: ['draw', 'fruit'], lessons: null });
    expect((await call('GET', '/v1/players/me/prefs', undefined, t)).json.prefs).toEqual(b.json.prefs);
  });

  it('is per player, needs a token, and refuses a malformed body', async () => {
    const { call, token } = route();
    const [t1, t2] = [await token(), await token()];
    await call('POST', '/v1/players/me/prefs', { fields: { sound: { v: true, at: 1 } } }, t1);
    expect((await call('GET', '/v1/players/me/prefs', undefined, t2)).json.prefs).toBeNull();
    expect((await call('GET', '/v1/players/me/prefs')).status).toBe(401);
    expect((await call('POST', '/v1/players/me/prefs', [1, 2], t1)).status).toBe(400);
  });
});
